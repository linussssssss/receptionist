import { authService } from '../services/auth/auth.service.js';
import { logger } from '../utils/logger.js';
import type { ScheduledJob } from './scheduler.js';

/**
 * Session cleanup job
 * Runs daily at 3 AM to clean up expired sessions
 */
async function handler(): Promise<void> {
  logger.info('Starting session cleanup job');

  try {
    const count = await authService.cleanupExpiredSessions();

    logger.info(
      { deletedCount: count },
      'Session cleanup completed successfully'
    );
  } catch (err) {
    logger.error({ err }, 'Session cleanup job failed');
    throw err;
  }
}

export const sessionCleanupJob: ScheduledJob = {
  name: 'session-cleanup',
  schedule: '0 3 * * *', // Daily at 3 AM
  handler,
};
