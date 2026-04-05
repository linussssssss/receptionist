import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';

// Mock dependencies
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

vi.mock('../../server.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('../../config/env.js', () => ({
  env: {
    BCRYPT_ROUNDS: 4,
    JWT_SECRET: 'test-secret-minimum-32-characters-long',
    JWT_ACCESS_EXPIRY: '15m',
    JWT_REFRESH_EXPIRY: '7d',
  },
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { authService } from './auth.service.js';
import { prisma } from '../../server.js';

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hashPassword', () => {
    it('calls bcrypt.hash with correct rounds', async () => {
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never);

      const result = await authService.hashPassword('mypassword');

      expect(bcrypt.hash).toHaveBeenCalledWith('mypassword', 4);
      expect(result).toBe('hashed-password');
    });
  });

  describe('verifyPassword', () => {
    it('returns true for correct password', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await authService.verifyPassword('password', 'hash');

      expect(bcrypt.compare).toHaveBeenCalledWith('password', 'hash');
      expect(result).toBe(true);
    });

    it('returns false for incorrect password', async () => {
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      const result = await authService.verifyPassword('wrong', 'hash');

      expect(result).toBe(false);
    });
  });

  describe('validatePasswordStrength', () => {
    it('returns valid for strong password', () => {
      const result = authService.validatePasswordStrength('SecureP@ss1');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error for short password', () => {
      const result = authService.validatePasswordStrength('Abc1@');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters long');
    });

    it('returns error for missing uppercase', () => {
      const result = authService.validatePasswordStrength('lowercase1@');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('returns error for missing lowercase', () => {
      const result = authService.validatePasswordStrength('UPPERCASE1@');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('returns error for missing number', () => {
      const result = authService.validatePasswordStrength('NoNumbers@abc');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('returns error for missing special character', () => {
      const result = authService.validatePasswordStrength('NoSpecial1abc');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });

    it('returns multiple errors for weak password', () => {
      const result = authService.validatePasswordStrength('weak');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('generateAccessToken', () => {
    it('generates a base64 encoded token', () => {
      const mockUser = {
        id: 'user-123',
        clientId: 'client-456',
        role: 'ADMIN' as const,
        email: 'test@example.com',
      };

      const token = authService.generateAccessToken(mockUser as any, 'session-token');

      expect(token).toBeTruthy();
      // Token should be base64 decodable
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
      expect(decoded.userId).toBe('user-123');
      expect(decoded.clientId).toBe('client-456');
      expect(decoded.role).toBe('ADMIN');
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.jti).toBe('session-token');
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it('sets correct expiration time', () => {
      const mockUser = {
        id: 'user-123',
        clientId: 'client-456',
        role: 'ADMIN' as const,
        email: 'test@example.com',
      };

      const token = authService.generateAccessToken(mockUser as any, 'session-token');
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));

      // 15 minutes = 900 seconds
      expect(decoded.exp - decoded.iat).toBe(900);
    });
  });

  describe('generateRefreshToken', () => {
    it('generates a refresh token with refresh flag', () => {
      const mockUser = {
        id: 'user-123',
        clientId: 'client-456',
        role: 'ADMIN' as const,
        email: 'test@example.com',
      };

      const token = authService.generateRefreshToken(mockUser as any, 'session-token');
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));

      expect(decoded.refresh).toBe(true);
    });

    it('sets 7 day expiration', () => {
      const mockUser = {
        id: 'user-123',
        clientId: 'client-456',
        role: 'ADMIN' as const,
        email: 'test@example.com',
      };

      const token = authService.generateRefreshToken(mockUser as any, 'session-token');
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));

      // 7 days = 604800 seconds
      expect(decoded.exp - decoded.iat).toBe(604800);
    });
  });

  describe('verifyToken', () => {
    it('returns payload for valid token', async () => {
      const payload = {
        userId: 'user-123',
        clientId: 'client-456',
        role: 'ADMIN',
        email: 'test@example.com',
        jti: 'session-token',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const token = Buffer.from(JSON.stringify(payload)).toString('base64');

      const result = await authService.verifyToken(token);

      expect(result.userId).toBe('user-123');
      expect(result.role).toBe('ADMIN');
    });

    it('throws for expired token', async () => {
      const payload = {
        userId: 'user-123',
        clientId: 'client-456',
        role: 'ADMIN',
        email: 'test@example.com',
        jti: 'session-token',
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      };
      const token = Buffer.from(JSON.stringify(payload)).toString('base64');

      await expect(authService.verifyToken(token)).rejects.toThrow('Invalid token');
    });

    it('throws for malformed token', async () => {
      await expect(authService.verifyToken('not-valid-base64!')).rejects.toThrow('Invalid token');
    });

    it('throws for missing required fields', async () => {
      const payload = {
        userId: 'user-123',
        // Missing other required fields
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const token = Buffer.from(JSON.stringify(payload)).toString('base64');

      await expect(authService.verifyToken(token)).rejects.toThrow('Invalid token');
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed',
        clientId: 'client-456',
        role: 'ADMIN',
        isActive: true,
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(prisma.session.create).mockResolvedValue({
        id: 'session-123',
        token: 'session-token',
        refreshToken: 'refresh-token-id',
      } as any);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser as any);

      const result = await authService.login('test@example.com', 'password');

      expect(result.user).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.sessionId).toBe('session-123');
    });

    it('throws for non-existent user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      await expect(authService.login('unknown@example.com', 'password'))
        .rejects.toThrow('Invalid credentials');
    });

    it('throws for inactive user', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed',
        isActive: false,
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);

      await expect(authService.login('test@example.com', 'password'))
        .rejects.toThrow('Account is deactivated');
    });

    it('throws for wrong password', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed',
        isActive: true,
      };

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(authService.login('test@example.com', 'wrongpassword'))
        .rejects.toThrow('Invalid credentials');
    });

    it('normalizes email to lowercase', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      try {
        await authService.login('TEST@EXAMPLE.COM', 'password');
      } catch {}

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });
  });

  describe('logout', () => {
    it('invalidates the session', async () => {
      vi.mocked(prisma.session.updateMany).mockResolvedValue({ count: 1 } as any);

      await authService.logout('session-token');

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { token: 'session-token' },
        data: expect.objectContaining({
          isActive: false,
          revokedAt: expect.any(Date),
        }),
      });
    });
  });

  describe('createUser', () => {
    it('creates user with hashed password', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never);
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: 'new-user',
        email: 'new@example.com',
      } as any);

      const result = await authService.createUser({
        email: 'NEW@example.com',
        password: 'SecureP@ss1',
        name: 'New User',
        role: 'ADMIN',
        clientId: 'client-123',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'new@example.com', // Normalized to lowercase
          passwordHash: 'hashed-password',
          name: 'New User',
          role: 'ADMIN',
        }),
      });
      expect(result.id).toBe('new-user');
    });

    it('throws for weak password', async () => {
      await expect(
        authService.createUser({
          email: 'test@example.com',
          password: 'weak',
          name: 'Test',
          role: 'ADMIN',
          clientId: 'client-123',
        })
      ).rejects.toThrow('Password validation failed');
    });

    it('throws for duplicate email', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'existing' } as any);

      await expect(
        authService.createUser({
          email: 'existing@example.com',
          password: 'SecureP@ss1',
          name: 'Test',
          role: 'ADMIN',
          clientId: 'client-123',
        })
      ).rejects.toThrow('Email already in use');
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('deletes expired and inactive sessions', async () => {
      vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 5 } as any);

      const count = await authService.cleanupExpiredSessions();

      expect(count).toBe(5);
      expect(prisma.session.deleteMany).toHaveBeenCalled();
    });
  });
});
