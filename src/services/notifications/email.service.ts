import { Resend } from 'resend';
import ical from 'ical-generator';
import { env } from '../../config/env.js';
import { createServiceLogger } from '../../utils/logger.js';
import { generateAppointmentReminderEmail } from './templates/appointment-reminder.js';
import { generateAppointmentConfirmationEmail } from './templates/appointment-confirmation.js';
import type { Appointment, Client } from '@prisma/client';

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Email Service using Resend
 *
 * Handles sending transactional emails for appointment reminders,
 * confirmations, and other notifications.
 */
export class EmailService {
  private resend: Resend;
  private logger = createServiceLogger('email');
  private fromEmail: string;

  constructor() {
    this.resend = new Resend(env.RESEND_API_KEY);
    this.fromEmail = env.RESEND_FROM_EMAIL;
    this.logger.info('Email service initialized with Resend');
  }

  /**
   * Send appointment reminder email
   */
  async sendAppointmentReminder(
    appointment: Appointment & { client: Pick<Client, 'id' | 'name' | 'phoneNumber'> }
  ): Promise<EmailResult> {
    try {
      // Validate customer email
      if (!appointment.customerEmail) {
        return {
          success: false,
          error: 'No customer email provided',
        };
      }

      // Format date and time
      const appointmentDate = new Date(appointment.datetime);
      const formattedDate = appointmentDate.toLocaleDateString('de-DE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const formattedTime = appointmentDate.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      });

      // Generate email content
      const { subject, html, text } = generateAppointmentReminderEmail({
        customerName: appointment.customerName,
        appointmentDate: formattedDate,
        appointmentTime: formattedTime,
        durationMinutes: appointment.durationMinutes,
        reason: appointment.reason || undefined,
        clientName: appointment.client.name,
        clientPhone: appointment.client.phoneNumber || undefined,
      });

      // Generate calendar invite (.ics file)
      const icsContent = this.generateCalendarInvite(appointment);

      // Send email via Resend with .ics attachment
      const result = await this.sendEmail(
        appointment.customerEmail,
        subject,
        html,
        text,
        undefined,
        [
          {
            filename: 'appointment.ics',
            content: icsContent,
          },
        ]
      );

      if (result.success) {
        this.logger.info(
          {
            appointmentId: appointment.id,
            customerEmail: appointment.customerEmail,
            messageId: result.messageId,
          },
          'Appointment reminder email sent successfully with calendar invite'
        );
      }

      return result;
    } catch (err: any) {
      this.logger.error(
        {
          err,
          appointmentId: appointment.id,
        },
        'Failed to send appointment reminder email'
      );

      return {
        success: false,
        error: err.message || 'Unknown error',
      };
    }
  }

  /**
   * Send appointment confirmation email
   */
  async sendAppointmentConfirmation(
    appointment: Appointment & { client: Pick<Client, 'id' | 'name' | 'phoneNumber'> }
  ): Promise<EmailResult> {
    try {
      // Validate customer email
      if (!appointment.customerEmail) {
        return {
          success: false,
          error: 'No customer email provided',
        };
      }

      // Format date and time
      const appointmentDate = new Date(appointment.datetime);
      const formattedDate = appointmentDate.toLocaleDateString('de-DE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const formattedTime = appointmentDate.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      });

      // Generate email content
      const { subject, html, text } = generateAppointmentConfirmationEmail({
        customerName: appointment.customerName,
        appointmentDate: formattedDate,
        appointmentTime: formattedTime,
        durationMinutes: appointment.durationMinutes,
        reason: appointment.reason || undefined,
        clientName: appointment.client.name,
        clientPhone: appointment.client.phoneNumber || undefined,
      });

      // Generate calendar invite (.ics file)
      const icsContent = this.generateCalendarInvite(appointment);

      // Send email via Resend with .ics attachment
      const result = await this.sendEmail(
        appointment.customerEmail,
        subject,
        html,
        text,
        undefined,
        [
          {
            filename: 'appointment.ics',
            content: icsContent,
          },
        ]
      );

      if (result.success) {
        this.logger.info(
          {
            appointmentId: appointment.id,
            customerEmail: appointment.customerEmail,
            messageId: result.messageId,
          },
          'Appointment confirmation email sent successfully with calendar invite'
        );
      }

      return result;
    } catch (err: any) {
      this.logger.error(
        {
          err,
          appointmentId: appointment.id,
        },
        'Failed to send appointment confirmation email'
      );

      return {
        success: false,
        error: err.message || 'Unknown error',
      };
    }
  }

  /**
   * Generate .ics calendar invite for appointment
   */
  private generateCalendarInvite(
    appointment: Appointment & { client: Pick<Client, 'id' | 'name' | 'phoneNumber'> }
  ): string {
    const calendar = ical({ name: 'Terminbestätigung' });

    const endTime = new Date(
      new Date(appointment.datetime).getTime() +
        (appointment.durationMinutes || 30) * 60 * 1000
    );

    calendar.createEvent({
      start: appointment.datetime,
      end: endTime,
      summary: `Termin bei ${appointment.client.name}`,
      description: appointment.reason || 'Termin',
      location: appointment.client.name,
      organizer: {
        name: appointment.client.name,
        email: 'noreply@example.com', // Using placeholder since we may not have client email
      },
      attendees: appointment.customerEmail
        ? [
            {
              name: appointment.customerName,
              email: appointment.customerEmail,
              rsvp: true,
            },
          ]
        : undefined,
    });

    return calendar.toString();
  }

  /**
   * Generic email sending method
   */
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    text?: string,
    from?: string,
    attachments?: Array<{ filename: string; content: string }>
  ): Promise<EmailResult> {
    try {
      const fromAddress = from || this.fromEmail;

      this.logger.debug(
        {
          to,
          subject,
          from: fromAddress,
        },
        'Sending email via Resend'
      );

      const response = await this.resend.emails.send({
        from: fromAddress,
        to: [to],
        subject,
        html,
        text: text || undefined,
        ...(attachments && { attachments }),
      });

      if (response.error) {
        this.logger.error(
          {
            error: response.error,
            to,
            subject,
          },
          'Resend API returned error'
        );

        return {
          success: false,
          error: response.error.message || 'Resend API error',
        };
      }

      return {
        success: true,
        messageId: response.data?.id,
      };
    } catch (err: any) {
      this.logger.error(
        {
          err,
          to,
          subject,
        },
        'Failed to send email'
      );

      return {
        success: false,
        error: err.message || 'Unknown error',
      };
    }
  }
}

// Export singleton instance
export const emailService = new EmailService();
