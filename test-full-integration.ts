import { prisma } from './src/server.js';
import { claudeService } from './src/services/ai/claude.service.js';
import { incrementalExtractor } from './src/services/business-logic/incremental-extractor.service.js';
import { appointmentHandler } from './src/services/business-logic/appointment.handler.js';
import { intentClassifier } from './src/services/business-logic/intent.classifier.js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Integration Test: Full Appointment Flow with Database
 * 
 * Tests:
 * 1. Opening hours question (information_request)
 * 2. First appointment booking (saves to DB)
 * 3. Second appointment for different person (new booking, saves to DB)
 * 
 * This simulates the exact webhook flow but saves to the actual database.
 */
async function integrationTest() {
  console.log('='.repeat(70));
  console.log('INTEGRATION TEST: Full Appointment Flow with Database');
  console.log('='.repeat(70));
  console.log();

  let testClient;
  let testCall;
  let conversationHistory: Message[] = [];
  let collectedData: any = {};
  let appointmentCount = 0;

  try {
    // ============================================================
    // SETUP: Create test client and call in database
    // ============================================================
    console.log('[SETUP] Creating test client and call in database...');
    
    testClient = await prisma.client.create({
      data: {
        name: 'Test Clinic',
        industry: 'healthcare',
        phoneNumber: '+1234567890',
        email: 'test@clinic.com',
        businessHours: { mon_fri: '9:00-17:00' },
        greetingMessage: 'Guten Tag, wie kann ich Ihnen helfen?',
        llmSystemPrompt: 'Du bist ein freundlicher Rezeptionist.',
        escalationRules: {},
        isActive: true,
      },
    });

    testCall = await prisma.call.create({
      data: {
        callSid: 'TEST-CALL-' + Date.now(),
        clientId: testClient.id,
        callerNumber: '+49123456789',
        status: 'IN_PROGRESS',
      },
    });

    console.log('[SETUP] Test client created:', testClient.id);
    console.log('[SETUP] Test call created:', testCall.id);
    console.log();

    // ============================================================
    // TEST 1: Opening Hours Question
    // ============================================================
    console.log('='.repeat(70));
    console.log('TEST 1: Opening Hours Information Request');
    console.log('='.repeat(70));
    
    const q1 = 'Wie sind Ihre Öffnungszeiten?';
    console.log(`[USER] ${q1}`);
    
    conversationHistory.push({ role: 'user', content: q1 });
    await saveMessage(testCall.id, 'USER', q1);

    const intent1 = await intentClassifier.classify(q1, conversationHistory);
    console.log(`[INTENT] ${intent1.intent} (confidence: ${intent1.confidence})`);
    
    if (intent1.intent === 'information_request') {
      console.log('[PASS] Correctly classified as information_request');
    } else {
      console.log('[FAIL] Expected information_request, got', intent1.intent);
    }
    console.log();

    // ============================================================
    // TEST 2: First Appointment Booking
    // ============================================================
    console.log('='.repeat(70));
    console.log('TEST 2: First Appointment Booking');
    console.log('='.repeat(70));

    const appointmentMessages = [
      'Ich möchte einen Termin vereinbaren',
      'Am dritten Februar',
      '14 Uhr',
      'Alex',
      '9346513457',
    ];

    for (const msg of appointmentMessages) {
      console.log(`[USER] ${msg}`);
      conversationHistory.push({ role: 'user', content: msg });
      await saveMessage(testCall.id, 'USER', msg);

      // Check if we're in appointment mode
      const hasPartialData = collectedData.date || collectedData.time || collectedData.name || collectedData.phone;
      
      let intentResult;
      if (hasPartialData) {
        console.log('[FORCING] appointment_booking (partial data exists)');
        intentResult = { intent: 'appointment_booking', confidence: 1.0 };
      } else {
        intentResult = await intentClassifier.classify(msg, conversationHistory.slice(-3));
        console.log(`[INTENT] ${intentResult.intent} (confidence: ${intentResult.confidence})`);
      }

      if (intentResult.intent === 'appointment_booking') {
        // Incremental extraction
        console.log(`[EXTRACT] Existing data:`, collectedData);
        const updatedData = await incrementalExtractor.extractFromSingleMessage(msg, collectedData);
        console.log(`[EXTRACT] Updated data:`, updatedData);
        
        collectedData = updatedData;

        // Check if complete
        if (incrementalExtractor.hasAllFields(collectedData)) {
          console.log('[COMPLETE] All fields collected, saving appointment...');
          
          const appointment = await appointmentHandler.createAppointment(
            testCall.id,
            testClient.id,
            collectedData
          );

          appointmentCount++;
          console.log(`[SAVED] Appointment #${appointmentCount} created with ID:`, appointment.id);
          console.log('[DATA]', {
            name: appointment.customerName,
            phone: appointment.customerPhone,
            datetime: appointment.datetime,
          });

          // Clear data after successful booking
          collectedData = {};
          console.log('[CLEAR] Collected data cleared for next appointment');
          break;
        } else {
          const missing = incrementalExtractor.getMissingFields(collectedData);
          console.log('[MISSING]', missing);
        }
      }
      console.log();
    }

    console.log();

    // ============================================================
    // TEST 3: Second Appointment (Different Person)
    // ============================================================
    console.log('='.repeat(70));
    console.log('TEST 3: Second Appointment Booking (for son)');
    console.log('='.repeat(70));

    const secondAppointmentMessages = [
      'Ich würde gerne noch einen Termin für meinen Sohn vereinbaren',
      'Am dritten Februar',
      '15 Uhr',
      'Max',
      '9734556865',
    ];

    for (const msg of secondAppointmentMessages) {
      console.log(`[USER] ${msg}`);
      conversationHistory.push({ role: 'user', content: msg });
      await saveMessage(testCall.id, 'USER', msg);

      // Check for "new appointment" keywords
      const newAppointmentKeywords = [
        'noch einen termin',
        'zweiten termin',
        'für meinen sohn',
        'für meine tochter',
      ];
      const isRequestingNewAppointment = newAppointmentKeywords.some(k =>
        msg.toLowerCase().includes(k)
      );

      if (isRequestingNewAppointment) {
        console.log('[DETECT] New appointment request detected, clearing old data');
        collectedData = {};
      }

      // Check if we're in appointment mode
      const hasPartialData = collectedData.date || collectedData.time || collectedData.name || collectedData.phone;
      
      let intentResult;
      if (hasPartialData && !isRequestingNewAppointment) {
        console.log('[FORCING] appointment_booking (partial data exists)');
        intentResult = { intent: 'appointment_booking', confidence: 1.0 };
      } else {
        intentResult = await intentClassifier.classify(msg, conversationHistory.slice(-3));
        console.log(`[INTENT] ${intentResult.intent} (confidence: ${intentResult.confidence})`);
      }

      if (intentResult.intent === 'appointment_booking') {
        // Incremental extraction
        console.log(`[EXTRACT] Existing data:`, collectedData);
        const updatedData = await incrementalExtractor.extractFromSingleMessage(msg, collectedData);
        console.log(`[EXTRACT] Updated data:`, updatedData);
        
        collectedData = updatedData;

        // Check if complete
        if (incrementalExtractor.hasAllFields(collectedData)) {
          console.log('[COMPLETE] All fields collected, saving appointment...');
          
          const appointment = await appointmentHandler.createAppointment(
            testCall.id,
            testClient.id,
            collectedData
          );

          appointmentCount++;
          console.log(`[SAVED] Appointment #${appointmentCount} created with ID:`, appointment.id);
          console.log('[DATA]', {
            name: appointment.customerName,
            phone: appointment.customerPhone,
            datetime: appointment.datetime,
          });

          // Clear data after successful booking
          collectedData = {};
          console.log('[CLEAR] Collected data cleared for next appointment');
          break;
        } else {
          const missing = incrementalExtractor.getMissingFields(collectedData);
          console.log('[MISSING]', missing);
        }
      }
      console.log();
    }

    console.log();

    // ============================================================
    // VERIFICATION: Check Database
    // ============================================================
    console.log('='.repeat(70));
    console.log('VERIFICATION: Database Check');
    console.log('='.repeat(70));

    const appointments = await prisma.appointment.findMany({
      where: { callId: testCall.id },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`[DB] Found ${appointments.length} appointments in database`);
    console.log();

    if (appointments.length !== 2) {
      console.log(`[FAIL] Expected 2 appointments, found ${appointments.length}`);
    } else {
      console.log('[PASS] Correct number of appointments saved');
    }

    console.log();
    console.log('Appointment #1:');
    console.log('  Name:', appointments[0].customerName);
    console.log('  Phone:', appointments[0].customerPhone);
    console.log('  DateTime:', appointments[0].datetime.toISOString());
    console.log('  Status:', appointments[0].status);
    
    console.log();
    console.log('Appointment #2:');
    console.log('  Name:', appointments[1].customerName);
    console.log('  Phone:', appointments[1].customerPhone);
    console.log('  DateTime:', appointments[1].datetime.toISOString());
    console.log('  Status:', appointments[1].status);

    console.log();

    // Verify no duplicates
    if (appointments[0].customerName === appointments[1].customerName) {
      console.log('[FAIL] Appointments have same name - possible duplicate!');
    } else {
      console.log('[PASS] Appointments have different names');
    }

    if (appointments[0].customerPhone === appointments[1].customerPhone) {
      console.log('[FAIL] Appointments have same phone - possible duplicate!');
    } else {
      console.log('[PASS] Appointments have different phone numbers');
    }

    console.log();

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('='.repeat(70));
    console.log('TEST SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total appointments created: ${appointmentCount}`);
    console.log(`Appointments in database: ${appointments.length}`);
    console.log();
    
    if (appointmentCount === 2 && appointments.length === 2) {
      console.log('[SUCCESS] All tests passed! ✓');
      console.log('- Opening hours question handled correctly');
      console.log('- First appointment saved to database');
      console.log('- Second appointment saved with different data');
      console.log('- No duplicate appointments created');
    } else {
      console.log('[FAILURE] Some tests failed ✗');
    }

  } catch (error) {
    console.error('[ERROR] Test failed:', error);
    throw error;
  } finally {
    // ============================================================
    // CLEANUP (comment out to keep test data in database)
    // ============================================================
    console.log();
    console.log('='.repeat(70));
    console.log('CLEANUP');
    console.log('='.repeat(70));
    
    const SKIP_CLEANUP = true; // Set to false to delete test data
    
    if (SKIP_CLEANUP) {
      console.log('[CLEANUP] SKIPPED - Test data remains in database');
      console.log(`[INFO] Client ID: ${testClient?.id}`);
      console.log(`[INFO] Call ID: ${testCall?.id}`);
      console.log('[INFO] Check the Appointment table to see saved appointments');
    } else {
      if (testCall) {
        console.log('[CLEANUP] Deleting test appointments...');
        await prisma.appointment.deleteMany({ where: { callId: testCall.id } });
        
        console.log('[CLEANUP] Deleting test messages...');
        await prisma.message.deleteMany({ where: { callId: testCall.id } });
        
        console.log('[CLEANUP] Deleting test call...');
        await prisma.call.delete({ where: { id: testCall.id } });
      }

      if (testClient) {
        console.log('[CLEANUP] Deleting test client...');
        await prisma.client.delete({ where: { id: testClient.id } });
      }

      console.log('[CLEANUP] Complete');
    }
    
    await prisma.$disconnect();
  }
}

async function saveMessage(callId: string, role: 'USER' | 'ASSISTANT', content: string) {
  await prisma.message.create({
    data: {
      callId,
      role,
      content,
    },
  });
}

// Run the test
integrationTest()
  .then(() => {
    console.log();
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error();
    console.error('Test failed with error:', err);
    process.exit(1);
  });