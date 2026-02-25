import { Request, Response, NextFunction } from 'express';
import { AppException } from './exceptions';

export const errorHandler = (
  err: Error | AppException,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof AppException) {
    console.warn(`[${req.method}] ${req.path} - ${err.errorCode}: ${err.message}`);
    return res.status(err.statusCode).json({
      error: {
        code: err.errorCode,
        message: err.message,
      },
    });
  }

  console.error(`[${req.method}] ${req.path} - Unexpected error:`, err.message);
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
