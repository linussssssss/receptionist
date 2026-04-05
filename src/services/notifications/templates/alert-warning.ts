export interface WarningAlertData {
  alertType: string;
  errorMessage: string;
  timestamp: Date;
  severity: 'critical' | 'warning' | 'info';
  stackTrace?: string;
  requestId?: string;
  userId?: string;
  clientId?: string;
  callSid?: string;
  affectedUsers?: number;
  requestDetails?: Record<string, unknown>;
  operation?: string;
  durationMs?: number;
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  tts_failure: 'TTS Generation Failed',
  transcription_failure: 'Speech Transcription Failed',
  email_delivery_failed: 'Email Delivery Failed',
  rate_limit_violation: 'Rate Limit Violation Detected',
  webhook_renewal_failed: 'Webhook Renewal Failed',
  job_failure: 'Scheduled Job Failed',
};

export function generateWarningAlertEmail(data: WarningAlertData): {
  subject: string;
  html: string;
  text: string;
} {
  const alertLabel = ALERT_TYPE_LABELS[data.alertType] || data.alertType;
  const formattedTime = data.timestamp.toLocaleString('de-DE', {
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  const subject = `[WARNING] ${alertLabel} - AI Receptionist`;

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
            <td style="padding: 30px 30px 20px 30px; text-align: center; background-color: #f59e0b; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                WARNING
              </h1>
              <p style="margin: 10px 0 0 0; color: #fef3c7; font-size: 14px;">
                ${alertLabel}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333;">
                A warning condition has been detected in the AI Receptionist system.
              </p>

              <!-- Warning Details Box -->
              <table role="presentation" style="width: 100%; background-color: #fffbeb; border-radius: 6px; border: 1px solid #fde68a; margin-bottom: 25px;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #92400e; font-size: 14px;">Message:</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 0 0 12px 0;">
                          <code style="color: #78350f; font-size: 13px; background-color: #fef3c7; padding: 8px 12px; border-radius: 4px; display: block; word-break: break-all;">
                            ${escapeHtml(data.errorMessage)}
                          </code>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #92400e; font-size: 14px;">Timestamp:</strong>
                          <span style="color: #78350f; font-size: 14px; margin-left: 10px;">${formattedTime}</span>
                        </td>
                      </tr>
                      ${data.operation ? `
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #92400e; font-size: 14px;">Operation:</strong>
                          <span style="color: #78350f; font-size: 14px; margin-left: 10px;">${escapeHtml(data.operation)}</span>
                        </td>
                      </tr>
                      ` : ''}
                      ${data.clientId ? `
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #92400e; font-size: 14px;">Client ID:</strong>
                          <span style="color: #78350f; font-size: 14px; margin-left: 10px;">${escapeHtml(data.clientId)}</span>
                        </td>
                      </tr>
                      ` : ''}
                      ${data.callSid ? `
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #92400e; font-size: 14px;">Call SID:</strong>
                          <span style="color: #78350f; font-size: 14px; margin-left: 10px;">${escapeHtml(data.callSid)}</span>
                        </td>
                      </tr>
                      ` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              ${data.stackTrace ? `
              <!-- Stack Trace (Detailed Mode) -->
              <table role="presentation" style="width: 100%; background-color: #1e293b; border-radius: 6px; margin-bottom: 25px;">
                <tr>
                  <td style="padding: 15px;">
                    <p style="margin: 0 0 10px 0; color: #94a3b8; font-size: 12px; font-weight: 600;">STACK TRACE</p>
                    <pre style="margin: 0; color: #e2e8f0; font-size: 11px; font-family: 'Courier New', monospace; white-space: pre-wrap; word-break: break-all; overflow-x: auto;">${escapeHtml(data.stackTrace)}</pre>
                  </td>
                </tr>
              </table>
              ` : ''}

              <p style="margin: 25px 0 0 0; font-size: 14px; color: #64748b;">
                This warning may indicate a recurring issue. Please review when convenient.
              </p>
            </td>
          </tr>

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
[WARNING] ${alertLabel}

A warning condition has been detected in the AI Receptionist system.

Message:
${data.errorMessage}

Timestamp: ${formattedTime}
${data.operation ? `Operation: ${data.operation}` : ''}
${data.clientId ? `Client ID: ${data.clientId}` : ''}
${data.callSid ? `Call SID: ${data.callSid}` : ''}

${data.stackTrace ? `Stack Trace:\n${data.stackTrace}\n` : ''}

This warning may indicate a recurring issue. Please review when convenient.

---
AI Receptionist Monitoring System
  `.trim();

  return { subject, html, text };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
