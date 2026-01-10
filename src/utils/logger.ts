import pino from 'pino';
import { env } from '../config/env.js';
import { pinoRedactPaths } from './pii-redactor.js';

// Create logger instance with PII redaction for GDPR compliance
export const logger = pino({
  level: env.LOG_LEVEL,
  // Redact PII from logs (GDPR/DSGVO compliance)
  redact: {
    paths: pinoRedactPaths,
    censor: '[REDACTED]',
  },
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