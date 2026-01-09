import { prisma } from '../server.js';
import { googleCalendarService } from '../services/integrations/google-calendar.service.js';
import { logger } from '../utils/logger.js';

/**
 * Webhook Renewal Job
 *
 * Automatically renews Google Calendar webhooks before they expire.
 * Webhooks expire after 7 days, so we renew them 24 hours before expiration.
 */

const RENEWAL_THRESHOLD_HOURS = 24; // Renew 24 hours before expiration
const WEBHOOK_URL = process.env.GOOGLE_CALENDAR_WEBHOOK_URL || '';

export async function renewExpiringWebhooks(): Promise<void> {
  try {
    const now = new Date();
    const threshold = new Date(now.getTime() + RENEWAL_THRESHOLD_HOURS * 60 * 60 * 1000);

    // Find webhooks expiring within the next 24 hours
    const expiringWebhooks = await prisma.calendarWebhook.findMany({
      where: {
        isActive: true,
        expiration: {
          lte: threshold,
          gte: now, // Not already expired
        },
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            integrations: true,
          },
        },
      },
    });

    logger.info(
      { count: expiringWebhooks.length, threshold: threshold.toISOString() },
      'Checking for expiring webhooks'
    );

    for (const webhook of expiringWebhooks) {
      try {
        // Check if Google Calendar is still enabled
        const integrations = webhook.client.integrations as any;
        if (!integrations?.googleCalendar?.enabled) {
          logger.info(
            { clientId: webhook.clientId, clientName: webhook.client.name },
            'Skipping webhook renewal - Google Calendar integration disabled'
          );
          continue;
        }

        logger.info(
          {
            clientId: webhook.clientId,
            clientName: webhook.client.name,
            currentExpiration: webhook.expiration.toISOString(),
          },
          'Renewing webhook subscription'
        );

        // Renew the webhook (stops old one and creates new one)
        await googleCalendarService.renewWatch(webhook.clientId, WEBHOOK_URL);

        logger.info(
          { clientId: webhook.clientId, clientName: webhook.client.name },
          'Successfully renewed webhook subscription'
        );
      } catch (err) {
        logger.error(
          { err, clientId: webhook.clientId, clientName: webhook.client.name },
          'Failed to renew webhook subscription'
        );

        // Mark webhook as inactive if renewal fails
        await prisma.calendarWebhook.update({
          where: { id: webhook.id },
          data: { isActive: false },
        });
      }
    }

    // Also cleanup expired webhooks that weren't renewed
    const expiredWebhooks = await prisma.calendarWebhook.findMany({
      where: {
        isActive: true,
        expiration: {
          lt: now,
        },
      },
    });

    if (expiredWebhooks.length > 0) {
      logger.warn(
        { count: expiredWebhooks.length },
        'Found expired webhooks, marking as inactive'
      );

      await prisma.calendarWebhook.updateMany({
        where: {
          isActive: true,
          expiration: {
            lt: now,
          },
        },
        data: { isActive: false },
      });
    }
  } catch (err) {
    logger.error({ err }, 'Error in webhook renewal job');
  }
}

// Run this job every hour
export const webhookRenewalJob = {
  name: 'webhook-renewal',
  schedule: '0 * * * *', // Every hour at minute 0
  handler: renewExpiringWebhooks,
};
