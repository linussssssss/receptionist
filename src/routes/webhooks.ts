import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { env } from '../config/env.js';
import { twilioService } from '../services/telephony/twilio.service.js';
import { callSessionManager } from '../services/telephony/call-session.manager.js';
import { claudeService } from '../services/ai/claude.service.js';
import { intentClassifier } from '../services/business-logic/intent.classifier.js';
import { appointmentHandler } from '../services/business-logic/appointment.handler.js';
import { incrementalExtractor } from '../services/business-logic/incremental-extractor.service.js';
// Prompts are now managed in the database via Client.llmSystemPrompt
import type {
  TwilioIncomingCallEvent,
  TwilioCallStatusEvent,
  TwilioGatherEvent,
} from '../types/twilio.js';

// Webhook payload schemas
const incomingCallSchema = z.object({
  CallSid: z.string(),
  From: z.string(),
  To: z.string(),
  CallStatus: z.string(),
  Direction: z.string(),
});

const statusCallbackSchema = z.object({
  CallSid: z.string(),
  CallStatus: z.string(),
  CallDuration: z.string().optional(),
  From: z.string(),
  To: z.string(),
});

const gatherSchema = z.object({
  CallSid: z.string(),
  SpeechResult: z.string().optional(),
  Digits: z.string().optional(),
});

export async function webhookRoutes(fastify: FastifyInstance) {
  /**
   * POST /webhooks/twilio/voice
   * Called when a call comes in
   */
  fastify.post(
    '/webhooks/twilio/voice',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const event = incomingCallSchema.parse(request.body) as TwilioIncomingCallEvent;
        
        fastify.log.info({ event }, 'Incoming call received');

        // Validate webhook signature for security
        const signature = request.headers['x-twilio-signature'] as string;
        const url = `${env.TWILIO_WEBHOOK_URL}/webhooks/twilio/voice`;
        
        if (!twilioService.validateRequest(url, request.body as Record<string, any>, signature)) {
          fastify.log.warn('Invalid Twilio signature');
          reply.code(403);
          return { error: 'Forbidden' };
        }

        // Find which client this number belongs to
        const client = await prisma.client.findUnique({
          where: { phoneNumber: event.To },
        });

        if (!client) {
          fastify.log.warn(`No client found for number: ${event.To}`);
          reply.type('text/xml');
          return twilioService.createSayAndHangup(
            'Diese Nummer ist nicht konfiguriert. Auf Wiederhören.'
          );
        }

        if (!client.isActive) {
          fastify.log.warn(`Client ${client.id} is not active`);
          reply.type('text/xml');
          return twilioService.createSayAndHangup(
            'Dieser Service ist derzeit nicht verfügbar. Auf Wiederhören.'
          );
        }

        // Create call record in database
        const call = await prisma.call.create({
          data: {
            callSid: event.CallSid,
            clientId: client.id,
            callerNumber: event.From,
            callerName: event.CallerName,
            status: 'RINGING',
          },
        });

        // Create session in memory
        callSessionManager.createSession(event.CallSid, client.id, event.From);

        // Log system event
        await prisma.systemEvent.create({
          data: {
            eventType: 'call_started',
            severity: 'info',
            message: `New call from ${event.From}`,
            clientId: client.id,
            callId: call.id,
            details: event as any,
          },
        });

        // Respond with greeting and gather input
        const greeting = client.greetingMessage || 'Guten Tag, wie kann ich Ihnen helfen?';
        const actionUrl = `${env.TWILIO_WEBHOOK_URL}/webhooks/twilio/gather`;
        
        reply.type('text/xml');
        return twilioService.createGreetingResponse(greeting, actionUrl);
        
      } catch (err) {
        fastify.log.error({ err }, 'Error handling incoming call');
        reply.type('text/xml');
        return twilioService.createSayAndHangup(
          'Es tut mir leid, ein Fehler ist aufgetreten. Auf Wiederhören.'
        );
      }
    }
  );

  /**
   * POST /webhooks/twilio/gather
   * Called after user speaks (speech recognition result)
   */
  fastify.post(
    '/webhooks/twilio/gather',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const event = gatherSchema.parse(request.body) as TwilioGatherEvent;
        
        fastify.log.info({ event }, 'Speech input received');

        const userSpeech = event.SpeechResult || event.Digits || '';
        
        if (!userSpeech) {
          reply.type('text/xml');
          return twilioService.createGatherResponse(
            'Entschuldigung, ich habe Sie nicht verstanden. Können Sie das bitte wiederholen?',
            `${env.TWILIO_WEBHOOK_URL}/webhooks/twilio/gather`
          );
        }

        // Get session
        const session = callSessionManager.getSession(event.CallSid);
        if (!session) {
          fastify.log.warn('Session not found for call:', event.CallSid);
          reply.type('text/xml');
          return twilioService.createSayAndHangup('Es tut mir leid, ein Fehler ist aufgetreten.');
        }

        // Add user message to session
        await callSessionManager.addMessage(event.CallSid, 'user', userSpeech);

        // Save user message to database
        const call = await prisma.call.findFirst({
          where: { callSid: event.CallSid },
        });

        if (call) {
          await prisma.message.create({
            data: {
              callId: call.id,
              role: 'USER',
              content: userSpeech,
            },
          });
        }

        // Get client config
        const client = await prisma.client.findUnique({
          where: { id: session.clientId },
        });

        if (!client) {
          reply.type('text/xml');
          return twilioService.createSayAndHangup('Es tut mir leid, ein Fehler ist aufgetreten.');
        }

        // Check if user is explicitly requesting a NEW appointment
        const newAppointmentKeywords = [
          'noch einen termin',
          'zweiten termin',
          'anderen termin',
          'neuen termin',
          'weiteren termin',
          'für meinen sohn',
          'für meine tochter',
          'für mein kind',
        ];
        const isRequestingNewAppointment = newAppointmentKeywords.some(keyword =>
          userSpeech.toLowerCase().includes(keyword)
        );

        if (isRequestingNewAppointment) {
          // Clear old appointment data for new booking
          console.log('New appointment request detected, clearing collected data');
          callSessionManager.updateCollectedData(event.CallSid, {});
        }

        // ⚠️ CRITICAL FIX: Get FRESH session data after potential clearing
        // The old 'session' variable is stale if we just cleared data above
        const freshSession = callSessionManager.getSession(event.CallSid);
        if (!freshSession) {
          reply.type('text/xml');
          return twilioService.createSayAndHangup('Es tut mir leid, ein Fehler ist aufgetreten.');
        }
        
        const currentData = freshSession.collectedData || {};
        const hasPartialAppointmentData = 
          currentData.date || 
          currentData.time || 
          currentData.name || 
          (currentData.phone && currentData.phone !== freshSession.callerNumber);

        let intentResult;

        if (hasPartialAppointmentData && !isRequestingNewAppointment) {
          // Already booking - force appointment intent
          console.log('Partial appointment data detected, forcing appointment_booking intent');
          fastify.log.info({ currentData }, 'Forcing appointment_booking intent');
          intentResult = {
            intent: 'appointment_booking',
            confidence: 1.0,
            data: currentData,
          };
        } else {
          // Normal intent classification
          intentResult = await intentClassifier.classify(
            userSpeech,
            freshSession.conversationHistory
          );
        }

        fastify.log.info({ intentResult }, 'Intent classified');

        // Store intent
        callSessionManager.setIntent(event.CallSid, intentResult.intent);

        // Check if should escalate
        const shouldEscalate = intentClassifier.shouldEscalate(
          intentResult.intent,
          intentResult.confidence,
          freshSession.conversationHistory,
          client.escalationRules
        );

        if (shouldEscalate) {
          fastify.log.info('Escalating call to human');
          reply.type('text/xml');
          return twilioService.createSayAndHangup(
            'Einen Moment bitte, ich verbinde Sie mit einem Mitarbeiter.'
          );
        }

        // Handle appointment booking
        if (intentResult.intent === 'appointment_booking') {
          // INCREMENTAL EXTRACTION: Extract from ONLY the current user message
          console.log('Using incremental extraction for:', userSpeech);
          console.log('Existing data:', currentData);
          
          const updatedData = await incrementalExtractor.extractFromSingleMessage(
            userSpeech,
            currentData
          );

          console.log('Updated data after extraction:', updatedData);
          
          // Update session with new data
          callSessionManager.updateCollectedData(event.CallSid, updatedData);

          // Check if we have all required fields
          if (incrementalExtractor.hasAllFields(updatedData)) {
            // Create appointment
            try {
              if (!call) {
                throw new Error('Call record not found');
              }

              await appointmentHandler.createAppointment(
                call.id,
                client.id,
                updatedData
              );

              const confirmation = appointmentHandler.generateConfirmation(updatedData);
              await callSessionManager.addMessage(event.CallSid, 'assistant', confirmation);

              // Save confirmation message
              await prisma.message.create({
                data: {
                  callId: call.id,
                  role: 'ASSISTANT',
                  content: confirmation,
                },
              });

              // Clear collected data after successful booking
              callSessionManager.updateCollectedData(event.CallSid, {});
              console.log('Appointment created successfully, cleared collected data');

              // Continue conversation
              reply.type('text/xml');
              return twilioService.createGatherResponse(
                confirmation + ' Kann ich Ihnen sonst noch weiterhelfen?',
                `${env.TWILIO_WEBHOOK_URL}/webhooks/twilio/gather`
              );
            } catch (err) {
              fastify.log.error({ err }, 'Failed to create appointment');
              
              const errorMessage = 'Entschuldigung, es gab ein Problem beim Speichern des Termins. Bitte versuchen Sie es später erneut oder rufen Sie uns direkt an.';
              await callSessionManager.addMessage(event.CallSid, 'assistant', errorMessage);
              
              if (call) {
                await prisma.message.create({
                  data: {
                    callId: call.id,
                    role: 'ASSISTANT',
                    content: errorMessage,
                  },
                });
              }
              
              reply.type('text/xml');
              return twilioService.createGatherResponse(
                errorMessage,
                `${env.TWILIO_WEBHOOK_URL}/webhooks/twilio/gather`
              );
            }
          } else {
            // Ask for next missing field
            const prompt = incrementalExtractor.generatePromptForNextField(updatedData);
            
            await callSessionManager.addMessage(event.CallSid, 'assistant', prompt);

            // Save prompt message
            if (call) {
              await prisma.message.create({
                data: {
                  callId: call.id,
                  role: 'ASSISTANT',
                  content: prompt,
                },
              });
            }

            reply.type('text/xml');
            return twilioService.createGatherResponse(
              prompt,
              `${env.TWILIO_WEBHOOK_URL}/webhooks/twilio/gather`
            );
          }
        }

        // Use the client's custom system prompt from database
        // This allows editing the prompt through the Settings page
        const systemPrompt = client.llmSystemPrompt;

        // Generate AI response using Claude
        const aiResponse = await claudeService.generateResponse(
          systemPrompt,
          freshSession.conversationHistory,
          userSpeech
        );

        await callSessionManager.addMessage(event.CallSid, 'assistant', aiResponse.response);

        // Save assistant message to database
        if (call) {
          await prisma.message.create({
            data: {
              callId: call.id,
              role: 'ASSISTANT',
              content: aiResponse.response,
            },
          });
        }

        // Continue conversation
        reply.type('text/xml');
        return twilioService.createGatherResponse(
          aiResponse.response,
          `${env.TWILIO_WEBHOOK_URL}/webhooks/twilio/gather`
        );
        
      } catch (err) {
        fastify.log.error({ err }, 'Error processing speech input');
        reply.type('text/xml');
        return twilioService.createSayAndHangup(
          'Es tut mir leid, ein Fehler ist aufgetreten. Auf Wiederhören.'
        );
      }
    }
  );

  /**
   * POST /webhooks/twilio/status
   * Called when call status changes
   */
  fastify.post(
    '/webhooks/twilio/status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const event = statusCallbackSchema.parse(request.body) as TwilioCallStatusEvent;
        
        fastify.log.info({ event }, 'Call status update');

        await prisma.call.updateMany({
          where: { callSid: event.CallSid },
          data: {
            status: event.CallStatus.toUpperCase() as any,
            endTime: event.CallStatus === 'completed' ? new Date() : undefined,
            duration: event.CallDuration ? parseInt(event.CallDuration) : undefined,
          },
        });

        if (event.CallStatus === 'completed') {
          const session = callSessionManager.endSession(event.CallSid);
          
          await prisma.systemEvent.create({
            data: {
              eventType: 'call_ended',
              severity: 'info',
              message: `Call ended with status: ${event.CallStatus}`,
              callId: event.CallSid,
              details: {
                ...event,
                sessionData: session as any,
              } as any,
            },
          });
        }

        return { status: 'ok' };
        
      } catch (err) {
        fastify.log.error({ err }, 'Error handling status callback');
        reply.code(500);
        return { error: 'Internal server error' };
      }
    }
  );

  /**
   * GET /webhooks/twilio/test
   */
  fastify.get('/webhooks/twilio/test', async (_request, _reply) => {
    return {
      message: 'Twilio webhooks are configured correctly',
      timestamp: new Date().toISOString(),
    };
  });
}