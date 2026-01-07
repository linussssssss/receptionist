import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { calendarSyncService } from '../services/integrations/calendar-sync.service.js';
import { authenticate, requireRole, injectClientContext } from '../hooks/auth.hook.js';

// Query parameter schemas
const paginationSchema = z.object({
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('20').transform(Number),
});

const callsQuerySchema = paginationSchema.extend({
  status: z.enum(['RINGING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'NO_ANSWER', 'BUSY', 'CANCELLED']).optional(),
  from: z.string().optional(), // Start date (ISO string)
  to: z.string().optional(), // End date (ISO string)
  callerNumber: z.string().optional(),
  clientId: z.string().optional(),
});

const appointmentsQuerySchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  clientId: z.string().optional(),
});

const analyticsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  clientId: z.string().optional(),
});

const updateAppointmentSchema = z.object({
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email().optional().nullable(),
  datetime: z.string().datetime().optional(),
  durationMinutes: z.number().int().positive().optional(),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED']).optional(),
});

const updateClientSettingsSchema = z.object({
  name: z.string().min(1).optional(),
  greetingMessage: z.string().min(1).optional(),
  llmSystemPrompt: z.string().optional(),
  businessHours: z.any().optional(), // JsonValue type from Prisma
  escalationRules: z.any().optional(),
  voiceId: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function apiRoutes(fastify: FastifyInstance) {
  // Apply authentication to all routes in this plugin
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', injectClientContext);

  /**
   * GET /api/calls
   * List all calls with pagination and filters
   */
  fastify.get('/api/calls', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = callsQuerySchema.parse(request.query);
      const { page, limit, status, from, to, callerNumber } = query;
      const skip = (page - 1) * limit;

      // Build where clause - Always filter by authenticated user's client
      const where: any = {
        clientId: request.user!.clientId,
      };
      if (status) where.status = status;
      if (callerNumber) where.callerNumber = { contains: callerNumber };
      if (from || to) {
        where.startTime = {};
        if (from) where.startTime.gte = new Date(from);
        if (to) where.startTime.lte = new Date(to);
      }

      const [calls, total] = await Promise.all([
        prisma.call.findMany({
          where,
          skip,
          take: limit,
          orderBy: { startTime: 'desc' },
          include: {
            client: {
              select: { id: true, name: true },
            },
            _count: {
              select: { messages: true, appointments: true },
            },
          },
        }),
        prisma.call.count({ where }),
      ]);

      return {
        data: calls,
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

  /**
   * GET /api/calls/:id
   * Get call details with full transcript
   */
  fastify.get('/api/calls/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;

    const call = await prisma.call.findFirst({
      where: {
        id,
        clientId: request.user!.clientId, // Verify call belongs to user's client
      },
      include: {
        client: {
          select: { id: true, name: true, phoneNumber: true },
        },
        messages: {
          orderBy: { timestamp: 'asc' },
        },
        appointments: true,
      },
    });

    if (!call) {
      reply.code(404);
      return { error: 'Call not found' };
    }

    return { data: call };
  });

  /**
   * GET /api/appointments
   * List appointments with pagination and filters
   */
  fastify.get('/api/appointments', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = appointmentsQuerySchema.parse(request.query);
      const { page, limit, status, from, to } = query;
      const skip = (page - 1) * limit;

      const where: any = {
        clientId: request.user!.clientId, // Always filter by user's client
      };
      if (status) where.status = status;
      if (from || to) {
        where.datetime = {};
        if (from) where.datetime.gte = new Date(from);
        if (to) where.datetime.lte = new Date(to);
      }

      const [appointments, total] = await Promise.all([
        prisma.appointment.findMany({
          where,
          skip,
          take: limit,
          orderBy: { datetime: 'desc' },
          include: {
            client: {
              select: { id: true, name: true },
            },
            call: {
              select: { id: true, callSid: true, callerNumber: true },
            },
          },
        }),
        prisma.appointment.count({ where }),
      ]);

      return {
        data: appointments,
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

  /**
   * GET /api/appointments/:id
   * Get a single appointment by ID
   */
  fastify.get('/api/appointments/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;

    const appointment = await prisma.appointment.findFirst({
      where: {
        id,
        clientId: request.user!.clientId, // Verify appointment belongs to user's client
      },
      include: {
        client: { select: { id: true, name: true } },
        call: { select: { id: true, callSid: true, callerNumber: true } },
      },
    });

    if (!appointment) {
      reply.code(404);
      return { error: 'Appointment not found' };
    }

    return { data: appointment };
  });

  /**
   * PATCH /api/appointments/:id
   * Update an appointment
   */
  fastify.patch('/api/appointments/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const updates = updateAppointmentSchema.parse(request.body);

      // Check if appointment exists and belongs to user's client
      const existingAppointment = await prisma.appointment.findFirst({
        where: {
          id,
          clientId: request.user!.clientId,
        },
        include: { client: true },
      });

      if (!existingAppointment) {
        reply.code(404);
        return { error: 'Appointment not found' };
      }

      // Prepare update data
      const updateData: any = { ...updates };
      if (updates.datetime) {
        updateData.datetime = new Date(updates.datetime);
      }

      // Update appointment
      const updatedAppointment = await prisma.appointment.update({
        where: { id },
        data: updateData,
        include: {
          client: { select: { id: true, name: true } },
          call: { select: { id: true, callSid: true, callerNumber: true } },
        },
      });

      // Sync to Google Calendar if enabled
      if (existingAppointment.client.integrations) {
        const googleCalendarConfig = (existingAppointment.client.integrations as any)?.googleCalendar;
        if (googleCalendarConfig?.enabled && updatedAppointment.calendarId) {
          // Sync in background - don't block appointment update
          calendarSyncService.syncAppointmentToCalendar(updatedAppointment.id, 'UPDATE')
            .catch(err => {
              request.log.error({ err, appointmentId: updatedAppointment.id },
                'Failed to sync appointment update to Google Calendar');
            });
        }
      }

      return { data: updatedAppointment };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.code(400);
        return { error: 'Invalid request data', details: err.issues };
      }
      throw err;
    }
  });

  /**
   * DELETE /api/appointments/:id
   * Cancel an appointment
   */
  fastify.delete('/api/appointments/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;

      // Check if appointment exists and belongs to user's client
      const existingAppointment = await prisma.appointment.findFirst({
        where: {
          id,
          clientId: request.user!.clientId,
        },
        include: { client: true },
      });

      if (!existingAppointment) {
        reply.code(404);
        return { error: 'Appointment not found' };
      }

      // Sync deletion to Google Calendar if enabled
      if (existingAppointment.client.integrations) {
        const googleCalendarConfig = (existingAppointment.client.integrations as any)?.googleCalendar;
        if (googleCalendarConfig?.enabled && existingAppointment.calendarId) {
          // Sync in background - don't block appointment deletion
          calendarSyncService.syncAppointmentToCalendar(existingAppointment.id, 'DELETE')
            .catch(err => {
              request.log.error({ err, appointmentId: existingAppointment.id },
                'Failed to sync appointment deletion to Google Calendar');
            });
        }
      }

      // Mark as cancelled instead of deleting
      const cancelledAppointment = await prisma.appointment.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: {
          client: { select: { id: true, name: true } },
          call: { select: { id: true, callSid: true, callerNumber: true } },
        },
      });

      return { data: cancelledAppointment, message: 'Appointment cancelled successfully' };
    } catch (err) {
      throw err;
    }
  });

  /**
   * GET /api/analytics
   * Get call analytics and statistics
   */
  fastify.get('/api/analytics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = analyticsQuerySchema.parse(request.query);
      const { from, to } = query;

      // Default to last 30 days if no date range specified
      const endDate = to ? new Date(to) : new Date();
      const startDate = from ? new Date(from) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get clientId from authenticated user
      const clientId = request.user!.clientId;

      const where: any = {
        clientId, // Always filter by user's client
        startTime: {
          gte: startDate,
          lte: endDate,
        },
      };

      // Get all stats in parallel
      const [
        totalCalls,
        callsByStatus,
        callsByIntent,
        avgDuration,
        appointmentsCreated,
        callsPerDay,
        appointmentsByStatus,
        callsByHour,
        uniqueCustomers,
        returningCustomers,
      ] = await Promise.all([
        // Total calls
        prisma.call.count({ where }),

        // Calls by status
        prisma.call.groupBy({
          by: ['status'],
          where,
          _count: { status: true },
        }),

        // Calls by intent
        prisma.call.groupBy({
          by: ['intent'],
          where: { ...where, intent: { not: null } },
          _count: { intent: true },
        }),

        // Average duration (completed calls only)
        prisma.call.aggregate({
          where: { ...where, status: 'COMPLETED', duration: { not: null } },
          _avg: { duration: true },
        }),

        // Appointments created in date range
        prisma.appointment.count({
          where: {
            createdAt: { gte: startDate, lte: endDate },
            ...(clientId ? { clientId } : {}),
          },
        }),

        // Calls per day (for chart)
        clientId
          ? prisma.$queryRaw`
              SELECT
                DATE("startTime") as date,
                COUNT(*)::int as count
              FROM "Call"
              WHERE "startTime" >= ${startDate}
                AND "startTime" <= ${endDate}
                AND "clientId" = ${clientId}
              GROUP BY DATE("startTime")
              ORDER BY date ASC
            ` as Promise<{ date: Date; count: number }[]>
          : prisma.$queryRaw`
              SELECT
                DATE("startTime") as date,
                COUNT(*)::int as count
              FROM "Call"
              WHERE "startTime" >= ${startDate}
                AND "startTime" <= ${endDate}
              GROUP BY DATE("startTime")
              ORDER BY date ASC
            ` as Promise<{ date: Date; count: number }[]>,

        // Appointments by status
        prisma.appointment.groupBy({
          by: ['status'],
          where: {
            createdAt: { gte: startDate, lte: endDate },
            ...(clientId ? { clientId } : {}),
          },
          _count: { status: true },
        }),

        // Calls by hour (peak times)
        clientId
          ? prisma.$queryRaw`
              SELECT
                EXTRACT(HOUR FROM "startTime")::int as hour,
                COUNT(*)::int as count
              FROM "Call"
              WHERE "startTime" >= ${startDate}
                AND "startTime" <= ${endDate}
                AND "clientId" = ${clientId}
              GROUP BY EXTRACT(HOUR FROM "startTime")
              ORDER BY hour ASC
            ` as Promise<{ hour: number; count: number }[]>
          : prisma.$queryRaw`
              SELECT
                EXTRACT(HOUR FROM "startTime")::int as hour,
                COUNT(*)::int as count
              FROM "Call"
              WHERE "startTime" >= ${startDate}
                AND "startTime" <= ${endDate}
              GROUP BY EXTRACT(HOUR FROM "startTime")
              ORDER BY hour ASC
            ` as Promise<{ hour: number; count: number }[]>,

        // Unique customers (by phone number) - grouped to get call counts
        prisma.call.groupBy({
          by: ['callerNumber'],
          where,
          _count: { callerNumber: true },
        }),

        // Placeholder for returning customers (will calculate from uniqueCustomers)
        Promise.resolve([]),
      ]);

      // Calculate appointment booking rate (appointments per total calls)
      const bookingSuccessRate = totalCalls > 0
        ? (appointmentsCreated / totalCalls) * 100
        : 0;

      // Calculate customer retention metrics
      // Filter customers who have called more than once
      const customersWithCallCounts = uniqueCustomers;
      const totalUniqueCustomers = customersWithCallCounts.length;
      const totalReturningCustomers = customersWithCallCounts.filter(
        c => c._count.callerNumber > 1
      ).length;
      const retentionRate = totalUniqueCustomers > 0
        ? (totalReturningCustomers / totalUniqueCustomers) * 100
        : 0;

      return {
        data: {
          summary: {
            totalCalls,
            avgDurationSeconds: Math.round(avgDuration._avg.duration || 0),
            appointmentsCreated,
            bookingSuccessRate: Math.round(bookingSuccessRate * 10) / 10,
            uniqueCustomers: totalUniqueCustomers,
            returningCustomers: totalReturningCustomers,
            retentionRate: Math.round(retentionRate * 10) / 10,
          },
          callsByStatus: callsByStatus.map(s => ({
            status: s.status,
            count: s._count.status,
          })),
          callsByIntent: callsByIntent.map(i => ({
            intent: i.intent,
            count: i._count.intent,
          })),
          appointmentsByStatus: appointmentsByStatus.map(a => ({
            status: a.status,
            count: a._count.status,
          })),
          callsByHour: callsByHour.map(h => ({
            hour: h.hour,
            count: h.count,
          })),
          callsPerDay,
          dateRange: {
            from: startDate.toISOString(),
            to: endDate.toISOString(),
          },
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

  /**
   * GET /api/client/settings
   * Get client configuration
   */
  fastify.get('/api/client/settings', async (request: FastifyRequest, reply: FastifyReply) => {
    // Get user's client
    const client = await prisma.client.findUnique({
      where: { id: request.user!.clientId },
    });

    if (!client) {
      reply.code(404);
      return { error: 'Client not found' };
    }

    return {
      data: {
        id: client.id,
        name: client.name,
        industry: client.industry,
        phoneNumber: client.phoneNumber,
        email: client.email,
        businessHours: client.businessHours,
        greetingMessage: client.greetingMessage,
        llmSystemPrompt: client.llmSystemPrompt,
        voiceId: client.voiceId,
        escalationRules: client.escalationRules,
        isActive: client.isActive,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
      },
    };
  });

  /**
   * PUT /api/client/settings
   * Update client configuration (Admin only)
   */
  fastify.put('/api/client/settings', {
    preHandler: requireRole('ADMIN'),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const updates = updateClientSettingsSchema.parse(request.body);

      const updatedClient = await prisma.client.update({
        where: { id: request.user!.clientId },
        data: updates,
      });

      // Log the settings change
      await prisma.systemEvent.create({
        data: {
          eventType: 'settings_updated',
          severity: 'info',
          message: `Client settings updated by ${request.user!.email}`,
          clientId: request.user!.clientId,
          userId: request.user!.userId,
          details: { updates } as any,
        },
      });

      return {
        data: {
          id: updatedClient.id,
          name: updatedClient.name,
          industry: updatedClient.industry,
          phoneNumber: updatedClient.phoneNumber,
          email: updatedClient.email,
          businessHours: updatedClient.businessHours,
          greetingMessage: updatedClient.greetingMessage,
          llmSystemPrompt: updatedClient.llmSystemPrompt,
          voiceId: updatedClient.voiceId,
          escalationRules: updatedClient.escalationRules,
          isActive: updatedClient.isActive,
          createdAt: updatedClient.createdAt,
          updatedAt: updatedClient.updatedAt,
        },
        message: 'Settings updated successfully',
      };
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.code(400);
        return { error: 'Invalid request body', details: err.issues };
      }
      throw err;
    }
  });

  /**
   * POST /api/client/settings/test-greeting
   * Preview how the greeting would sound (returns TTS URL or text)
   */
  fastify.post('/api/client/settings/test-greeting', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = z.object({ message: z.string().min(1) }).parse(request.body);

    // For now, just return the text. In production, this could:
    // 1. Generate TTS audio via ElevenLabs
    // 2. Return a URL to the audio file
    return {
      data: {
        text: body.message,
        // audioUrl: 'https://...' // Future: ElevenLabs TTS preview
      },
      message: 'Greeting preview generated',
    };
  });
}
