import { invitationService } from '../services/auth/invitation.service.js';
import { logger } from '../utils/logger.js';
import type { ScheduledJob } from './scheduler.js';

/**
 * Invitation cleanup job
 * Runs daily at 3 AM to clean up expired invitations
 */
async function handler(): Promise<void> {
  logger.info('Starting invitation cleanup job');

  try {
    const count = await invitationService.cleanupExpiredInvitations();

    logger.info(
      { processedCount: count },
      'Invitation cleanup completed successfully'
    );
  } catch (err) {
    logger.error({ err }, 'Invitation cleanup job failed');
    throw err;
  }
}

export const invitationCleanupJob: ScheduledJob = {
  name: 'invitation-cleanup',
  schedule: '0 3 * * *', // Daily at 3 AM
  handler,
};
