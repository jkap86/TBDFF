import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../auth.service';
import { User } from '../auth.model';
import { UserRepository } from '../auth.repository';
import crypto from 'crypto';

// Stable test data
const NOW = new Date('2025-01-01T00:00:00Z');
const TEST_USER = new User(
  'user-123',
  'testuser',
  'TestUser',
  'test@example.com',
  '$2b$10$hashedpassword', // bcrypt hash placeholder
  NOW,
  NOW,
);

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$10$mockhash'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

// Mock jwt module — return deterministic tokens
vi.mock('../../../shared/jwt', () => ({
  signToken: vi.fn((payload: { type: string }) =>
    payload.type === 'access' ? 'mock-access-token' : 'mock-refresh-token',
  ),
  verifyToken: vi.fn(() => ({
    sub: 'user-123',
    userId: 'user-123',
    username: 'testuser',
    type: 'refresh',
  })),
}));

function createMockRepo(): UserRepository {
  return {
    findByUsername: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    usernameExists: vi.fn(),
    emailExists: vi.fn(),
    updateRefreshToken: vi.fn(),
    clearRefreshToken: vi.fn(),
    getRefreshTokenWithExpiry: vi.fn(),
  } as unknown as UserRepository;
}

describe('AuthService', () => {
  let service: AuthService;
  let repo: ReturnType<typeof createMockRepo>;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = createMockRepo();
    service = new AuthService(repo);
  });

  describe('register', () => {
    it('creates user, returns tokens, and stores hashed refresh token', async () => {
      vi.mocked(repo.usernameExists).mockResolvedValue(false);
      vi.mocked(repo.emailExists).mockResolvedValue(false);
      vi.mocked(repo.create).mockResolvedValue(TEST_USER);
      vi.mocked(repo.updateRefreshToken).mockResolvedValue(undefined);

      const result = await service.register('TestUser', 'test@example.com', 'password123');

      expect(result.token).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(result.user.userId).toBe('user-123');
      expect(repo.create).toHaveBeenCalledOnce();
      expect(repo.updateRefreshToken).toHaveBeenCalledWith(
        'user-123',
        hashToken('mock-refresh-token'),
        expect.any(Date),
      );
    });

    it('rejects duplicate username', async () => {
      vi.mocked(repo.usernameExists).mockResolvedValue(true);

      await expect(
        service.register('TestUser', 'test@example.com', 'password123'),
      ).rejects.toThrow('Username already taken');
    });
  });

  describe('login', () => {
    it('validates password and returns tokens', async () => {
      vi.mocked(repo.findByUsername).mockResolvedValue(TEST_USER);
      vi.mocked(repo.updateRefreshToken).mockResolvedValue(undefined);
      const bcrypt = await import('bcrypt');
      vi.mocked(bcrypt.default.compare).mockResolvedValue(true as never);

      const result = await service.login('testuser', 'password123');

      expect(result.token).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(result.user.username).toBe('testuser');
    });

    it('rejects invalid credentials when user not found', async () => {
      vi.mocked(repo.findByUsername).mockResolvedValue(null);

      await expect(service.login('unknown', 'password123')).rejects.toThrow();
    });

    it('rejects invalid credentials when password is wrong', async () => {
      vi.mocked(repo.findByUsername).mockResolvedValue(TEST_USER);
      const bcrypt = await import('bcrypt');
      vi.mocked(bcrypt.default.compare).mockResolvedValue(false as never);

      await expect(service.login('testuser', 'wrongpassword')).rejects.toThrow();
    });
  });

  describe('refreshAccessToken', () => {
    it('validates token, rotates refresh token', async () => {
      vi.mocked(repo.findById).mockResolvedValue(TEST_USER);
      vi.mocked(repo.getRefreshTokenWithExpiry).mockResolvedValue({
        token: hashToken('mock-refresh-token'),
        expiresAt: new Date(Date.now() + 86400000),
      });
      vi.mocked(repo.updateRefreshToken).mockResolvedValue(undefined);

      const result = await service.refreshAccessToken('mock-refresh-token');

      expect(result.token).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(repo.updateRefreshToken).toHaveBeenCalledOnce();
    });

    it('rejects expired token', async () => {
      vi.mocked(repo.findById).mockResolvedValue(TEST_USER);
      vi.mocked(repo.getRefreshTokenWithExpiry).mockResolvedValue({
        token: hashToken('mock-refresh-token'),
        expiresAt: new Date(Date.now() - 1000), // expired
      });

      await expect(service.refreshAccessToken('mock-refresh-token')).rejects.toThrow(
        'Refresh token has expired',
      );
    });
  });

  describe('logout', () => {
    it('clears refresh token', async () => {
      vi.mocked(repo.clearRefreshToken).mockResolvedValue(undefined);

      await service.logout('user-123');

      expect(repo.clearRefreshToken).toHaveBeenCalledWith('user-123');
    });
  });
});
