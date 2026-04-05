export interface DailyDigestMetrics {
  // Date range
  date: string;
  dateFormatted: string;

  // Call metrics
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  averageCallDuration: number; // in seconds

  // Appointment metrics
  appointmentsCreated: number;
  appointmentsCancelled: number;

  // Error metrics
  totalErrors: number;
  criticalAlertsSent: number;
  errorsByType: Record<string, number>;

  // Sync metrics
  calendarSyncSuccess: number;
  calendarSyncFailed: number;

  // Rate limiting
  rateLimitViolations: number;
}

function getHealthIndicator(metrics: DailyDigestMetrics): {
  color: string;
  status: string;
  bgColor: string;
} {
  const errorRate = metrics.totalCalls > 0
    ? metrics.failedCalls / metrics.totalCalls
    : 0;

  if (errorRate > 0.1 || metrics.criticalAlertsSent > 5) {
    return { color: '#dc2626', status: 'Needs Attention', bgColor: '#fef2f2' };
  } else if (errorRate > 0.05 || metrics.criticalAlertsSent > 0) {
    return { color: '#f59e0b', status: 'Minor Issues', bgColor: '#fffbeb' };
  }
  return { color: '#16a34a', status: 'Healthy', bgColor: '#f0fdf4' };
}

export function generateDailyDigestEmail(metrics: DailyDigestMetrics): {
  subject: string;
  html: string;
  text: string;
} {
  const health = getHealthIndicator(metrics);
  const subject = `AI Receptionist Daily Digest - ${metrics.dateFormatted}`;

  const html = `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; line-height: 1.6; color: #333333; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 30px 20px 30px; text-align: center; background-color: #4f46e5; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                Daily Digest
              </h1>
              <p style="margin: 10px 0 0 0; color: #c7d2fe; font-size: 14px;">
                ${metrics.dateFormatted}
              </p>
            </td>
          </tr>

          <!-- Health Status -->
          <tr>
            <td style="padding: 20px 30px;">
              <table role="presentation" style="width: 100%; background-color: ${health.bgColor}; border-radius: 6px; border: 1px solid ${health.color}20;">
                <tr>
                  <td style="padding: 15px; text-align: center;">
                    <span style="display: inline-block; padding: 4px 12px; background-color: ${health.color}; color: white; border-radius: 12px; font-size: 12px; font-weight: 600;">
                      ${health.status.toUpperCase()}
                    </span>
                    <p style="margin: 10px 0 0 0; color: ${health.color}; font-size: 14px;">
                      ${metrics.criticalAlertsSent > 0 ? `${metrics.criticalAlertsSent} critical alert${metrics.criticalAlertsSent !== 1 ? 's' : ''} sent` : 'No critical alerts'}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Metrics Grid -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <table role="presentation" style="width: 100%;">
                <!-- Calls Row -->
                <tr>
                  <td style="width: 50%; padding: 10px;">
                    <table role="presentation" style="width: 100%; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                      <tr>
                        <td style="padding: 15px; text-align: center;">
                          <p style="margin: 0; font-size: 28px; font-weight: 700; color: #1e293b;">${metrics.totalCalls}</p>
                          <p style="margin: 5px 0 0 0; font-size: 12px; color: #64748b;">Total Calls</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="width: 50%; padding: 10px;">
                    <table role="presentation" style="width: 100%; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                      <tr>
                        <td style="padding: 15px; text-align: center;">
                          <p style="margin: 0; font-size: 28px; font-weight: 700; color: #16a34a;">${metrics.completedCalls}</p>
                          <p style="margin: 5px 0 0 0; font-size: 12px; color: #64748b;">Completed</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Appointments Row -->
                <tr>
                  <td style="width: 50%; padding: 10px;">
                    <table role="presentation" style="width: 100%; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                      <tr>
                        <td style="padding: 15px; text-align: center;">
                          <p style="margin: 0; font-size: 28px; font-weight: 700; color: #4f46e5;">${metrics.appointmentsCreated}</p>
                          <p style="margin: 5px 0 0 0; font-size: 12px; color: #64748b;">Appointments Created</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="width: 50%; padding: 10px;">
                    <table role="presentation" style="width: 100%; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                      <tr>
                        <td style="padding: 15px; text-align: center;">
                          <p style="margin: 0; font-size: 28px; font-weight: 700; color: #dc2626;">${metrics.totalErrors}</p>
                          <p style="margin: 5px 0 0 0; font-size: 12px; color: #64748b;">Total Errors</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Additional Stats -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <table role="presentation" style="width: 100%; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;">
                <tr>
                  <td style="padding: 15px;">
                    <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #1e293b;">Additional Statistics</p>
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Average Call Duration</td>
                        <td style="padding: 5px 0; color: #1e293b; font-size: 13px; text-align: right;">${formatDuration(metrics.averageCallDuration)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Calendar Sync Success</td>
                        <td style="padding: 5px 0; color: #1e293b; font-size: 13px; text-align: right;">${metrics.calendarSyncSuccess} / ${metrics.calendarSyncSuccess + metrics.calendarSyncFailed}</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Rate Limit Violations</td>
                        <td style="padding: 5px 0; color: #1e293b; font-size: 13px; text-align: right;">${metrics.rateLimitViolations}</td>
                      </tr>
                      <tr>
                        <td style="padding: 5px 0; color: #64748b; font-size: 13px;">Appointments Cancelled</td>
                        <td style="padding: 5px 0; color: #1e293b; font-size: 13px; text-align: right;">${metrics.appointmentsCancelled}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${Object.keys(metrics.errorsByType).length > 0 ? `
          <!-- Error Breakdown -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <table role="presentation" style="width: 100%; background-color: #fef2f2; border-radius: 6px; border: 1px solid #fecaca;">
                <tr>
                  <td style="padding: 15px;">
                    <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #991b1b;">Error Breakdown</p>
                    <table role="presentation" style="width: 100%;">
                      ${Object.entries(metrics.errorsByType).map(([type, count]) => `
                      <tr>
                        <td style="padding: 5px 0; color: #7f1d1d; font-size: 13px;">${formatErrorType(type)}</td>
                        <td style="padding: 5px 0; color: #7f1d1d; font-size: 13px; text-align: right;">${count}</td>
                      </tr>
                      `).join('')}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; text-align: center; background-color: #f8fafc; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                AI Receptionist Monitoring System
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  // Plain text version
  const text = `
AI Receptionist Daily Digest
${metrics.dateFormatted}

STATUS: ${health.status}
${metrics.criticalAlertsSent > 0 ? `${metrics.criticalAlertsSent} critical alert(s) sent` : 'No critical alerts'}

CALLS
- Total: ${metrics.totalCalls}
- Completed: ${metrics.completedCalls}
- Failed: ${metrics.failedCalls}
- Average Duration: ${formatDuration(metrics.averageCallDuration)}

APPOINTMENTS
- Created: ${metrics.appointmentsCreated}
- Cancelled: ${metrics.appointmentsCancelled}

ERRORS
- Total: ${metrics.totalErrors}
${Object.entries(metrics.errorsByType).map(([type, count]) => `- ${formatErrorType(type)}: ${count}`).join('\n')}

SYNC
- Calendar Sync Success: ${metrics.calendarSyncSuccess}
- Calendar Sync Failed: ${metrics.calendarSyncFailed}

RATE LIMITING
- Violations: ${metrics.rateLimitViolations}

---
AI Receptionist Monitoring System
  `.trim();

  return { subject, html, text };
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function formatErrorType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
