import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationException } from './exceptions';

export function validate(schema: z.ZodType, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const message = result.error.issues.map((e) => e.message).join(', ');
      return next(new ValidationException(message));
    }
    req[source] = result.data;
    next();
  };
}
