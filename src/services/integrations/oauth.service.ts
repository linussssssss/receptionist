import { google } from 'googleapis';
import { prisma } from '../../server.js';
import { env } from '../../config/env.js';
import type { OAuthTokens, GoogleCalendarConfig } from '../../types/google-calendar.js';

export class OAuthService {
  private oauth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      env.GOOGLE_CALENDAR_CLIENT_ID,
      env.GOOGLE_CALENDAR_CLIENT_SECRET,
      env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:3001/settings/integrations/callback'
    );
  }

  /**
   * Generate OAuth authorization URL for client
   */
  generateAuthUrl(clientId: string): string {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline', // Required for refresh token
      scope: [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.readonly',
      ],
      state: clientId, // Pass clientId in state parameter
      prompt: 'consent', // Force consent screen to always get refresh token
    });

    return authUrl;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string, clientId: string): Promise<OAuthTokens> {
    const { tokens } = await this.oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Failed to obtain access or refresh token');
    }

    const oauthTokens: OAuthTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expiry_date || Date.now() + 3600 * 1000, // Default 1 hour
      scope: tokens.scope || '',
      tokenType: tokens.token_type || 'Bearer',
    };

    // Store tokens in database
    await this.storeTokens(clientId, oauthTokens);

    return oauthTokens;
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidAccessToken(clientId: string): Promise<string> {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client?.integrations) {
      throw new Error('Client not found or has no integrations');
    }

    const config = (client.integrations as any).googleCalendar as GoogleCalendarConfig | undefined;

    if (!config || !config.enabled) {
      throw new Error('Google Calendar integration not enabled for this client');
    }

    // Check if token is expired (with 5 minute buffer)
    const now = Date.now();
    const expirationBuffer = 5 * 60 * 1000; // 5 minutes

    if (config.expiresAt < now + expirationBuffer) {
      // Token expired or expiring soon, refresh it
      const newTokens = await this.refreshAccessToken(clientId, config.refreshToken);
      return newTokens.accessToken;
    }

    return config.accessToken;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(clientId: string, refreshToken: string): Promise<OAuthTokens> {
    this.oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const { credentials } = await this.oauth2Client.refreshAccessToken();

    if (!credentials.access_token) {
      throw new Error('Failed to refresh access token');
    }

    const oauthTokens: OAuthTokens = {
      accessToken: credentials.access_token,
      refreshToken: refreshToken, // Refresh token stays the same
      expiresAt: credentials.expiry_date || Date.now() + 3600 * 1000,
      scope: credentials.scope || '',
      tokenType: credentials.token_type || 'Bearer',
    };

    // Update tokens in database
    await this.storeTokens(clientId, oauthTokens);

    return oauthTokens;
  }

  /**
   * Store tokens in database
   */
  async storeTokens(clientId: string, tokens: OAuthTokens): Promise<void> {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      throw new Error('Client not found');
    }

    const integrations = (client.integrations as any) || {};

    const googleCalendarConfig: GoogleCalendarConfig = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      calendarId: 'primary', // Default to primary calendar
      enabled: true,
      connectedAt: integrations.googleCalendar?.connectedAt || new Date().toISOString(),
      lastSyncAt: integrations.googleCalendar?.lastSyncAt,
    };

    await prisma.client.update({
      where: { id: clientId },
      data: {
        integrations: {
          ...integrations,
          googleCalendar: googleCalendarConfig,
        },
      },
    });
  }

  /**
   * Revoke access and disconnect
   */
  async revokeAccess(clientId: string): Promise<void> {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client?.integrations) {
      throw new Error('Client not found or has no integrations');
    }

    const config = (client.integrations as any).googleCalendar as GoogleCalendarConfig | undefined;

    if (!config) {
      throw new Error('Google Calendar not connected for this client');
    }

    // Revoke token with Google
    try {
      this.oauth2Client.setCredentials({
        access_token: config.accessToken,
      });
      await this.oauth2Client.revokeCredentials();
    } catch (err) {
      // Continue even if revocation fails (token might already be invalid)
      console.error('Failed to revoke credentials:', err);
    }

    // Delete webhook if exists
    const webhook = await prisma.calendarWebhook.findUnique({
      where: { clientId },
    });

    if (webhook) {
      await prisma.calendarWebhook.delete({
        where: { clientId },
      });
    }

    // Remove Google Calendar config from integrations
    const integrations = (client.integrations as any) || {};
    delete integrations.googleCalendar;

    await prisma.client.update({
      where: { id: clientId },
      data: {
        integrations,
      },
    });
  }

  /**
   * Get OAuth2 client configured with client's credentials
   */
  async getOAuth2Client(clientId: string) {
    const accessToken = await this.getValidAccessToken(clientId);

    const oauth2Client = new google.auth.OAuth2(
      env.GOOGLE_CALENDAR_CLIENT_ID,
      env.GOOGLE_CALENDAR_CLIENT_SECRET,
      env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:3001/settings/integrations/callback'
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
    });

    return oauth2Client;
  }
}

// Export singleton instance
export const oauthService = new OAuthService();
