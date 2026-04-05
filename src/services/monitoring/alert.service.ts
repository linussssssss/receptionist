import { env } from '../../config/env.js';
import { prisma } from '../../server.js';
import { emailService } from '../notifications/email.service.js';
import { alertDeduplication } from './alert-deduplication.js';
import { createServiceLogger } from '../../utils/logger.js';
import { generateCriticalAlertEmail } from '../notifications/templates/alert-critical.js';
import { generateWarningAlertEmail } from '../notifications/templates/alert-warning.js';

const logger = createServiceLogger('alert-service');

/**
 * Alert types for categorizing different error conditions
 */
export enum AlertType {
  // CRITICAL - Immediate notification
  CLAUDE_API_FAILURE = 'claude_api_failure',
  APPOINTMENT_CREATION_FAILED = 'appointment_creation_failed',
  DATABASE_ERROR = 'database_error',
  CALENDAR_SYNC_EXHAUSTED = 'calendar_sync_exhausted',
  TWILIO_WEBHOOK_FAILURE = 'twilio_webhook_failure',

  // WARNING - May be batched
  TTS_FAILURE = 'tts_failure',
  TRANSCRIPTION_FAILURE = 'transcription_failure',
  EMAIL_DELIVERY_FAILED = 'email_delivery_failed',
  RATE_LIMIT_VIOLATION = 'rate_limit_violation',
  WEBHOOK_RENEWAL_FAILED = 'webhook_renewal_failed',
  JOB_FAILURE = 'job_failure',
}

/**
 * Metric types for tracking operational metrics
 */
export enum MetricType {
  OPERATION_SUCCESS = 'operation_success',
  OPERATION_FAILURE = 'operation_failure',
  API_LATENCY = 'api_latency',
  RATE_LIMIT_HIT = 'rate_limit_hit',
}

/**
 * Context for alert notifications
 */
export interface AlertContext {
  // Basic (always included)
  errorMessage: string;
  timestamp: Date;
  severity: 'critical' | 'warning' | 'info';

  // Detailed (when MONITORING_DETAIL_LEVEL=detailed)
  stackTrace?: string;
  requestId?: string;
  userId?: string;
  clientId?: string;
  callSid?: string;
  affectedUsers?: number;
  requestDetails?: Record<string, unknown>;
  operation?: string;
  durationMs?: number;
}

/**
 * Alert Service
 *
 * Handles sending real-time alerts to admin users via email.
 * Includes deduplication to prevent alert spam.
 */
class AlertService {
  private enabled: boolean;

  constructor() {
    this.enabled = env.MONITORING_ENABLED;
    if (this.enabled) {
      logger.info('Alert service initialized');
    } else {
      logger.info('Alert service disabled via MONITORING_ENABLED=false');
    }
  }

  /**
   * Send a critical alert immediately
   * Used for severe issues that require immediate attention
   */
  async sendCriticalAlert(type: AlertType, context: AlertContext): Promise<void> {
    if (!this.enabled) return;

    try {
      const alertHash = alertDeduplication.generateHash(type, context.clientId, context.errorMessage);

      // Check deduplication
      if (!alertDeduplication.shouldSendAlert(alertHash)) {
        logger.debug({ type, hash: alertHash }, 'Critical alert deduplicated');
        return;
      }

      // Get admin emails
      const adminEmails = await this.getAdminEmails();
      if (adminEmails.length === 0) {
        logger.warn('No admin emails found, cannot send critical alert');
        return;
      }

      // Build alert context based on detail level
      const alertContext = this.buildAlertContext(context);

      // Generate email content
      const { subject, html, text } = generateCriticalAlertEmail({
        alertType: type,
        ...alertContext,
      });

      // Send to all admins
      for (const email of adminEmails) {
        await emailService.sendEmail(email, subject, html, text);
      }

      // Record alert sent
      alertDeduplication.recordAlertSent(alertHash);

      // Log to database for audit trail
      await this.logAlert(type, 'critical', alertHash, context, adminEmails);

      logger.info(
        { type, recipients: adminEmails.length },
        'Critical alert sent'
      );
    } catch (err) {
      logger.error({ err, type }, 'Failed to send critical alert');
    }
  }

  /**
   * Send a warning alert
   * Used for non-critical issues that should be monitored
   */
  async sendWarningAlert(type: AlertType, context: AlertContext): Promise<void> {
    if (!this.enabled) return;

    try {
      const alertHash = alertDeduplication.generateHash(type, context.clientId, context.errorMessage);

      // Check deduplication
      if (!alertDeduplication.shouldSendAlert(alertHash)) {
        logger.debug({ type, hash: alertHash }, 'Warning alert deduplicated');
        return;
      }

      // Get admin emails
      const adminEmails = await this.getAdminEmails();
      if (adminEmails.length === 0) {
        logger.warn('No admin emails found, cannot send warning alert');
        return;
      }

      // Build alert context based on detail level
      const alertContext = this.buildAlertContext(context);

      // Generate email content
      const { subject, html, text } = generateWarningAlertEmail({
        alertType: type,
        ...alertContext,
      });

      // Send to all admins
      for (const email of adminEmails) {
        await emailService.sendEmail(email, subject, html, text);
      }

      // Record alert sent
      alertDeduplication.recordAlertSent(alertHash);

      // Log to database for audit trail
      await this.logAlert(type, 'warning', alertHash, context, adminEmails);

      logger.info(
        { type, recipients: adminEmails.length },
        'Warning alert sent'
      );
    } catch (err) {
      logger.error({ err, type }, 'Failed to send warning alert');
    }
  }

  /**
   * Record a metric for tracking and daily digest
   * Stored in SystemEvent table for aggregation
   */
  async recordMetric(
    metric: MetricType,
    value: number,
    context?: Record<string, unknown>
  ): Promise<void> {
    if (!this.enabled) return;

    try {
      await prisma.systemEvent.create({
        data: {
          eventType: `metric:${metric}`,
          severity: 'info',
          message: `Metric recorded: ${metric} = ${value}`,
          details: {
            metric,
            value,
            ...context,
          },
          clientId: context?.clientId as string | undefined,
          callId: context?.callSid as string | undefined,
        },
      });
    } catch (err) {
      // Don't log errors for metric recording to avoid cascading failures
      logger.debug({ err, metric }, 'Failed to record metric');
    }
  }

  /**
   * Get emails of all admin users
   */
  private async getAdminEmails(): Promise<string[]> {
    try {
      const admins = await prisma.user.findMany({
        where: {
          role: 'ADMIN',
          isActive: true,
        },
        select: {
          email: true,
        },
      });

      return admins.map((admin) => admin.email);
    } catch (err) {
      logger.error({ err }, 'Failed to fetch admin emails');
      return [];
    }
  }

  /**
   * Build alert context based on detail level configuration
   */
  private buildAlertContext(context: AlertContext): AlertContext {
    const isDetailed = env.MONITORING_DETAIL_LEVEL === 'detailed';

    if (isDetailed) {
      // Include all context for detailed mode
      return context;
    }

    // Basic mode - only include essential info
    return {
      errorMessage: context.errorMessage,
      timestamp: context.timestamp,
      severity: context.severity,
      clientId: context.clientId,
      operation: context.operation,
    };
  }

  /**
   * Log alert to database for audit trail
   */
  private async logAlert(
    type: AlertType,
    severity: string,
    alertHash: string,
    context: AlertContext,
    sentTo: string[]
  ): Promise<void> {
    try {
      await prisma.alertLog.create({
        data: {
          alertType: type,
          severity,
          alertHash,
          message: context.errorMessage,
          details: env.MONITORING_DETAIL_LEVEL === 'detailed' ? (context as any) : undefined,
          clientId: context.clientId,
          callId: context.callSid,
          userId: context.userId,
          sentTo,
        },
      });
    } catch (err) {
      logger.error({ err }, 'Failed to log alert to database');
    }
  }

  /**
   * Get alert statistics
   */
  getStats(): {
    enabled: boolean;
    detailLevel: string;
    deduplication: ReturnType<typeof alertDeduplication.getStats>;
  } {
    return {
      enabled: this.enabled,
      detailLevel: env.MONITORING_DETAIL_LEVEL,
      deduplication: alertDeduplication.getStats(),
    };
  }
}

// Export singleton
export const alertService = new AlertService();
