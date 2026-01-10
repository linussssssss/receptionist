# Google Calendar Integration Guide

This guide covers setting up Google Calendar integration for appointment sync.

## Prerequisites

- Google Cloud Console account
- A Google Workspace or personal Google account for calendar
- HTTPS domain for webhooks

## Google Cloud Setup

### 1. Create Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create new project (e.g., "AI Receptionist")
3. Note the Project ID

### 2. Enable Calendar API

1. Go to **APIs & Services** > **Library**
2. Search for "Google Calendar API"
3. Click **Enable**

### 3. Configure OAuth Consent Screen

1. Go to **APIs & Services** > **OAuth consent screen**
2. Choose **External** (or Internal for Workspace)
3. Fill in:
   - App name: "AI Receptionist"
   - User support email
   - Developer contact email
4. Add scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
5. Add test users (while in testing mode)

### 4. Create OAuth Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Application type: **Web application**
4. Add Authorized redirect URIs:
   - `https://your-domain.com/api/integrations/google-calendar/auth/callback`
5. Copy **Client ID** and **Client Secret**

### 5. Configure Environment

```env
GOOGLE_CALENDAR_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CALENDAR_CLIENT_SECRET=GOCSPX-xxxxx
GOOGLE_CALENDAR_REDIRECT_URI=https://your-domain.com/api/integrations/google-calendar/auth/callback
GOOGLE_CALENDAR_WEBHOOK_URL=https://your-domain.com/webhooks/google-calendar/notifications
```

---

## OAuth Flow

### 1. Generate Auth URL

```
GET /api/integrations/google-calendar/auth/url?clientId=xxx
```

Returns authorization URL. Redirect user to this URL.

### 2. User Authorizes

User logs into Google, grants calendar access.

### 3. Exchange Code

Google redirects back with authorization code.

```
POST /api/integrations/google-calendar/auth/callback
{
  "code": "auth_code_from_google",
  "clientId": "client123"
}
```

This:
- Exchanges code for access/refresh tokens
- Stores tokens in client's integrations
- Sets up webhook subscription

---

## Webhook Configuration

### How Webhooks Work

1. After OAuth, system calls `watchCalendar()` to subscribe
2. Google sends notifications to webhook URL when calendar changes
3. System processes changes using delta sync

### Webhook Endpoint

```
POST /webhooks/google-calendar/notifications
```

Headers from Google:
- `X-Goog-Channel-ID` - Webhook channel identifier
- `X-Goog-Resource-State` - Type of change (sync, exists)
- `X-Goog-Resource-ID` - Resource identifier

### Webhook Expiration

- Webhooks expire after ~7 days
- `webhook-renewal` job runs every 6 hours
- Automatically renews before expiration

---

## Sync Behavior

### Outbound Sync (AI Receptionist → Google Calendar)

When an appointment is created/updated/deleted:

1. `CalendarSyncService.syncAppointmentToCalendar()` is called
2. Creates/updates/deletes Google Calendar event
3. Stores event ID in appointment's `calendarId`
4. Logs sync operation in `CalendarSync` table

### Inbound Sync (Google Calendar → AI Receptionist)

When calendar is modified externally:

1. Google sends webhook notification
2. System fetches changed events using sync token
3. Creates/updates/cancels appointments accordingly
4. Stores sync token for next delta sync

### Delta Sync

Uses Google's sync tokens for efficient syncing:
- First sync: Full calendar fetch
- Subsequent: Only changed events
- Token stored in client's integrations

---

## Calendar Event Format

### Created Events

```javascript
{
  summary: "Appointment: John Doe",
  description: "Phone: +49123456789\nReason: Checkup\nNotes: Booked via AI",
  start: {
    dateTime: "2024-01-20T14:00:00+01:00",
    timeZone: "Europe/Berlin"
  },
  end: {
    dateTime: "2024-01-20T14:30:00+01:00",
    timeZone: "Europe/Berlin"
  }
}
```

### Parsing Inbound Events

Events created in Google Calendar are parsed:
- Customer name from summary
- Phone/email from description
- Time from start/end
- All-day events are skipped

---

## Retry Logic

### Failed Syncs

If sync fails:
1. Logged in `CalendarSync` with status `FAILED`
2. `sync-retry` job runs every 15 minutes
3. Retries up to 5 times
4. After 5 failures: Critical alert sent

### Manual Sync

Force sync specific appointment:
```
POST /api/integrations/google-calendar/sync/manual
{
  "clientId": "client123",
  "appointmentId": "appt123"
}
```

Or sync all unsynced appointments:
```
POST /api/integrations/google-calendar/sync/manual
{
  "clientId": "client123"
}
```

---

## API Endpoints

### Check Status

```
GET /api/integrations/google-calendar/status?clientId=xxx
```

Response:
```json
{
  "connected": true,
  "calendarId": "primary",
  "connectedAt": "2024-01-10T10:00:00.000Z",
  "lastSyncAt": "2024-01-15T10:30:00.000Z",
  "webhookActive": true,
  "webhookExpiration": "2024-01-17T10:00:00.000Z"
}
```

### View Sync History

```
GET /api/integrations/google-calendar/sync-history?clientId=xxx
```

### Disconnect

```
DELETE /api/integrations/google-calendar/disconnect?clientId=xxx
```

This:
- Stops watching calendar
- Revokes OAuth access
- Clears stored tokens

---

## Troubleshooting

### OAuth Errors

**"redirect_uri_mismatch"**
- Redirect URI in code doesn't match Google Console
- Check exact URL including protocol and path

**"invalid_grant"**
- Authorization code expired (10 minutes)
- User needs to re-authorize

**"access_denied"**
- User denied permission
- App may not be verified

### Webhook Issues

**Not receiving notifications:**
1. Check webhook URL is HTTPS
2. Verify domain is publicly accessible
3. Check expiration date
4. Run webhook renewal manually

**"Unknown channel":**
- Webhook was renewed or deleted
- Old notification from previous channel
- Safe to ignore

### Sync Issues

**Events not appearing in calendar:**
1. Check status endpoint for connection
2. View sync history for errors
3. Run manual sync to test
4. Check OAuth tokens haven't expired

**Events duplicating:**
- Check `calendarId` is stored on appointment
- Verify sync direction (OUTBOUND vs INBOUND)

---

## Security

### Token Storage

- OAuth tokens stored in client's `integrations` JSON
- Refresh tokens used to get new access tokens
- Access tokens expire in 1 hour

### Scopes

Minimal scopes requested:
- `calendar` - Full calendar access
- `calendar.events` - Event management

### Webhook Verification

- Channel ID verified against stored webhooks
- Unknown channels ignored
- Rate limited to prevent abuse

---

## Testing

### In Development

1. Use ngrok for webhook URL
2. Configure redirect URI with ngrok URL
3. Add your email as test user in Google Console

### Verify Connection

```bash
curl "https://your-domain.com/api/integrations/google-calendar/status?clientId=xxx"
```

### Test Sync

1. Create appointment in system
2. Check Google Calendar for new event
3. Modify event in Google Calendar
4. Verify appointment updated in system
