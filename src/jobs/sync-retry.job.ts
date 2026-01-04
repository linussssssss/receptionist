import { prisma } from '../server.js';
import { calendarSyncService } from '../services/integrations/calendar-sync.service.js';
import { logger } from '../utils/logger.js';

/**
 * Sync Retry Job
 *
 * Automatically retries failed calendar sync operations with exponential backoff.
 * Syncs are retried up to 5 times with increasing delays between attempts.
 */

const MAX_RETRY_COUNT = 5;
const MAX_AGE_HOURS = 24; // Don't retry syncs older than 24 hours

/**
 * Calculate backoff delay based on retry count
 * Returns delay in minutes: 5, 15, 30, 60, 120 minutes
 */
function getBackoffMinutes(retryCount: number): number {
  const delays = [5, 15, 30, 60, 120];
  return delays[Math.min(retryCount, delays.length - 1)];
}

export async function retryFailedSyncs(): Promise<void> {
  try {
    const now = new Date();
    const maxAge = new Date(now.getTime() - MAX_AGE_HOURS * 60 * 60 * 1000);

    // Find failed syncs that haven't exceeded max retry count and aren't too old
    const failedSyncs = await prisma.calendarSync.findMany({
      where: {
        status: 'FAILED',
        retryCount: {
          lt: MAX_RETRY_COUNT,
        },
        createdAt: {
          gte: maxAge,
        },
      },
      include: {
        appointment: true,
        client: {
          select: {
            id: true,
            name: true,
            integrations: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 50, // Limit to 50 syncs per run to avoid overload
    });

    logger.info(
      { count: failedSyncs.length },
      'Checking for failed syncs to retry'
    );

    let retriedCount = 0;
    let skippedCount = 0;

    for (const sync of failedSyncs) {
      try {
        // Check if enough time has passed since last attempt (exponential backoff)
        const requiredBackoffMinutes = getBackoffMinutes(sync.retryCount);
        const nextRetryTime = new Date(
          sync.updatedAt.getTime() + requiredBackoffMinutes * 60 * 1000
        );

        if (now < nextRetryTime) {
          // Not enough time has passed, skip for now
          skippedCount++;
          continue;
        }

        // Check if integration is still enabled
        const integrations = sync.client.integrations as any;
        if (!integrations?.googleCalendar?.enabled) {
          logger.info(
            { syncId: sync.id, clientId: sync.clientId },
            'Skipping retry - Google Calendar integration disabled'
          );

          // Mark as SKIPPED since integration is disabled
          await prisma.calendarSync.update({
            where: { id: sync.id },
            data: { status: 'SKIPPED' },
          });

          skippedCount++;
          continue;
        }

        logger.info(
          {
            syncId: sync.id,
            appointmentId: sync.appointmentId,
            operation: sync.operation,
            direction: sync.direction,
            retryCount: sync.retryCount,
            backoffMinutes: requiredBackoffMinutes,
          },
          'Retrying failed sync'
        );

        // Update retry count first
        await prisma.calendarSync.update({
          where: { id: sync.id },
          data: {
            retryCount: sync.retryCount + 1,
            status: 'PENDING', // Set to pending while retrying
          },
        });

        // Retry the sync operation based on direction
        if (sync.direction === 'OUTBOUND') {
          // Retry outbound sync (AI -> Calendar)
          await calendarSyncService.syncAppointmentToCalendar(
            sync.appointmentId,
            sync.operation as 'CREATE' | 'UPDATE' | 'DELETE'
          );
        } else {
          // Retry inbound sync (Calendar -> AI)
          if (sync.calendarEventId) {
            await calendarSyncService.syncCalendarEventToAppointment(
              sync.clientId,
              sync.calendarEventId,
              sync.operation as 'CREATE' | 'UPDATE' | 'DELETE'
            );
          } else {
            logger.warn(
              { syncId: sync.id },
              'Cannot retry inbound sync without calendarEventId'
            );
            await prisma.calendarSync.update({
              where: { id: sync.id },
              data: { status: 'SKIPPED' },
            });
            skippedCount++;
            continue;
          }
        }

        retriedCount++;

        logger.info(
          { syncId: sync.id, appointmentId: sync.appointmentId },
          'Successfully retried failed sync'
        );
      } catch (err) {
        logger.error(
          { err, syncId: sync.id, appointmentId: sync.appointmentId },
          'Failed to retry sync operation'
        );

        // The sync service will have updated the status to FAILED
        // with the new error message
      }
    }

    logger.info(
      {
        totalFailed: failedSyncs.length,
        retried: retriedCount,
        skipped: skippedCount,
      },
      'Completed sync retry job'
    );

    // Mark very old failed syncs as SKIPPED to clean up
    const veryOldSyncs = await prisma.calendarSync.updateMany({
      where: {
        status: 'FAILED',
        createdAt: {
          lt: maxAge,
        },
      },
      data: { status: 'SKIPPED' },
    });

    if (veryOldSyncs.count > 0) {
      logger.info(
        { count: veryOldSyncs.count },
        'Marked old failed syncs as SKIPPED'
      );
    }
  } catch (err) {
    logger.error({ err }, 'Error in sync retry job');
  }
}

// Run this job every 5 minutes
export const syncRetryJob = {
  name: 'sync-retry',
  schedule: '*/5 * * * *', // Every 5 minutes
  handler: retryFailedSyncs,
};
