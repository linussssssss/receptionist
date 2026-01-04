import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { env } from './config/env.js';
import { PrismaClient } from '@prisma/client';
import { webhookRoutes } from './routes/webhooks.js';
import { apiRoutes } from './routes/api.js';
import { audioRoutes } from './routes/audio.js';
import { integrationRoutes } from './routes/integrations.js';
import fastifyFormbody from '@fastify/formbody';
import { startScheduledJobs, stopScheduledJobs } from './jobs/scheduler.js';

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

// Register routes
await fastify.register(webhookRoutes);
await fastify.register(apiRoutes);
await fastify.register(audioRoutes);
await fastify.register(integrationRoutes);

// Health check endpoint
fastify.get('/health', async (_request, reply) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
      database: 'connected',
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
    await prisma.$disconnect();
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
});

process.on('uncaughtException', (err) => {
  fastify.log.error({ err }, 'Uncaught Exception');
  closeGracefully('UNCAUGHT_EXCEPTION');
});

// Start the server
start();