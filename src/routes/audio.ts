import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { elevenLabsService } from '../services/ai/elevenlabs.service.js';
import { prisma } from '../server.js';

const audioQuerySchema = z.object({
  text: z.string(),
  clientId: z.string().optional(),
  cache: z.enum(['true', 'false']).optional().default('true'),
});

// In-memory cache for audio (in production, use Redis)
const audioCache = new Map<string, { buffer: Buffer; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export async function audioRoutes(fastify: FastifyInstance) {
  /**
   * GET /audio/tts
   * Generate speech from text using ElevenLabs
   * Query params: text, clientId (optional), cache (optional)
   */
  fastify.get(
    '/audio/tts',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = audioQuerySchema.parse(request.query);
        const { text, clientId, cache } = query;

        // Generate cache key
        const cacheKey = `${clientId || 'default'}:${text}`;

        // Check cache if enabled
        if (cache === 'true') {
          const cached = audioCache.get(cacheKey);
          if (cached) {
            const age = Date.now() - cached.timestamp;
            if (age < CACHE_TTL) {
              fastify.log.info('Serving cached audio');
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

        // Get voice ID from client settings if available
        let voiceId = process.env.ELEVENLABS_VOICE_ID;
        if (clientId) {
          const client = await prisma.client.findUnique({
            where: { id: clientId },
            select: { voiceId: true },
          });
          if (client?.voiceId) {
            voiceId = client.voiceId;
          }
        }

        fastify.log.info({ text: text.substring(0, 50) }, 'Generating speech with ElevenLabs');

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
        reply.header('Cache-Control', 'public, max-age=3600');
        return audioBuffer;
      } catch (err) {
        fastify.log.error({ err }, 'Error generating speech');
        reply.code(500);
        return { error: 'Failed to generate speech' };
      }
    }
  );

  /**
   * POST /audio/clear-cache
   * Clear the audio cache (for development/testing)
   */
  fastify.post(
    '/audio/clear-cache',
    async (request: FastifyRequest, reply: FastifyReply) => {
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
    async (request: FastifyRequest, reply: FastifyReply) => {
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
