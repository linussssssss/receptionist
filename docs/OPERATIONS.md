# Operations Guide

This guide covers operating and maintaining the AI Receptionist in production.

## Scheduled Jobs

The system runs several background jobs automatically:

| Job | Schedule | Purpose |
|-----|----------|---------|
| `webhook-renewal` | `0 */6 * * *` (every 6 hours) | Renew Google Calendar webhook subscriptions |
| `sync-retry` | `*/15 * * * *` (every 15 min) | Retry failed calendar sync operations |
| `appointment-reminder` | `0 * * * *` (hourly) | Send appointment reminder emails |
| `session-cleanup` | `0 3 * * *` (daily 3 AM) | Remove expired JWT sessions |
| `invitation-cleanup` | `0 4 * * *` (daily 4 AM) | Mark expired invitations |
| `daily-digest` | `0 8 * * *` (daily, configurable) | Send daily metrics email to admins |

### Viewing Job Status

Jobs are logged on execution. Check logs for:
- `Running scheduled job: <job-name>`
- `Scheduled job completed: <job-name>`
- `Scheduled job failed: <job-name>`

---

## Monitoring & Alerting

### Alert Types

**Critical Alerts** (immediate email):
- `CLAUDE_API_FAILURE` - Claude API call failed
- `APPOINTMENT_CREATION_FAILED` - Could not save appointment
- `DATABASE_ERROR` - Database operation failed
- `CALENDAR_SYNC_EXHAUSTED` - Sync retries exhausted (5 attempts)
- `TWILIO_WEBHOOK_FAILURE` - Webhook processing error

**Warning Alerts** (batched):
- `TTS_FAILURE` - ElevenLabs TTS generation failed
- `EMAIL_DELIVERY_FAILED` - Could not send email
- `RATE_LIMIT_VIOLATION` - User/IP hit rate limit
- `WEBHOOK_RENEWAL_FAILED` - Calendar webhook renewal failed

### Alert Deduplication

Alerts are deduplicated using a hash of:
- Alert type
- Client ID
- Error message (first 100 chars)

Same alert suppressed for 5 minutes (configurable via `ALERT_DEDUPLICATION_WINDOW_MS`).

Maximum 20 alerts per hour (configurable via `ALERT_MAX_PER_HOUR`).

### Detail Levels

Set via `MONITORING_DETAIL_LEVEL`:

**basic:**
- Error message
- Timestamp
- Severity

**detailed:**
- Error message
- Timestamp
- Severity
- Stack trace
- Client ID
- Call SID
- Request details

### Daily Digest

Sent to all ADMIN users at configured hour (`DAILY_DIGEST_HOUR`).

**Contents:**
- Call metrics (total, completed, failed)
- Average call duration
- Appointments created/cancelled
- Error summary by type
- Calendar sync success/failure
- Rate limit violations
- Health indicator (green/yellow/red)

---

## Troubleshooting

### Call Issues

**"Diese Nummer ist nicht konfiguriert"**
- No client found for the called number
- Verify client's phone number in database matches Twilio number

**"Dieser Service ist derzeit nicht verfügbar"**
- Client is inactive (`isActive: false`)
- Enable client in database or dashboard

**Caller hears nothing / call drops**
- Check Twilio webhook URL is correct
- Verify SSL certificate is valid
- Check server logs for errors

**AI not responding correctly**
- Check Claude API key is valid
- Review client's `llmSystemPrompt`
- Check rate limiting isn't blocking requests

### Calendar Sync Issues

**Events not syncing to Google Calendar:**
1. Check Google Calendar is connected (status endpoint)
2. Verify OAuth tokens haven't expired
3. Check sync history for errors
4. Run manual sync to test

**Webhook not receiving updates:**
1. Check webhook expiration date
2. Webhook renewal job runs every 6 hours
3. Manually trigger renewal if needed

**Sync retry exhausted:**
- After 5 failed attempts, critical alert sent
- Manually investigate and fix root cause
- Clear failed sync records if needed

### Authentication Issues

**"Invalid credentials"**
- Check email/password combination
- Verify user is active
- Check for too many login attempts

**"Token expired"**
- Use refresh token to get new access token
- If refresh token expired, user must login again

**"Insufficient permissions"**
- Endpoint requires ADMIN role
- Check user's role in database

### Rate Limiting

**Getting 429 Too Many Requests:**
- Wait for rate limit window to reset (usually 1 minute)
- Check which endpoint is being rate limited
- Review logs for rate limit violations
- Adjust limits if necessary

### Database Issues

**Connection errors:**
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection
psql -U postgres -d ai_receptionist -c "SELECT 1"
```

**Migration issues:**
```bash
# Check pending migrations
npx prisma migrate status

# Apply migrations
npx prisma migrate deploy
```

### Redis Issues

**Connection errors:**
```bash
# Check Redis is running
sudo systemctl status redis

# Check connection
redis-cli ping
```

**Fallback behavior:**
- Rate limiting falls back to in-memory (not distributed)
- Call sessions use in-memory storage
- Warning logged: "Rate limiting using in-memory store"

---

## Log Levels

Set via `LOG_LEVEL`:

| Level | Use |
|-------|-----|
| `trace` | Very detailed debugging |
| `debug` | Development debugging |
| `info` | Standard production logging |
| `warn` | Warnings, recoverable issues |
| `error` | Errors, unhandled exceptions |

### Log Locations

**PM2:**
```bash
pm2 logs ai-receptionist
```

**Docker:**
```bash
docker logs container_name -f
```

**Systemd:**
```bash
journalctl -u ai-receptionist -f
```

---

## Database Maintenance

### Backup

```bash
# Full backup
pg_dump -U postgres ai_receptionist > backup.sql

# Compressed backup
pg_dump -U postgres ai_receptionist | gzip > backup.sql.gz
```

### Restore

```bash
psql -U postgres ai_receptionist < backup.sql
```

### Data Retention

Consider periodic cleanup of:
- Old call records (`Call`, `Message`)
- Expired sessions (`Session`)
- Old sync logs (`CalendarSync`)
- Old system events (`SystemEvent`)

Example cleanup query:
```sql
-- Delete calls older than 90 days
DELETE FROM "Call" WHERE "startTime" < NOW() - INTERVAL '90 days';

-- Delete expired sessions
DELETE FROM "Session" WHERE "expiresAt" < NOW();

-- Delete old system events
DELETE FROM "SystemEvent" WHERE "timestamp" < NOW() - INTERVAL '30 days';
```

---

## Emergency Procedures

### Disable AI Receptionist Temporarily

**Option 1: Deactivate client**
```sql
UPDATE "Client" SET "isActive" = false WHERE id = 'client_id';
```
Callers hear: "Dieser Service ist derzeit nicht verfügbar"

**Option 2: Change Twilio webhook**
In Twilio Console, point webhook to a static TwiML file that says "Please call back later"

**Option 3: Stop server**
```bash
pm2 stop ai-receptionist
```
Twilio will get connection errors (not ideal)

### Fallback to Human Operator

Configure in client's `escalationRules`:
```json
{
  "keywords": ["mensch", "mitarbeiter", "transfer"],
  "transferNumber": "+49123456789",
  "maxConfidenceForEscalation": 0.4
}
```

### Alert Escalation

1. Critical alerts sent to all ADMIN emails
2. If no response, check Sentry dashboard
3. Monitor daily digest for trends
4. Review SystemEvent table for audit trail

---

## Performance Monitoring

### Key Metrics to Watch

- **Call duration**: Average should be consistent
- **Booking success rate**: Track in analytics
- **Error rate**: Monitor via daily digest
- **API response times**: Check Claude/ElevenLabs latency

### Health Check Endpoint

```bash
curl https://your-domain.com/health
```

Response includes:
- Database status
- Redis status
- Sentry status
- Monitoring status

### Sentry Dashboard

Monitor:
- Error frequency
- Error types
- Affected users/clients
- Performance traces

---

## Security Checklist

- [ ] HTTPS enabled with valid certificate
- [ ] Strong `JWT_SECRET` (min 32 chars, random)
- [ ] Database not exposed to internet
- [ ] Redis password protected
- [ ] API keys stored in environment, not code
- [ ] Rate limiting enabled
- [ ] Twilio webhook signature validation enabled
- [ ] Regular security updates applied
