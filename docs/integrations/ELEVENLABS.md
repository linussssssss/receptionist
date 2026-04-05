# ElevenLabs Integration Guide

This guide covers setting up ElevenLabs for natural text-to-speech.

## Prerequisites

- ElevenLabs account (sign up at elevenlabs.io)
- API key from ElevenLabs dashboard

## Account Setup

### 1. Get API Key

1. Log into ElevenLabs
2. Go to **Profile** > **API Keys**
3. Copy your API key
4. Add to `.env`:

```env
ELEVENLABS_API_KEY=xxxxx
```

### 2. Choose a Voice

1. Go to **Voices** in ElevenLabs
2. Browse available voices or clone your own
3. Copy the **Voice ID**
4. Add to `.env`:

```env
ELEVENLABS_VOICE_ID=voice_id_here
```

---

## Configuration

### Enable Per Client

Each client can use ElevenLabs independently:

```javascript
// In client record
{
  useElevenLabsTTS: true,
  voiceId: "client_specific_voice_id"
}
```

### Default Voice

If client has no voice ID, uses `ELEVENLABS_VOICE_ID` from environment.

---

## Audio Endpoints

### Public Endpoint (for Twilio)

```
GET /audio/tts?text=Hello&clientId=xxx
```

Rate limit: 5 req/min per IP

### Authenticated Endpoint (for Dashboard)

```
GET /api/audio/tts?text=Hello
Authorization: Bearer <token>
```

Rate limit: 20 req/min per user

### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `text` | Yes | Text to convert (max 500 chars) |
| `clientId` | No | Client ID for voice selection |
| `cache` | No | Enable caching (default: true) |

### Response

Audio file with headers:
- `Content-Type: audio/mpeg`
- `X-Cache: HIT` or `MISS`
- `Cache-Control: public, max-age=86400`

---

## Audio Caching

### How It Works

1. Audio is cached by client ID + text hash
2. Cache TTL: 24 hours
3. Reduces API calls and costs

### Cache Headers

Response includes:
- `X-Cache: HIT` - Served from cache
- `X-Cache: MISS` - Generated fresh
- `X-Cache-Age: 3600` - Cache age in ms

### Disable Caching

Add `cache=false` to bypass cache:
```
GET /audio/tts?text=Hello&cache=false
```

### Clear Cache

```
POST /audio/clear-cache
```

### Cache Stats

```
GET /audio/cache-stats
```

Response:
```json
{
  "totalEntries": 50,
  "validEntries": 45,
  "expiredEntries": 5,
  "totalSizeBytes": 2500000
}
```

---

## How TTS Works in Calls

1. AI generates text response
2. System calls ElevenLabs API to convert to audio
3. Audio URL returned in TwiML
4. Twilio fetches audio and plays to caller
5. Audio cached for future use

### TwiML Example

```xml
<Response>
  <Play>https://your-domain.com/audio/tts?text=Hello</Play>
  <Gather input="speech" action="/webhooks/twilio/gather">
  </Gather>
</Response>
```

---

## Voice Selection

### Available Voices

ElevenLabs offers:
- Pre-made voices (various accents, ages, genders)
- Voice cloning (from audio samples)
- Voice design (create custom voice)

### German Voices

Recommended for German:
- Check ElevenLabs voice library for German voices
- Test accent and clarity for phone calls
- Consider voice cloning for brand consistency

### Clone Your Own Voice

1. Go to **Voices** > **Add Voice** > **Instant Voice Cloning**
2. Upload audio samples (min 1 minute recommended)
3. Preview and adjust
4. Copy new voice ID

---

## Best Practices

### Text Optimization

1. Keep sentences short for natural pauses
2. Avoid special characters
3. Spell out numbers ("twenty" not "20")
4. Use punctuation for pacing

### Performance

1. Enable caching
2. Pre-generate common phrases
3. Keep text under 500 characters
4. Use appropriate timeouts

### Quality

1. Test voice at phone audio quality
2. Consider background noise
3. Check pronunciation of domain terms
4. Use SSML for fine control (if supported)

---

## Costs

### ElevenLabs Pricing

| Plan | Characters/month | Cost |
|------|------------------|------|
| Free | 10,000 | $0 |
| Starter | 30,000 | $5 |
| Creator | 100,000 | $22 |
| Pro | 500,000 | $99 |

### Estimate Usage

- Average response: 100-200 characters
- Per call: 3-5 responses = 500-1000 chars
- 100 calls/day = 50,000-100,000 chars/month

### Cost Optimization

1. Enable audio caching
2. Use shorter responses
3. Fall back to Twilio Polly for less critical audio
4. Monitor usage in ElevenLabs dashboard

---

## Fallback to Twilio Polly

If ElevenLabs is disabled or fails:

1. Set `useElevenLabsTTS: false` on client
2. System uses Twilio's built-in Polly voices
3. Lower quality but no additional cost

---

## Troubleshooting

### "Failed to generate speech"

**Possible causes:**
- Invalid API key
- Rate limit exceeded
- Text too long
- Network error

**Fix:**
1. Verify API key is valid
2. Check ElevenLabs usage dashboard
3. Shorten text
4. Check server logs

### Audio Sounds Robotic

**Causes:**
- Low-quality voice selected
- Text formatting issues

**Fix:**
1. Try different voice
2. Add punctuation for natural pauses
3. Test with shorter sentences

### High Latency

**Causes:**
- No caching
- Long text
- Network issues

**Fix:**
1. Enable caching
2. Pre-generate common phrases
3. Use CDN for audio files

### Rate Limiting

ElevenLabs has request limits per plan.

**Signs:**
- 429 errors in logs
- Slow responses
- Fallback to Twilio

**Fix:**
1. Enable caching
2. Upgrade plan
3. Reduce response length

---

## Testing

### Test TTS Endpoint

```bash
# Get audio file
curl "http://localhost:3000/audio/tts?text=Hallo" > test.mp3

# Play audio
open test.mp3  # macOS
start test.mp3 # Windows
```

### Test in Call

1. Configure test client with ElevenLabs
2. Make test call
3. Verify voice quality
4. Check cache headers
