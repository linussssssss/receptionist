import { calendar_v3 } from 'googleapis';

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
  scope: string;
  tokenType: string;
}

export interface GoogleCalendarConfig {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  calendarId: string; // Which calendar to use (usually 'primary')
  enabled: boolean;
  connectedAt: string; // ISO timestamp
  lastSyncAt?: string; // ISO timestamp
}

export interface CalendarEvent {
  summary: string; // Title/description
  description?: string;
  location?: string;
  start: {
    dateTime: string; // ISO 8601 format
    timeZone?: string;
  };
  end: {
    dateTime: string; // ISO 8601 format
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
}

export interface WatchResponse {
  kind: string;
  id: string; // Channel ID
  resourceId: string; // Opaque ID for the watched resource
  resourceUri: string;
  token?: string;
  expiration: string; // Unix timestamp in milliseconds as string
}

export interface WebhookNotification {
  channelId: string;
  resourceId: string;
  resourceState: 'sync' | 'exists' | 'not_exists';
  resourceUri: string;
  changed?: string; // Comma-separated list of changed properties
}

export interface AppointmentData {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  datetime: Date;
  durationMinutes: number;
  reason?: string;
  notes?: string;
}

export type CalendarSyncOperation = 'CREATE' | 'UPDATE' | 'DELETE';
export type CalendarSyncDirection = 'OUTBOUND' | 'INBOUND';
export type CalendarSyncStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface CalendarSyncLog {
  id: string;
  appointmentId: string;
  clientId: string;
  operation: CalendarSyncOperation;
  direction: CalendarSyncDirection;
  status: CalendarSyncStatus;
  calendarEventId?: string;
  eventData?: any;
  errorMessage?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  syncedAt?: Date;
}

// Re-export calendar types from googleapis for convenience
export type GoogleCalendarEvent = calendar_v3.Schema$Event;
export type GoogleCalendarList = calendar_v3.Schema$Events;
