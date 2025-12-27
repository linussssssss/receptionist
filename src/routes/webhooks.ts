import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { env } from '../config/env.js';
import { twilioService } from '../services/telephony/twilio.service.js';
import { callSessionManager } from '../services/telephony/call-session.manager.js';
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

        // Add user message to session
        callSessionManager.addMessage(event.CallSid, 'user', userSpeech);

        // TODO: Phase 3 - Send to Claude for AI processing
        // For now, just echo back
        const aiResponse = `Sie haben gesagt: ${userSpeech}. Wie kann ich Ihnen weiter helfen?`;
        
        callSessionManager.addMessage(event.CallSid, 'assistant', aiResponse);

        // Continue gathering
        reply.type('text/xml');
        return twilioService.createGatherResponse(
          aiResponse,
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