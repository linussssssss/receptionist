import { google, calendar_v3 } from 'googleapis';
import { oauthService } from './oauth.service.js';
import { prisma } from '../../server.js';
import type { CalendarEvent, WatchResponse, AppointmentData, GoogleCalendarEvent } from '../../types/google-calendar.js';
import type { Appointment } from '@prisma/client';

export class GoogleCalendarService {
  /**
   * Create calendar event
   */
  async createEvent(clientId: string, event: CalendarEvent): Promise<GoogleCalendarEvent> {
    const auth = await oauthService.getOAuth2Client(clientId);
    const calendar = google.calendar({ version: 'v3', auth });

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    const calendarId = ((client?.integrations as any)?.googleCalendar?.calendarId) || 'primary';

    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    return response.data;
  }

  /**
   * Update calendar event
   */
  async updateEvent(clientId: string, eventId: string, event: CalendarEvent): Promise<GoogleCalendarEvent> {
    const auth = await oauthService.getOAuth2Client(clientId);
    const calendar = google.calendar({ version: 'v3', auth });

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    const calendarId = ((client?.integrations as any)?.googleCalendar?.calendarId) || 'primary';

    const response = await calendar.events.update({
      calendarId,
      eventId,
      requestBody: event,
    });

    return response.data;
  }

  /**
   * Delete calendar event
   */
  async deleteEvent(clientId: string, eventId: string): Promise<void> {
    const auth = await oauthService.getOAuth2Client(clientId);
    const calendar = google.calendar({ version: 'v3', auth });

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    const calendarId = ((client?.integrations as any)?.googleCalendar?.calendarId) || 'primary';

    await calendar.events.delete({
      calendarId,
      eventId,
    });
  }

  /**
   * Get calendar event
   */
  async getEvent(clientId: string, eventId: string): Promise<GoogleCalendarEvent> {
    const auth = await oauthService.getOAuth2Client(clientId);
    const calendar = google.calendar({ version: 'v3', auth });

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    const calendarId = ((client?.integrations as any)?.googleCalendar?.calendarId) || 'primary';

    const response = await calendar.events.get({
      calendarId,
      eventId,
    });

    return response.data;
  }

  /**
   * List events (for conflict checking)
   */
  async listEvents(clientId: string, timeMin: Date, timeMax: Date): Promise<GoogleCalendarEvent[]> {
    const auth = await oauthService.getOAuth2Client(clientId);
    const calendar = google.calendar({ version: 'v3', auth });

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    const calendarId = ((client?.integrations as any)?.googleCalendar?.calendarId) || 'primary';

    const response = await calendar.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    return response.data.items || [];
  }

  /**
   * Watch calendar for push notifications
   */
  async watchCalendar(clientId: string, webhookUrl: string): Promise<WatchResponse> {
    const auth = await oauthService.getOAuth2Client(clientId);
    const calendar = google.calendar({ version: 'v3', auth });

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    const calendarId = ((client?.integrations as any)?.googleCalendar?.calendarId) || 'primary';

    // Generate unique channel ID
    const channelId = `calendar-watch-${clientId}-${Date.now()}`;

    const response = await calendar.events.watch({
      calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
        expiration: (Date.now() + 7 * 24 * 60 * 60 * 1000).toString(), // 7 days from now
      },
    });

    // Store webhook info in database
    await prisma.calendarWebhook.upsert({
      where: { clientId },
      create: {
        clientId,
        channelId: response.data.id!,
        resourceId: response.data.resourceId!,
        expiration: new Date(parseInt(response.data.expiration!)),
        isActive: true,
      },
      update: {
        channelId: response.data.id!,
        resourceId: response.data.resourceId!,
        expiration: new Date(parseInt(response.data.expiration!)),
        isActive: true,
      },
    });

    return {
      kind: response.data.kind!,
      id: response.data.id!,
      resourceId: response.data.resourceId!,
      resourceUri: response.data.resourceUri!,
      token: response.data.token,
      expiration: response.data.expiration!,
    };
  }

  /**
   * Stop watching calendar
   */
  async stopWatching(clientId: string): Promise<void> {
    const webhook = await prisma.calendarWebhook.findUnique({
      where: { clientId },
    });

    if (!webhook) {
      return; // Nothing to stop
    }

    try {
      const auth = await oauthService.getOAuth2Client(clientId);
      const calendar = google.calendar({ version: 'v3', auth });

      await calendar.channels.stop({
        requestBody: {
          id: webhook.channelId,
          resourceId: webhook.resourceId,
        },
      });
    } catch (err) {
      console.error('Failed to stop watching calendar:', err);
      // Continue to delete webhook record even if API call fails
    }

    // Delete webhook record
    await prisma.calendarWebhook.delete({
      where: { clientId },
    });
  }

  /**
   * Renew watch (should be called before expiration)
   */
  async renewWatch(clientId: string, webhookUrl: string): Promise<void> {
    await this.stopWatching(clientId);
    await this.watchCalendar(clientId, webhookUrl);
  }

  /**
   * Convert Appointment to Google Calendar event format
   */
  convertAppointmentToCalendarEvent(appointment: Appointment): CalendarEvent {
    const endTime = new Date(appointment.datetime);
    endTime.setMinutes(endTime.getMinutes() + appointment.durationMinutes);

    // Format datetime without timezone conversion - assume DB stores in local time
    const formatDateTimeForCalendar = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    };

    return {
      summary: `Appointment: ${appointment.customerName}`,
      description: [
        `Customer: ${appointment.customerName}`,
        `Phone: ${appointment.customerPhone}`,
        appointment.customerEmail ? `Email: ${appointment.customerEmail}` : '',
        appointment.reason ? `Reason: ${appointment.reason}` : '',
        appointment.notes ? `Notes: ${appointment.notes}` : '',
      ].filter(Boolean).join('\n'),
      start: {
        dateTime: formatDateTimeForCalendar(appointment.datetime),
        timeZone: 'Europe/Berlin', // TODO: Make configurable per client
      },
      end: {
        dateTime: formatDateTimeForCalendar(endTime),
        timeZone: 'Europe/Berlin',
      },
      attendees: appointment.customerEmail
        ? [{
            email: appointment.customerEmail,
            displayName: appointment.customerName,
          }]
        : undefined,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 60 }, // 1 hour before
        ],
      },
    };
  }

  /**
   * Convert Google Calendar event to AppointmentData
   */
  convertCalendarEventToAppointment(event: GoogleCalendarEvent, clientId: string): AppointmentData | null {
    if (!event.start?.dateTime || !event.end?.dateTime) {
      return null; // Skip all-day events
    }

    const startTime = new Date(event.start.dateTime);
    const endTime = new Date(event.end.dateTime);
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));

    // Try to extract customer info from description
    const description = event.description || '';
    const phoneMatch = description.match(/Phone:\s*(.+)/i);
    const emailMatch = description.match(/Email:\s*(.+)/i);
    const reasonMatch = description.match(/Reason:\s*(.+)/i);

    return {
      customerName: event.summary || 'Unknown',
      customerPhone: phoneMatch ? phoneMatch[1].trim() : '',
      customerEmail: emailMatch ? emailMatch[1].trim() : undefined,
      datetime: startTime,
      durationMinutes,
      reason: reasonMatch ? reasonMatch[1].trim() : undefined,
      notes: `Synced from Google Calendar (Event ID: ${event.id})`,
    };
  }
}

// Export singleton instance
export const googleCalendarService = new GoogleCalendarService();
