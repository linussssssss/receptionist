# AI Receptionist

An AI-powered phone receptionist system that handles incoming calls, books appointments, and integrates with Google Calendar. Built with Claude AI for natural language understanding and ElevenLabs for natural text-to-speech.

## Features

- **Voice-Based Appointment Booking** - Natural conversation flow for scheduling appointments via phone
- **Claude AI Integration** - Intent classification and information extraction using Claude
- **ElevenLabs TTS** - High-quality, natural-sounding voice responses
- **Google Calendar Sync** - Bidirectional sync with Google Calendar (webhooks + OAuth)
- **Email Notifications** - Appointment confirmations and reminders via Resend
- **Real-Time Monitoring** - Sentry error tracking + custom alerts for critical events
- **Daily Digest Reports** - Automated email summaries with key metrics
- **Rate Limiting** - Redis-backed rate limiting to control API costs
- **Multi-Tenant Support** - Multiple clients with separate configurations

## Tech Stack

| Category | Technology |
|----------|------------|
| Runtime | Node.js 20+ with TypeScript |
| Framework | Fastify |
| Database | PostgreSQL with Prisma ORM |
| Cache/Sessions | Redis |
| AI | Claude API (Anthropic) |
| Voice/Telephony | Twilio |
| Text-to-Speech | ElevenLabs |
| Calendar | Google Calendar API |
| Email | Resend |
| Monitoring | Sentry |

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 6+ (optional but recommended)
- Twilio account with phone number
- API keys for: Anthropic, ElevenLabs, Resend
- ngrok (for local development)

### Installation

```bash
# Clone the repository
git clone https://github.com/linussssssss/receptionist.git
cd receptionist

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your API keys and configuration

# Run database migrations
npx prisma migrate dev

# Seed the database (optional)
npm run db:seed

# Start development server
npm run dev
```

### Local Development with ngrok

Twilio requires a publicly accessible URL for webhooks:

```bash
# In a separate terminal
ngrok http 3000

# Copy the https URL and update TWILIO_WEBHOOK_URL in .env
```

## Project Structure

```
src/
├── config/          # Environment, Redis, Sentry configuration
├── routes/          # API route handlers
├── services/
│   ├── ai/          # Claude AI and ElevenLabs services
│   ├── telephony/   # Twilio and call state management
│   ├── business-logic/  # Appointment and conversation handlers
│   ├── integrations/    # Google Calendar sync
│   ├── notifications/   # Email service and templates
│   └── monitoring/      # Alert service and metrics
├── jobs/            # Scheduled jobs (cron)
├── middleware/      # Auth, rate limiting
├── types/           # TypeScript type definitions
└── utils/           # Logger and utilities
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build TypeScript to JavaScript |
| `npm start` | Run production server |
| `npm run db:migrate` | Run database migrations |
| `npm run db:studio` | Open Prisma Studio (database GUI) |
| `npm run db:seed` | Seed database with test data |
| `npm run lint` | Type check with TypeScript |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - System design and component overview
- [API Reference](docs/API.md) - Endpoint documentation
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment instructions
- [Operations Guide](docs/OPERATIONS.md) - Monitoring, jobs, troubleshooting
- [Contributing](docs/CONTRIBUTING.md) - Development setup and guidelines
- [Testing](docs/TESTING.md) - Unit Tests

### Integration Guides

- [Twilio Setup](docs/integrations/TWILIO.md)
- [Google Calendar](docs/integrations/GOOGLE_CALENDAR.md)
- [ElevenLabs](docs/integrations/ELEVENLABS.md)

## Environment Variables

See [.env.example](.env.example) for all available configuration options. Key variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `TWILIO_*` | Twilio credentials and webhook URL |
| `ANTHROPIC_API_KEY` | Claude API key |
| `ELEVENLABS_API_KEY` | ElevenLabs API key |
| `GOOGLE_CALENDAR_*` | Google OAuth credentials |
| `RESEND_API_KEY` | Resend email API key |
| `SENTRY_DSN` | Sentry error tracking DSN |

## License

ISC
