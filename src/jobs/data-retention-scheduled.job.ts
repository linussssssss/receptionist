/**
 * Data Retention Scheduled Job
 * Runs daily at 3 AM to clean up old data per GDPR requirements
 */

import type { ScheduledJob } from './scheduler.js';
import { executeDataRetentionJob } from './data-retention.job.js';
import { prisma } from '../server.js';
import { logger } from '../utils/logger.js';

const jobLogger = logger.child({ job: 'data-retention-scheduled' });

async function handler(): Promise<void> {
  jobLogger.info('Starting scheduled data retention cleanup');

  try {
    const result = await executeDataRetentionJob(prisma);

    if (result.success) {
      jobLogger.info(
        {
          deletedCalls: result.deletedCalls,
          deletedMessages: result.deletedMessages,
          anonymizedAppointments: result.anonymizedAppointments,
          deletedSessions: result.deletedSessions,
          deletedSystemEvents: result.deletedSystemEvents,
          deletedAlertLogs: result.deletedAlertLogs,
        },
        'Data retention cleanup completed successfully'
      );
    } else {
      jobLogger.warn(
        { errors: result.errors },
        'Data retention cleanup completed with errors'
      );
    }

    // Log retention event for audit purposes
    await prisma.systemEvent.create({
      data: {
        eventType: 'data_retention_executed',
        severity: result.success ? 'info' : 'warning',
        message: `Data retention job completed. Deleted: ${result.deletedCalls} calls, ${result.deletedMessages} messages. Anonymized: ${result.anonymizedAppointments} appointments.`,
        details: {
          success: result.success,
          deletedCalls: result.deletedCalls,
          deletedMessages: result.deletedMessages,
          anonymizedAppointments: result.anonymizedAppointments,
          deletedSessions: result.deletedSessions,
          deletedSystemEvents: result.deletedSystemEvents,
          deletedAlertLogs: result.deletedAlertLogs,
          errorCount: result.errors.length,
        },
      },
    });
  } catch (error) {
    jobLogger.error({ error }, 'Data retention job failed');

    // Log failure for audit
    await prisma.systemEvent.create({
      data: {
        eventType: 'data_retention_failed',
        severity: 'error',
        message: `Data retention job failed: ${error}`,
        details: { error: String(error) },
      },
    });

    throw error;
  }
}

export const dataRetentionJob: ScheduledJob = {
  name: 'data-retention',
  schedule: '0 3 * * *', // Daily at 3 AM
  handler,
};
