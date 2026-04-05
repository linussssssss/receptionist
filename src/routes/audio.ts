import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { elevenLabsService } from '../services/ai/elevenlabs.service.js';
import { authenticate } from '../hooks/auth.hook.js';
import { RATE_LIMIT_PRESETS, KEY_GENERATORS } from '../config/rate-limits.js';

const audioQuerySchema = z.object({
  text: z.string().max(500, 'Text must be 500 characters or less'),
  clientId: z.string().optional(),
  cache: z.enum(['true', 'false']).optional().default('true'),
});

// In-memory cache for audio (in production, use Redis)
const audioCache = new Map<string, { buffer: Buffer; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

export async function audioRoutes(fastify: FastifyInstance) {
  /**
   * Shared handler for TTS generation
   * Used by both public and authenticated endpoints
   */
  const ttsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = audioQuerySchema.parse(request.query);
      const { text, clientId, cache } = query;

      // If user is authenticated, validate clientId matches
      if (request.user && clientId && clientId !== request.user.clientId) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Cannot access TTS for another client',
        });
      }

      // Use authenticated user's clientId if available
      const effectiveClientId = request.user?.clientId || clientId || 'default';

      // Generate cache key
      const cacheKey = `${effectiveClientId}:${text}`;

      // Check cache if enabled
      if (cache === 'true') {
        const cached = audioCache.get(cacheKey);
        if (cached) {
          const age = Date.now() - cached.timestamp;
          if (age < CACHE_TTL) {
            fastify.log.info(
              { userId: request.user?.userId, clientId: effectiveClientId },
              'Serving cached audio'
            );
            reply.type('audio/mpeg');
            reply.header('X-Cache', 'HIT');
            reply.header('X-Cache-Age', age.toString());
            return cached.buffer;
          } else {
            // Cache expired
            audioCache.delete(cacheKey);
          }
        }
      }

      // TODO: Voice ID selection from client settings will be added when elevenLabsService.textToSpeech supports it

      fastify.log.info(
        {
          text: text.substring(0, 50),
          userId: request.user?.userId,
          clientId: effectiveClientId,
        },
        'Generating speech with ElevenLabs'
      );

      // Generate speech
      const audioBuffer = await elevenLabsService.textToSpeech(text);

      // Cache the result
      if (cache === 'true') {
        audioCache.set(cacheKey, {
          buffer: audioBuffer,
          timestamp: Date.now(),
        });
      }

      // Return audio
      reply.type('audio/mpeg');
      reply.header('X-Cache', 'MISS');
      reply.header('Cache-Control', 'public, max-age=86400'); // 24 hours
      return audioBuffer;
    } catch (err) {
      fastify.log.error({ err }, 'Error generating speech');
      reply.code(500);
      return { error: 'Failed to generate speech' };
    }
  };

  /**
   * GET /audio/tts (PUBLIC - for Twilio during calls)
   * Generate speech from text using ElevenLabs
   * STRICT rate limiting: 5 requests/minute per IP
   * Query params: text, clientId (optional), cache (optional)
   */
  fastify.get(
    '/audio/tts',
    {
      config: {
        rateLimit: {
          ...RATE_LIMIT_PRESETS.TTS_PUBLIC,
          keyGenerator: KEY_GENERATORS.byIP,
        },
      },
    },
    ttsHandler
  );

  /**
   * GET /api/audio/tts (AUTHENTICATED - for dashboard)
   * Generate speech from text using ElevenLabs
   * RELAXED rate limiting: 20 requests/minute per user
   * Requires authentication via Bearer token
   * Query params: text, clientId (optional), cache (optional)
   */
  fastify.get(
    '/api/audio/tts',
    {
      preHandler: authenticate,
      config: {
        rateLimit: {
          ...RATE_LIMIT_PRESETS.TTS_AUTHENTICATED,
          keyGenerator: KEY_GENERATORS.byUser,
        },
      },
    },
    ttsHandler
  );

  /**
   * POST /audio/clear-cache
   * Clear the audio cache (for development/testing)
   */
  fastify.post(
    '/audio/clear-cache',
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      const size = audioCache.size;
      audioCache.clear();
      fastify.log.info({ clearedEntries: size }, 'Audio cache cleared');
      return { message: 'Cache cleared', entriesCleared: size };
    }
  );

  /**
   * GET /audio/cache-stats
   * Get cache statistics
   */
  fastify.get(
    '/audio/cache-stats',
    async (_request: FastifyRequest, _reply: FastifyReply) => {
      const now = Date.now();
      const entries = Array.from(audioCache.entries());

      const stats = {
        totalEntries: entries.length,
        validEntries: entries.filter(([_, v]) => now - v.timestamp < CACHE_TTL).length,
        expiredEntries: entries.filter(([_, v]) => now - v.timestamp >= CACHE_TTL).length,
        totalSizeBytes: entries.reduce((sum, [_, v]) => sum + v.buffer.length, 0),
      };

      return stats;
    }
  );
}
