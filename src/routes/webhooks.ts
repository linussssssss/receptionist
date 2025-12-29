import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { env } from '../config/env.js';
import { twilioService } from '../services/telephony/twilio.service.js';
import { callSessionManager } from '../services/telephony/call-session.manager.js';
import { claudeService } from '../services/ai/claude.service.js';
import { intentClassifier } from '../services/business-logic/intent.classifier.js';
import { appointmentHandler } from '../services/business-logic/appointment.handler.js';
import { buildReceptionistPrompt, defaultBusinessContext, type BusinessContext } from '../prompts/index.js';
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
          // No input detected
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

        // Classify intent
        const intentResult = await intentClassifier.classify(
          userSpeech,
          session.conversationHistory
        );

        fastify.log.info({ intentResult }, 'Intent classified');

        // Store intent
        callSessionManager.setIntent(event.CallSid, intentResult.intent);

        // Check if should escalate
        const shouldEscalate = intentClassifier.shouldEscalate(
          intentResult.intent,
          intentResult.confidence,
          session.conversationHistory,
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
          // Extract appointment details
          const appointmentData = await appointmentHandler.extractDetails(
            session.conversationHistory
          );

          callSessionManager.updateCollectedData(event.CallSid, appointmentData);

          // Check if we have all required fields
          if (appointmentHandler.hasRequiredFields(appointmentData)) {
            // Create appointment
            try {
              // Get the Call database record
              if (!call) {
                throw new Error('Call record not found');
              }

              await appointmentHandler.createAppointment(
                call.id,
                client.id,
                appointmentData
              );

              const confirmation = appointmentHandler.generateConfirmation(appointmentData);
              await callSessionManager.addMessage(event.CallSid, 'assistant', confirmation);

              // Save confirmation message
              await prisma.message.create({
                data: {
                  callId: call.id,
                  role: 'ASSISTANT',
                  content: confirmation,
                },
              });

              reply.type('text/xml');
              return twilioService.createSayAndHangup(confirmation);
            } catch (err) {
              fastify.log.error({ err }, 'Failed to create appointment');
            }
          } else {
            // Ask for missing information
            const missingFields = appointmentHandler.getMissingFields(appointmentData);
            const prompt = appointmentHandler.generateCollectionPrompt(missingFields);
            
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

        // ============================================
        // THIS IS THE KEY CHANGE:
        // Build the proper receptionist prompt instead of using client.llmSystemPrompt
        // ============================================
        
        // Build business context - using defaults for now since these fields
        // aren't in the Client model yet. You can add them to your Prisma schema later.
        const businessContext: BusinessContext = {
          // For now, we'll use the default business context
          // Later you can pull these from client fields once you add them to your schema
          ...defaultBusinessContext,
          
          // Override with any client-specific data you DO have:
          companyName: client.name || defaultBusinessContext.companyName,
          // businessType: client.businessType || defaultBusinessContext.businessType, // Add to schema later
          // services: client.services || defaultBusinessContext.services, // Add to schema later
          // etc.
        };

        // Generate the strong receptionist prompt
        const systemPrompt = buildReceptionistPrompt(businessContext);

        // Generate AI response using Claude with the proper prompt
        const aiResponse = await claudeService.generateResponse(
          systemPrompt,  // <-- NOW USING THE STRONG PROMPT
          session.conversationHistory,
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
   * Called when call status changes (answered, completed, etc.)
   */
  fastify.post(
    '/webhooks/twilio/status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const event = statusCallbackSchema.parse(request.body) as TwilioCallStatusEvent;
        
        fastify.log.info({ event }, 'Call status update');

        // Update call status in database
        await prisma.call.updateMany({
          where: { callSid: event.CallSid },
          data: {
            status: event.CallStatus.toUpperCase() as any,
            endTime: event.CallStatus === 'completed' ? new Date() : undefined,
            duration: event.CallDuration ? parseInt(event.CallDuration) : undefined,
          },
        });

        // If call completed, end session
        if (event.CallStatus === 'completed') {
          const session = callSessionManager.endSession(event.CallSid);
          
          // Log completion
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
   * Test endpoint to verify webhooks are working
   */
  fastify.get('/webhooks/twilio/test', async (_request, _reply) => {
    return {
      message: 'Twilio webhooks are configured correctly',
      timestamp: new Date().toISOString(),
    };
  });
}