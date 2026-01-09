import { prisma } from '../server.js';
import { emailService } from '../services/notifications/email.service.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

/**
 * Appointment Reminder Job
 *
 * Sends email reminders 24 hours before appointments.
 * Can be disabled via ENABLE_APPOINTMENT_REMINDERS environment variable.
 */

export async function sendAppointmentReminders(): Promise<void> {
  try {
    // Check if reminders are enabled
    if (!env.ENABLE_APPOINTMENT_REMINDERS) {
      logger.debug('Appointment reminders are disabled via environment variable');
      return;
    }

    // Calculate time window: 23-25 hours from now (24h ± 1h)
    const now = new Date();
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000); // 23 hours from now
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000); // 25 hours from now

    // Find appointments that need reminders
    const appointmentsToRemind = await prisma.appointment.findMany({
      where: {
        reminderSent: false,
        AND: [
          { customerEmail: { not: null } },
          { customerEmail: { not: '' } },
        ],
        status: {
          in: ['PENDING', 'CONFIRMED'], // Don't remind cancelled/completed appointments
        },
        datetime: {
          gte: windowStart, // Appointment is at least 23 hours away
          lte: windowEnd, // Appointment is at most 25 hours away
        },
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: {
        datetime: 'asc', // Send reminders for earlier appointments first
      },
      take: 50, // Limit batch size to prevent overload
    });

    logger.info(
      { count: appointmentsToRemind.length },
      'Checking appointments for reminders'
    );

    if (appointmentsToRemind.length === 0) {
      return;
    }

    let sentCount = 0;
    let failedCount = 0;

    // Process each appointment
    for (const appointment of appointmentsToRemind) {
      try {
        // Extra safety check
        if (!appointment.customerEmail) {
          continue;
        }

        logger.info(
          {
            appointmentId: appointment.id,
            customerEmail: appointment.customerEmail,
            appointmentDate: appointment.datetime,
          },
          'Sending appointment reminder'
        );

        // Send email reminder
        const result = await emailService.sendAppointmentReminder(appointment);

        if (result.success) {
          // Mark as sent in database
          await prisma.appointment.update({
            where: { id: appointment.id },
            data: {
              reminderSent: true,
              reminderSentAt: new Date(),
            },
          });

          sentCount++;
          logger.info(
            {
              appointmentId: appointment.id,
              messageId: result.messageId,
            },
            'Appointment reminder sent successfully'
          );
        } else {
          // Log failure but don't mark as sent (will retry next run)
          failedCount++;
          logger.error(
            {
              appointmentId: appointment.id,
              error: result.error,
            },
            'Failed to send appointment reminder'
          );
        }
      } catch (err) {
        failedCount++;
        logger.error(
          {
            err,
            appointmentId: appointment.id,
          },
          'Error processing appointment reminder'
        );
      }
    }

    logger.info(
      {
        total: appointmentsToRemind.length,
        sent: sentCount,
        failed: failedCount,
      },
      'Completed appointment reminder job'
    );
  } catch (err) {
    logger.error({ err }, 'Error in appointment reminder job');
  }
}

// Export job configuration
export const appointmentReminderJob = {
  name: 'appointment-reminder',
  schedule: '*/15 * * * *', // Every 15 minutes (checks for appointments 24h away)
  // Runs every 15 minutes to check for appointments in the 23-25 hour window
  // Set ENABLE_APPOINTMENT_REMINDERS=true in .env to enable
  handler: sendAppointmentReminders,
};
