import crypto from 'crypto';
import { env } from '../../config/env.js';
import { createServiceLogger } from '../../utils/logger.js';

const logger = createServiceLogger('alert-deduplication');

interface DeduplicationEntry {
  hash: string;
  timestamp: number;
  count: number;
}

/**
 * Alert Deduplication Service
 *
 * Prevents alert spam by tracking recently sent alerts and
 * skipping duplicates within a configurable time window.
 */
class AlertDeduplication {
  private cache: Map<string, DeduplicationEntry> = new Map();
  private alertCountThisHour: number = 0;
  private hourStartTime: number = Date.now();

  /**
   * Generate a hash for an alert to identify duplicates
   * Hash based on: alertType + clientId + first 100 chars of error message
   */
  generateHash(alertType: string, clientId: string | undefined, errorMessage: string): string {
    const normalizedMessage = errorMessage.substring(0, 100).toLowerCase().trim();
    const input = `${alertType}:${clientId || 'global'}:${normalizedMessage}`;
    return crypto.createHash('md5').update(input).digest('hex');
  }

  /**
   * Check if an alert should be sent or deduplicated
   * Returns true if the alert should be sent, false if it should be skipped
   */
  shouldSendAlert(alertHash: string): boolean {
    const now = Date.now();
    const windowMs = env.ALERT_DEDUPLICATION_WINDOW_MS;

    // Reset hourly counter if needed
    if (now - this.hourStartTime > 60 * 60 * 1000) {
      this.alertCountThisHour = 0;
      this.hourStartTime = now;
    }

    // Check max alerts per hour
    if (this.alertCountThisHour >= env.ALERT_MAX_PER_HOUR) {
      logger.warn(
        { alertHash, alertCount: this.alertCountThisHour },
        'Alert rate limit exceeded, skipping alert'
      );
      return false;
    }

    // Check for existing entry
    const existing = this.cache.get(alertHash);

    if (existing) {
      const timeSinceLastAlert = now - existing.timestamp;

      if (timeSinceLastAlert < windowMs) {
        // Within deduplication window - skip
        existing.count++;
        logger.debug(
          {
            alertHash,
            timeSinceLastMs: timeSinceLastAlert,
            duplicateCount: existing.count,
          },
          'Alert deduplicated'
        );
        return false;
      }

      // Outside window - allow and reset
      existing.timestamp = now;
      existing.count = 1;
    } else {
      // New alert
      this.cache.set(alertHash, {
        hash: alertHash,
        timestamp: now,
        count: 1,
      });
    }

    this.alertCountThisHour++;
    return true;
  }

  /**
   * Record that an alert was sent (for tracking purposes)
   */
  recordAlertSent(alertHash: string): void {
    const existing = this.cache.get(alertHash);
    if (existing) {
      existing.timestamp = Date.now();
    }
  }

  /**
   * Get deduplication statistics
   */
  getStats(): {
    cachedAlerts: number;
    alertsThisHour: number;
    maxAlertsPerHour: number;
    deduplicationWindowMs: number;
  } {
    return {
      cachedAlerts: this.cache.size,
      alertsThisHour: this.alertCountThisHour,
      maxAlertsPerHour: env.ALERT_MAX_PER_HOUR,
      deduplicationWindowMs: env.ALERT_DEDUPLICATION_WINDOW_MS,
    };
  }

  /**
   * Clean up old entries to prevent memory leaks
   * Called periodically
   */
  cleanup(): void {
    const now = Date.now();
    const windowMs = env.ALERT_DEDUPLICATION_WINDOW_MS;
    let removed = 0;

    for (const [hash, entry] of this.cache) {
      if (now - entry.timestamp > windowMs * 2) {
        this.cache.delete(hash);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug({ removed, remaining: this.cache.size }, 'Cleaned up old deduplication entries');
    }
  }
}

// Export singleton
export const alertDeduplication = new AlertDeduplication();

// Cleanup old entries every 10 minutes
setInterval(() => {
  alertDeduplication.cleanup();
}, 10 * 60 * 1000);
