# Twilio Integration Guide

This guide covers setting up Twilio for voice calls with the AI Receptionist.

## Prerequisites

- Twilio account (sign up at twilio.com)
- A verified phone number for testing
- ngrok for local development

## Account Setup

### 1. Get Credentials

In Twilio Console:
1. Go to **Account** > **API keys & tokens**
2. Copy **Account SID** and **Auth Token**
3. Add to `.env`:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
```

### 2. Buy a Phone Number

1. Go to **Phone Numbers** > **Buy a Number**
2. Select country (e.g., Germany)
3. Enable **Voice** capability
4. Purchase the number
5. Add to `.env`:

```env
TWILIO_PHONE_NUMBER=+491234567890
```

### 3. Configure Webhooks

In Twilio Console:
1. Go to **Phone Numbers** > **Manage** > **Active Numbers**
2. Click on your phone number
3. Under **Voice Configuration**:
   - **Configure with**: Webhooks, TwiML Bins, Functions, etc.
   - **A call comes in**: `https://your-domain.com/webhooks/twilio/voice` (HTTP POST)
   - **Status callback URL**: `https://your-domain.com/webhooks/twilio/status` (HTTP POST)

---

## Local Development with ngrok

### 1. Install ngrok

```bash
# macOS
brew install ngrok

# Windows
choco install ngrok

# Or download from ngrok.com
```

### 2. Start Tunnel

```bash
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### 3. Update Environment

```env
TWILIO_WEBHOOK_URL=https://abc123.ngrok.io
```

### 4. Update Twilio Webhooks

Temporarily update your Twilio phone number webhooks to use the ngrok URL:
- `https://abc123.ngrok.io/webhooks/twilio/voice`
- `https://abc123.ngrok.io/webhooks/twilio/status`

---

## TwiML Application (Alternative)

Instead of configuring webhooks per number, use a TwiML App:

### 1. Create TwiML App

1. Go to **Voice** > **TwiML** > **TwiML Apps**
2. Create new app
3. Set **Voice Request URL**: `https://your-domain.com/webhooks/twilio/voice`
4. Copy the **App SID**

### 2. Assign to Number

1. Go to **Phone Numbers** > **Active Numbers**
2. Select your number
3. Under **Voice**, select **Configure with: TwiML App**
4. Choose your TwiML App

---

## Webhook Endpoints

### POST /webhooks/twilio/voice

Called when an incoming call is received.

**Twilio sends:**
- `CallSid` - Unique call identifier
- `From` - Caller's phone number
- `To` - Your Twilio number
- `CallStatus` - Current status

**Response:**
TwiML XML that tells Twilio what to do:
- Play greeting
- Gather speech input
- Call back to `/webhooks/twilio/gather`

### POST /webhooks/twilio/gather

Called after speech is captured.

**Twilio sends:**
- `CallSid` - Unique call identifier
- `SpeechResult` - Transcribed speech
- `Digits` - DTMF digits (if any)

**Response:**
TwiML XML with AI response and next gather.

### POST /webhooks/twilio/status

Called when call status changes.

**Twilio sends:**
- `CallSid` - Unique call identifier
- `CallStatus` - New status (ringing, in-progress, completed, etc.)
- `CallDuration` - Duration in seconds (on completion)

---

## Security

### Webhook Signature Validation

All webhooks are validated using Twilio's signature:

```typescript
twilioService.validateRequest(url, body, signature)
```

This ensures requests genuinely come from Twilio.

### Required Headers

Twilio sends `x-twilio-signature` header with every request.

---

## Testing

### Test Endpoint

```bash
curl https://your-domain.com/webhooks/twilio/test
```

Should return:
```json
{
  "message": "Twilio webhooks are configured correctly",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Make a Test Call

1. Call your Twilio number from any phone
2. You should hear the greeting
3. Speak to test voice recognition
4. Check logs for call processing

### Twilio Debugger

In Twilio Console:
1. Go to **Monitor** > **Logs** > **Errors**
2. Check for webhook errors
3. View call logs for debugging

---

## Voice Configuration

### Speech Recognition

The system uses Twilio's built-in speech recognition with:
- Language: German (`de-DE`)
- Timeout: 3 seconds
- Speech model: Enhanced

### Text-to-Speech

Two options configured per client:

**1. Twilio Polly (default):**
- Voice: Vicki (German)
- No additional cost

**2. ElevenLabs (optional):**
- Natural-sounding voices
- Enabled via `useElevenLabsTTS: true`
- Requires voice ID in client config

---

## Troubleshooting

### "Diese Nummer ist nicht konfiguriert"

**Cause:** No client found for the Twilio number

**Fix:**
1. Check the phone number format matches exactly
2. Verify client exists in database:
```sql
SELECT * FROM "Client" WHERE "phoneNumber" = '+491234567890';
```

### Webhook Returns 403 Forbidden

**Cause:** Invalid Twilio signature

**Fix:**
1. Verify `TWILIO_AUTH_TOKEN` is correct
2. Ensure `TWILIO_WEBHOOK_URL` matches exactly
3. Check URL includes correct protocol (https)

### No Speech Detected

**Cause:** Speech recognition not working

**Fix:**
1. Check audio quality on caller's end
2. Verify language matches (German)
3. Increase speech timeout in TwiML

### Call Drops Immediately

**Cause:** Webhook error or timeout

**Fix:**
1. Check server logs for errors
2. Verify webhook URL is accessible
3. Check SSL certificate is valid

---

## Costs

### Twilio Pricing (approximate)

| Service | Cost |
|---------|------|
| German phone number | ~€3/month |
| Inbound calls | ~€0.01/min |
| Speech recognition | ~€0.02/15 sec |

### Cost Optimization

1. Use shorter system prompts
2. Enable audio caching
3. Set appropriate timeouts
4. Use Twilio Polly instead of ElevenLabs for lower quality needs

---

## Multi-Client Setup

Each client has their own:
- Phone number in database
- Greeting message
- System prompt
- Voice settings

To add a new client:
1. Buy new Twilio number
2. Configure webhooks (same URLs)
3. Create client record with new phone number
4. Calls are routed by matching `To` number
