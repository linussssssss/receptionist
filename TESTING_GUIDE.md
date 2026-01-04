# Inbound Calendar Sync - Testing Guide

This guide helps you test the three major improvements to inbound calendar sync.

## Prerequisites

1. Server running: `npm run dev`
2. Dashboard running: `cd dashboard && npm run dev`
3. Google Calendar integration connected in dashboard
4. ngrok or similar tunnel for webhook URL

## 1. Testing Delta Sync (Sync Tokens)

### Goal
Verify that only changed events are fetched instead of all events.

### Test Steps

#### A. Initial Full Sync
1. **Connect Google Calendar** (if not already connected):
   - Go to `http://localhost:3001/settings?tab=integrations`
   - Click "Connect Google Calendar"
   - Authorize

2. **Watch server logs** for:
   ```
   Fetched calendar changes via delta sync
   eventCount: X, hadSyncToken: false
   Updated sync token for future delta syncs
   ```

#### B. Delta Sync Test - Create Event
1. **Create event in Google Calendar**:
   - Title: "Test Sync - Meeting"
   - Time: 2pm today
   - Save

2. **Expected logs** (within 10 seconds):
   ```
   Fetched calendar changes via delta sync
   eventCount: 1, hadSyncToken: true  ← KEY: Should be TRUE
   Successfully synced calendar event
   ```

3. **Verify in dashboard**:
   - Go to Appointments page
   - Should see new appointment from Google Calendar

#### C. Delta Sync Test - Update Event
1. **Update the event** in Google Calendar:
   - Change time to 3pm
   - Save

2. **Expected logs**:
   ```
   eventCount: 1, hadSyncToken: true
   operation: UPDATE
   ```

3. **Verify in dashboard**:
   - Appointment time should update to 3pm

#### D. Delta Sync Test - Delete Event
1. **Delete the event** in Google Calendar

2. **Expected logs**:
   ```
   eventCount: 1, hadSyncToken: true
   operation: DELETE
   event.status: cancelled
   ```

3. **Verify in dashboard**:
   - Appointment status should change to CANCELLED

#### E. Verify Efficiency
1. **Create multiple events** in Google Calendar (3-5 events)
2. **Update one event**
3. **Check logs** - should only fetch 1 event (the changed one), not all 3-5

### Success Criteria
✅ `hadSyncToken: true` after initial sync
✅ Only changed events are fetched
✅ Create, Update, Delete all work correctly
✅ Sync token persists across webhook notifications

---

## 2. Testing Automatic Webhook Renewal

### Goal
Verify that webhooks are renewed before they expire.

### Test Steps

#### A. Check Current Webhook Status
1. **Query database**:
   ```sql
   SELECT
     id,
     "clientId",
     "channelId",
     expiration,
     "isActive"
   FROM "CalendarWebhook";
   ```

2. **Note the expiration time** (should be ~7 days from connection)

#### B. Simulate Near-Expiration
Since waiting 7 days isn't practical, we'll test the job manually:

1. **Update webhook expiration** to be within 24 hours:
   ```sql
   UPDATE "CalendarWebhook"
   SET expiration = NOW() + INTERVAL '12 hours'
   WHERE "isActive" = true;
   ```

2. **Manually trigger the renewal job**:

   Create a test file `test-webhook-renewal.ts`:
   ```typescript
   import { renewExpiringWebhooks } from './src/jobs/webhook-renewal.job.js';

   console.log('Testing webhook renewal...');
   await renewExpiringWebhooks();
   console.log('Done!');
   process.exit(0);
   ```

3. **Run it**:
   ```bash
   tsx test-webhook-renewal.ts
   ```

4. **Expected logs**:
   ```
   Checking for expiring webhooks
   count: 1
   Renewing webhook subscription
   Successfully renewed webhook subscription
   ```

5. **Verify in database**:
   ```sql
   SELECT expiration FROM "CalendarWebhook";
   ```
   - Expiration should be ~7 days in the future (renewed!)

#### C. Test Automatic Renewal (Optional)
1. **Wait for the hourly job** to run (or restart server to trigger immediately)
2. **Check logs** for webhook renewal activity

### Success Criteria
✅ Webhooks expiring <24 hours are found
✅ Renewal creates new webhook with fresh expiration
✅ Old expired webhooks are marked inactive
✅ Job runs every hour without errors

---

## 3. Testing Failed Sync Retry

### Goal
Verify that failed syncs are automatically retried with exponential backoff.

### Test Steps

#### A. Create a Failed Sync
We'll simulate a failure by temporarily breaking the sync:

1. **Temporarily modify** `calendar-sync.service.ts` to force a failure:
   ```typescript
   // In syncCalendarEventToAppointment, add at the top:
   if (operation === 'UPDATE') {
     throw new Error('TESTING: Simulated sync failure');
   }
   ```

2. **Update an event** in Google Calendar
3. **Check database**:
   ```sql
   SELECT * FROM "CalendarSync"
   WHERE status = 'FAILED'
   ORDER BY "createdAt" DESC
   LIMIT 1;
   ```

4. **Note**:
   - `status`: FAILED
   - `retryCount`: 0
   - `errorMessage`: "TESTING: Simulated sync failure"

#### B. Test Manual Retry
1. **Remove the test code** from step A.1

2. **Manually trigger retry job**:

   Create `test-sync-retry.ts`:
   ```typescript
   import { retryFailedSyncs } from './src/jobs/sync-retry.job.js';

   console.log('Testing sync retry...');
   await retryFailedSyncs();
   console.log('Done!');
   process.exit(0);
   ```

3. **Run it**:
   ```bash
   tsx test-sync-retry.ts
   ```

4. **Expected logs**:
   ```
   Checking for failed syncs to retry
   count: 1
   Retrying failed sync
   retryCount: 0, backoffMinutes: 5
   Successfully retried failed sync
   ```

5. **Verify in database**:
   ```sql
   SELECT status, "retryCount"
   FROM "CalendarSync"
   WHERE id = 'the-failed-sync-id';
   ```
   - `status`: SUCCESS (or FAILED if still broken)
   - `retryCount`: 1

#### C. Test Exponential Backoff
1. **Check retry times**:
   ```sql
   SELECT
     id,
     "retryCount",
     "createdAt",
     "updatedAt",
     EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) / 60 AS minutes_since_creation
   FROM "CalendarSync"
   WHERE status = 'FAILED'
   ORDER BY "createdAt" DESC;
   ```

2. **Expected backoff delays**:
   - Retry 1: 5 minutes
   - Retry 2: 15 minutes
   - Retry 3: 30 minutes
   - Retry 4: 60 minutes
   - Retry 5: 120 minutes
   - After 5 attempts: Marked as SKIPPED

#### D. Test Old Sync Cleanup
1. **Create old failed sync**:
   ```sql
   UPDATE "CalendarSync"
   SET "createdAt" = NOW() - INTERVAL '25 hours'
   WHERE status = 'FAILED'
   LIMIT 1;
   ```

2. **Run retry job**:
   ```bash
   tsx test-sync-retry.ts
   ```

3. **Expected**:
   - Old sync is marked as SKIPPED
   - Logs show: "Marked old failed syncs as SKIPPED"

### Success Criteria
✅ Failed syncs are detected and retried
✅ Exponential backoff is respected
✅ Max 5 retries before giving up
✅ Old syncs (>24h) are marked SKIPPED
✅ Job runs every 5 minutes without errors

---

## 4. Integration Test - End-to-End

### Full Workflow Test

1. **Create appointment via phone call** (or manually in database)
2. **Verify synced to Google Calendar** (OUTBOUND sync)
3. **Update event in Google Calendar** (change time)
4. **Verify appointment updated in dashboard** (INBOUND delta sync)
5. **Delete event in Google Calendar**
6. **Verify appointment marked CANCELLED** (INBOUND delta sync)

### Expected Results
- All syncs complete successfully
- Delta sync only fetches changed events
- Sync tokens are updated after each webhook
- No failed syncs (or auto-retry if failures occur)

---

## 5. Monitoring & Verification

### Check Sync Logs
```sql
-- Recent sync activity
SELECT
  operation,
  direction,
  status,
  "retryCount",
  "errorMessage",
  "createdAt"
FROM "CalendarSync"
ORDER BY "createdAt" DESC
LIMIT 20;

-- Success rate
SELECT
  status,
  COUNT(*) as count
FROM "CalendarSync"
GROUP BY status;

-- Failed syncs needing attention
SELECT * FROM "CalendarSync"
WHERE status = 'FAILED'
  AND "retryCount" < 5
  AND "createdAt" > NOW() - INTERVAL '24 hours'
ORDER BY "createdAt" DESC;
```

### Check Webhook Status
```sql
SELECT
  "clientId",
  "channelId",
  expiration,
  "isActive",
  expiration - NOW() as time_until_expiration
FROM "CalendarWebhook";
```

### Check Sync Tokens
```sql
SELECT
  id,
  name,
  integrations->'googleCalendar'->>'syncToken' as sync_token,
  integrations->'googleCalendar'->>'lastSyncAt' as last_sync
FROM "Client"
WHERE integrations->'googleCalendar'->>'enabled' = 'true';
```

---

## Troubleshooting

### Issue: Delta sync not working (hadSyncToken: false)
**Cause**: Sync token not saved or expired
**Fix**:
1. Check if `updateSyncToken()` is called after webhook processing
2. Verify integrations field is updated in database
3. Clear sync token and do full sync:
   ```sql
   UPDATE "Client"
   SET integrations = jsonb_set(
     integrations,
     '{googleCalendar,syncToken}',
     'null'::jsonb
   );
   ```

### Issue: Webhook not receiving notifications
**Cause**: Webhook expired or ngrok URL changed
**Fix**:
1. Check webhook expiration: `SELECT expiration FROM "CalendarWebhook"`
2. Reconnect calendar in dashboard
3. Verify ngrok URL matches env variable

### Issue: Syncs failing repeatedly
**Cause**: OAuth token expired or API error
**Fix**:
1. Check token expiration in Client.integrations
2. Reconnect Google Calendar
3. Check error messages in CalendarSync table

### Issue: Jobs not running
**Cause**: Scheduler not started or job crashed
**Fix**:
1. Check server logs for "Starting scheduled jobs"
2. Restart server
3. Verify cron expressions are valid

---

## Cleanup After Testing

```bash
# Remove test files
rm test-webhook-renewal.ts
rm test-sync-retry.ts

# Reset any modified code
git checkout src/services/integrations/calendar-sync.service.ts
```

```sql
-- Optional: Clear test sync logs
DELETE FROM "CalendarSync"
WHERE "errorMessage" LIKE 'TESTING:%';
```
