import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { webhookRenewalJob } from './webhook-renewal.job.js';
import { syncRetryJob } from './sync-retry.job.js';
import { appointmentReminderJob } from './appointment-reminder.job.js';
import { sessionCleanupJob } from './session-cleanup.job.js';
import { invitationCleanupJob } from './invitation-cleanup.job.js';
import { dailyDigestJob } from './daily-digest.job.js';
import { dataRetentionJob } from './data-retention-scheduled.job.js';

export interface ScheduledJob {
  name: string;
  schedule: string; // Cron expression
  handler: () => Promise<void>;
}

const jobs: ScheduledJob[] = [
  webhookRenewalJob,
  syncRetryJob,
  appointmentReminderJob,
  sessionCleanupJob,
  invitationCleanupJob,
  dailyDigestJob,
  dataRetentionJob,
];

const scheduledTasks: cron.ScheduledTask[] = [];

/**
 * Initialize and start all scheduled jobs
 */
export function startScheduledJobs(): void {
  logger.info({ count: jobs.length }, 'Starting scheduled jobs');

  for (const job of jobs) {
    try {
      // Validate cron expression
      if (!cron.validate(job.schedule)) {
        logger.error({ job: job.name, schedule: job.schedule }, 'Invalid cron expression');
        continue;
      }

      // Create scheduled task
      const task = cron.schedule(job.schedule, async () => {
        const startTime = Date.now();
        logger.info({ job: job.name }, 'Running scheduled job');

        try {
          await job.handler();
          const duration = Date.now() - startTime;
          logger.info({ job: job.name, durationMs: duration }, 'Scheduled job completed');
        } catch (err) {
          const duration = Date.now() - startTime;
          logger.error(
            { err, job: job.name, durationMs: duration },
            'Scheduled job failed'
          );
        }
      });

      scheduledTasks.push(task);
      logger.info({ job: job.name, schedule: job.schedule }, 'Scheduled job registered');
    } catch (err) {
      logger.error({ err, job: job.name }, 'Failed to schedule job');
    }
  }

  logger.info({ activeJobs: scheduledTasks.length }, 'All scheduled jobs started');
}

/**
 * Stop all scheduled jobs
 */
export function stopScheduledJobs(): void {
  logger.info({ count: scheduledTasks.length }, 'Stopping scheduled jobs');

  for (const task of scheduledTasks) {
    task.stop();
  }

  scheduledTasks.length = 0;
  logger.info('All scheduled jobs stopped');
}

/**
 * Get status of all scheduled jobs
 */
export function getJobsStatus(): Array<{ name: string; schedule: string; isRunning: boolean }> {
  return jobs.map((job, index) => ({
    name: job.name,
    schedule: job.schedule,
    isRunning: scheduledTasks[index] ? true : false,
  }));
}
