import { Request, Response, NextFunction } from 'express';
import { AppException } from './exceptions';
import { RequestWithId } from '../middleware/request-id.middleware';

export const errorHandler = (
  err: Error | AppException,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const requestId = (req as RequestWithId).requestId ?? 'unknown';

  if (err instanceof AppException) {
    console.warn(`[${req.method}] ${req.path} - ${err.errorCode}: ${err.message} req=${requestId}`);
    return res.status(err.statusCode).json({
      error: {
        code: err.errorCode,
        message: err.message,
      },
    });
  }

  console.error(`[${req.method}] ${req.path} - Unexpected error: ${err.message} req=${requestId}`);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An error occurred while processing your request',
    },
  });
};
