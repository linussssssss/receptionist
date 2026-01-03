import { prisma } from '../../server.js';
import { googleCalendarService } from './google-calendar.service.js';
import type { CalendarSyncOperation, GoogleCalendarEvent } from '../../types/google-calendar.js';

export class CalendarSyncService {
  /**
   * Sync appointment to Google Calendar (outbound)
   */
  async syncAppointmentToCalendar(
    appointmentId: string,
    operation: CalendarSyncOperation
  ): Promise<void> {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { client: true },
    });

    if (!appointment) {
      throw new Error(`Appointment ${appointmentId} not found`);
    }

    // Check if Google Calendar is enabled for this client
    const googleCalendarConfig = (appointment.client.integrations as any)?.googleCalendar;
    if (!googleCalendarConfig?.enabled) {
      // Skip sync if not enabled
      return;
    }

    // Create sync log
    const syncLog = await prisma.calendarSync.create({
      data: {
        appointmentId,
        clientId: appointment.clientId,
        operation,
        direction: 'OUTBOUND',
        status: 'PENDING',
      },
    });

    try {
      let calendarEventId = appointment.calendarId;

      switch (operation) {
        case 'CREATE':
          // Create new calendar event
          const createEvent = googleCalendarService.convertAppointmentToCalendarEvent(appointment);
          const createdEvent = await googleCalendarService.createEvent(
            appointment.clientId,
            createEvent
          );

          // Store event ID in appointment
          await prisma.appointment.update({
            where: { id: appointmentId },
            data: { calendarId: createdEvent.id! },
          });

          calendarEventId = createdEvent.id!;
          break;

        case 'UPDATE':
          if (!appointment.calendarId) {
            // No calendar event exists, create one instead
            await this.syncAppointmentToCalendar(appointmentId, 'CREATE');
            return;
          }

          // Update existing calendar event
          const updateEvent = googleCalendarService.convertAppointmentToCalendarEvent(appointment);
          await googleCalendarService.updateEvent(
            appointment.clientId,
            appointment.calendarId,
            updateEvent
          );
          break;

        case 'DELETE':
          if (!appointment.calendarId) {
            // No calendar event to delete, skip
            await this.updateSyncLog(syncLog.id, 'SKIPPED');
            return;
          }

          // Delete calendar event
          await googleCalendarService.deleteEvent(
            appointment.clientId,
            appointment.calendarId
          );

          // Clear calendarId from appointment
          await prisma.appointment.update({
            where: { id: appointmentId },
            data: { calendarId: null },
          });
          break;
      }

      // Update sync log as successful
      await this.updateSyncLog(syncLog.id, 'SUCCESS', undefined, calendarEventId);

      // Update last sync time
      await this.updateLastSyncTime(appointment.clientId);
    } catch (err: any) {
      // Update sync log with error
      await this.updateSyncLog(syncLog.id, 'FAILED', err.message);

      // Don't rethrow - we don't want sync failures to break appointment creation
      console.error(`Failed to sync appointment ${appointmentId} to calendar:`, err);
    }
  }

  /**
   * Sync calendar event to appointment (inbound)
   */
  async syncCalendarEventToAppointment(
    clientId: string,
    eventId: string,
    operation: CalendarSyncOperation
  ): Promise<void> {
    try {
      switch (operation) {
        case 'CREATE':
        case 'UPDATE':
          // Fetch event from Google Calendar
          const event = await googleCalendarService.getEvent(clientId, eventId);
          const appointmentData = googleCalendarService.convertCalendarEventToAppointment(event, clientId);

          if (!appointmentData) {
            // Skip events that can't be converted (e.g., all-day events)
            return;
          }

          // Check if appointment already exists with this calendarId
          const existing = await prisma.appointment.findFirst({
            where: { calendarId: eventId, clientId },
          });

          if (existing) {
            // Update existing appointment
            await prisma.appointment.update({
              where: { id: existing.id },
              data: {
                customerName: appointmentData.customerName,
                customerPhone: appointmentData.customerPhone,
                customerEmail: appointmentData.customerEmail,
                datetime: appointmentData.datetime,
                durationMinutes: appointmentData.durationMinutes,
                reason: appointmentData.reason,
                notes: appointmentData.notes,
              },
            });

            // Create sync log
            await prisma.calendarSync.create({
              data: {
                appointmentId: existing.id,
                clientId,
                operation: 'UPDATE',
                direction: 'INBOUND',
                status: 'SUCCESS',
                calendarEventId: eventId,
              },
            });
          } else {
            // Create new appointment
            const newAppointment = await prisma.appointment.create({
              data: {
                clientId,
                customerName: appointmentData.customerName,
                customerPhone: appointmentData.customerPhone,
                customerEmail: appointmentData.customerEmail,
                datetime: appointmentData.datetime,
                durationMinutes: appointmentData.durationMinutes,
                reason: appointmentData.reason,
                notes: appointmentData.notes,
                status: 'PENDING',
                calendarId: eventId,
              },
            });

            // Create sync log
            await prisma.calendarSync.create({
              data: {
                appointmentId: newAppointment.id,
                clientId,
                operation: 'CREATE',
                direction: 'INBOUND',
                status: 'SUCCESS',
                calendarEventId: eventId,
              },
            });
          }
          break;

        case 'DELETE':
          // Find appointment with this calendarId
          const appointment = await prisma.appointment.findFirst({
            where: { calendarId: eventId, clientId },
          });

          if (appointment) {
            // Mark appointment as cancelled
            await prisma.appointment.update({
              where: { id: appointment.id },
              data: {
                status: 'CANCELLED',
                notes: appointment.notes
                  ? `${appointment.notes}\n\nCancelled via Google Calendar`
                  : 'Cancelled via Google Calendar',
              },
            });

            // Create sync log
            await prisma.calendarSync.create({
              data: {
                appointmentId: appointment.id,
                clientId,
                operation: 'DELETE',
                direction: 'INBOUND',
                status: 'SUCCESS',
                calendarEventId: eventId,
              },
            });
          }
          break;
      }

      // Update last sync time
      await this.updateLastSyncTime(clientId);
    } catch (err: any) {
      console.error(`Failed to sync calendar event ${eventId} to appointment:`, err);
      throw err;
    }
  }

  /**
   * Update sync log status
   */
  private async updateSyncLog(
    syncId: string,
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED',
    errorMessage?: string,
    calendarEventId?: string
  ): Promise<void> {
    await prisma.calendarSync.update({
      where: { id: syncId },
      data: {
        status,
        errorMessage,
        calendarEventId,
        syncedAt: status === 'SUCCESS' ? new Date() : undefined,
      },
    });
  }

  /**
   * Update last sync time for client
   */
  private async updateLastSyncTime(clientId: string): Promise<void> {
    const client = await prisma.client.findUnique({ where: { id: clientId } });

    if (!client?.integrations) {
      return;
    }

    const integrations = client.integrations as any;

    if (integrations.googleCalendar) {
      integrations.googleCalendar.lastSyncAt = new Date().toISOString();

      await prisma.client.update({
        where: { id: clientId },
        data: { integrations },
      });
    }
  }

  /**
   * Retry failed syncs
   */
  async retryFailedSyncs(): Promise<void> {
    const failedSyncs = await prisma.calendarSync.findMany({
      where: {
        status: 'FAILED',
        retryCount: { lt: 3 },
      },
      include: {
        appointment: true,
      },
    });

    for (const sync of failedSyncs) {
      try {
        // Increment retry count
        await prisma.calendarSync.update({
          where: { id: sync.id },
          data: { retryCount: { increment: 1 } },
        });

        // Retry sync
        if (sync.direction === 'OUTBOUND') {
          await this.syncAppointmentToCalendar(sync.appointmentId, sync.operation as CalendarSyncOperation);
        } else {
          if (sync.calendarEventId) {
            await this.syncCalendarEventToAppointment(
              sync.clientId,
              sync.calendarEventId,
              sync.operation as CalendarSyncOperation
            );
          }
        }
      } catch (err) {
        console.error(`Failed to retry sync ${sync.id}:`, err);
      }
    }
  }
}

// Export singleton instance
export const calendarSyncService = new CalendarSyncService();
