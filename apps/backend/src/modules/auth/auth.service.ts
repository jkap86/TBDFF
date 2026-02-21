import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { User } from './auth.model';
import { UserRepository } from './auth.repository';
import {
  ValidationException,
  InvalidCredentialsException,
  ConflictException,
} from '../../shared/exceptions';
import { signToken, verifyToken } from '../../shared/jwt';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface AuthResult {
  user: {
    userId: string;
    username: string;
    displayUsername: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
  };
  token: string;
  refreshToken: string;
}

export class AuthService {
  private readonly ACCESS_TOKEN_EXPIRY = '15m';
  private readonly REFRESH_TOKEN_EXPIRY = '30d';

  constructor(private readonly userRepository: UserRepository) {}

  async register(username: string, email: string, password: string): Promise<AuthResult> {
    const normalizedEmail = email.toLowerCase().trim();
    const trimmedUsername = username.trim();
    const normalizedUsername = trimmedUsername.toLowerCase();

    if (!User.isValidUsername(trimmedUsername)) {
      throw new ValidationException(
        'Username must be 3-20 characters and contain only letters, numbers, and underscores'
      );
    }

    if (password.length < User.MIN_PASSWORD_LENGTH) {
      throw new ValidationException(
        `Password must be at least ${User.MIN_PASSWORD_LENGTH} characters`
      );
    }

    if (await this.userRepository.usernameExists(normalizedUsername)) {
      throw new ConflictException('Username already taken');
    }

    if (await this.userRepository.emailExists(normalizedEmail)) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.userRepository.create(normalizedUsername, trimmedUsername, normalizedEmail, passwordHash);

    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.userRepository.updateRefreshToken(user.userId, hashToken(refreshToken), refreshExpiry);

    return { user: user.toSafeObject(), token: accessToken, refreshToken };
  }

  async login(username: string, password: string): Promise<AuthResult> {
    const user = await this.userRepository.findByUsername(username);
    if (!user) {
      throw new InvalidCredentialsException();
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new InvalidCredentialsException();
    }

    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.userRepository.updateRefreshToken(user.userId, hashToken(refreshToken), refreshExpiry);

    return { user: user.toSafeObject(), token: accessToken, refreshToken };
  }

  async getCurrentUser(userId: string) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new InvalidCredentialsException('User not found');
    }
    return user.toSafeObject();
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthResult> {
    try {
      const payload = verifyToken(refreshToken);

      if (payload.type !== 'refresh') {
        throw new InvalidCredentialsException('Invalid refresh token');
      }

      const user = await this.userRepository.findById(payload.sub);
      if (!user) {
        throw new InvalidCredentialsException('Invalid refresh token');
      }

      const { token: storedHash, expiresAt } = await this.userRepository.getRefreshTokenWithExpiry(
        user.userId
      );

      if (storedHash !== hashToken(refreshToken)) {
        throw new InvalidCredentialsException('Invalid refresh token');
      }

      if (!expiresAt || expiresAt < new Date()) {
        throw new InvalidCredentialsException('Refresh token has expired');
      }

      const newAccessToken = this.generateAccessToken(user);
      const newRefreshToken = this.generateRefreshToken(user);

      const refreshExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await this.userRepository.updateRefreshToken(user.userId, hashToken(newRefreshToken), refreshExpiry);

      return { user: user.toSafeObject(), token: newAccessToken, refreshToken: newRefreshToken };
    } catch (error) {
      if (error instanceof InvalidCredentialsException) throw error;
      throw new InvalidCredentialsException('Invalid refresh token');
    }
  }

  async logout(userId: string): Promise<void> {
    await this.userRepository.clearRefreshToken(userId);
  }

  private generateAccessToken(user: User): string {
    return signToken(
      { sub: user.userId, userId: user.userId, username: user.username, type: 'access' },
      { expiresIn: this.ACCESS_TOKEN_EXPIRY }
    );
  }

  private generateRefreshToken(user: User): string {
    return signToken(
      { sub: user.userId, userId: user.userId, username: user.username, type: 'refresh' },
      { expiresIn: this.REFRESH_TOKEN_EXPIRY }
    );
  }
}
