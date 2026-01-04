import { prisma } from '../server.js';
import { emailService } from '../services/notifications/email.service.js';
import { logger } from '../utils/logger.js';

/**
 * Appointment Reminder Job
 *
 * Sends email reminders for appointments that haven't been reminded yet.
 * For testing: Runs every 2 minutes to catch new appointments quickly.
 * For production: Should be configured to run at appropriate intervals.
 */

export async function sendAppointmentReminders(): Promise<void> {
  try {
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
  schedule: '*/2 * * * *', // Every 2 minutes for testing
  // For production, consider:
  // '*/15 * * * *' - Every 15 minutes
  // '0 * * * *' - Every hour
  handler: sendAppointmentReminders,
};
