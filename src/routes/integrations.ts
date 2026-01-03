import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { oauthService } from '../services/integrations/oauth.service.js';
import { googleCalendarService } from '../services/integrations/google-calendar.service.js';
import { calendarSyncService } from '../services/integrations/calendar-sync.service.js';
import { prisma } from '../server.js';
import { env } from '../config/env.js';

export async function integrationRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/integrations/google-calendar/auth/url
   * Generate OAuth authorization URL
   */
  fastify.get('/api/integrations/google-calendar/auth/url', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = z.object({
        clientId: z.string(),
      }).parse(request.query);

      const authUrl = oauthService.generateAuthUrl(query.clientId);

      return { authUrl };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.code(400);
        return { error: 'Invalid query parameters', details: err.issues };
      }
      throw err;
    }
  });

  /**
   * POST /api/integrations/google-calendar/auth/callback
   * Complete OAuth flow - exchange code for tokens
   */
  fastify.post('/api/integrations/google-calendar/auth/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = z.object({
        code: z.string(),
        clientId: z.string(),
      }).parse(request.body);

      await oauthService.exchangeCodeForTokens(body.code, body.clientId);

      // Set up webhook subscription
      const webhookUrl = env.GOOGLE_CALENDAR_WEBHOOK_URL || `${env.TWILIO_WEBHOOK_URL}/webhooks/google-calendar/notifications`;
      await googleCalendarService.watchCalendar(body.clientId, webhookUrl);

      return {
        success: true,
        message: 'Google Calendar connected successfully',
      };
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        reply.code(400);
        return { error: 'Invalid request body', details: err.issues };
      }

      fastify.log.error({ err }, 'Failed to complete Google Calendar OAuth');
      reply.code(500);
      return {
        error: 'Failed to connect Google Calendar',
        message: err.message,
      };
    }
  });

  /**
   * DELETE /api/integrations/google-calendar/disconnect
   * Disconnect Google Calendar integration
   */
  fastify.delete('/api/integrations/google-calendar/disconnect', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = z.object({
        clientId: z.string(),
      }).parse(request.query);

      // Stop watching calendar
      await googleCalendarService.stopWatching(query.clientId);

      // Revoke OAuth access
      await oauthService.revokeAccess(query.clientId);

      return {
        success: true,
        message: 'Google Calendar disconnected successfully',
      };
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        reply.code(400);
        return { error: 'Invalid query parameters', details: err.issues };
      }

      fastify.log.error({ err }, 'Failed to disconnect Google Calendar');
      reply.code(500);
      return {
        error: 'Failed to disconnect Google Calendar',
        message: err.message,
      };
    }
  });

  /**
   * GET /api/integrations/google-calendar/status
   * Get connection status
   */
  fastify.get('/api/integrations/google-calendar/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = z.object({
        clientId: z.string(),
      }).parse(request.query);

      const client = await prisma.client.findUnique({
        where: { id: query.clientId },
        include: {
          calendarWebhook: true,
        },
      });

      if (!client) {
        reply.code(404);
        return { error: 'Client not found' };
      }

      const googleCalendarConfig = (client.integrations as any)?.googleCalendar;

      if (!googleCalendarConfig?.enabled) {
        return {
          connected: false,
        };
      }

      return {
        connected: true,
        calendarId: googleCalendarConfig.calendarId,
        connectedAt: googleCalendarConfig.connectedAt,
        lastSyncAt: googleCalendarConfig.lastSyncAt,
        webhookActive: client.calendarWebhook?.isActive || false,
        webhookExpiration: client.calendarWebhook?.expiration,
      };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.code(400);
        return { error: 'Invalid query parameters', details: err.issues };
      }
      throw err;
    }
  });

  /**
   * POST /api/integrations/google-calendar/sync/manual
   * Manually trigger sync
   */
  fastify.post('/api/integrations/google-calendar/sync/manual', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = z.object({
        clientId: z.string(),
        appointmentId: z.string().optional(),
      }).parse(request.body);

      if (body.appointmentId) {
        // Sync specific appointment
        await calendarSyncService.syncAppointmentToCalendar(body.appointmentId, 'CREATE');
        return {
          success: true,
          synced: 1,
          failed: 0,
        };
      } else {
        // Sync all appointments for client
        const appointments = await prisma.appointment.findMany({
          where: {
            clientId: body.clientId,
            calendarId: null, // Only sync appointments not yet in calendar
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
        });

        let synced = 0;
        let failed = 0;

        for (const appointment of appointments) {
          try {
            await calendarSyncService.syncAppointmentToCalendar(appointment.id, 'CREATE');
            synced++;
          } catch (err) {
            failed++;
            fastify.log.error({ err, appointmentId: appointment.id }, 'Failed to sync appointment');
          }
        }

        return {
          success: true,
          synced,
          failed,
        };
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.code(400);
        return { error: 'Invalid request body', details: err.issues };
      }
      throw err;
    }
  });

  /**
   * POST /webhooks/google-calendar/notifications
   * Receive Google Calendar push notifications
   */
  fastify.post('/webhooks/google-calendar/notifications', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const channelId = request.headers['x-goog-channel-id'] as string;
      const resourceState = request.headers['x-goog-resource-state'] as string;
      const resourceId = request.headers['x-goog-resource-id'] as string;

      if (!channelId) {
        reply.code(400);
        return { error: 'Missing channel ID' };
      }

      // Find webhook by channel ID
      const webhook = await prisma.calendarWebhook.findUnique({
        where: { channelId },
      });

      if (!webhook) {
        // Unknown webhook, ignore
        return { success: true };
      }

      // Handle different resource states
      if (resourceState === 'sync') {
        // Initial sync notification, just acknowledge
        return { success: true };
      }

      if (resourceState === 'exists') {
        // Calendar was updated, fetch changes
        // For now, we'll do a simple approach: fetch recent events and sync them
        // In production, you'd want to use sync tokens for more efficient syncing

        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        try {
          const events = await googleCalendarService.listEvents(
            webhook.clientId,
            yesterday,
            new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // Next 30 days
          );

          // Sync each event (this is simplified - in production you'd be more selective)
          for (const event of events) {
            if (event.id) {
              try {
                await calendarSyncService.syncCalendarEventToAppointment(
                  webhook.clientId,
                  event.id,
                  'UPDATE'
                );
              } catch (err) {
                fastify.log.error({ err, eventId: event.id }, 'Failed to sync calendar event');
              }
            }
          }
        } catch (err) {
          fastify.log.error({ err, clientId: webhook.clientId }, 'Failed to process calendar webhook');
        }
      }

      return { success: true };
    } catch (err) {
      fastify.log.error({ err }, 'Error processing calendar webhook');
      // Return 200 anyway to prevent Google from retrying
      return { success: true };
    }
  });

  /**
   * GET /api/integrations/google-calendar/sync-history
   * Get sync history
   */
  fastify.get('/api/integrations/google-calendar/sync-history', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = z.object({
        clientId: z.string(),
        page: z.string().optional().default('1').transform(Number),
        limit: z.string().optional().default('20').transform(Number),
      }).parse(request.query);

      const page = query.page;
      const limit = query.limit;

      const [syncs, total] = await Promise.all([
        prisma.calendarSync.findMany({
          where: { clientId: query.clientId },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            appointment: {
              select: {
                customerName: true,
                datetime: true,
              },
            },
          },
        }),
        prisma.calendarSync.count({
          where: { clientId: query.clientId },
        }),
      ]);

      return {
        data: syncs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.code(400);
        return { error: 'Invalid query parameters', details: err.issues };
      }
      throw err;
    }
  });
}
