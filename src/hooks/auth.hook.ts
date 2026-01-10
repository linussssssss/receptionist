import type { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from '../services/auth/auth.service.js';
import { prisma } from '../server.js';

// Extend Fastify request interface to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      clientId: string;
      role: 'ADMIN' | 'STAFF';
      email: string;
    };
  }
}

/**
 * Authentication hook
 * Verifies JWT token and attaches user info to request
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.substring(7);

    // Verify token
    const payload = await authService.verifyToken(token);

    // Check if session is still active
    const session = await prisma.session.findFirst({
      where: {
        token: payload.jti,
        isActive: true,
        expiresAt: { gte: new Date() },
      },
    });

    if (!session) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired session',
      });
    }

    // Update last used timestamp (fire-and-forget)
    prisma.session
      .update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {
        // Ignore errors updating lastUsedAt
      });

    // Attach user info to request
    request.user = {
      userId: payload.userId,
      clientId: payload.clientId,
      role: payload.role,
      email: payload.email,
    };
  } catch (err) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid token',
    });
  }
}

/**
 * Role-based access control hook
 * Checks if user has one of the allowed roles
 */
export function requireRole(...allowedRoles: Array<'ADMIN' | 'STAFF'>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource',
      });
    }
  };
}

/**
 * Client context injection hook
 * Ensures users can only access their own client's data
 */
export async function injectClientContext(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (request.user && request.user.clientId) {
    // For GET/POST/PATCH/DELETE requests with clientId in query params or body,
    // validate it matches user's client
    const query = request.query as any;
    const body = request.body as any;

    const requestClientId = query?.clientId || body?.clientId;

    if (requestClientId && requestClientId !== request.user.clientId) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Cannot access data from another client',
      });
    }
  }
}

/**
 * Optional authentication hook
 * Attaches user if token is present, but doesn't fail if missing
 */
export async function optionalAuthenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = await authService.verifyToken(token);

      // Check session
      const session = await prisma.session.findFirst({
        where: {
          token: payload.jti,
          isActive: true,
          expiresAt: { gte: new Date() },
        },
      });

      if (session) {
        request.user = {
          userId: payload.userId,
          clientId: payload.clientId,
          role: payload.role,
          email: payload.email,
        };
      }
    }
  } catch (err) {
    // Silently fail - this is optional auth
  }
}
