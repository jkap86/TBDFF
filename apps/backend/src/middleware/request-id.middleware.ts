import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface RequestWithId extends Request {
  requestId: string;
}

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = crypto.randomUUID();
  (req as RequestWithId).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
};

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const { method, path } = req;
  const requestId = (req as RequestWithId).requestId;

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${method}] ${path} ${res.statusCode} ${duration}ms req=${requestId}`);
  });

  next();
};
