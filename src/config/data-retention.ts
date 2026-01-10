/**
 * Data Retention Configuration
 * GDPR/DSGVO compliant retention periods
 */

export interface RetentionPeriod {
  days: number;
  action: 'delete' | 'anonymize';
}

export interface RetentionConfig {
  // Call transcripts and messages - 90 days then delete
  callsAndMessages: RetentionPeriod;
  // Appointments - 2 years then anonymize (keep for statistics)
  appointments: RetentionPeriod;
  // System events - 180 days then delete
  systemEvents: RetentionPeriod;
  // Alert logs - 180 days then delete
  alertLogs: RetentionPeriod;
  // Sessions - 30 days after expiry then delete
  expiredSessions: RetentionPeriod;
  // Audit logs - 7 years (legal requirement) then archive/delete
  auditLogs: RetentionPeriod;
  // Daily metrics - 2 years then delete
  dailyMetrics: RetentionPeriod;
}

// Default retention periods (can be overridden per client)
export const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  callsAndMessages: {
    days: 90,
    action: 'delete',
  },
  appointments: {
    days: 730, // 2 years
    action: 'anonymize',
  },
  systemEvents: {
    days: 180,
    action: 'delete',
  },
  alertLogs: {
    days: 180,
    action: 'delete',
  },
  expiredSessions: {
    days: 30,
    action: 'delete',
  },
  auditLogs: {
    days: 2555, // 7 years
    action: 'delete',
  },
  dailyMetrics: {
    days: 730, // 2 years
    action: 'delete',
  },
};

/**
 * Get retention config for a specific client
 * Falls back to defaults if client has no custom settings
 */
export function getClientRetentionConfig(
  clientRetentionSettings: Record<string, unknown> | null
): RetentionConfig {
  if (!clientRetentionSettings) {
    return DEFAULT_RETENTION_CONFIG;
  }

  return {
    callsAndMessages: {
      days:
        (clientRetentionSettings.callsAndMessagesDays as number) ||
        DEFAULT_RETENTION_CONFIG.callsAndMessages.days,
      action: 'delete',
    },
    appointments: {
      days:
        (clientRetentionSettings.appointmentsDays as number) ||
        DEFAULT_RETENTION_CONFIG.appointments.days,
      action: 'anonymize',
    },
    systemEvents: DEFAULT_RETENTION_CONFIG.systemEvents,
    alertLogs: DEFAULT_RETENTION_CONFIG.alertLogs,
    expiredSessions: DEFAULT_RETENTION_CONFIG.expiredSessions,
    auditLogs: DEFAULT_RETENTION_CONFIG.auditLogs,
    dailyMetrics: DEFAULT_RETENTION_CONFIG.dailyMetrics,
  };
}

/**
 * Calculate cutoff date for a retention period
 */
export function getCutoffDate(days: number): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}
