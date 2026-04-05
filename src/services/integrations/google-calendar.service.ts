import { google } from 'googleapis';
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
   * List changed events using delta/sync tokens for efficient incremental sync
   * Returns both the events and the new sync token to use for the next delta request
   */
  async listEventsDelta(
    clientId: string,
    syncToken?: string
  ): Promise<{ events: GoogleCalendarEvent[]; nextSyncToken?: string; nextPageToken?: string }> {
    const auth = await oauthService.getOAuth2Client(clientId);
    const calendar = google.calendar({ version: 'v3', auth });

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    const calendarId = ((client?.integrations as any)?.googleCalendar?.calendarId) || 'primary';

    try {
      const response = await calendar.events.list({
        calendarId,
        syncToken: syncToken || undefined,
        singleEvents: true,
        showDeleted: true, // Include deleted events in delta sync
        maxResults: 250, // Fetch up to 250 events per page
      });

      return {
        events: response.data.items || [],
        nextSyncToken: response.data.nextSyncToken ?? undefined,
        nextPageToken: response.data.nextPageToken ?? undefined,
      };
    } catch (err: any) {
      // If sync token is invalid, Google returns 410 Gone
      if (err.code === 410 || err.status === 410) {
        // Sync token expired or invalid - do a full sync
        console.warn('Sync token expired, performing full sync');
        const now = new Date();
        const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
        const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days ahead

        const response = await calendar.events.list({
          calendarId,
          timeMin: past.toISOString(),
          timeMax: future.toISOString(),
          singleEvents: true,
          showDeleted: true,
          maxResults: 250,
        });

        return {
          events: response.data.items || [],
          nextSyncToken: response.data.nextSyncToken ?? undefined,
          nextPageToken: response.data.nextPageToken ?? undefined,
        };
      }
      throw err;
    }
  }

  /**
   * Update sync token for a client
   */
  async updateSyncToken(clientId: string, syncToken: string): Promise<void> {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return;

    const integrations = client.integrations as any;
    if (!integrations?.googleCalendar) return;

    integrations.googleCalendar.syncToken = syncToken;
    integrations.googleCalendar.lastSyncAt = new Date().toISOString();

    await prisma.client.update({
      where: { id: clientId },
      data: { integrations },
    });
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
      token: response.data.token ?? undefined,
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
  convertCalendarEventToAppointment(event: GoogleCalendarEvent, _clientId: string): AppointmentData | null {
    if (!event.start?.dateTime || !event.end?.dateTime) {
      return null; // Skip all-day events
    }

    const startTime = new Date(event.start.dateTime);
    const endTime = new Date(event.end.dateTime);
    const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));

    // Extract customer email - try multiple sources
    let customerEmail: string | undefined;

    // 1. Check if event has attendees (guests added to the event)
    if (event.attendees && event.attendees.length > 0) {
      // Use the first attendee's email
      customerEmail = event.attendees[0].email ?? undefined;
    }

    // 2. Try to extract from description if no attendees
    if (!customerEmail) {
      const description = event.description || '';

      // Try structured format first: "Email: xxx"
      const emailMatch = description.match(/Email:\s*(.+)/i);
      if (emailMatch) {
        customerEmail = emailMatch[1].trim();
      } else {
        // Try to find any email address in the description using general regex
        const generalEmailMatch = description.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
        if (generalEmailMatch) {
          customerEmail = generalEmailMatch[1].trim();
        }
      }
    }

    // Extract other customer info from description
    const description = event.description || '';
    const phoneMatch = description.match(/Phone:\s*(.+)/i);
    const reasonMatch = description.match(/Reason:\s*(.+)/i);

    return {
      customerName: event.summary || 'Unknown',
      customerPhone: phoneMatch ? phoneMatch[1].trim() : '',
      customerEmail: customerEmail,
      datetime: startTime,
      durationMinutes,
      reason: reasonMatch ? reasonMatch[1].trim() : undefined,
      notes: `Synced from Google Calendar (Event ID: ${event.id})`,
    };
  }
}

// Export singleton instance
export const googleCalendarService = new GoogleCalendarService();
