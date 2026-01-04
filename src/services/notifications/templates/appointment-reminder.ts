export interface AppointmentReminderData {
  customerName: string;
  appointmentDate: string; // Formatted date (e.g., "Montag, 15. Januar 2025")
  appointmentTime: string; // Formatted time (e.g., "14:00")
  durationMinutes: number;
  reason?: string;
  clientName: string;
  clientPhone?: string;
}

export function generateAppointmentReminderEmail(data: AppointmentReminderData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Terminerinnerung - ${data.appointmentDate} um ${data.appointmentTime}`;

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
                Terminerinnerung
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333;">
                Guten Tag ${data.customerName},
              </p>

              <p style="margin: 0 0 25px 0; font-size: 16px; color: #333333;">
                Dies ist eine Erinnerung an Ihren bevorstehenden Termin:
              </p>

              <!-- Appointment Details Box -->
              <table role="presentation" style="width: 100%; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 25px;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #1e293b; font-size: 14px;">📅 Datum:</strong>
                          <span style="color: #475569; font-size: 14px; margin-left: 10px;">${data.appointmentDate}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #1e293b; font-size: 14px;">🕐 Uhrzeit:</strong>
                          <span style="color: #475569; font-size: 14px; margin-left: 10px;">${data.appointmentTime}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #1e293b; font-size: 14px;">⏱️ Dauer:</strong>
                          <span style="color: #475569; font-size: 14px; margin-left: 10px;">${data.durationMinutes} Minuten</span>
                        </td>
                      </tr>
                      ${
                        data.reason
                          ? `
                      <tr>
                        <td style="padding: 8px 0;">
                          <strong style="color: #1e293b; font-size: 14px;">📋 Grund:</strong>
                          <span style="color: #475569; font-size: 14px; margin-left: 10px;">${data.reason}</span>
                        </td>
                      </tr>
                      `
                          : ''
                      }
                    </table>
                  </td>
                </tr>
              </table>

              ${
                data.clientPhone
                  ? `
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #333333;">
                Bei Fragen oder falls Sie den Termin verschieben möchten, erreichen Sie uns unter:
                <br>
                <strong style="color: #4f46e5;">${data.clientPhone}</strong>
              </p>
              `
                  : ''
              }

              <p style="margin: 25px 0 0 0; font-size: 16px; color: #333333;">
                Mit freundlichen Grüßen,<br>
                <strong>${data.clientName}</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 30px; text-align: center; background-color: #f8fafc; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                Diese E-Mail wurde automatisch generiert. Bitte nicht antworten.
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

  // Plain text version for email clients that don't support HTML
  const text = `
Terminerinnerung

Guten Tag ${data.customerName},

Dies ist eine Erinnerung an Ihren bevorstehenden Termin:

Datum: ${data.appointmentDate}
Uhrzeit: ${data.appointmentTime}
Dauer: ${data.durationMinutes} Minuten${data.reason ? `\nGrund: ${data.reason}` : ''}
${
    data.clientPhone
      ? `\nBei Fragen oder falls Sie den Termin verschieben möchten, erreichen Sie uns unter: ${data.clientPhone}`
      : ''
  }

Mit freundlichen Grüßen,
${data.clientName}

---
Diese E-Mail wurde automatisch generiert. Bitte nicht antworten.
  `.trim();

  return { subject, html, text };
}
