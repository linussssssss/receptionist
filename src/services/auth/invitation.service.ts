import { Invitation, User } from '@prisma/client';
import { prisma } from '../../server.js';
import { authService, CreateUserInput } from './auth.service.js';
import { emailService } from '../notifications/email.service.js';
import { env } from '../../config/env.js';
import pino from 'pino';

const logger = pino({ name: 'invitation-service' });

export interface CreateInvitationInput {
  email: string;
  role: 'ADMIN' | 'STAFF';
  clientId: string;
  invitedBy: string;
}

export interface AcceptInvitationInput {
  name: string;
  password: string;
}

/**
 * Invitation Service
 * Handles user invitation flow for invite-only registration
 */
class InvitationService {
  /**
   * Create a new user invitation
   */
  async createInvitation(data: CreateInvitationInput): Promise<Invitation> {
    // Check if user with this email already exists
    const existingUser = await authService.getUserByEmail(data.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Check if there's a pending invitation for this email
    const existingInvitation = await prisma.invitation.findFirst({
      where: {
        email: data.email.toLowerCase(),
        status: 'PENDING',
        expiresAt: { gte: new Date() },
      },
    });

    if (existingInvitation) {
      throw new Error('Pending invitation already exists for this email');
    }

    // Generate unique invitation token
    const token = this.generateInvitationToken();

    // Set expiration to 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create invitation
    const invitation = await prisma.invitation.create({
      data: {
        email: data.email.toLowerCase(),
        token,
        role: data.role,
        clientId: data.clientId,
        invitedBy: data.invitedBy,
        status: 'PENDING',
        expiresAt,
      },
      include: {
        inviter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    logger.info(
      { invitationId: invitation.id, email: invitation.email, role: invitation.role },
      'Invitation created'
    );

    return invitation;
  }

  /**
   * Validate invitation token
   * Returns invitation if valid, null if invalid/expired
   */
  async validateInvitationToken(token: string): Promise<
    | (Invitation & {
        client: { id: string; name: string };
        inviter: { id: string; name: string; email: string };
      })
    | null
  > {
    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
        inviter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!invitation) {
      return null;
    }

    // Check if invitation is expired
    if (invitation.expiresAt < new Date()) {
      // Mark as expired
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      return null;
    }

    // Check if invitation is still pending
    if (invitation.status !== 'PENDING') {
      return null;
    }

    return invitation;
  }

  /**
   * Accept invitation and create user account
   */
  async acceptInvitation(
    token: string,
    userData: AcceptInvitationInput
  ): Promise<User> {
    // Validate invitation
    const invitation = await this.validateInvitationToken(token);

    if (!invitation) {
      throw new Error('Invalid or expired invitation');
    }

    // Create user
    const userInput: CreateUserInput = {
      email: invitation.email,
      password: userData.password,
      name: userData.name,
      role: invitation.role,
      clientId: invitation.clientId,
      invitedBy: invitation.invitedBy,
    };

    const user = await authService.createUser(userInput);

    // Mark invitation as accepted
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });

    logger.info(
      {
        userId: user.id,
        email: user.email,
        invitationId: invitation.id,
      },
      'Invitation accepted, user created'
    );

    return user;
  }

  /**
   * Revoke invitation
   */
  async revokeInvitation(id: string): Promise<void> {
    await prisma.invitation.update({
      where: { id },
      data: { status: 'REVOKED' },
    });

    logger.info({ invitationId: id }, 'Invitation revoked');
  }

  /**
   * Clean up expired invitations
   * Called by scheduled job daily
   */
  async cleanupExpiredInvitations(): Promise<number> {
    // Mark expired invitations
    const now = new Date();
    const result = await prisma.invitation.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      data: {
        status: 'EXPIRED',
      },
    });

    // Delete old accepted/expired/revoked invitations (>30 days old)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const deleteResult = await prisma.invitation.deleteMany({
      where: {
        status: { in: ['ACCEPTED', 'EXPIRED', 'REVOKED'] },
        createdAt: { lt: thirtyDaysAgo },
      },
    });

    const total = result.count + deleteResult.count;

    logger.info(
      { marked: result.count, deleted: deleteResult.count },
      'Expired invitations cleaned up'
    );

    return total;
  }

  /**
   * Send invitation email
   */
  async sendInvitationEmail(
    invitation: Invitation & {
      client: { id: string; name: string };
      inviter: { id: string; name: string; email: string };
    }
  ): Promise<void> {
    try {
      // Build invitation URL
      const baseUrl = env.FRONTEND_URL;
      const invitationUrl = `${baseUrl}/register?token=${invitation.token}`;

      // Build email content
      const subject = `Einladung zum AI Receptionist Dashboard`;

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 40px 0; text-align: center;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">
                        📧 Einladung
                      </h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                        Hallo,
                      </p>
                      <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                        <strong>${invitation.inviter.name}</strong> hat Sie eingeladen, dem AI Receptionist Dashboard für <strong>${invitation.client.name}</strong> beizutreten.
                      </p>
                      <div style="margin: 30px 0; padding: 20px; background-color: #f9fafb; border-left: 4px solid #667eea; border-radius: 4px;">
                        <p style="margin: 0 0 10px; color: #374151; font-size: 14px;">
                          <strong>Ihre Rolle:</strong> ${invitation.role === 'ADMIN' ? 'Administrator' : 'Mitarbeiter'}
                        </p>
                        <p style="margin: 0; color: #6b7280; font-size: 14px;">
                          ${invitation.role === 'ADMIN'
                            ? 'Als Administrator haben Sie vollen Zugriff auf alle Funktionen.'
                            : 'Als Mitarbeiter können Sie Anrufe und Termine verwalten.'}
                        </p>
                      </div>
                      <p style="margin: 0 0 30px; color: #374151; font-size: 16px; line-height: 1.6;">
                        Klicken Sie auf den Button unten, um Ihr Konto zu erstellen:
                      </p>
                      <table role="presentation" style="margin: 0 auto;">
                        <tr>
                          <td style="border-radius: 6px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                            <a href="${invitationUrl}" style="display: inline-block; padding: 16px 32px; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 16px;">
                              Konto erstellen
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                        Oder kopieren Sie diesen Link in Ihren Browser:
                      </p>
                      <p style="margin: 10px 0 0; color: #667eea; font-size: 14px; word-break: break-all;">
                        ${invitationUrl}
                      </p>
                      <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.6;">
                          Diese Einladung ist 7 Tage gültig und kann nur einmal verwendet werden.
                        </p>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 20px 30px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
                      <p style="margin: 0; color: #6b7280; font-size: 12px;">
                        © ${new Date().getFullYear()} AI Receptionist. Alle Rechte vorbehalten.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      const text = `
Einladung zum AI Receptionist Dashboard

Hallo,

${invitation.inviter.name} hat Sie eingeladen, dem AI Receptionist Dashboard für ${invitation.client.name} beizutreten.

Ihre Rolle: ${invitation.role === 'ADMIN' ? 'Administrator' : 'Mitarbeiter'}

Um Ihr Konto zu erstellen, besuchen Sie bitte:
${invitationUrl}

Diese Einladung ist 7 Tage gültig und kann nur einmal verwendet werden.

© ${new Date().getFullYear()} AI Receptionist
      `.trim();

      // Send email
      const result = await emailService.sendEmail(
        invitation.email,
        subject,
        html,
        text
      );

      if (!result.success) {
        logger.error(
          { error: result.error, invitationId: invitation.id },
          'Failed to send invitation email'
        );
        throw new Error('Failed to send invitation email');
      }

      logger.info(
        { invitationId: invitation.id, email: invitation.email },
        'Invitation email sent successfully'
      );
    } catch (err) {
      logger.error({ err, invitationId: invitation.id }, 'Error sending invitation email');
      throw err;
    }
  }

  /**
   * Generate unique invitation token
   */
  private generateInvitationToken(): string {
    const timestamp = Date.now().toString(36);
    const random1 = Math.random().toString(36).substring(2, 15);
    const random2 = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${random1}-${random2}`;
  }
}

// Export singleton instance
export const invitationService = new InvitationService();
