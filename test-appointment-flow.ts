import { claudeService } from './src/services/ai/claude.service.js';
import { appointmentHandler } from './src/services/business-logic/appointment.handler.js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

async function test() {
  console.log('=== Testing Appointment Booking Flow ===\n');
  
  // Simulate first appointment booking
  const conversation1: Message[] = [
    { role: 'assistant', content: 'Wann möchten Sie einen Termin?' },
    { role: 'user', content: 'Am dritten Februar' },
    { role: 'assistant', content: 'Zu welcher Uhrzeit?' },
    { role: 'user', content: '13 Uhr' },
    { role: 'assistant', content: 'Wie ist Ihr Name?' },
    { role: 'user', content: 'Alex' },
    { role: 'assistant', content: 'Und Ihre Telefonnummer?' },
    { role: 'user', content: '111111' },
  ];
  
  console.log('First Appointment - Full conversation:');
  conversation1.forEach(msg => {
    console.log(`  [${msg.role}] ${msg.content}`);
  });
  
  console.log('\nExtracting first appointment...');
  const data1 = await appointmentHandler.extractDetails(conversation1);
  console.log('Result:', JSON.stringify(data1, null, 2));
  console.log('Has all required fields?', appointmentHandler.hasRequiredFields(data1));
  
  if (appointmentHandler.hasRequiredFields(data1)) {
    console.log('[PASS] First appointment would be saved to database');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('NEW APPOINTMENT REQUEST (simulating "für meinen Sohn")');
  console.log('='.repeat(60) + '\n');
  
  // This is what happens when user says "noch einen Termin für meinen Sohn"
  // We should ONLY look at the last 2 messages
  const conversation2: Message[] = [
    { role: 'assistant', content: 'Kann ich Ihnen sonst noch weiterhelfen?' },
    { role: 'user', content: 'Ich würde gerne noch einen Termin für meinen Sohn vereinbaren' },
  ];
  
  console.log('Second Appointment - Using only last 2 messages:');
  conversation2.forEach(msg => {
    console.log(`  [${msg.role}] ${msg.content}`);
  });
  
  console.log('\nExtracting second appointment (should be empty)...');
  const data2 = await appointmentHandler.extractDetails(conversation2);
  console.log('Result:', JSON.stringify(data2, null, 2));
  console.log('Is empty?', Object.keys(data2).length === 0, '(should be true)');
  
  if (Object.keys(data2).length > 0) {
    console.log('[FAIL] PROBLEM: Extracted old appointment data!');
    console.log('[FAIL] This means appointment extractor saw old conversation');
  } else {
    console.log('[PASS] CORRECT: No old data extracted');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Testing with FULL conversation history (the bug scenario)');
  console.log('='.repeat(60) + '\n');
  
  // This is the BUG - when we pass the FULL conversation
  const fullConversation: Message[] = [
    ...conversation1,
    { role: 'assistant', content: 'Termin für Alex am 3. Februar um 13:00 Uhr bestätigt. Kann ich Ihnen sonst noch weiterhelfen?' },
    { role: 'user', content: 'Ich würde gerne noch einen Termin für meinen Sohn vereinbaren' },
  ];
  
  console.log('Using ALL messages (last 10):');
  fullConversation.slice(-10).forEach(msg => {
    console.log(`  [${msg.role}] ${msg.content}`);
  });
  
  console.log('\nExtracting with full history (simulating the bug)...');
  const data3 = await appointmentHandler.extractDetails(fullConversation.slice(-10));
  console.log('Result:', JSON.stringify(data3, null, 2));
  
  if (data3.name === 'Alex' && data3.phone === '556894') {
    console.log('[FAIL] BUG CONFIRMED: Old appointment data leaked through!');
  } else {
    console.log('[PASS] Bug fixed: No old data in extraction');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log('First appointment extraction:', appointmentHandler.hasRequiredFields(data1) ? '[PASS] Complete' : '[FAIL] Incomplete');
  console.log('Second appointment (2 messages):', Object.keys(data2).length === 0 ? '[PASS] Empty (correct)' : '[FAIL] Has data (wrong)');
  console.log('Full history extraction:', data3.name === 'Alex' ? '[FAIL] Bug present' : '[PASS] Bug fixed');
}

test().catch(err => {
  console.error('[ERROR] Test failed:', err);
  process.exit(1);
});