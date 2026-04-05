import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';
import { env } from './env.js';

type RedisClient = Redis;

/**
 * Redis Service for distributed caching and rate limiting
 * Provides graceful fallback to in-memory storage if Redis is unavailable
 */
class RedisService {
  private client: RedisClient | null = null;
  private isConnected: boolean = false;
  private connectionAttempts: number = 0;
  private maxRetries: number = 5;

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    // Skip if Redis URL not configured
    if (!env.REDIS_URL) {
      logger.warn('Redis URL not configured - rate limiting will use in-memory store');
      logger.warn('⚠️  In-memory rate limiting does not work across multiple instances');
      return;
    }

    try {
      logger.info('Connecting to Redis...');

      this.client = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true, // Don't auto-connect, we'll do it manually
      });

      // Event handlers
      this.client.on('connect', () => {
        logger.info('Redis connected successfully');
        this.isConnected = true;
        this.connectionAttempts = 0;
      });

      this.client.on('ready', () => {
        logger.info('Redis ready to accept commands');
      });

      this.client.on('error', (error: Error) => {
        logger.error({ err: error }, 'Redis connection error');
        this.isConnected = false;
      });

      this.client.on('close', () => {
        logger.warn('Redis connection closed');
        this.isConnected = false;
      });

      this.client.on('reconnecting', (delay: number) => {
        this.connectionAttempts++;
        logger.info(
          { attempt: this.connectionAttempts, delayMs: delay },
          'Redis reconnecting...'
        );

        if (this.connectionAttempts >= this.maxRetries) {
          logger.error('Max Redis reconnection attempts reached - falling back to in-memory');
          this.client?.disconnect();
          this.client = null;
        }
      });

      // Attempt connection
      await this.client.connect();

      // Test connection
      await this.client.ping();
      logger.info('Redis ping successful');

    } catch (error) {
      logger.error({ err: error }, 'Failed to connect to Redis - falling back to in-memory store');
      this.client = null;
      this.isConnected = false;

      // Warn about production implications
      if (env.NODE_ENV === 'production') {
        logger.warn('⚠️  Running without Redis in production - rate limiting will NOT work across multiple instances');
      }
    }
  }

  /**
   * Gracefully disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      logger.info('Disconnecting from Redis...');
      try {
        await this.client.quit();
        logger.info('Redis disconnected successfully');
      } catch (error) {
        logger.error({ err: error }, 'Error during Redis disconnect');
        // Force disconnect if quit fails
        this.client.disconnect();
      }
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * Check if Redis is healthy and connected
   */
  isHealthy(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get the Redis client instance
   * Returns null if Redis is not available (fallback to in-memory)
   */
  getClient(): RedisClient | null {
    return this.client;
  }

  /**
   * Get Redis connection info for monitoring
   */
  async getInfo(): Promise<{
    connected: boolean;
    keyCount: number;
    usedMemory?: string;
    uptime?: number;
  }> {
    if (!this.isHealthy() || !this.client) {
      return {
        connected: false,
        keyCount: 0,
      };
    }

    try {
      const dbSize = await this.client.dbsize();
      const info = await this.client.info('memory');
      const serverInfo = await this.client.info('server');

      // Parse info strings
      const usedMemory = info.match(/used_memory_human:(.+)/)?.[1]?.trim();
      const uptime = serverInfo.match(/uptime_in_seconds:(\d+)/)?.[1];

      return {
        connected: true,
        keyCount: dbSize,
        usedMemory,
        uptime: uptime ? parseInt(uptime, 10) : undefined,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get Redis info');
      return {
        connected: false,
        keyCount: 0,
      };
    }
  }

  /**
   * Manually test Redis connection
   */
  async ping(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error({ err: error }, 'Redis ping failed');
      return false;
    }
  }
}

// Export singleton instance
export const redisService = new RedisService();
