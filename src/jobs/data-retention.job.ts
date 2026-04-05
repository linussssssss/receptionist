/**
 * Data Retention Job
 * GDPR/DSGVO compliant automatic data cleanup
 *
 * Runs daily to:
 * - Delete old call transcripts and messages
 * - Anonymize old appointments
 * - Clean up expired sessions
 * - Remove old system events and alert logs
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import {
  DEFAULT_RETENTION_CONFIG,
  getCutoffDate,
  getClientRetentionConfig,
} from '../config/data-retention.js';

const jobLogger = logger.child({ job: 'data-retention' });

export interface RetentionJobResult {
  success: boolean;
  deletedCalls: number;
  deletedMessages: number;
  anonymizedAppointments: number;
  deletedSessions: number;
  deletedSystemEvents: number;
  deletedAlertLogs: number;
  deletedDailyMetrics: number;
  errors: string[];
}

/**
 * Execute data retention cleanup
 */
export async function executeDataRetentionJob(
  prisma: PrismaClient
): Promise<RetentionJobResult> {
  const result: RetentionJobResult = {
    success: true,
    deletedCalls: 0,
    deletedMessages: 0,
    anonymizedAppointments: 0,
    deletedSessions: 0,
    deletedSystemEvents: 0,
    deletedAlertLogs: 0,
    deletedDailyMetrics: 0,
    errors: [],
  };

  jobLogger.info('Starting data retention job');

  try {
    // 1. Delete old messages first (foreign key to calls)
    const messageCutoff = getCutoffDate(
      DEFAULT_RETENTION_CONFIG.callsAndMessages.days
    );

    const deletedMessages = await prisma.message.deleteMany({
      where: {
        call: {
          startTime: { lt: messageCutoff },
        },
      },
    });
    result.deletedMessages = deletedMessages.count;
    jobLogger.info({ count: deletedMessages.count }, 'Deleted old messages');
  } catch (error) {
    result.errors.push(`Failed to delete messages: ${error}`);
    jobLogger.error({ error }, 'Failed to delete messages');
  }

  try {
    // 2. Delete old calls (after messages are deleted)
    const callCutoff = getCutoffDate(
      DEFAULT_RETENTION_CONFIG.callsAndMessages.days
    );

    const deletedCalls = await prisma.call.deleteMany({
      where: {
        startTime: { lt: callCutoff },
      },
    });
    result.deletedCalls = deletedCalls.count;
    jobLogger.info({ count: deletedCalls.count }, 'Deleted old calls');
  } catch (error) {
    result.errors.push(`Failed to delete calls: ${error}`);
    jobLogger.error({ error }, 'Failed to delete calls');
  }

  try {
    // 3. Anonymize old appointments (don't delete - keep for statistics)
    const appointmentCutoff = getCutoffDate(
      DEFAULT_RETENTION_CONFIG.appointments.days
    );

    const oldAppointments = await prisma.appointment.findMany({
      where: {
        datetime: { lt: appointmentCutoff },
        anonymizedAt: null, // Only anonymize once
      },
      select: { id: true },
    });

    if (oldAppointments.length > 0) {
      await prisma.appointment.updateMany({
        where: {
          id: { in: oldAppointments.map((a) => a.id) },
        },
        data: {
          customerName: '[ANONYMIZED]',
          customerPhone: '[ANONYMIZED]',
          customerEmail: null,
          reason: '[ANONYMIZED]',
          notes: null,
          anonymizedAt: new Date(),
        },
      });
      result.anonymizedAppointments = oldAppointments.length;
      jobLogger.info(
        { count: oldAppointments.length },
        'Anonymized old appointments'
      );
    }
  } catch (error) {
    result.errors.push(`Failed to anonymize appointments: ${error}`);
    jobLogger.error({ error }, 'Failed to anonymize appointments');
  }

  try {
    // 4. Delete expired sessions
    const sessionCutoff = getCutoffDate(
      DEFAULT_RETENTION_CONFIG.expiredSessions.days
    );

    const deletedSessions = await prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: sessionCutoff } },
          {
            AND: [{ revokedAt: { not: null } }, { revokedAt: { lt: sessionCutoff } }],
          },
        ],
      },
    });
    result.deletedSessions = deletedSessions.count;
    jobLogger.info({ count: deletedSessions.count }, 'Deleted expired sessions');
  } catch (error) {
    result.errors.push(`Failed to delete sessions: ${error}`);
    jobLogger.error({ error }, 'Failed to delete sessions');
  }

  try {
    // 5. Delete old system events
    const systemEventCutoff = getCutoffDate(
      DEFAULT_RETENTION_CONFIG.systemEvents.days
    );

    const deletedSystemEvents = await prisma.systemEvent.deleteMany({
      where: {
        timestamp: { lt: systemEventCutoff },
      },
    });
    result.deletedSystemEvents = deletedSystemEvents.count;
    jobLogger.info(
      { count: deletedSystemEvents.count },
      'Deleted old system events'
    );
  } catch (error) {
    result.errors.push(`Failed to delete system events: ${error}`);
    jobLogger.error({ error }, 'Failed to delete system events');
  }

  try {
    // 6. Delete old alert logs
    const alertLogCutoff = getCutoffDate(
      DEFAULT_RETENTION_CONFIG.alertLogs.days
    );

    const deletedAlertLogs = await prisma.alertLog.deleteMany({
      where: {
        sentAt: { lt: alertLogCutoff },
      },
    });
    result.deletedAlertLogs = deletedAlertLogs.count;
    jobLogger.info({ count: deletedAlertLogs.count }, 'Deleted old alert logs');
  } catch (error) {
    result.errors.push(`Failed to delete alert logs: ${error}`);
    jobLogger.error({ error }, 'Failed to delete alert logs');
  }

  try {
    // 7. Delete old daily metrics
    const metricsCutoff = getCutoffDate(
      DEFAULT_RETENTION_CONFIG.dailyMetrics.days
    );

    const deletedDailyMetrics = await prisma.dailyMetrics.deleteMany({
      where: {
        date: { lt: metricsCutoff },
      },
    });
    result.deletedDailyMetrics = deletedDailyMetrics.count;
    jobLogger.info(
      { count: deletedDailyMetrics.count },
      'Deleted old daily metrics'
    );
  } catch (error) {
    result.errors.push(`Failed to delete daily metrics: ${error}`);
    jobLogger.error({ error }, 'Failed to delete daily metrics');
  }

  // Determine overall success
  result.success = result.errors.length === 0;

  jobLogger.info(
    {
      result: {
        ...result,
        errors: result.errors.length,
      },
    },
    'Data retention job completed'
  );

  return result;
}

/**
 * Execute per-client retention based on custom settings
 * This allows clients to have shorter retention periods than defaults
 */
export async function executeClientSpecificRetention(
  prisma: PrismaClient,
  clientId: string
): Promise<{ deletedCalls: number; deletedMessages: number; anonymizedAppointments: number }> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { retentionSettings: true },
  });

  const config = getClientRetentionConfig(
    client?.retentionSettings as Record<string, unknown> | null
  );

  const messageCutoff = getCutoffDate(config.callsAndMessages.days);
  const appointmentCutoff = getCutoffDate(config.appointments.days);

  // Delete messages for this client's old calls
  const deletedMessages = await prisma.message.deleteMany({
    where: {
      call: {
        clientId,
        startTime: { lt: messageCutoff },
      },
    },
  });

  // Delete old calls for this client
  const deletedCalls = await prisma.call.deleteMany({
    where: {
      clientId,
      startTime: { lt: messageCutoff },
    },
  });

  // Anonymize old appointments for this client
  const oldAppointments = await prisma.appointment.findMany({
    where: {
      clientId,
      datetime: { lt: appointmentCutoff },
      anonymizedAt: null,
    },
    select: { id: true },
  });

  if (oldAppointments.length > 0) {
    await prisma.appointment.updateMany({
      where: {
        id: { in: oldAppointments.map((a) => a.id) },
      },
      data: {
        customerName: '[ANONYMIZED]',
        customerPhone: '[ANONYMIZED]',
        customerEmail: null,
        reason: '[ANONYMIZED]',
        notes: null,
        anonymizedAt: new Date(),
      },
    });
  }

  return {
    deletedCalls: deletedCalls.count,
    deletedMessages: deletedMessages.count,
    anonymizedAppointments: oldAppointments.length,
  };
}
