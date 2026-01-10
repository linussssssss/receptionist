import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock env before importing the module
vi.mock('../../config/env.js', () => ({
  env: {
    ALERT_DEDUPLICATION_WINDOW_MS: 5000, // 5 seconds for testing
    ALERT_MAX_PER_HOUR: 10,
  },
}));

vi.mock('../../utils/logger.js', () => ({
  createServiceLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks are set up
import { alertDeduplication } from './alert-deduplication.js';

describe('AlertDeduplication', () => {
  beforeEach(() => {
    // Clear internal state before each test
    const cache = (alertDeduplication as any).cache as Map<string, any>;
    cache.clear();
    (alertDeduplication as any).alertCountThisHour = 0;
    (alertDeduplication as any).hourStartTime = Date.now();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateHash', () => {
    it('generates consistent hash for same inputs', () => {
      const hash1 = alertDeduplication.generateHash('error_type', 'client-123', 'Error message');
      const hash2 = alertDeduplication.generateHash('error_type', 'client-123', 'Error message');

      expect(hash1).toBe(hash2);
    });

    it('generates different hash for different alert types', () => {
      const hash1 = alertDeduplication.generateHash('type_a', 'client-123', 'Error message');
      const hash2 = alertDeduplication.generateHash('type_b', 'client-123', 'Error message');

      expect(hash1).not.toBe(hash2);
    });

    it('generates different hash for different clients', () => {
      const hash1 = alertDeduplication.generateHash('error_type', 'client-a', 'Error message');
      const hash2 = alertDeduplication.generateHash('error_type', 'client-b', 'Error message');

      expect(hash1).not.toBe(hash2);
    });

    it('generates different hash for different error messages', () => {
      const hash1 = alertDeduplication.generateHash('error_type', 'client-123', 'Error A');
      const hash2 = alertDeduplication.generateHash('error_type', 'client-123', 'Error B');

      expect(hash1).not.toBe(hash2);
    });

    it('uses "global" for undefined clientId', () => {
      const hash1 = alertDeduplication.generateHash('error_type', undefined, 'Error message');
      const hash2 = alertDeduplication.generateHash('error_type', 'global', 'Error message');

      // Both should produce the same hash since undefined maps to 'global'
      expect(hash1).toBe(hash2);
    });

    it('truncates long error messages to 100 chars', () => {
      const longMessage = 'A'.repeat(200);
      const shortMessage = 'A'.repeat(100);

      const hash1 = alertDeduplication.generateHash('error_type', 'client-123', longMessage);
      const hash2 = alertDeduplication.generateHash('error_type', 'client-123', shortMessage);

      expect(hash1).toBe(hash2);
    });

    it('normalizes case in error messages', () => {
      const hash1 = alertDeduplication.generateHash('error_type', 'client-123', 'ERROR MESSAGE');
      const hash2 = alertDeduplication.generateHash('error_type', 'client-123', 'error message');

      expect(hash1).toBe(hash2);
    });
  });

  describe('shouldSendAlert', () => {
    it('returns true for new alert', () => {
      const hash = alertDeduplication.generateHash('error_type', 'client-123', 'Error message');

      const shouldSend = alertDeduplication.shouldSendAlert(hash);

      expect(shouldSend).toBe(true);
    });

    it('returns false for duplicate within window', () => {
      const hash = alertDeduplication.generateHash('error_type', 'client-123', 'Error message');

      // First alert should be sent
      expect(alertDeduplication.shouldSendAlert(hash)).toBe(true);

      // Duplicate immediately after should be blocked
      expect(alertDeduplication.shouldSendAlert(hash)).toBe(false);
    });

    it('returns true after deduplication window expires', async () => {
      const hash = alertDeduplication.generateHash('error_type', 'client-123', 'Error message');

      // First alert
      expect(alertDeduplication.shouldSendAlert(hash)).toBe(true);

      // Simulate time passing beyond the window (5000ms in test config)
      const cache = (alertDeduplication as any).cache as Map<string, any>;
      const entry = cache.get(hash);
      entry.timestamp = Date.now() - 6000; // 6 seconds ago

      // Should now be allowed
      expect(alertDeduplication.shouldSendAlert(hash)).toBe(true);
    });

    it('increments duplicate count when deduplicated', () => {
      const hash = alertDeduplication.generateHash('error_type', 'client-123', 'Error message');

      alertDeduplication.shouldSendAlert(hash);
      alertDeduplication.shouldSendAlert(hash);
      alertDeduplication.shouldSendAlert(hash);

      const cache = (alertDeduplication as any).cache as Map<string, any>;
      const entry = cache.get(hash);
      expect(entry.count).toBe(3);
    });

    it('respects max alerts per hour limit', () => {
      // Send max allowed alerts
      for (let i = 0; i < 10; i++) {
        const hash = alertDeduplication.generateHash('error_type', `client-${i}`, `Error ${i}`);
        expect(alertDeduplication.shouldSendAlert(hash)).toBe(true);
      }

      // 11th unique alert should be blocked
      const hash = alertDeduplication.generateHash('error_type', 'client-new', 'New error');
      expect(alertDeduplication.shouldSendAlert(hash)).toBe(false);
    });

    it('resets hourly counter after an hour', () => {
      // Fill up the hourly quota
      for (let i = 0; i < 10; i++) {
        const hash = alertDeduplication.generateHash('error_type', `client-${i}`, `Error ${i}`);
        alertDeduplication.shouldSendAlert(hash);
      }

      // Simulate hour passing
      (alertDeduplication as any).hourStartTime = Date.now() - 61 * 60 * 1000;

      // Clear cache to avoid deduplication
      const cache = (alertDeduplication as any).cache as Map<string, any>;
      cache.clear();

      // Should now be allowed again
      const hash = alertDeduplication.generateHash('error_type', 'client-new', 'New error');
      expect(alertDeduplication.shouldSendAlert(hash)).toBe(true);
    });
  });

  describe('recordAlertSent', () => {
    it('updates timestamp of existing entry', () => {
      const hash = alertDeduplication.generateHash('error_type', 'client-123', 'Error message');

      alertDeduplication.shouldSendAlert(hash);

      // Simulate some time passing
      const cache = (alertDeduplication as any).cache as Map<string, any>;
      const entry = cache.get(hash);
      const originalTimestamp = entry.timestamp;
      entry.timestamp = originalTimestamp - 1000;

      // Record alert sent should update timestamp
      alertDeduplication.recordAlertSent(hash);

      expect(entry.timestamp).toBeGreaterThan(originalTimestamp - 1000);
    });

    it('does nothing for non-existent hash', () => {
      // Should not throw
      alertDeduplication.recordAlertSent('non-existent-hash');
    });
  });

  describe('getStats', () => {
    it('returns correct statistics', () => {
      // Send some alerts
      const hash1 = alertDeduplication.generateHash('error_type', 'client-1', 'Error 1');
      const hash2 = alertDeduplication.generateHash('error_type', 'client-2', 'Error 2');

      alertDeduplication.shouldSendAlert(hash1);
      alertDeduplication.shouldSendAlert(hash2);

      const stats = alertDeduplication.getStats();

      expect(stats.cachedAlerts).toBe(2);
      expect(stats.alertsThisHour).toBe(2);
      expect(stats.maxAlertsPerHour).toBe(10);
      expect(stats.deduplicationWindowMs).toBe(5000);
    });

    it('reflects correct hourly count after deduplication', () => {
      const hash = alertDeduplication.generateHash('error_type', 'client-123', 'Error message');

      alertDeduplication.shouldSendAlert(hash);
      alertDeduplication.shouldSendAlert(hash); // Deduplicated - shouldn't count
      alertDeduplication.shouldSendAlert(hash); // Deduplicated - shouldn't count

      const stats = alertDeduplication.getStats();
      expect(stats.alertsThisHour).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('removes entries older than 2x the window', () => {
      const hash1 = alertDeduplication.generateHash('error_type', 'client-1', 'Error 1');
      const hash2 = alertDeduplication.generateHash('error_type', 'client-2', 'Error 2');

      alertDeduplication.shouldSendAlert(hash1);
      alertDeduplication.shouldSendAlert(hash2);

      // Age the first entry beyond cleanup threshold (2x window = 10000ms)
      const cache = (alertDeduplication as any).cache as Map<string, any>;
      const entry1 = cache.get(hash1);
      entry1.timestamp = Date.now() - 15000; // 15 seconds ago

      // Run cleanup
      alertDeduplication.cleanup();

      expect(cache.has(hash1)).toBe(false);
      expect(cache.has(hash2)).toBe(true);
    });

    it('keeps recent entries', () => {
      const hash = alertDeduplication.generateHash('error_type', 'client-123', 'Error message');

      alertDeduplication.shouldSendAlert(hash);

      // Run cleanup immediately
      alertDeduplication.cleanup();

      const cache = (alertDeduplication as any).cache as Map<string, any>;
      expect(cache.has(hash)).toBe(true);
    });
  });
});
