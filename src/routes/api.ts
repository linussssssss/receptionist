import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';

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
  /**
   * GET /api/calls
   * List all calls with pagination and filters
   */
  fastify.get('/api/calls', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = callsQuerySchema.parse(request.query);
      const { page, limit, status, from, to, callerNumber, clientId } = query;
      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {};
      if (status) where.status = status;
      if (callerNumber) where.callerNumber = { contains: callerNumber };
      if (clientId) where.clientId = clientId;
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

    const call = await prisma.call.findUnique({
      where: { id },
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
      const { page, limit, status, from, to, clientId } = query;
      const skip = (page - 1) * limit;

      const where: any = {};
      if (status) where.status = status;
      if (clientId) where.clientId = clientId;
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
   * GET /api/analytics
   * Get call analytics and statistics
   */
  fastify.get('/api/analytics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = analyticsQuerySchema.parse(request.query);
      const { from, to, clientId } = query;

      // Default to last 30 days if no date range specified
      const endDate = to ? new Date(to) : new Date();
      const startDate = from ? new Date(from) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      const where: any = {
        startTime: {
          gte: startDate,
          lte: endDate,
        },
      };
      if (clientId) where.clientId = clientId;

      // Get all stats in parallel
      const [
        totalCalls,
        callsByStatus,
        callsByIntent,
        avgDuration,
        appointmentsCreated,
        callsPerDay,
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
      ]);

      // Calculate appointment booking rate
      const appointmentIntentCalls = callsByIntent.find(c => c.intent === 'appointment_booking')?._count?.intent || 0;
      const bookingSuccessRate = appointmentIntentCalls > 0
        ? (appointmentsCreated / appointmentIntentCalls) * 100
        : 0;

      return {
        data: {
          summary: {
            totalCalls,
            avgDurationSeconds: Math.round(avgDuration._avg.duration || 0),
            appointmentsCreated,
            bookingSuccessRate: Math.round(bookingSuccessRate * 10) / 10,
          },
          callsByStatus: callsByStatus.map(s => ({
            status: s.status,
            count: s._count.status,
          })),
          callsByIntent: callsByIntent.map(i => ({
            intent: i.intent,
            count: i._count.intent,
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
  fastify.get('/api/client/settings', async (request: FastifyRequest<{ Querystring: { clientId?: string } }>, reply: FastifyReply) => {
    const { clientId } = request.query;

    // For now, get the first client or by ID
    // In production, this would be based on authenticated user
    const client = clientId
      ? await prisma.client.findUnique({ where: { id: clientId } })
      : await prisma.client.findFirst();

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
   * Update client configuration
   */
  fastify.put('/api/client/settings', async (request: FastifyRequest<{ Querystring: { clientId?: string } }>, reply: FastifyReply) => {
    try {
      const { clientId } = request.query;
      const updates = updateClientSettingsSchema.parse(request.body);

      // Get client to update
      const existingClient = clientId
        ? await prisma.client.findUnique({ where: { id: clientId } })
        : await prisma.client.findFirst();

      if (!existingClient) {
        reply.code(404);
        return { error: 'Client not found' };
      }

      const updatedClient = await prisma.client.update({
        where: { id: existingClient.id },
        data: updates,
      });

      // Log the settings change
      await prisma.systemEvent.create({
        data: {
          eventType: 'settings_updated',
          severity: 'info',
          message: `Client settings updated`,
          clientId: existingClient.id,
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
