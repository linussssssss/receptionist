import { env } from '../../config/env.js';
import { alertService, AlertType, MetricType } from './alert.service.js';
import { captureError } from '../../config/sentry.js';
import { createServiceLogger } from '../../utils/logger.js';

const logger = createServiceLogger('monitored-operation');

/**
 * Context for monitored operations
 */
export interface OperationContext {
  clientId?: string;
  callSid?: string;
  userId?: string;
  requestId?: string;
}

/**
 * List of critical operations that trigger immediate alerts on failure
 */
const CRITICAL_OPERATIONS = [
  'claude.generateResponse',
  'claude.classifyIntent',
  'claude.extractAppointmentDetails',
  'appointment.create',
  'calendar.sync',
  'calendar.createEvent',
  'calendar.updateEvent',
];

/**
 * Map operation names to alert types
 */
const OPERATION_ALERT_TYPE_MAP: Record<string, AlertType> = {
  'claude.generateResponse': AlertType.CLAUDE_API_FAILURE,
  'claude.classifyIntent': AlertType.CLAUDE_API_FAILURE,
  'claude.extractAppointmentDetails': AlertType.CLAUDE_API_FAILURE,
  'appointment.create': AlertType.APPOINTMENT_CREATION_FAILED,
  'calendar.sync': AlertType.CALENDAR_SYNC_EXHAUSTED,
  'calendar.createEvent': AlertType.CALENDAR_SYNC_EXHAUSTED,
  'calendar.updateEvent': AlertType.CALENDAR_SYNC_EXHAUSTED,
  'tts.generate': AlertType.TTS_FAILURE,
  'transcription.transcribe': AlertType.TRANSCRIPTION_FAILURE,
};

/**
 * Wrap an operation with monitoring, metrics, and alerting
 *
 * @param operationName - Name of the operation (e.g., 'claude.generateResponse')
 * @param operation - The async operation to execute
 * @param context - Additional context for logging and alerts
 * @returns The result of the operation
 * @throws Re-throws any error from the operation after recording metrics
 */
export async function monitoredOperation<T>(
  operationName: string,
  operation: () => Promise<T>,
  context: OperationContext = {}
): Promise<T> {
  if (!env.MONITORING_ENABLED) {
    return operation();
  }

  const startTime = Date.now();

  try {
    const result = await operation();
    const durationMs = Date.now() - startTime;

    // Record success metric (fire and forget)
    alertService.recordMetric(MetricType.OPERATION_SUCCESS, 1, {
      operation: operationName,
      durationMs,
      ...context,
    }).catch(() => {
      // Ignore metric recording errors
    });

    // Log slow operations
    if (durationMs > 5000) {
      logger.warn(
        { operation: operationName, durationMs, ...context },
        'Slow operation detected'
      );
    }

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stackTrace = error instanceof Error ? error.stack : undefined;

    // Record failure metric (fire and forget)
    alertService.recordMetric(MetricType.OPERATION_FAILURE, 1, {
      operation: operationName,
      error: errorMessage,
      durationMs,
      ...context,
    }).catch(() => {
      // Ignore metric recording errors
    });

    // Capture to Sentry
    if (error instanceof Error) {
      captureError(error, {
        operation: operationName,
        durationMs,
        ...context,
      });
    }

    // Send alert for critical operations
    if (CRITICAL_OPERATIONS.includes(operationName)) {
      const alertType = OPERATION_ALERT_TYPE_MAP[operationName] || AlertType.DATABASE_ERROR;

      // Fire and forget - don't block on alert sending
      alertService.sendCriticalAlert(alertType, {
        errorMessage,
        timestamp: new Date(),
        severity: 'critical',
        stackTrace: env.MONITORING_DETAIL_LEVEL === 'detailed' ? stackTrace : undefined,
        operation: operationName,
        durationMs,
        ...context,
      }).catch((err) => {
        logger.error({ err }, 'Failed to send critical alert');
      });
    }

    // Re-throw the original error
    throw error;
  }
}

/**
 * Wrap an operation with warning-level monitoring
 * Used for non-critical operations like TTS, email, etc.
 */
export async function monitoredWarningOperation<T>(
  operationName: string,
  operation: () => Promise<T>,
  context: OperationContext = {}
): Promise<T> {
  if (!env.MONITORING_ENABLED) {
    return operation();
  }

  const startTime = Date.now();

  try {
    const result = await operation();
    const durationMs = Date.now() - startTime;

    // Record success metric
    alertService.recordMetric(MetricType.OPERATION_SUCCESS, 1, {
      operation: operationName,
      durationMs,
      ...context,
    }).catch(() => {});

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stackTrace = error instanceof Error ? error.stack : undefined;

    // Record failure metric
    alertService.recordMetric(MetricType.OPERATION_FAILURE, 1, {
      operation: operationName,
      error: errorMessage,
      durationMs,
      ...context,
    }).catch(() => {});

    // Send warning alert
    const alertType = OPERATION_ALERT_TYPE_MAP[operationName] || AlertType.JOB_FAILURE;

    alertService.sendWarningAlert(alertType, {
      errorMessage,
      timestamp: new Date(),
      severity: 'warning',
      stackTrace: env.MONITORING_DETAIL_LEVEL === 'detailed' ? stackTrace : undefined,
      operation: operationName,
      durationMs,
      ...context,
    }).catch((err) => {
      logger.error({ err }, 'Failed to send warning alert');
    });

    throw error;
  }
}

/**
 * Record a rate limit violation
 */
export function recordRateLimitViolation(
  endpoint: string,
  ip: string,
  userId?: string
): void {
  if (!env.MONITORING_ENABLED) return;

  alertService.recordMetric(MetricType.RATE_LIMIT_HIT, 1, {
    endpoint,
    ip,
    userId,
  }).catch(() => {});
}
