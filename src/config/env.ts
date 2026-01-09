import { config } from 'dotenv';
import { z } from 'zod';

// Load environment variables
config();

// Define schema for environment variables
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform((val) => parseInt(val, 10)),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis (optional for POC)
  REDIS_URL: z.string().optional(),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_PHONE_NUMBER: z.string().min(1),
  TWILIO_WEBHOOK_URL: z.string().url().optional(),

  // AI Services
  DEEPGRAM_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  ELEVENLABS_API_KEY: z.string().min(1),
  ELEVENLABS_VOICE_ID: z.string().min(1),

  // Integrations (optional for now)
  GOOGLE_CALENDAR_CLIENT_ID: z.string().optional(),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALENDAR_REDIRECT_URI: z.string().optional(),
  GOOGLE_CALENDAR_WEBHOOK_URL: z.string().optional(),
  HUBSPOT_API_KEY: z.string().optional(),

  // Email (Resend)
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email(),
  ENABLE_APPOINTMENT_REMINDERS: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),

  // JWT & Authentication
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  BCRYPT_ROUNDS: z.string().default('10').transform((val) => parseInt(val, 10)),
  MAX_LOGIN_ATTEMPTS: z.string().default('5').transform((val) => parseInt(val, 10)),
  LOGIN_RATE_LIMIT: z.string().default('5').transform((val) => parseInt(val, 10)),

  // Rate Limiting
  RATE_LIMIT_ENABLED: z.string().default('true').transform((val) => val === 'true'),
  RATE_LIMIT_REDIS_ENABLED: z.string().default('true').transform((val) => val === 'true'),
  RATE_LIMIT_AI_MAX: z.string().default('10').transform((val) => parseInt(val, 10)),
  RATE_LIMIT_TTS_MAX: z.string().default('20').transform((val) => parseInt(val, 10)),
  RATE_LIMIT_ANALYTICS_MAX: z.string().default('10').transform((val) => parseInt(val, 10)),
  RATE_LIMIT_WEBHOOK_MAX: z.string().default('100').transform((val) => parseInt(val, 10)),

  // Monitoring
  SENTRY_DSN: z.string().optional(),

  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
});

// Parse and validate environment variables
const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error(' Invalid environment variables:');
      error.issues.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
};

export const env = parseEnv();

// Export typed environment
export type Env = z.infer<typeof envSchema>;