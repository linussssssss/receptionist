import { vi, beforeEach, afterEach } from 'vitest';

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-minimum-32-characters-long';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';
process.env.BCRYPT_ROUNDS = '4'; // Lower for faster tests
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = '';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.TWILIO_ACCOUNT_SID = 'test-twilio-sid';
process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
process.env.TWILIO_PHONE_NUMBER = '+1234567890';
process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';
process.env.ELEVENLABS_VOICE_ID = 'test-voice-id';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.RESEND_FROM_EMAIL = 'test@example.com';
process.env.MONITORING_ENABLED = 'false';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.SENTRY_DSN = '';

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Clean up after each test
afterEach(() => {
  vi.restoreAllMocks();
});

// Global test utilities
export const createMockDate = (dateString: string): Date => new Date(dateString);

export const waitFor = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
