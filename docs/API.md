# API Reference

This document describes all API endpoints available in the AI Receptionist.

## Authentication

All authenticated endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <access_token>
```

Tokens are obtained via the login endpoint and refreshed using the refresh endpoint.

## Base URL

- Development: `http://localhost:3000`
- Production: Your deployed server URL

---

## Health Check

### GET /health

Check server health and dependencies.

**Authentication:** None

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "database": {
    "status": "connected",
    "tables": 12
  },
  "redis": {
    "status": "connected",
    "keyCount": 45,
    "usedMemory": "1.2M"
  },
  "sentry": "enabled",
  "monitoring": "enabled"
}
```

---

## Authentication Routes

### POST /api/auth/login

Authenticate and receive JWT tokens.

**Authentication:** None

**Rate Limit:** 5 req/min per IP

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "data": {
    "user": {
      "id": "cuid123",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "ADMIN",
      "clientId": "client123"
    },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

### POST /api/auth/register

Register using invitation token.

**Authentication:** None

**Rate Limit:** 5 req/min per IP

**Request:**
```json
{
  "invitationToken": "token123",
  "name": "John Doe",
  "password": "password123"
}
```

### POST /api/auth/refresh

Refresh access token.

**Authentication:** None

**Rate Limit:** 50 req/min per IP

**Request:**
```json
{
  "refreshToken": "eyJ..."
}
```

**Response:**
```json
{
  "data": {
    "accessToken": "eyJ..."
  }
}
```

### POST /api/auth/logout

Invalidate current session.

**Authentication:** Required

### GET /api/auth/me

Get current user info.

**Authentication:** Required

**Response:**
```json
{
  "data": {
    "id": "cuid123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "ADMIN",
    "clientId": "client123",
    "isActive": true,
    "lastLoginAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### PUT /api/auth/password

Change own password.

**Authentication:** Required

**Rate Limit:** 5 req/min per IP

**Request:**
```json
{
  "currentPassword": "oldpass",
  "newPassword": "newpass123"
}
```

---

## User Management (Admin Only)

### POST /api/auth/invite

Invite new user.

**Authentication:** Required (ADMIN)

**Rate Limit:** 10 req/min per user

**Request:**
```json
{
  "email": "newuser@example.com",
  "role": "STAFF"
}
```

### GET /api/auth/invitations

List all invitations.

**Authentication:** Required (ADMIN)

### GET /api/auth/invitations/validate

Validate invitation token (public).

**Query Parameters:**
- `token`: Invitation token

### DELETE /api/auth/invitations/:id

Revoke invitation.

**Authentication:** Required (ADMIN)

### GET /api/auth/users

List all users in client.

**Authentication:** Required (ADMIN)

### PATCH /api/auth/users/:id

Update user (activate/deactivate, change role).

**Authentication:** Required (ADMIN)

**Request:**
```json
{
  "isActive": false,
  "role": "STAFF"
}
```

---

## Calls

### GET /api/calls

List calls with pagination and filters.

**Authentication:** Required

**Rate Limit:** 60 req/min per user

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20)
- `status`: RINGING, IN_PROGRESS, COMPLETED, FAILED, NO_ANSWER, BUSY, CANCELLED
- `from`: Start date (ISO string)
- `to`: End date (ISO string)
- `callerNumber`: Filter by caller

**Response:**
```json
{
  "data": [
    {
      "id": "cuid123",
      "callSid": "CA123",
      "callerNumber": "+491234567890",
      "status": "COMPLETED",
      "startTime": "2024-01-15T10:30:00.000Z",
      "duration": 120,
      "client": {
        "id": "client123",
        "name": "Dental Practice"
      },
      "_count": {
        "messages": 5,
        "appointments": 1
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### GET /api/calls/:id

Get call details with full transcript.

**Authentication:** Required

**Rate Limit:** 60 req/min per user

---

## Appointments

### GET /api/appointments

List appointments with pagination.

**Authentication:** Required

**Rate Limit:** 60 req/min per user

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20)
- `status`: PENDING, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW, RESCHEDULED
- `from`: Start date (ISO string)
- `to`: End date (ISO string)

### GET /api/appointments/:id

Get appointment details.

**Authentication:** Required

**Rate Limit:** 60 req/min per user

### PATCH /api/appointments/:id

Update appointment.

**Authentication:** Required

**Rate Limit:** 30 req/min per user

**Request:**
```json
{
  "customerName": "John Doe",
  "datetime": "2024-01-20T14:00:00.000Z",
  "status": "CONFIRMED",
  "notes": "Updated notes"
}
```

### DELETE /api/appointments/:id

Cancel appointment (sets status to CANCELLED).

**Authentication:** Required

**Rate Limit:** 30 req/min per user

---

## Analytics

### GET /api/analytics

Get call analytics and statistics.

**Authentication:** Required

**Rate Limit:** 10 req/min (STAFF), 20 req/min (ADMIN)

**Query Parameters:**
- `from`: Start date (default: 30 days ago)
- `to`: End date (default: now)

**Response:**
```json
{
  "data": {
    "summary": {
      "totalCalls": 150,
      "avgDurationSeconds": 180,
      "appointmentsCreated": 45,
      "bookingSuccessRate": 30.0,
      "uniqueCustomers": 120,
      "returningCustomers": 15,
      "retentionRate": 12.5
    },
    "callsByStatus": [
      { "status": "COMPLETED", "count": 140 },
      { "status": "FAILED", "count": 10 }
    ],
    "callsByIntent": [
      { "intent": "appointment_booking", "count": 80 },
      { "intent": "information_request", "count": 50 }
    ],
    "callsByHour": [
      { "hour": 9, "count": 20 },
      { "hour": 10, "count": 35 }
    ],
    "callsPerDay": [
      { "date": "2024-01-14", "count": 25 },
      { "date": "2024-01-15", "count": 30 }
    ]
  }
}
```

---

## Client Settings

### GET /api/client/settings

Get client configuration.

**Authentication:** Required

**Rate Limit:** 60 req/min per user

### PUT /api/client/settings

Update client configuration.

**Authentication:** Required (ADMIN)

**Rate Limit:** 30 req/min per user

**Request:**
```json
{
  "name": "Updated Practice Name",
  "greetingMessage": "Welcome to our practice!",
  "llmSystemPrompt": "You are a helpful assistant...",
  "businessHours": {
    "monday": { "start": "09:00", "end": "17:00" }
  },
  "voiceId": "voice123",
  "isActive": true
}
```

---

## Audio (TTS)

### GET /audio/tts

Generate speech from text (public, for Twilio).

**Authentication:** None

**Rate Limit:** 5 req/min per IP

**Query Parameters:**
- `text`: Text to convert (max 500 chars)
- `clientId`: Client ID (optional)
- `cache`: Enable caching (default: true)

**Response:** Audio file (audio/mpeg)

### GET /api/audio/tts

Generate speech from text (authenticated).

**Authentication:** Required

**Rate Limit:** 20 req/min per user

Same query parameters as public endpoint.

---

## Google Calendar Integration

### GET /api/integrations/google-calendar/auth/url

Generate OAuth authorization URL.

**Query Parameters:**
- `clientId`: Client ID

### POST /api/integrations/google-calendar/auth/callback

Complete OAuth flow.

**Request:**
```json
{
  "code": "auth_code_from_google",
  "clientId": "client123"
}
```

### DELETE /api/integrations/google-calendar/disconnect

Disconnect Google Calendar.

**Query Parameters:**
- `clientId`: Client ID

### GET /api/integrations/google-calendar/status

Get connection status.

**Query Parameters:**
- `clientId`: Client ID

**Response:**
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

### POST /api/integrations/google-calendar/sync/manual

Manually trigger sync.

**Rate Limit:** 5 req/min per IP

**Request:**
```json
{
  "clientId": "client123",
  "appointmentId": "appt123"  // Optional
}
```

### GET /api/integrations/google-calendar/sync-history

Get sync history.

**Query Parameters:**
- `clientId`: Client ID
- `page` (default: 1)
- `limit` (default: 20)

---

## GDPR / Data Privacy

Endpoints for GDPR compliance including data subject search and Right to Erasure (Article 17).

### POST /api/gdpr/search

Search for all data belonging to a data subject by phone or email.

**Authentication:** Required

**Rate Limit:** 60 req/min per user

**Request:**
```json
{
  "identifier": "+491234567890",
  "identifierType": "phone"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "found": true,
    "callCount": 5,
    "messageCount": 23,
    "appointmentCount": 2,
    "calls": [
      {
        "id": "cuid123",
        "startTime": "2024-01-15T10:30:00.000Z",
        "status": "COMPLETED",
        "duration": 120
      }
    ],
    "appointments": [
      {
        "id": "appt123",
        "datetime": "2024-01-20T14:00:00.000Z",
        "status": "CONFIRMED",
        "customerName": "John Doe"
      }
    ]
  }
}
```

### GET /api/gdpr/erasure-requests

List all erasure requests for the client.

**Authentication:** Required (ADMIN)

**Rate Limit:** 60 req/min per user

**Query Parameters:**
- `status`: PENDING, APPROVED, EXECUTED, REJECTED (optional filter)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "erasure123",
      "subjectIdentifierMasked": "****7890",
      "status": "PENDING",
      "requestedBy": "user123",
      "approvedBy": null,
      "executedAt": null,
      "recordsDeleted": null,
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### POST /api/gdpr/erasure-requests

Create a new erasure request (Right to be Forgotten).

**Authentication:** Required

**Rate Limit:** 60 req/min per user

**Request:**
```json
{
  "identifier": "+491234567890",
  "identifierType": "phone"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "requestId": "erasure123",
    "status": "PENDING",
    "message": "Erasure request created. Requires admin approval before execution.",
    "dataFound": {
      "calls": 5,
      "messages": 23,
      "appointments": 2
    }
  }
}
```

### GET /api/gdpr/erasure-requests/:id

Get details of a specific erasure request.

**Authentication:** Required (ADMIN)

**Rate Limit:** 60 req/min per user

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "erasure123",
    "subjectIdentifierMasked": "****7890",
    "status": "APPROVED",
    "requestedBy": "user123",
    "approvedBy": "admin456",
    "executedAt": null,
    "recordsDeleted": null,
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### POST /api/gdpr/erasure-requests/:id/approve

Approve an erasure request.

**Authentication:** Required (ADMIN)

**Rate Limit:** 60 req/min per user

**Response:**
```json
{
  "success": true,
  "message": "Erasure request approved. You can now execute the erasure."
}
```

### POST /api/gdpr/erasure-requests/:id/reject

Reject an erasure request with a reason.

**Authentication:** Required (ADMIN)

**Rate Limit:** 60 req/min per user

**Request:**
```json
{
  "reason": "Data retention period not yet expired for legal compliance."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Erasure request rejected."
}
```

### POST /api/gdpr/erasure-requests/:id/execute

Execute an approved erasure request. **This action is IRREVERSIBLE.**

**Authentication:** Required (ADMIN)

**Rate Limit:** 5 req/hour per user (strict limit)

**Response:**
```json
{
  "success": true,
  "message": "Data erasure completed successfully.",
  "data": {
    "deletedCalls": 5,
    "deletedMessages": 23,
    "anonymizedAppointments": 2
  }
}
```

**Error Response (400 - Not approved):**
```json
{
  "success": false,
  "error": "Request must be approved before execution (current status: PENDING)"
}
```

---

## Twilio Webhooks

These endpoints are called by Twilio during phone calls.

### POST /webhooks/twilio/voice

Handle incoming calls.

**Rate Limit:** 100 req/min per IP (soft limit)

### POST /webhooks/twilio/gather

Process speech input.

**Rate Limit:** 10 req/min per IP+CallSid

### POST /webhooks/twilio/status

Handle call status updates.

**Rate Limit:** 100 req/min per IP (soft limit)

---

## Google Calendar Webhook

### POST /webhooks/google-calendar/notifications

Receive calendar push notifications.

**Rate Limit:** 100 req/min per channel

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error type",
  "message": "Human-readable message",
  "details": []  // Optional validation details
}
```

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 429 | Rate Limited |
| 500 | Internal Server Error |
