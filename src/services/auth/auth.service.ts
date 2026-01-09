import bcrypt from 'bcrypt';
import { User, Session } from '@prisma/client';
import { prisma } from '../../server.js';
import { env } from '../../config/env.js';
import pino from 'pino';

const logger = pino({ name: 'auth-service' });

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role: 'ADMIN' | 'STAFF';
  clientId: string;
  invitedBy?: string;
}

export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface JWTPayload {
  userId: string;
  clientId: string;
  role: 'ADMIN' | 'STAFF';
  email: string;
  jti: string; // Session token ID
  iat: number;
  exp: number;
}

export interface PasswordValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Authentication Service
 * Handles password hashing, JWT operations, user management, and sessions
 */
class AuthService {
  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    const hash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
    return hash;
  }

  /**
   * Verify a password against its hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    const isValid = await bcrypt.compare(password, hash);
    return isValid;
  }

  /**
   * Validate password strength
   */
  validatePasswordStrength(password: string): PasswordValidation {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate access token (JWT)
   * Short-lived token for API authentication
   */
  generateAccessToken(user: User, sessionToken: string): string {
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: user.id,
      clientId: user.clientId,
      role: user.role,
      email: user.email,
      jti: sessionToken,
    };

    // Calculate expiration in seconds
    const expiryTime = env.JWT_ACCESS_EXPIRY;
    const expirySeconds = this.parseExpiry(expiryTime);

    const now = Math.floor(Date.now() / 1000);
    const token = Buffer.from(
      JSON.stringify({
        ...payload,
        iat: now,
        exp: now + expirySeconds,
      })
    ).toString('base64');

    return token;
  }

  /**
   * Generate refresh token
   * Long-lived token for refreshing access tokens
   */
  generateRefreshToken(user: User, sessionToken: string): string {
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: user.id,
      clientId: user.clientId,
      role: user.role,
      email: user.email,
      jti: sessionToken,
    };

    const expiryTime = env.JWT_REFRESH_EXPIRY;
    const expirySeconds = this.parseExpiry(expiryTime);

    const now = Math.floor(Date.now() / 1000);
    const token = Buffer.from(
      JSON.stringify({
        ...payload,
        iat: now,
        exp: now + expirySeconds,
        refresh: true,
      })
    ).toString('base64');

    return token;
  }

  /**
   * Parse expiry time string (e.g., "15m", "7d") to seconds
   */
  private parseExpiry(expiryStr: string): number {
    const match = expiryStr.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiry format: ${expiryStr}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };

    return value * multipliers[unit];
  }

  /**
   * Verify and decode JWT token
   */
  async verifyToken(token: string): Promise<JWTPayload> {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
      const now = Math.floor(Date.now() / 1000);

      if (!decoded.exp || decoded.exp < now) {
        throw new Error('Token expired');
      }

      if (!decoded.userId || !decoded.clientId || !decoded.role || !decoded.email || !decoded.jti) {
        throw new Error('Invalid token payload');
      }

      return decoded as JWTPayload;
    } catch (err) {
      throw new Error('Invalid token');
    }
  }

  /**
   * Authenticate user with email and password
   */
  async login(
    email: string,
    password: string
  ): Promise<{ user: User; accessToken: string; refreshToken: string; sessionId: string }> {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Generate session token (unique identifier)
    const sessionToken = this.generateSessionToken();

    // Calculate expiration times
    const accessExpiry = this.parseExpiry(env.JWT_ACCESS_EXPIRY);
    const refreshExpiry = this.parseExpiry(env.JWT_REFRESH_EXPIRY);

    // Create session in database
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        token: sessionToken,
        refreshToken: this.generateRefreshTokenId(),
        expiresAt: new Date(Date.now() + accessExpiry * 1000),
        refreshExpiresAt: new Date(Date.now() + refreshExpiry * 1000),
        isActive: true,
      },
    });

    // Generate JWT tokens
    const accessToken = this.generateAccessToken(user, sessionToken);
    const refreshToken = this.generateRefreshToken(user, session.refreshToken!);

    // Update last login timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    logger.info({ userId: user.id, email: user.email }, 'User logged in successfully');

    return {
      user,
      accessToken,
      refreshToken,
      sessionId: session.id,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      // Decode refresh token
      const decoded = await this.verifyToken(refreshToken);

      // Find session by refresh token identifier
      const session = await prisma.session.findFirst({
        where: {
          refreshToken: decoded.jti,
          isActive: true,
          refreshExpiresAt: { gte: new Date() },
        },
        include: { user: true },
      });

      if (!session) {
        throw new Error('Invalid or expired refresh token');
      }

      // Check if user is still active
      if (!session.user.isActive) {
        throw new Error('Account is deactivated');
      }

      // Generate new session token
      const newSessionToken = this.generateSessionToken();

      // Update session with new token and expiration
      const accessExpiry = this.parseExpiry(env.JWT_ACCESS_EXPIRY);
      await prisma.session.update({
        where: { id: session.id },
        data: {
          token: newSessionToken,
          expiresAt: new Date(Date.now() + accessExpiry * 1000),
          lastUsedAt: new Date(),
        },
      });

      // Generate new access token
      const accessToken = this.generateAccessToken(session.user, newSessionToken);

      logger.info({ userId: session.user.id }, 'Access token refreshed');

      return { accessToken };
    } catch (err) {
      throw new Error('Failed to refresh token');
    }
  }

  /**
   * Logout user by invalidating session
   */
  async logout(sessionToken: string): Promise<void> {
    await prisma.session.updateMany({
      where: { token: sessionToken },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });

    logger.info({ sessionToken }, 'User logged out');
  }

  /**
   * Create new user
   */
  async createUser(data: CreateUserInput): Promise<User> {
    // Validate password strength
    const validation = this.validatePasswordStrength(data.password);
    if (!validation.valid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (existingUser) {
      throw new Error('Email already in use');
    }

    // Hash password
    const passwordHash = await this.hashPassword(data.password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        name: data.name,
        role: data.role,
        clientId: data.clientId,
        invitedBy: data.invitedBy,
        invitedAt: new Date(),
        isActive: true,
        emailVerified: false,
      },
    });

    logger.info({ userId: user.id, email: user.email }, 'User created successfully');

    return user;
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  /**
   * Create session
   */
  async createSession(userId: string, token: string, metadata: SessionMetadata): Promise<Session> {
    const accessExpiry = this.parseExpiry(env.JWT_ACCESS_EXPIRY);
    const refreshExpiry = this.parseExpiry(env.JWT_REFRESH_EXPIRY);

    const session = await prisma.session.create({
      data: {
        userId,
        token,
        refreshToken: this.generateRefreshTokenId(),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        expiresAt: new Date(Date.now() + accessExpiry * 1000),
        refreshExpiresAt: new Date(Date.now() + refreshExpiry * 1000),
        isActive: true,
      },
    });

    return session;
  }

  /**
   * Invalidate session
   */
  async invalidateSession(sessionId: string): Promise<void> {
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Clean up expired sessions
   * Called by scheduled job daily
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { isActive: false },
        ],
      },
    });

    logger.info({ count: result.count }, 'Expired sessions cleaned up');

    return result.count;
  }

  /**
   * Generate unique session token
   */
  private generateSessionToken(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Generate unique refresh token identifier
   */
  private generateRefreshTokenId(): string {
    return `refresh-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
}

// Export singleton instance
export const authService = new AuthService();
