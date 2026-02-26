import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { AuthRequest } from '../../middleware/auth.middleware';
import { InvalidCredentialsException } from '../../shared/exceptions';
import { setRefreshCookie, clearRefreshCookie, getRefreshCookie } from '../../shared/cookie';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private mapUserToResponse(user: {
    userId: string;
    username: string;
    displayUsername: string;
    email: string;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    return {
      id: user.userId,
      username: user.username,
      display_username: user.displayUsername,
      email: user.email,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
    };
  }

  register = async (req: Request, res: Response): Promise<void> => {
    const { username, email, password } = req.body;
    const result = await this.authService.register(username, email, password);

    setRefreshCookie(res, result.refreshToken);
    res.status(201).json({
      user: this.mapUserToResponse(result.user),
      token: result.token,
      refreshToken: result.refreshToken,
    });
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const { username, password } = req.body;
    const result = await this.authService.login(username, password);

    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({
      user: this.mapUserToResponse(result.user),
      token: result.token,
      refreshToken: result.refreshToken,
    });
  };

  me = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) return next(new InvalidCredentialsException('User ID not found'));

    const user = await this.authService.getCurrentUser(userId);
    res.status(200).json({ user: this.mapUserToResponse(user) });
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const refreshToken = getRefreshCookie(req.cookies) || req.body?.refreshToken;
    if (!refreshToken) {
      return next(new InvalidCredentialsException('Refresh token is required'));
    }

    const result = await this.authService.refreshAccessToken(refreshToken);
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({
      user: this.mapUserToResponse(result.user),
      token: result.token,
      refreshToken: result.refreshToken,
    });
  };

  logout = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) return next(new InvalidCredentialsException('User ID not found'));

    await this.authService.logout(userId);
    clearRefreshCookie(res);
    res.status(200).json({ message: 'Logged out successfully' });
  };
}
