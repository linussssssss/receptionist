/**
 * GDPR/DSGVO Compliance API Routes
 *
 * Endpoints for:
 * - Data Subject Search (find all data for a person)
 * - Data Erasure Requests (Right to be Forgotten)
 * - Erasure Request Management (approve/reject/execute)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { authenticate, requireRole } from '../hooks/auth.hook.js';
import {
  searchDataSubject,
  createErasureRequest,
  approveErasureRequest,
  rejectErasureRequest,
  executeErasure,
  getErasureRequests,
  getErasureRequest,
} from '../services/gdpr/erasure.service.js';
import { RATE_LIMIT_PRESETS, KEY_GENERATORS } from '../config/rate-limits.js';

// Request schemas
const searchSubjectSchema = z.object({
  identifier: z.string().min(1),
  identifierType: z.enum(['phone', 'email']),
});

const createErasureSchema = z.object({
  identifier: z.string().min(1),
  identifierType: z.enum(['phone', 'email']),
});

const rejectErasureSchema = z.object({
  reason: z.string().min(1).max(500),
});

export async function gdprRoutes(fastify: FastifyInstance) {
  // Apply auth to all routes
  fastify.addHook('preHandler', authenticate);

  /**
   * POST /api/gdpr/search
   * Search for all data belonging to a data subject
   * Requires: ADMIN or STAFF
   */
  fastify.post(
    '/gdpr/search',
    {
      config: {
        rateLimit: {
          ...RATE_LIMIT_PRESETS.API_STANDARD,
          keyGenerator: KEY_GENERATORS.byUser,
        },
      },
    },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const body = searchSubjectSchema.parse(request.body);
      const { clientId } = request.user!;

      const result = await searchDataSubject(
        prisma,
        clientId,
        body.identifier,
        body.identifierType
      );

      return {
        success: true,
        data: result,
      };
    }
  );

  /**
   * GET /api/gdpr/erasure-requests
   * List all erasure requests for the client
   * Requires: ADMIN
   */
  fastify.get(
    '/gdpr/erasure-requests',
    {
      preHandler: [requireRole('ADMIN')],
      config: {
        rateLimit: {
          ...RATE_LIMIT_PRESETS.API_STANDARD,
          keyGenerator: KEY_GENERATORS.byUser,
        },
      },
    },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { clientId } = request.user!;
      const { status } = request.query as { status?: string };

      const validStatuses = ['PENDING', 'APPROVED', 'EXECUTED', 'REJECTED'];
      const statusFilter = status && validStatuses.includes(status)
        ? (status as 'PENDING' | 'APPROVED' | 'EXECUTED' | 'REJECTED')
        : undefined;

      const requests = await getErasureRequests(prisma, clientId, statusFilter);

      // Mask identifiers for security (show only last 4 chars)
      const maskedRequests = requests.map((req) => ({
        id: req.id,
        subjectIdentifierMasked: `****${req.subjectIdentifier.slice(-4)}`,
        status: req.status,
        requestedBy: req.requestedBy,
        approvedBy: req.approvedBy,
        executedAt: req.executedAt,
        recordsDeleted: req.recordsDeleted,
        createdAt: req.createdAt,
      }));

      return {
        success: true,
        data: maskedRequests,
      };
    }
  );

  /**
   * POST /api/gdpr/erasure-requests
   * Create a new erasure request
   * Requires: ADMIN or STAFF
   */
  fastify.post(
    '/gdpr/erasure-requests',
    {
      config: {
        rateLimit: {
          ...RATE_LIMIT_PRESETS.API_STANDARD,
          keyGenerator: KEY_GENERATORS.byUser,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createErasureSchema.parse(request.body);
      const { userId, clientId } = request.user!;

      // First search to verify data exists
      const searchResult = await searchDataSubject(
        prisma,
        clientId,
        body.identifier,
        body.identifierType
      );

      if (!searchResult.found) {
        reply.code(404);
        return {
          success: false,
          error: 'No data found for this identifier',
        };
      }

      // Create erasure request
      const requestId = await createErasureRequest(
        prisma,
        clientId,
        userId,
        body.identifier,
        body.identifierType
      );

      reply.code(201);
      return {
        success: true,
        data: {
          requestId,
          status: 'PENDING',
          message: 'Erasure request created. Requires admin approval before execution.',
          dataFound: {
            calls: searchResult.callCount,
            messages: searchResult.messageCount,
            appointments: searchResult.appointmentCount,
          },
        },
      };
    }
  );

  /**
   * GET /api/gdpr/erasure-requests/:id
   * Get details of a specific erasure request
   * Requires: ADMIN
   */
  fastify.get(
    '/gdpr/erasure-requests/:id',
    {
      preHandler: [requireRole('ADMIN')],
      config: {
        rateLimit: {
          ...RATE_LIMIT_PRESETS.API_STANDARD,
          keyGenerator: KEY_GENERATORS.byUser,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { clientId } = request.user!;

      const erasureRequest = await getErasureRequest(prisma, id);

      if (!erasureRequest || erasureRequest.clientId !== clientId) {
        reply.code(404);
        return {
          success: false,
          error: 'Erasure request not found',
        };
      }

      return {
        success: true,
        data: {
          id: erasureRequest.id,
          subjectIdentifierMasked: `****${erasureRequest.subjectIdentifier.slice(-4)}`,
          status: erasureRequest.status,
          requestedBy: erasureRequest.requestedBy,
          approvedBy: erasureRequest.approvedBy,
          executedAt: erasureRequest.executedAt,
          recordsDeleted: erasureRequest.recordsDeleted,
          createdAt: erasureRequest.createdAt,
        },
      };
    }
  );

  /**
   * POST /api/gdpr/erasure-requests/:id/approve
   * Approve an erasure request
   * Requires: ADMIN
   */
  fastify.post(
    '/gdpr/erasure-requests/:id/approve',
    {
      preHandler: [requireRole('ADMIN')],
      config: {
        rateLimit: {
          ...RATE_LIMIT_PRESETS.API_STANDARD,
          keyGenerator: KEY_GENERATORS.byUser,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { userId, clientId } = request.user!;

      const erasureRequest = await getErasureRequest(prisma, id);

      if (!erasureRequest || erasureRequest.clientId !== clientId) {
        reply.code(404);
        return {
          success: false,
          error: 'Erasure request not found',
        };
      }

      if (erasureRequest.status !== 'PENDING') {
        reply.code(400);
        return {
          success: false,
          error: `Request cannot be approved (current status: ${erasureRequest.status})`,
        };
      }

      await approveErasureRequest(prisma, id, userId);

      return {
        success: true,
        message: 'Erasure request approved. You can now execute the erasure.',
      };
    }
  );

  /**
   * POST /api/gdpr/erasure-requests/:id/reject
   * Reject an erasure request
   * Requires: ADMIN
   */
  fastify.post(
    '/gdpr/erasure-requests/:id/reject',
    {
      preHandler: [requireRole('ADMIN')],
      config: {
        rateLimit: {
          ...RATE_LIMIT_PRESETS.API_STANDARD,
          keyGenerator: KEY_GENERATORS.byUser,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = rejectErasureSchema.parse(request.body);
      const { userId, clientId } = request.user!;

      const erasureRequest = await getErasureRequest(prisma, id);

      if (!erasureRequest || erasureRequest.clientId !== clientId) {
        reply.code(404);
        return {
          success: false,
          error: 'Erasure request not found',
        };
      }

      if (erasureRequest.status !== 'PENDING') {
        reply.code(400);
        return {
          success: false,
          error: `Request cannot be rejected (current status: ${erasureRequest.status})`,
        };
      }

      await rejectErasureRequest(prisma, id, userId, body.reason);

      return {
        success: true,
        message: 'Erasure request rejected.',
      };
    }
  );

  /**
   * POST /api/gdpr/erasure-requests/:id/execute
   * Execute an approved erasure request (IRREVERSIBLE!)
   * Requires: ADMIN
   */
  fastify.post(
    '/gdpr/erasure-requests/:id/execute',
    {
      preHandler: [requireRole('ADMIN')],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 hour', // Very restrictive - erasure is serious
          keyGenerator: KEY_GENERATORS.byUser,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { userId, clientId } = request.user!;

      const erasureRequest = await getErasureRequest(prisma, id);

      if (!erasureRequest || erasureRequest.clientId !== clientId) {
        reply.code(404);
        return {
          success: false,
          error: 'Erasure request not found',
        };
      }

      if (erasureRequest.status !== 'APPROVED') {
        reply.code(400);
        return {
          success: false,
          error: `Request must be approved before execution (current status: ${erasureRequest.status})`,
        };
      }

      // Execute the erasure
      const result = await executeErasure(prisma, id, userId);

      if (!result.success) {
        reply.code(500);
        return {
          success: false,
          error: 'Erasure failed',
          details: result.errors,
        };
      }

      return {
        success: true,
        message: 'Data erasure completed successfully.',
        data: {
          deletedCalls: result.deletedCalls,
          deletedMessages: result.deletedMessages,
          anonymizedAppointments: result.anonymizedAppointments,
        },
      };
    }
  );
}
