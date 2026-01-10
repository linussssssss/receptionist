# Architecture

This document describes the system architecture of the AI Receptionist.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              External Services                               │
├──────────────┬──────────────┬──────────────┬──────────────┬─────────────────┤
│    Twilio    │    Claude    │  ElevenLabs  │   Google     │     Resend      │
│  (Telephony) │     (AI)     │    (TTS)     │  Calendar    │    (Email)      │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴────────┬────────┘
       │              │              │              │                │
       ▼              ▼              ▼              ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AI Receptionist Server                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ │
│  │   Routes   │  │  Services  │  │    Jobs    │  │      Middleware        │ │
│  │            │  │            │  │ (Scheduled)│  │  (Auth, Rate Limit)    │ │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └───────────┬────────────┘ │
│        │               │               │                     │              │
│        └───────────────┴───────────────┴─────────────────────┘              │
│                                    │                                         │
│                    ┌───────────────┴───────────────┐                        │
│                    ▼                               ▼                        │
│             ┌────────────┐                  ┌────────────┐                  │
│             │ PostgreSQL │                  │   Redis    │                  │
│             │  (Prisma)  │                  │  (Cache)   │                  │
│             └────────────┘                  └────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Service Layer Architecture

```
src/services/
├── ai/                     # AI integrations
│   ├── claude.service.ts       # Intent classification, appointment extraction
│   └── elevenlabs.service.ts   # Text-to-speech generation
│
├── telephony/              # Voice call handling
│   ├── twilio.service.ts       # Twilio API, TwiML generation
│   └── call-state.service.ts   # In-memory call state (Redis-backed)
│
├── business-logic/         # Core business logic
│   ├── appointment.handler.ts  # Appointment creation and validation
│   └── conversation.handler.ts # Conversation flow management
│
├── integrations/           # External integrations
│   ├── google-calendar.service.ts  # Calendar API operations
│   └── calendar-sync.service.ts    # Bidirectional sync logic
│
├── notifications/          # Email notifications
│   ├── email.service.ts        # Resend email sending
│   └── templates/              # Email HTML/text templates
│       ├── appointment-confirmation.ts
│       ├── appointment-reminder.ts
│       ├── alert-critical.ts
│       ├── alert-warning.ts
│       └── daily-digest.ts
│
└── monitoring/             # Alerting & metrics
    ├── alert.service.ts        # Send alerts to admins
    ├── alert-deduplication.ts  # Prevent alert spam
    └── monitored-operation.ts  # Wrap critical operations
```

## Call Flow

```
1. Incoming Call
   Twilio → POST /api/voice/incoming

2. Initial Greeting
   Server generates TwiML with greeting
   Twilio plays audio to caller

3. Speech Collection
   Twilio gathers speech input
   Sends transcription to POST /api/voice/gather

4. AI Processing
   Claude classifies intent (appointment, info, callback, emergency)
   Extracts structured data (date, time, name, phone)

5. Response Generation
   Generate response text
   ElevenLabs converts to audio (or Twilio Polly)
   Return TwiML with audio URL

6. Loop until complete
   Continue gathering speech and responding
   Create appointment when all data collected

7. Call End
   Twilio calls POST /api/voice/status
   Log call outcome and summary
```

## Appointment Booking Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Caller    │────▶│   Claude    │────▶│   Extract   │
│   speaks    │     │  classifies │     │    data     │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
       ┌───────────────────────────────────────┘
       ▼
┌─────────────────────────────────────────────────────┐
│              Required Fields Check                   │
│   date, time, name, phone - all present?            │
└───────────────────────┬─────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
   ┌─────────┐                    ┌─────────────┐
   │  Yes    │                    │     No      │
   │ Create  │                    │  Ask for    │
   │ appt.   │                    │  missing    │
   └────┬────┘                    └──────┬──────┘
        │                                │
        ▼                                │
   ┌─────────────┐                       │
   │ Sync to     │                       │
   │ Google Cal  │◀──────────────────────┘
   └─────────────┘           (loop)
```

## Calendar Sync (Bidirectional)

### Outbound (AI Receptionist → Google Calendar)

```
Appointment Created/Updated
        │
        ▼
CalendarSyncService.syncAppointmentToCalendar()
        │
        ▼
Create/Update/Delete event via Calendar API
        │
        ▼
Store sync record in CalendarSync table
```

### Inbound (Google Calendar → AI Receptionist)

```
Calendar event changed
        │
        ▼
Google sends webhook notification
        │
        ▼
POST /api/calendar/webhook
        │
        ▼
Fetch delta events using syncToken
        │
        ▼
CalendarSyncService.syncCalendarEventToAppointment()
        │
        ▼
Create/Update/Cancel appointment in database
```

## Database Schema

### Core Entities

| Model | Purpose |
|-------|---------|
| `Client` | Business/tenant configuration (phone, prompts, settings) |
| `User` | Dashboard user accounts (admin, staff) |
| `Session` | JWT session management |
| `Call` | Individual call records with metadata |
| `Message` | Conversation messages within calls |
| `Appointment` | Booked appointments |

### Calendar Integration

| Model | Purpose |
|-------|---------|
| `CalendarSync` | Sync operation log (success/failure tracking) |
| `CalendarWebhook` | Google Calendar webhook channel subscriptions |

### Monitoring

| Model | Purpose |
|-------|---------|
| `SystemEvent` | Audit log and system events |
| `AlertLog` | Sent alert records (for deduplication) |
| `DailyMetrics` | Aggregated daily metrics for trend analysis |

### Authentication

| Model | Purpose |
|-------|---------|
| `Invitation` | User invite tokens for registration |

## External Integrations

### Twilio (Voice/Telephony)

- Receives incoming calls
- Provides speech-to-text transcription
- Plays audio responses to callers
- Webhook-based communication

### Anthropic Claude (AI)

- Intent classification (appointment, info, callback, emergency)
- Structured data extraction (date, time, name, phone)
- Natural language response generation

### ElevenLabs (Text-to-Speech)

- Converts AI responses to natural-sounding audio
- Supports multiple voices
- Caches audio files for reuse

### Google Calendar (Scheduling)

- OAuth2 authentication per client
- Push notifications via webhooks
- Delta sync for efficient updates

### Resend (Email)

- Appointment confirmations
- Appointment reminders
- Critical alert notifications
- Daily digest reports

### Sentry (Error Tracking)

- Automatic error capture
- Performance monitoring
- User context tracking

## Security Architecture

### Authentication

- JWT-based authentication for API
- Session table for token revocation
- Refresh token rotation
- Bcrypt password hashing

### Authorization

- Role-based access (ADMIN, STAFF)
- Client-scoped data access
- Invite-only user registration

### Webhook Security

- Twilio signature validation
- Google webhook channel verification
- Webhook token authentication

### Rate Limiting

- Redis-backed distributed rate limiting
- Per-endpoint limits (AI, TTS, analytics, webhooks)
- Configurable via environment variables

### Data Protection

- Sensitive headers stripped from Sentry
- API keys stored in environment variables
- No secrets in database

## Scheduled Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `webhook-renewal` | Every 6 hours | Renew expiring Google Calendar webhooks |
| `sync-retry` | Every 15 minutes | Retry failed calendar sync operations |
| `appointment-reminder` | Hourly | Send appointment reminders |
| `session-cleanup` | Daily | Remove expired JWT sessions |
| `invitation-cleanup` | Daily | Expire old invitations |
| `daily-digest` | Daily (configurable) | Send metrics summary to admins |
