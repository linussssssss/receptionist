import * as Sentry from '@sentry/node';
import { env } from './env.js';
import { redactString, redactObject } from '../utils/pii-redactor.js';

let isInitialized = false;

/**
 * Initialize Sentry for error tracking
 * Should be called early in the application lifecycle
 */
export function initSentry(): void {
  if (!env.SENTRY_DSN) {
    console.log('Sentry DSN not configured - error tracking disabled');
    return;
  }

  if (isInitialized) {
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,

    // Capture 100% of errors, 10% of transactions in production
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Don't capture rate limit errors (expected behavior)
    ignoreErrors: [
      'Rate limit exceeded',
      /^429/,
    ],

    // Strip sensitive data before sending (GDPR/DSGVO compliance)
    beforeSend(event) {
      // Remove authorization headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-api-key'];
      }

      // Remove sensitive body data
      if (event.request?.data) {
        const data = event.request.data;
        if (typeof data === 'object') {
          delete (data as any).password;
          delete (data as any).passwordHash;
          delete (data as any).token;
          delete (data as any).refreshToken;
        }
      }

      // Redact PII from exception messages
      if (event.exception?.values) {
        event.exception.values = event.exception.values.map((ex) => {
          if (ex.value && typeof ex.value === 'string') {
            ex.value = redactString(ex.value);
          }
          return ex;
        });
      }

      // Redact PII from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((crumb) => {
          if (crumb.message && typeof crumb.message === 'string') {
            crumb.message = redactString(crumb.message);
          }
          if (crumb.data && typeof crumb.data === 'object') {
            crumb.data = redactObject(crumb.data);
          }
          return crumb;
        });
      }

      // Redact PII from extra context
      if (event.extra && typeof event.extra === 'object') {
        event.extra = redactObject(event.extra);
      }

      // Redact user PII (keep id for tracking)
      if (event.user) {
        if (event.user.email) event.user.email = '[REDACTED]';
        if (event.user.username) event.user.username = '[REDACTED]';
        if (event.user.ip_address) event.user.ip_address = '[REDACTED]';
      }

      return event;
    },

    // Add additional context
    initialScope: {
      tags: {
        service: 'ai-receptionist',
      },
    },
  });

  isInitialized = true;
  console.log(`Sentry initialized (environment: ${env.SENTRY_ENVIRONMENT})`);
}

/**
 * Capture an error with optional context
 */
export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (!isInitialized) {
    console.error('Sentry not initialized, logging error locally:', error);
    return;
  }

  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Set user context for error tracking
 * Call this after user authentication
 * Note: Email is NOT sent to Sentry for GDPR compliance - only user ID
 */
export function setUserContext(userId: string, clientId?: string, _email?: string): void {
  if (!isInitialized) return;

  // Only set user ID, not email (GDPR compliance)
  Sentry.setUser({
    id: userId,
  });

  if (clientId) {
    Sentry.setTag('clientId', clientId);
  }
}

/**
 * Clear user context (call on logout)
 */
export function clearUserContext(): void {
  if (!isInitialized) return;

  Sentry.setUser(null);
}

/**
 * Add a breadcrumb for debugging
 */
export function addBreadcrumb(
  message: string,
  category: string,
  level: Sentry.SeverityLevel = 'info',
  data?: Record<string, unknown>
): void {
  if (!isInitialized) return;

  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
    timestamp: Date.now() / 1000,
  });
}

/**
 * Set a tag for all subsequent errors
 */
export function setTag(key: string, value: string): void {
  if (!isInitialized) return;

  Sentry.setTag(key, value);
}

/**
 * Start a transaction for performance monitoring
 */
export function startTransaction(
  name: string,
  op: string
): Sentry.Span | undefined {
  if (!isInitialized) return undefined;

  return Sentry.startInactiveSpan({
    name,
    op,
  });
}

/**
 * Flush pending events (call before shutdown)
 */
export async function flushSentry(timeout: number = 2000): Promise<boolean> {
  if (!isInitialized) return true;

  return Sentry.flush(timeout);
}

/**
 * Check if Sentry is configured and initialized
 */
export function isSentryEnabled(): boolean {
  return isInitialized;
}
