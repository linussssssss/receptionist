# Deployment Guide

This guide covers deploying the AI Receptionist to production.

## Prerequisites

### Required Services

| Service | Minimum Version | Purpose |
|---------|-----------------|---------|
| Node.js | 20+ | Runtime |
| PostgreSQL | 14+ | Database |
| Redis | 6+ | Sessions, rate limiting, caching |

### Required API Keys

| Service | Required | Purpose |
|---------|----------|---------|
| Twilio | Yes | Voice calls, webhooks |
| Anthropic | Yes | Claude AI for conversation |
| ElevenLabs | Yes | Text-to-speech |
| Resend | Yes | Email notifications |
| Google Cloud | Optional | Calendar integration |
| Sentry | Optional | Error tracking |

### Domain Requirements

- **HTTPS Required**: Twilio webhooks require a valid SSL certificate
- **Public URL**: The server must be accessible from the internet for webhooks

---

## Environment Configuration

Copy `.env.example` to `.env` and configure:

### Core Settings

```env
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
```

### Database

```env
DATABASE_URL="postgresql://USER:PASSWORD@host:5432/ai_receptionist?schema=public"
```

### Redis

```env
REDIS_URL="redis://host:6379"
```

### Twilio

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+491234567890
TWILIO_WEBHOOK_URL=https://your-domain.com
```

### AI Services

```env
ANTHROPIC_API_KEY=sk-ant-xxxxx
ELEVENLABS_API_KEY=xxxxx
ELEVENLABS_VOICE_ID=voice_id
```

### Google Calendar (Optional)

```env
GOOGLE_CALENDAR_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CALENDAR_CLIENT_SECRET=xxxxx
GOOGLE_CALENDAR_REDIRECT_URI=https://your-domain.com/api/integrations/google-calendar/auth/callback
GOOGLE_CALENDAR_WEBHOOK_URL=https://your-domain.com/webhooks/google-calendar/notifications
```

### Email

```env
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=noreply@your-domain.com
```

### Authentication

```env
# Generate with: openssl rand -base64 48
JWT_SECRET=your_random_secret_min_32_chars
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
BCRYPT_ROUNDS=12
```

### Rate Limiting

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REDIS_ENABLED=true
RATE_LIMIT_AI_MAX=10
RATE_LIMIT_TTS_MAX=20
RATE_LIMIT_ANALYTICS_MAX=10
```

### Monitoring

```env
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
SENTRY_ENVIRONMENT=production
MONITORING_ENABLED=true
MONITORING_DETAIL_LEVEL=detailed
DAILY_DIGEST_ENABLED=true
DAILY_DIGEST_HOUR=8
```

---

## Database Setup

### Run Migrations

```bash
# Generate Prisma client
npx prisma generate

# Apply migrations
npx prisma migrate deploy
```

### Seed Initial Data

```bash
# Create admin user
npm run db:seed-admin
```

---

## Deployment Options

### Option 1: Docker

Create a `Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY prisma ./prisma
RUN npx prisma generate

COPY dist ./dist

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

Build and run:

```bash
# Build TypeScript
npm run build

# Build Docker image
docker build -t ai-receptionist .

# Run container
docker run -p 3000:3000 --env-file .env ai-receptionist
```

### Option 2: Railway

1. Connect your GitHub repository
2. Add environment variables in Railway dashboard
3. Set build command: `npm run build`
4. Set start command: `npm start`
5. Railway auto-deploys on push

### Option 3: Render

1. Create new Web Service
2. Connect repository
3. Settings:
   - Build: `npm install && npm run build && npx prisma generate && npx prisma migrate deploy`
   - Start: `npm start`
4. Add environment variables

### Option 4: VPS (Ubuntu)

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Clone and setup
git clone https://github.com/your-repo/ai-receptionist.git
cd ai-receptionist
npm install
npm run build
npx prisma generate
npx prisma migrate deploy

# Start with PM2
pm2 start dist/server.js --name ai-receptionist
pm2 save
pm2 startup
```

---

## Twilio Configuration

### Phone Number Setup

1. Buy a phone number in Twilio Console
2. Configure Voice webhooks:
   - **When a call comes in**: `https://your-domain.com/webhooks/twilio/voice` (HTTP POST)
   - **Status callback URL**: `https://your-domain.com/webhooks/twilio/status` (HTTP POST)

### TwiML App (Alternative)

1. Create TwiML App in Twilio Console
2. Set Voice Request URL: `https://your-domain.com/webhooks/twilio/voice`
3. Assign TwiML App to your phone number

---

## Google Calendar Setup

See [Google Calendar Integration Guide](integrations/GOOGLE_CALENDAR.md) for detailed setup.

---

## Monitoring Setup

### Sentry

1. Create Sentry project
2. Copy DSN to `SENTRY_DSN`
3. Errors are automatically captured

### Daily Digest

- Sent to all ADMIN users at configured hour
- Contains call metrics, appointments, errors
- Requires at least one ADMIN user with email

### Alert System

- Critical alerts sent immediately via email
- Deduplication prevents spam (5-minute window)
- Max 20 alerts per hour

---

## SSL/HTTPS

### Using Let's Encrypt (Certbot)

```bash
# Install Certbot
sudo apt install certbot

# Get certificate
sudo certbot certonly --standalone -d your-domain.com

# Auto-renewal
sudo certbot renew --dry-run
```

### Using Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Scaling Considerations

### Redis for Sessions

- Required for multi-instance deployments
- Stores call state, rate limiting counters
- Configure `REDIS_URL` for shared Redis instance

### Database Connection Pooling

- Prisma handles connection pooling automatically
- For high traffic, consider PgBouncer

### Rate Limiting

- Redis-backed rate limiting works across instances
- Configure limits based on API costs:
  - Claude API: `RATE_LIMIT_AI_MAX`
  - ElevenLabs: `RATE_LIMIT_TTS_MAX`

### Horizontal Scaling

- Stateless design allows multiple instances
- Use load balancer (nginx, HAProxy)
- Share Redis for session state

---

## Health Checks

### Endpoint

```
GET /health
```

### Example Health Check (Docker)

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

---

## Troubleshooting

### Common Issues

**Twilio webhooks failing:**
- Verify HTTPS certificate is valid
- Check `TWILIO_WEBHOOK_URL` matches your domain
- Verify Twilio signature validation

**Database connection errors:**
- Check `DATABASE_URL` format
- Verify PostgreSQL is running
- Check network/firewall rules

**Redis connection errors:**
- Verify `REDIS_URL` format
- Falls back to in-memory if Redis unavailable

**ElevenLabs rate limiting:**
- Reduce `RATE_LIMIT_TTS_MAX`
- Enable audio caching

### Logs

```bash
# PM2 logs
pm2 logs ai-receptionist

# Docker logs
docker logs container_name

# System logs
journalctl -u ai-receptionist
```

---

## Backup Procedures

### Database Backup

```bash
# Full backup
pg_dump -U postgres ai_receptionist > backup_$(date +%Y%m%d).sql

# Automated daily backup (cron)
0 2 * * * pg_dump -U postgres ai_receptionist | gzip > /backups/ai_receptionist_$(date +\%Y\%m\%d).sql.gz
```

### Restore

```bash
psql -U postgres ai_receptionist < backup.sql
```
