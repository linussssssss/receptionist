import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import rateLimit from '@fastify/rate-limit';
import { authService } from '../services/auth/auth.service.js';
import { invitationService } from '../services/auth/invitation.service.js';
import { authenticate, requireRole } from '../hooks/auth.hook.js';
import { prisma } from '../server.js';
import { env } from '../config/env.js';
import { KEY_GENERATORS } from '../config/rate-limits.js';

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  invitationToken: z.string().min(1),
  name: z.string().min(1),
  password: z.string().min(8),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

const inviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'STAFF']),
});

const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(['ADMIN', 'STAFF']).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function authRoutes(fastify: FastifyInstance) {
  // Register rate limiting plugin
  await fastify.register(rateLimit, {
    global: false, // Don't apply globally, we'll apply to specific routes
    max: env.LOGIN_RATE_LIMIT,
    timeWindow: '1 minute',
  });

  /**
   * POST /api/auth/login
   * Authenticate user and return JWT tokens
   * Rate limited to prevent brute force attacks
   */
  fastify.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: env.LOGIN_RATE_LIMIT,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      
      const { email, password } = loginSchema.parse(request.body);

      // Attempt login
      const result = await authService.login(email, password);

      // Log successful login
      await prisma.systemEvent.create({
        data: {
          eventType: 'user_login',
          severity: 'info',
          message: `User ${email} logged in successfully`,
          userId: result.user.id,
          clientId: result.user.clientId,
        },
      });

      return reply.send({
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            role: result.user.role,
            clientId: result.user.clientId,
            isActive: result.user.isActive,
            lastLoginAt: result.user.lastLoginAt,
          },
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (err) {
      // Log failed login attempt
      const body = request.body as any;
      if (body?.email) {
        await prisma.systemEvent.create({
          data: {
            eventType: 'login_failed',
            severity: 'warning',
            message: `Failed login attempt for ${body.email}`,
            details: { ip: request.ip } as any,
          },
        });
      }

      return reply.code(401).send({
        error: 'Invalid credentials',
        message: err instanceof Error ? err.message : 'Login failed',
      });
    }
  }
);

  /**
   * POST /api/auth/register
   * Register new user with invitation token
   * Rate limited to prevent abuse
   */
  fastify.post(
    '/api/auth/register',
    {
      config: {
        rateLimit: {
          max: env.LOGIN_RATE_LIMIT,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { invitationToken, name, password } = registerSchema.parse(request.body);

      // Validate invitation
      const invitation = await invitationService.validateInvitationToken(invitationToken);

      if (!invitation) {
        return reply.code(400).send({
          error: 'Invalid invitation',
          message: 'Invalid or expired invitation token',
        });
      }

      // Accept invitation and create user
      const user = await invitationService.acceptInvitation(invitationToken, {
        name,
        password,
      });

      // Generate tokens
      const sessionToken = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      const refreshTokenId = `refresh-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

      // Create session
      const session = await authService.createSession(user.id, sessionToken, {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      // Generate JWT tokens
      const accessToken = authService.generateAccessToken(user, sessionToken);
      const refreshToken = authService.generateRefreshToken(user, refreshTokenId);

      // Update session with refresh token
      await prisma.session.update({
        where: { id: session.id },
        data: { refreshToken: refreshTokenId },
      });

      // Log registration
      await prisma.systemEvent.create({
        data: {
          eventType: 'user_registered',
          severity: 'info',
          message: `User ${user.email} registered successfully`,
          userId: user.id,
          clientId: user.clientId,
        },
      });

      return reply.send({
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            clientId: user.clientId,
          },
          accessToken,
          refreshToken,
        },
        message: 'Registration successful',
      });
    } catch (err) {
      return reply.code(400).send({
        error: 'Registration failed',
        message: err instanceof Error ? err.message : 'Failed to register user',
      });
    }
  }
);

  /**
   * POST /api/auth/refresh
   * Refresh access token using refresh token
   * Rate limited: 50 req/min per IP
   */
  fastify.post('/api/auth/refresh', {
    config: {
      rateLimit: {
        max: 50,
        timeWindow: '1 minute',
        keyGenerator: KEY_GENERATORS.byIP,
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { refreshToken } = refreshTokenSchema.parse(request.body);

      const result = await authService.refreshAccessToken(refreshToken);

      return reply.send({
        data: {
          accessToken: result.accessToken,
        },
      });
    } catch (err) {
      return reply.code(401).send({
        error: 'Invalid refresh token',
        message: 'Token refresh failed',
      });
    }
  });

  /**
   * POST /api/auth/logout
   * Invalidate current session
   */
  fastify.post(
    '/api/auth/logout',
    {
      preHandler: authenticate,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authHeader = request.headers.authorization!;
        const token = authHeader.substring(7);
        const payload = await authService.verifyToken(token);

        await authService.logout(payload.jti);

        return reply.send({ message: 'Logged out successfully' });
      } catch (err) {
        return reply.code(400).send({
          error: 'Logout failed',
        });
      }
    }
  );

  /**
   * GET /api/auth/me
   * Get current user info
   */
  fastify.get(
    '/api/auth/me',
    {
      preHandler: authenticate,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await authService.getUserById(request.user!.userId);

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      return reply.send({
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          clientId: user.clientId,
          isActive: user.isActive,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
        },
      });
    }
  );

  /**
   * POST /api/auth/invite
   * Admin only: Invite new user
   * Rate limited: 10 req/min per user
   */
  fastify.post(
    '/api/auth/invite',
    {
      preHandler: [authenticate, requireRole('ADMIN')],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: KEY_GENERATORS.byUser,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { email, role } = inviteUserSchema.parse(request.body);

        // Check if user already exists
        const existingUser = await authService.getUserByEmail(email);
        if (existingUser) {
          return reply.code(400).send({
            error: 'User already exists',
            message: 'A user with this email already exists',
          });
        }

        // Create invitation
        const invitation = await invitationService.createInvitation({
          email,
          role,
          clientId: request.user!.clientId,
          invitedBy: request.user!.userId,
        });

        // Send invitation email
        await invitationService.sendInvitationEmail(invitation as any);

        return reply.send({
          data: {
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            expiresAt: invitation.expiresAt,
            status: invitation.status,
          },
          message: 'Invitation sent successfully',
        });
      } catch (err) {
        return reply.code(400).send({
          error: 'Failed to send invitation',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/auth/invitations
   * Admin only: List all invitations
   */
  fastify.get(
    '/api/auth/invitations',
    {
      preHandler: [authenticate, requireRole('ADMIN')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const invitations = await prisma.invitation.findMany({
        where: {
          clientId: request.user!.clientId,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          inviter: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return reply.send({ data: invitations });
    }
  );

  /**
   * GET /api/auth/invitations/validate
   * Public: Validate invitation token (for registration page)
   */
  fastify.get(
    '/api/auth/invitations/validate',
    async (request: FastifyRequest<{ Querystring: { token: string } }>, reply: FastifyReply) => {
      try {
        const { token } = request.query;

        if (!token) {
          return reply.code(400).send({ error: 'Token is required' });
        }

        const invitation = await invitationService.validateInvitationToken(token);

        if (!invitation) {
          return reply.code(404).send({ error: 'Invalid or expired invitation' });
        }

        return reply.send({
          data: {
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            status: invitation.status,
            expiresAt: invitation.expiresAt,
            inviter: invitation.inviter,
          },
        });
      } catch (err) {
        return reply.code(400).send({
          error: 'Failed to validate invitation',
        });
      }
    }
  );

  /**
   * DELETE /api/auth/invitations/:id
   * Admin only: Revoke invitation
   */
  fastify.delete(
    '/api/auth/invitations/:id',
    {
      preHandler: [authenticate, requireRole('ADMIN')],
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        // Verify invitation belongs to user's client
        const invitation = await prisma.invitation.findFirst({
          where: {
            id,
            clientId: request.user!.clientId,
          },
        });

        if (!invitation) {
          return reply.code(404).send({ error: 'Invitation not found' });
        }

        await invitationService.revokeInvitation(id);

        return reply.send({ message: 'Invitation revoked successfully' });
      } catch (err) {
        return reply.code(400).send({
          error: 'Failed to revoke invitation',
        });
      }
    }
  );

  /**
   * GET /api/auth/users
   * Admin only: List all users in client
   */
  fastify.get(
    '/api/auth/users',
    {
      preHandler: [authenticate, requireRole('ADMIN')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const users = await prisma.user.findMany({
        where: {
          clientId: request.user!.clientId,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });

      return reply.send({ data: users });
    }
  );

  /**
   * PATCH /api/auth/users/:id
   * Admin only: Update user (activate/deactivate, change role)
   */
  fastify.patch(
    '/api/auth/users/:id',
    {
      preHandler: [authenticate, requireRole('ADMIN')],
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const updates = updateUserSchema.parse(request.body);

        // Verify user belongs to same client
        const user = await prisma.user.findFirst({
          where: {
            id,
            clientId: request.user!.clientId,
          },
        });

        if (!user) {
          return reply.code(404).send({ error: 'User not found' });
        }

        // Cannot deactivate yourself
        if (user.id === request.user!.userId && updates.isActive === false) {
          return reply.code(400).send({
            error: 'Cannot deactivate your own account',
          });
        }

        const updatedUser = await prisma.user.update({
          where: { id },
          data: updates,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
          },
        });

        // Log user update
        await prisma.systemEvent.create({
          data: {
            eventType: 'user_updated',
            severity: 'info',
            message: `User ${updatedUser.email} updated by ${request.user!.email}`,
            userId: request.user!.userId,
            clientId: request.user!.clientId,
            details: { updates } as any,
          },
        });

        return reply.send({
          data: updatedUser,
          message: 'User updated successfully',
        });
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.code(400).send({
            error: 'Invalid request data',
            details: err.issues,
          });
        }
        return reply.code(400).send({
          error: 'Failed to update user',
        });
      }
    }
  );

  /**
   * PUT /api/auth/password
   * Change own password
   * Rate limited to prevent brute force attacks
   */
  fastify.put(
    '/api/auth/password',
    {
      preHandler: authenticate,
      config: {
        rateLimit: {
          max: env.LOGIN_RATE_LIMIT,
          timeWindow: '1 minute',
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);

        const user = await authService.getUserById(request.user!.userId);
        if (!user) {
          return reply.code(404).send({ error: 'User not found' });
        }

        // Verify current password
        const isValid = await authService.verifyPassword(currentPassword, user.passwordHash);
        if (!isValid) {
          return reply.code(401).send({
            error: 'Invalid password',
            message: 'Current password is incorrect',
          });
        }

        // Validate new password strength
        const validation = authService.validatePasswordStrength(newPassword);
        if (!validation.valid) {
          return reply.code(400).send({
            error: 'Password does not meet requirements',
            details: validation.errors,
          });
        }

        // Hash and update password
        const newHash = await authService.hashPassword(newPassword);
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: newHash },
        });

        // Invalidate all existing sessions except current
        const authHeader = request.headers.authorization!;
        const token = authHeader.substring(7);
        const payload = await authService.verifyToken(token);

        await prisma.session.updateMany({
          where: {
            userId: user.id,
            token: { not: payload.jti },
          },
          data: {
            isActive: false,
            revokedAt: new Date(),
          },
        });

        // Log password change
        await prisma.systemEvent.create({
          data: {
            eventType: 'password_changed',
            severity: 'info',
            message: `User ${user.email} changed password`,
            userId: user.id,
            clientId: user.clientId,
          },
        });

        return reply.send({ message: 'Password changed successfully' });
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.code(400).send({
            error: 'Invalid request data',
            details: err.issues,
          });
        }
        return reply.code(400).send({
          error: 'Failed to change password',
        });
      }
    }
  );
}
