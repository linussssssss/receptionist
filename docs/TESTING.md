# Testing Documentation

This document describes the test suite for the AI Receptionist project.

## Overview

- **Framework:** Vitest
- **Total Tests:** 138
- **Test Files:** 6

## Running Tests

```bash
# Run all tests once
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# With coverage report
npm run test:coverage

# Interactive UI
npm run test:ui
```

---

## Test Files

### 1. Auth Service (`src/services/auth/auth.service.test.ts`)

**28 tests** - Authentication and authorization functionality.

#### `hashPassword`
| Test Name | Description |
|-----------|-------------|
| `calls bcrypt.hash with correct rounds` | Verifies password hashing uses configured bcrypt rounds |

#### `verifyPassword`
| Test Name | Description |
|-----------|-------------|
| `returns true for correct password` | Validates correct password verification |
| `returns false for incorrect password` | Rejects wrong passwords |

#### `validatePasswordStrength`
| Test Name | Description |
|-----------|-------------|
| `returns valid for strong password` | Accepts passwords meeting all criteria |
| `returns error for short password` | Rejects passwords < 8 characters |
| `returns error for missing uppercase` | Requires at least one uppercase letter |
| `returns error for missing lowercase` | Requires at least one lowercase letter |
| `returns error for missing number` | Requires at least one digit |
| `returns error for missing special character` | Requires at least one special character |
| `returns multiple errors for weak password` | Reports all validation failures |

#### `generateAccessToken`
| Test Name | Description |
|-----------|-------------|
| `generates a base64 encoded token` | Creates properly formatted access tokens with payload |
| `sets correct expiration time` | Token expires in 15 minutes |

#### `generateRefreshToken`
| Test Name | Description |
|-----------|-------------|
| `generates a refresh token with refresh flag` | Creates tokens with refresh: true |
| `sets 7 day expiration` | Refresh tokens expire in 7 days |

#### `verifyToken`
| Test Name | Description |
|-----------|-------------|
| `returns payload for valid token` | Decodes valid tokens correctly |
| `throws for expired token` | Rejects tokens past expiration |
| `throws for malformed token` | Rejects invalid base64 |
| `throws for missing required fields` | Rejects tokens without userId/role/etc. |

#### `login`
| Test Name | Description |
|-----------|-------------|
| `returns tokens for valid credentials` | Successful login returns access + refresh tokens |
| `throws for non-existent user` | Rejects unknown email addresses |
| `throws for inactive user` | Blocks disabled accounts |
| `throws for wrong password` | Rejects incorrect passwords |
| `normalizes email to lowercase` | Handles case-insensitive email |

#### `logout`
| Test Name | Description |
|-----------|-------------|
| `invalidates the session` | Sets isActive=false and revokedAt |

#### `createUser`
| Test Name | Description |
|-----------|-------------|
| `creates user with hashed password` | Stores password securely with bcrypt |
| `throws for weak password` | Validates password strength on creation |
| `throws for duplicate email` | Prevents duplicate user registration |

#### `cleanupExpiredSessions`
| Test Name | Description |
|-----------|-------------|
| `deletes expired and inactive sessions` | Removes old sessions from database |

---

### 2. Claude Service (`src/services/ai/claude.service.test.ts`)

**20 tests** - AI/LLM integration with Anthropic's Claude API.

#### `generateResponse`
| Test Name | Description |
|-----------|-------------|
| `returns AI response for conversation` | Calls Claude API and returns text response |
| `builds messages array correctly` | Constructs proper message history for API |
| `uses correct model` | Sends requests to claude-sonnet-4-5 |
| `handles non-text response` | Gracefully handles tool_use responses |

#### `classifyIntent`
| Test Name | Description |
|-----------|-------------|
| `classifies appointment_booking intent` | Recognizes appointment requests |
| `classifies emergency intent` | Detects urgent situations |
| `classifies information_request intent` | Identifies info queries with topic data |
| `handles markdown code blocks in response` | Strips ```json``` wrappers |
| `extracts JSON from mixed content` | Finds JSON in surrounding text |
| `falls back to other intent on parse failure` | Returns safe default on invalid JSON |
| `falls back to other on API error` | Handles API failures gracefully |
| `uses only last 3 messages for context` | Limits context to prevent drift |

#### `extractAppointmentDetails`
| Test Name | Description |
|-----------|-------------|
| `extracts all appointment fields` | Parses date, time, name, phone |
| `extracts partial data when not all fields provided` | Handles incomplete information |
| `returns empty object when no data found` | Safe default for no extractable data |
| `filters out non-allowed fields` | Only returns date/time/name/phone |
| `handles markdown code blocks` | Strips code block formatting |
| `returns empty object on API error` | Graceful API failure handling |
| `respects maxMessages parameter` | Limits conversation history used |
| `uses last 10 messages by default` | Default context window size |

---

### 3. Twilio Service (`src/services/telephony/twilio.service.test.ts`)

**24 tests** - Telephony integration with Twilio.

#### `createGreetingResponse`
| Test Name | Description |
|-----------|-------------|
| `returns valid TwiML with Say element` | Generates proper XML structure |
| `uses German Polly voice` | Configures Polly.Vicki with de-DE |
| `includes Gather when actionUrl provided` | Adds speech input collection |
| `does not include Gather without actionUrl` | Simple greeting without input |

#### `createGatherResponse`
| Test Name | Description |
|-----------|-------------|
| `returns TwiML with Gather containing Say` | Speech input with prompt |
| `uses German language for speech recognition` | Configures de-DE recognition |

#### `createGreetingResponseWithElevenLabs`
| Test Name | Description |
|-----------|-------------|
| `uses Play instead of Say` | Streams audio URL instead of TTS |
| `builds correct audio URL` | Constructs proper TTS endpoint URL |
| `includes Gather when actionUrl provided` | Combines audio with input collection |

#### `createGatherResponseWithElevenLabs`
| Test Name | Description |
|-----------|-------------|
| `uses Play inside Gather` | Audio prompt within gather element |

#### `createSayAndHangup`
| Test Name | Description |
|-----------|-------------|
| `includes Say and Hangup` | Goodbye message then disconnect |
| `uses German voice` | Consistent voice configuration |

#### `createHangupResponse`
| Test Name | Description |
|-----------|-------------|
| `returns TwiML with just Hangup` | Simple disconnect response |

#### `createForwardResponse`
| Test Name | Description |
|-----------|-------------|
| `includes forwarding message and Dial` | Announces transfer then connects |

#### `makeCall`
| Test Name | Description |
|-----------|-------------|
| `calls twilio API to create call` | Initiates outbound calls |
| `throws error on API failure` | Handles call creation errors |

#### `getCall`
| Test Name | Description |
|-----------|-------------|
| `fetches call details` | Retrieves call status and duration |
| `throws error on fetch failure` | Handles fetch errors |

#### `getCallRecordings`
| Test Name | Description |
|-----------|-------------|
| `returns list of recordings` | Retrieves call recordings |
| `throws error on fetch failure` | Handles recording fetch errors |

#### `validateRequest`
| Test Name | Description |
|-----------|-------------|
| `validates webhook signature` | Verifies authentic Twilio requests |
| `rejects invalid signature` | Blocks forged webhook requests |

#### `getBalance`
| Test Name | Description |
|-----------|-------------|
| `returns account balance` | Retrieves Twilio balance |
| `throws error on fetch failure` | Handles balance fetch errors |

---

### 4. Call Session Manager (`src/services/telephony/call-session.manager.test.ts`)

**24 tests** - In-memory call session state management.

#### `createSession`
| Test Name | Description |
|-----------|-------------|
| `creates a new session with correct data` | Initializes callId, clientId, callerNumber, status |
| `stores session for later retrieval` | Session can be fetched by callId |

#### `getSession`
| Test Name | Description |
|-----------|-------------|
| `returns existing session` | Finds session by call ID |
| `returns undefined for non-existent session` | Handles missing sessions |

#### `updateSessionStatus`
| Test Name | Description |
|-----------|-------------|
| `updates session status` | Changes session state (ringing -> in-progress) |
| `does nothing for non-existent session` | Gracefully handles missing session |

#### `addMessage`
| Test Name | Description |
|-----------|-------------|
| `adds message to conversation history` | Appends user/assistant messages with timestamp |
| `adds multiple messages in order` | Preserves conversation sequence |
| `does nothing for non-existent session` | Gracefully handles missing session |

#### `updateCollectedData`
| Test Name | Description |
|-----------|-------------|
| `merges new data with existing` | Combines appointment field values |
| `overwrites existing fields` | Later values replace earlier |
| `clears data when empty object passed` | Resets collected data |
| `does nothing for non-existent session` | Gracefully handles missing session |

#### `setIntent`
| Test Name | Description |
|-----------|-------------|
| `sets intent on session` | Records classified intent |
| `overwrites existing intent` | Updates intent when reclassified |
| `does nothing for non-existent session` | Gracefully handles missing session |

#### `endSession`
| Test Name | Description |
|-----------|-------------|
| `marks session as ended` | Sets status to 'ended' |
| `returns the ended session` | Returns session data for logging |
| `returns undefined for non-existent session` | Handles end on missing session |

#### `getActiveSessions`
| Test Name | Description |
|-----------|-------------|
| `returns empty array when no sessions` | Handles empty state |
| `returns only non-ended sessions` | Filters out completed calls |

#### `getSessionCount`
| Test Name | Description |
|-----------|-------------|
| `returns 0 when no sessions` | Handles empty state |
| `returns correct count` | Accurate session count |
| `includes ended sessions in count` | Counts all sessions before cleanup |

---

### 5. Appointment Handler (`src/services/business-logic/appointment.handler.test.ts`)

**23 tests** - Appointment booking business logic.

#### `hasRequiredFields`
| Test Name | Description |
|-----------|-------------|
| `returns true when all fields present` | Validates complete appointment data |
| `returns false when date is missing` | Requires date field |
| `returns false when time is missing` | Requires time field |
| `returns false when name is missing` | Requires name field |
| `returns false when phone is missing` | Requires phone field |
| `returns false when field is empty string` | Treats empty as missing |
| `returns false when field is null` | Treats null as missing |

#### `getMissingFields`
| Test Name | Description |
|-----------|-------------|
| `returns empty array when all fields present` | No missing fields |
| `returns array with missing field names` | Lists specific missing fields |
| `returns all fields when data is empty` | Reports all four required fields |

#### `generateCollectionPrompt`
| Test Name | Description |
|-----------|-------------|
| `returns date prompt when date is missing` | German prompt asking for date |
| `returns time prompt when time is missing` | German prompt asking for time |
| `returns name prompt when name is missing` | German prompt asking for name |
| `returns phone prompt when phone is missing` | German prompt asking for phone |
| `returns first missing field prompt when multiple missing` | Prioritizes collection order |
| `returns completion message when no fields missing` | Confirms all data collected |

#### `validateData`
| Test Name | Description |
|-----------|-------------|
| `returns valid for correct data` | Accepts properly formatted data |
| `returns error for invalid date format` | Requires YYYY-MM-DD format |
| `returns error for invalid time format` | Requires HH:MM format |
| `returns error for past date` | Rejects historical dates |
| `accepts today as valid date` | Current date is allowed |

#### `generateConfirmation`
| Test Name | Description |
|-----------|-------------|
| `generates German confirmation message` | Includes all appointment details |
| `includes formatted date in German` | Formats date in German locale |

---

### 6. Alert Deduplication (`src/services/monitoring/alert-deduplication.test.ts`)

**19 tests** - Prevents duplicate alert notifications.

#### `generateHash`
| Test Name | Description |
|-----------|-------------|
| `generates consistent hash for same inputs` | Deterministic fingerprinting |
| `generates different hash for different alert types` | Type affects hash |
| `generates different hash for different clients` | ClientId affects hash |
| `generates different hash for different error messages` | Message affects hash |
| `uses "global" for undefined clientId` | Handles missing clientId |
| `truncates long error messages to 100 chars` | Normalizes long messages |
| `normalizes case in error messages` | Case-insensitive comparison |

#### `shouldSendAlert`
| Test Name | Description |
|-----------|-------------|
| `returns true for new alert` | First occurrence sends |
| `returns false for duplicate within window` | Recent duplicate suppressed |
| `returns true after deduplication window expires` | Old alerts can resend |
| `increments duplicate count when deduplicated` | Tracks suppression count |
| `respects max alerts per hour limit` | Rate limiting per hour |
| `resets hourly counter after an hour` | Counter resets each hour |

#### `recordAlertSent`
| Test Name | Description |
|-----------|-------------|
| `updates timestamp of existing entry` | Refreshes dedup window |
| `does nothing for non-existent hash` | Gracefully handles unknown hash |

#### `getStats`
| Test Name | Description |
|-----------|-------------|
| `returns correct statistics` | Reports cached alerts, hourly count, limits |
| `reflects correct hourly count after deduplication` | Only counts sent alerts |

#### `cleanup`
| Test Name | Description |
|-----------|-------------|
| `removes entries older than 2x the window` | Cleans old alert records |
| `keeps recent entries` | Preserves active dedup windows |

---

## Test Configuration

### `vitest.config.ts`

```typescript
{
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'dashboard'],
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 50,
        branches: 50,
        functions: 50,
        lines: 50,
      },
    },
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10000,
  },
}
```

### Test Setup (`tests/setup.ts`)

- Mocks environment variables for testing
- Clears all mocks between tests
- Restores mocks after each test

---

## Writing New Tests

### Mocking External Services

Use `vi.hoisted()` for mock variables referenced in `vi.mock()`:

```typescript
const { mockFn } = vi.hoisted(() => ({
  mockFn: vi.fn(),
}));

vi.mock('./some-module', () => ({
  someFunction: mockFn,
}));
```

### Constructor Mocks

Use function syntax (not arrow functions) for mocks used with `new`:

```typescript
vi.mock('some-sdk', () => ({
  default: function MockSDK() {
    return { method: vi.fn() };
  },
}));
```

### Test Factories

Use factories from `tests/factories/index.ts`:

```typescript
import { createMockUser, createMockAppointment } from '../../tests/factories';

const user = createMockUser({ email: 'custom@example.com' });
```
