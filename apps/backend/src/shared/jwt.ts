import * as jwt from 'jsonwebtoken';

export interface JwtPayload {
  sub: string;
  userId: string;
  username: string;
  type: 'access' | 'refresh';
}

const getSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 64) {
    throw new Error('JWT_SECRET must be at least 64 characters');
  }
  return secret;
};

export function signToken(payload: JwtPayload, options: { expiresIn: string }): string {
  return jwt.sign(payload, getSecret() as jwt.Secret, {
    algorithm: 'HS256',
    expiresIn: options.expiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, getSecret() as jwt.Secret, {
    algorithms: ['HS256'],
  }) as jwt.JwtPayload;

  return {
    sub: decoded.sub as string,
    userId: (decoded.userId as string) ?? (decoded.sub as string),
    username: decoded.username as string,
    type: decoded.type as 'access' | 'refresh',
  };
}
