import { prisma } from '../server.js';
import { env } from '../config/env.js';
import { emailService } from '../services/notifications/email.service.js';
import { generateDailyDigestEmail, type DailyDigestMetrics } from '../services/notifications/templates/daily-digest.js';
import { logger } from '../utils/logger.js';
import type { ScheduledJob } from './scheduler.js';

/**
 * Daily Digest Job
 *
 * Sends a daily summary email to all admin users with key metrics
 * from the previous 24 hours.
 */
export const dailyDigestJob: ScheduledJob = {
  name: 'daily-digest',
  schedule: `0 ${env.DAILY_DIGEST_HOUR} * * *`, // Run at configured hour daily
  handler: async () => {
    if (!env.DAILY_DIGEST_ENABLED) {
      logger.info('Daily digest disabled via DAILY_DIGEST_ENABLED=false');
      return;
    }

    logger.info('Starting daily digest generation');

    try {
      // Calculate date range (last 24 hours)
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

      // Aggregate metrics
      const metrics = await aggregateDailyMetrics(startDate, endDate);

      // Get admin emails
      const adminEmails = await getAdminEmails();

      if (adminEmails.length === 0) {
        logger.warn('No admin emails found, skipping daily digest');
        return;
      }

      // Generate and send email to each admin
      const { subject, html, text } = generateDailyDigestEmail(metrics);

      let successCount = 0;
      let failCount = 0;

      for (const email of adminEmails) {
        try {
          const result = await emailService.sendEmail(email, subject, html, text);
          if (result.success) {
            successCount++;
          } else {
            failCount++;
            logger.error({ email, error: result.error }, 'Failed to send daily digest');
          }
        } catch (err) {
          failCount++;
          logger.error({ err, email }, 'Error sending daily digest');
        }
      }

      // Store metrics for trend analysis
      await storeDailyMetrics(metrics);

      logger.info(
        { successCount, failCount, totalRecipients: adminEmails.length },
        'Daily digest sent'
      );
    } catch (err) {
      logger.error({ err }, 'Failed to generate daily digest');
      throw err;
    }
  },
};

/**
 * Aggregate metrics from the database for the given date range
 */
async function aggregateDailyMetrics(startDate: Date, endDate: Date): Promise<DailyDigestMetrics> {
  // Get call metrics
  const calls = await prisma.call.findMany({
    where: {
      startTime: { gte: startDate, lt: endDate },
    },
    select: {
      status: true,
      duration: true,
    },
  });

  const totalCalls = calls.length;
  const completedCalls = calls.filter((c) => c.status === 'COMPLETED').length;
  const failedCalls = calls.filter((c) => c.status === 'FAILED').length;
  const totalDuration = calls.reduce((sum, c) => sum + (c.duration || 0), 0);
  const averageCallDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;

  // Get appointment metrics
  const [appointmentsCreated, appointmentsCancelled] = await Promise.all([
    prisma.appointment.count({
      where: {
        createdAt: { gte: startDate, lt: endDate },
        status: { not: 'CANCELLED' },
      },
    }),
    prisma.appointment.count({
      where: {
        updatedAt: { gte: startDate, lt: endDate },
        status: 'CANCELLED',
      },
    }),
  ]);

  // Get error metrics from SystemEvent
  const errorEvents = await prisma.systemEvent.findMany({
    where: {
      timestamp: { gte: startDate, lt: endDate },
      severity: { in: ['error', 'critical'] },
    },
    select: {
      eventType: true,
      severity: true,
    },
  });

  const totalErrors = errorEvents.length;
  const errorsByType: Record<string, number> = {};
  for (const event of errorEvents) {
    errorsByType[event.eventType] = (errorsByType[event.eventType] || 0) + 1;
  }

  // Get critical alerts sent
  const criticalAlertsSent = await prisma.alertLog.count({
    where: {
      sentAt: { gte: startDate, lt: endDate },
      severity: 'critical',
    },
  });

  // Get sync metrics
  const [calendarSyncSuccess, calendarSyncFailed] = await Promise.all([
    prisma.calendarSync.count({
      where: {
        createdAt: { gte: startDate, lt: endDate },
        status: 'SUCCESS',
      },
    }),
    prisma.calendarSync.count({
      where: {
        createdAt: { gte: startDate, lt: endDate },
        status: 'FAILED',
      },
    }),
  ]);

  // Get rate limit violations from SystemEvent
  const rateLimitViolations = await prisma.systemEvent.count({
    where: {
      timestamp: { gte: startDate, lt: endDate },
      eventType: 'rate_limit_exceeded',
    },
  });

  // Format date
  const dateFormatted = startDate.toLocaleDateString('de-DE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return {
    date: startDate.toISOString().split('T')[0],
    dateFormatted,
    totalCalls,
    completedCalls,
    failedCalls,
    averageCallDuration,
    appointmentsCreated,
    appointmentsCancelled,
    totalErrors,
    criticalAlertsSent,
    errorsByType,
    calendarSyncSuccess,
    calendarSyncFailed,
    rateLimitViolations,
  };
}

/**
 * Get emails of all admin users
 */
async function getAdminEmails(): Promise<string[]> {
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
}

/**
 * Store daily metrics in database for trend analysis
 */
async function storeDailyMetrics(metrics: DailyDigestMetrics): Promise<void> {
  const date = new Date(metrics.date);
  date.setHours(0, 0, 0, 0);

  try {
    await prisma.dailyMetrics.upsert({
      where: { date },
      create: {
        date,
        metrics: metrics as any,
      },
      update: {
        metrics: metrics as any,
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to store daily metrics');
  }
}
