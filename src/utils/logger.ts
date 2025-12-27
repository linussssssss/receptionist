import pino from 'pino';
import { env } from '../config/env.js';

// Create logger instance
export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

// Export child logger creators for different contexts
export const createCallLogger = (callId: string) =>
  logger.child({ context: 'call', callId });

export const createServiceLogger = (service: string) =>
  logger.child({ context: 'service', service });

export const createWebhookLogger = (webhook: string) =>
  logger.child({ context: 'webhook', webhook });