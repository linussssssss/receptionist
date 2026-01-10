import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { PrismaClient } from '@prisma/client';
import { webhookRoutes } from './routes/webhooks.js';
import { authRoutes } from './routes/auth.js';
import { apiRoutes } from './routes/api.js';
import { audioRoutes } from './routes/audio.js';
import { integrationRoutes } from './routes/integrations.js';
import fastifyFormbody from '@fastify/formbody';
import { startScheduledJobs, stopScheduledJobs } from './jobs/scheduler.js';
import { redisService } from './config/redis.js';
import { initSentry, captureError, flushSentry, isSentryEnabled } from './config/sentry.js';

// Initialize Sentry early for error tracking
initSentry();

// Initialize Prisma Client
export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport: env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  },
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'reqId',
  disableRequestLogging: false,
  trustProxy: true,
  bodyLimit: 1048576, // 1MB
});

// Register plugins
await fastify.register(fastifyFormbody);

await fastify.register(cors, {
  origin: env.ALLOWED_ORIGINS.split(','),
  credentials: true,
});

await fastify.register(websocket, {
  options: {
    maxPayload: 1048576, // 1MB for audio chunks
  },
});

// Register rate limiting plugin globally (non-global by default, routes opt-in)
// Redis store will be configured at runtime if available
await fastify.register(rateLimit, {
  global: false, // Routes must explicitly opt-in
  redis: undefined, // Will be set at runtime if Redis is available
  nameSpace: 'rl:', // Redis key prefix
  continueExceeding: true, // Continue to count requests after limit
  addHeadersOnExceeding: {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
  },
  addHeaders: {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
    'retry-after': true,
  },
});

// Register routes
await fastify.register(webhookRoutes);
await fastify.register(authRoutes);
await fastify.register(apiRoutes);
await fastify.register(audioRoutes);
await fastify.register(integrationRoutes);

// Health check endpoint
fastify.get('/health', async (_request, reply) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    // Check Redis connection (optional)
    const redisInfo = await redisService.getInfo();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
      database: 'connected',
      redis: redisInfo.connected ? {
        status: 'connected',
        keyCount: redisInfo.keyCount,
        usedMemory: redisInfo.usedMemory,
      } : {
        status: 'disconnected',
        message: 'Rate limiting using in-memory store',
      },
      sentry: isSentryEnabled() ? 'enabled' : 'disabled',
      monitoring: env.MONITORING_ENABLED ? 'enabled' : 'disabled',
    };
  } catch (error) {
    reply.code(503);
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// Root endpoint
fastify.get('/', async (_request, _reply) => {
  return {
    name: 'AI Receptionist POC',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      webhooks: '/webhooks/*',
      auth: {
        login: 'POST /api/auth/login',
        register: 'POST /api/auth/register',
        refresh: 'POST /api/auth/refresh',
        logout: 'POST /api/auth/logout',
        me: 'GET /api/auth/me',
        invite: 'POST /api/auth/invite (Admin)',
        users: 'GET /api/auth/users (Admin)',
      },
      api: {
        calls: 'GET /api/calls',
        callDetails: 'GET /api/calls/:id',
        appointments: 'GET /api/appointments',
        analytics: 'GET /api/analytics',
        settings: 'GET /api/client/settings',
        updateSettings: 'PUT /api/client/settings',
      },
    },
  };
});

// Graceful shutdown
const closeGracefully = async (signal: string) => {
  fastify.log.info(`Received signal ${signal}, closing gracefully...`);

  try {
    stopScheduledJobs();
    await redisService.disconnect();
    await prisma.$disconnect();
    // Flush Sentry events before shutdown
    if (isSentryEnabled()) {
      await flushSentry(2000);
    }
    await fastify.close();
    fastify.log.info('Server closed successfully');
    process.exit(0);
  } catch (err) {
    fastify.log.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGINT', () => closeGracefully('SIGINT'));
process.on('SIGTERM', () => closeGracefully('SIGTERM'));

// Start server
const start = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    fastify.log.info('Database connected successfully');

    // Initialize Redis connection (non-blocking, logs warning on failure)
    if (env.RATE_LIMIT_ENABLED && env.RATE_LIMIT_REDIS_ENABLED) {
      await redisService.connect();

      // If Redis connected, update rate limit plugin to use it
      if (redisService.isHealthy()) {
        const redisClient = redisService.getClient();
        if (redisClient) {
          // Update the rate limit plugin with Redis store
          // @ts-ignore - Accessing internal property to update Redis store
          fastify.rateLimit.redis = redisClient;
          fastify.log.info('Rate limiting configured with Redis store');
        }
      } else {
        fastify.log.warn('Rate limiting will use in-memory store (not distributed)');
      }
    } else {
      fastify.log.info('Rate limiting disabled or Redis disabled - using in-memory store');
    }

    // Start listening
    await fastify.listen({
      port: env.PORT,
      host: '0.0.0.0', // Listen on all interfaces
    });

    fastify.log.info(`Server running on http://localhost:${env.PORT}`);
    fastify.log.info(`Health check: http://localhost:${env.PORT}/health`);
    fastify.log.info(`Environment: ${env.NODE_ENV}`);

    // Start scheduled jobs
    startScheduledJobs();

  } catch (err) {
    fastify.log.error({ err }, 'Failed to start server');
    process.exit(1);
  }
};

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  fastify.log.error({ reason, promise }, 'Unhandled Rejection');
  // Capture to Sentry
  if (reason instanceof Error) {
    captureError(reason, { type: 'unhandledRejection' });
  }
});

process.on('uncaughtException', (err) => {
  fastify.log.error({ err }, 'Uncaught Exception');
  // Capture to Sentry before shutdown
  captureError(err, { type: 'uncaughtException' });
  closeGracefully('UNCAUGHT_EXCEPTION');
});

// Start the server
start();