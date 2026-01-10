# Contributing Guide

This guide covers setting up a development environment and contributing to the project.

## Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 6+
- ngrok (for Twilio webhook testing)

### 1. Clone Repository

```bash
git clone <repository-url>
cd ai-receptionist-poc
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Configure required variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/ai_receptionist_dev"

# Auth
JWT_SECRET="dev-secret-change-in-production"

# Redis
REDIS_HOST="localhost"
REDIS_PORT="6379"

# AI (get from Anthropic)
ANTHROPIC_API_KEY="sk-ant-..."
```

Optional for full functionality:
- `TWILIO_*` - Voice call handling
- `ELEVENLABS_*` - Text-to-speech
- `GOOGLE_CALENDAR_*` - Calendar sync
- `RESEND_API_KEY` - Email notifications

### 4. Database Setup

```bash
# Run migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate

# (Optional) Seed with test data
npx prisma db seed
```

### 5. Start Development Server

```bash
npm run dev
```

Server runs at `http://localhost:3000`.

### 6. Testing Webhooks Locally

For Twilio integration:

```bash
# Start ngrok tunnel
ngrok http 3000

# Update .env with ngrok URL
TWILIO_WEBHOOK_URL=https://abc123.ngrok.io
```

---

## Project Structure

```
src/
├── config/           # Configuration (env, sentry, redis)
├── jobs/             # Scheduled background jobs
├── middleware/       # Express middleware (auth, rate-limit)
├── routes/           # API route handlers
│   ├── api.ts        # Main API routes
│   ├── auth.ts       # Authentication routes
│   ├── webhooks.ts   # Twilio webhook routes
│   ├── integrations.ts # Google Calendar routes
│   └── audio.ts      # TTS audio routes
├── services/         # Business logic
│   ├── ai/           # Claude AI integration
│   ├── telephony/    # Twilio call handling
│   ├── business-logic/ # Appointment handling
│   ├── integrations/ # Google Calendar sync
│   ├── notifications/ # Email service
│   └── monitoring/   # Alerts and metrics
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
└── server.ts         # Application entry point
```

### Key Files

| File | Purpose |
|------|---------|
| `server.ts` | Fastify app setup, routes, middleware |
| `services/ai/claude.service.ts` | Claude API integration |
| `services/telephony/twilio.service.ts` | Twilio voice handling |
| `services/business-logic/appointment.handler.ts` | Appointment extraction and creation |
| `services/integrations/calendar-sync.service.ts` | Bidirectional calendar sync |
| `jobs/scheduler.ts` | Cron job definitions |

---

## Code Conventions

### TypeScript

- Use strict mode (`"strict": true`)
- Prefer interfaces over type aliases for object shapes
- Use explicit return types on exported functions
- Avoid `any` - use `unknown` and type guards instead

```typescript
// Good
export async function getAppointment(id: string): Promise<Appointment | null> {
  return prisma.appointment.findUnique({ where: { id } });
}

// Avoid
export async function getAppointment(id: any) {
  return prisma.appointment.findUnique({ where: { id } });
}
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `calendar-sync.service.ts` |
| Classes | PascalCase | `CalendarSyncService` |
| Functions | camelCase | `syncAppointmentToCalendar` |
| Constants | SCREAMING_SNAKE | `MAX_RETRIES` |
| Types/Interfaces | PascalCase | `AppointmentData` |

### Service Pattern

Services are organized as classes with a singleton export:

```typescript
export class MyService {
  async doSomething(): Promise<void> {
    // Implementation
  }
}

// Export singleton instance
export const myService = new MyService();
```

### Error Handling

- Use try/catch for async operations
- Log errors with context using the logger
- Capture to Sentry for production monitoring

```typescript
try {
  await someOperation();
} catch (err) {
  logger.error({ err, context: 'operation-name' }, 'Operation failed');
  captureError(err, { operation: 'operation-name' });
  throw err;
}
```

### Logging

Use structured logging with pino:

```typescript
import { logger } from '../utils/logger.js';

// Info with context
logger.info({ appointmentId, clientId }, 'Appointment created');

// Error with error object
logger.error({ err, appointmentId }, 'Failed to sync appointment');
```

---

## Database

### Prisma Schema

Schema is defined in `prisma/schema.prisma`. Key models:

- `Client` - Business client configuration
- `User` - Dashboard users
- `Call` - Voice call records
- `Appointment` - Booked appointments
- `CalendarSync` - Sync operation logs

### Migrations

```bash
# Create migration after schema changes
npx prisma migrate dev --name describe_the_change

# Apply migrations in production
npx prisma migrate deploy

# Reset database (dev only)
npx prisma migrate reset
```

### Querying

Use Prisma client for all database operations:

```typescript
import { prisma } from '../server.js';

// Find with relations
const appointment = await prisma.appointment.findUnique({
  where: { id },
  include: { client: true },
});

// Create with validation
const newAppointment = await prisma.appointment.create({
  data: {
    clientId,
    customerName,
    datetime,
    status: 'PENDING',
  },
});
```

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- appointment.handler.test.ts
```

### Writing Tests

Tests are located alongside source files or in `__tests__` directories:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appointmentHandler } from './appointment.handler.js';

describe('AppointmentHandler', () => {
  describe('hasRequiredFields', () => {
    it('returns true when all fields present', () => {
      const data = {
        date: '2024-01-20',
        time: '14:00',
        name: 'John Doe',
        phone: '+49123456789',
      };

      expect(appointmentHandler.hasRequiredFields(data)).toBe(true);
    });

    it('returns false when field missing', () => {
      const data = {
        date: '2024-01-20',
        time: '14:00',
        name: 'John Doe',
        // phone missing
      };

      expect(appointmentHandler.hasRequiredFields(data)).toBe(false);
    });
  });
});
```

### Mocking

Use Vitest's mock functions:

```typescript
import { vi } from 'vitest';
import { prisma } from '../server.js';

vi.mock('../server.js', () => ({
  prisma: {
    appointment: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// In test
vi.mocked(prisma.appointment.findUnique).mockResolvedValue(mockAppointment);
```

---

## Code Style

### ESLint

Linting is configured in `eslint.config.js`:

```bash
# Run linter
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix
```

### Prettier

Formatting is handled by Prettier:

```bash
# Format all files
npm run format

# Check formatting
npm run format:check
```

### Editor Setup

VS Code settings (`.vscode/settings.json`):

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

Recommended extensions:
- ESLint
- Prettier
- Prisma

---

## Git Workflow

### Branch Naming

```
feature/short-description   # New features
fix/issue-description       # Bug fixes
refactor/what-changed       # Code refactoring
docs/what-documented        # Documentation updates
```

### Commit Messages

Follow conventional commits:

```
feat: add appointment cancellation endpoint
fix: resolve calendar sync duplicate events
refactor: extract TTS logic to separate service
docs: add Google Calendar setup guide
chore: update dependencies
```

### Pull Request Process

1. **Create branch** from `main`
2. **Make changes** following code conventions
3. **Test locally** - ensure all tests pass
4. **Lint and format** - run `npm run lint` and `npm run format`
5. **Push branch** to remote
6. **Open PR** with description:
   - What changed
   - Why it changed
   - How to test
7. **Address review feedback**
8. **Squash and merge** when approved

### PR Template

```markdown
## Summary
Brief description of changes.

## Changes
- Added X
- Fixed Y
- Updated Z

## Testing
- [ ] Unit tests added/updated
- [ ] Manual testing completed
- [ ] Tested with ngrok (if webhook changes)

## Screenshots
(If UI changes)
```

---

## Adding New Features

### Adding a New API Endpoint

1. Define route in appropriate file (`src/routes/api.ts` or new file)
2. Add validation schema if needed
3. Implement handler logic
4. Add rate limiting if public-facing
5. Document in `docs/API.md`

```typescript
// In routes/api.ts
app.get('/api/my-endpoint', {
  preHandler: [authenticate],
  schema: {
    querystring: {
      type: 'object',
      properties: {
        param: { type: 'string' },
      },
    },
  },
}, async (request, reply) => {
  // Handler logic
  return { result: 'success' };
});
```

### Adding a New Service

1. Create file in `src/services/<category>/`
2. Define class with methods
3. Export singleton instance
4. Add types to `src/types/` if needed

```typescript
// src/services/my-category/my.service.ts
export class MyService {
  async doThing(): Promise<Result> {
    // Implementation
  }
}

export const myService = new MyService();
```

### Adding a Scheduled Job

1. Add job function in `src/jobs/`
2. Register in `src/jobs/scheduler.ts`
3. Document in `docs/OPERATIONS.md`

```typescript
// In scheduler.ts
cron.schedule('0 * * * *', async () => {
  logger.info('Running my job');
  await myJobFunction();
});
```

---

## Troubleshooting Development

### Database Connection Issues

```bash
# Check PostgreSQL is running
pg_isready

# Check connection string
psql $DATABASE_URL
```

### Redis Connection Issues

```bash
# Check Redis is running
redis-cli ping
```

### Prisma Issues

```bash
# Regenerate client after schema changes
npx prisma generate

# Reset if migrations are broken
npx prisma migrate reset
```

### TypeScript Errors

```bash
# Check for type errors
npx tsc --noEmit

# Clean build
rm -rf dist && npm run build
```

---

## Getting Help

- Check existing documentation in `docs/`
- Review similar code patterns in the codebase
- Open an issue for bugs or feature requests
