import type { RateLimitOptions } from '@fastify/rate-limit';
import { env } from './env.js';

/**
 * Centralized rate limit configuration presets
 * Each preset defines rate limiting strategy for different endpoint categories
 */

export interface RateLimitPreset {
  max: number;
  timeWindow: string;
  ban?: number; // Number of violations before temporary ban
  skipSuccessfulRequests?: boolean;
}

/**
 * Rate limit presets by category
 */
export const RATE_LIMIT_PRESETS = {
  /**
   * AI/LLM Operations - MOST EXPENSIVE
   * Protects Claude AI and ElevenLabs TTS endpoints
   */
  AI_CLAUDE: {
    max: env.RATE_LIMIT_AI_MAX,
    timeWindow: '1 minute',
    ban: 3, // Ban after 3 violations in the time window
    skipSuccessfulRequests: false,
  },

  /**
   * TTS Generation - PUBLIC endpoint (strict)
   * Very aggressive limits for unauthenticated access
   */
  TTS_PUBLIC: {
    max: 5,
    timeWindow: '1 minute',
    ban: 3, // Quick ban for abusive behavior
    skipSuccessfulRequests: false,
  },

  /**
   * TTS Generation - AUTHENTICATED endpoint (relaxed)
   * Higher limits for authenticated dashboard users
   */
  TTS_AUTHENTICATED: {
    max: env.RATE_LIMIT_TTS_MAX,
    timeWindow: '1 minute',
    skipSuccessfulRequests: false,
  },

  /**
   * Database-Heavy Operations
   * Protects analytics and bulk query endpoints
   */
  ANALYTICS: {
    max: env.RATE_LIMIT_ANALYTICS_MAX,
    timeWindow: '1 minute',
    skipSuccessfulRequests: false,
  },

  /**
   * Authentication - Sensitive operations
   * Login, register, password change
   */
  AUTH_SENSITIVE: {
    max: env.LOGIN_RATE_LIMIT,
    timeWindow: '1 minute',
    ban: 5, // Ban after 5 failed login attempts
    skipSuccessfulRequests: false,
  },

  /**
   * Authentication - Less sensitive
   * Token refresh, user info
   */
  AUTH_STANDARD: {
    max: 50,
    timeWindow: '1 minute',
    skipSuccessfulRequests: true, // Only count failures
  },

  /**
   * Standard API Operations
   * Regular CRUD operations
   */
  API_STANDARD: {
    max: 60,
    timeWindow: '1 minute',
    skipSuccessfulRequests: false,
  },

  /**
   * API Write Operations
   * Creating, updating, deleting resources
   */
  API_WRITE: {
    max: 30,
    timeWindow: '1 minute',
    skipSuccessfulRequests: false,
  },

  /**
   * Integration Operations
   * Calendar sync, external API calls
   */
  INTEGRATION: {
    max: 5,
    timeWindow: '1 minute',
    skipSuccessfulRequests: false,
  },

  /**
   * Webhooks - Soft Limits
   * High thresholds to catch extreme abuse only
   */
  WEBHOOK_SOFT: {
    max: env.RATE_LIMIT_WEBHOOK_MAX,
    timeWindow: '1 minute',
    skipSuccessfulRequests: true, // Only count errors
  },

  /**
   * Admin Operations
   * User management, invitations
   */
  ADMIN: {
    max: 10,
    timeWindow: '1 minute',
    skipSuccessfulRequests: false,
  },
} as const;

/**
 * Helper function to create rate limit config with overrides
 */
export function createRateLimitConfig(
  preset: keyof typeof RATE_LIMIT_PRESETS,
  overrides?: Partial<RateLimitOptions>
): RateLimitOptions {
  const baseConfig = RATE_LIMIT_PRESETS[preset];

  return {
    ...baseConfig,
    ...overrides,
    // Add custom error response
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Please try again in ${context.after}`,
      retryAfter: context.after,
    }),
  } as RateLimitOptions;
}

/**
 * Helper to create a dynamic rate limit based on user role
 */
export function createDynamicRateLimit(
  defaultMax: number,
  adminMax?: number
): (request: any) => number {
  return (request: any) => {
    if (request.user?.role === 'ADMIN' && adminMax) {
      return adminMax;
    }
    return defaultMax;
  };
}

/**
 * Common key generators for rate limiting
 */
export const KEY_GENERATORS = {
  /**
   * Rate limit by IP address
   */
  byIP: (request: any) => `ip:${request.ip}`,

  /**
   * Rate limit by authenticated user ID
   */
  byUser: (request: any) => `user:${request.user?.userId || request.ip}`,

  /**
   * Rate limit by client ID
   */
  byClient: (request: any) => `client:${request.user?.clientId || request.ip}`,

  /**
   * Rate limit by IP + CallSid (for Twilio webhooks)
   * Note: Body is not available in rate limit hook, so this falls back to IP only
   */
  byIPAndCallSid: (request: any) => {
    // Body isn't parsed yet during rate limit check, so we can only use IP
    return `webhook:${request.ip}`;
  },

  /**
   * Rate limit by CallSid only
   * Note: Body is not available in rate limit hook, so this falls back to IP only
   */
  byCallSid: (request: any) => {
    // Body isn't parsed yet during rate limit check, so we can only use IP
    return `call:${request.ip}`;
  },

  /**
   * Rate limit by Google Calendar channel ID
   */
  byChannelId: (request: any) => {
    const channelId = request.headers['x-goog-channel-id'];
    return `gcal:${channelId || request.ip}`;
  },

  /**
   * Rate limit TTS by user or IP
   */
  tts: (authenticated: boolean) => (request: any) => {
    const prefix = authenticated ? 'auth-tts' : 'public-tts';
    const key = authenticated ? request.user?.userId : request.ip;
    return `${prefix}:${key || 'unknown'}`;
  },

  /**
   * Rate limit analytics by user
   */
  analytics: (request: any) => `analytics:${request.user?.userId || request.ip}`,

  /**
   * Rate limit calendar sync by client
   */
  calendarSync: (request: any) => {
    const body = request.body as any;
    return `calendar-sync:${body.clientId || request.user?.clientId || request.ip}`;
  },
};
