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
    if (source === 'query') {
      // req.query is a getter on IncomingMessage — mutate in place
      const q = req.query as Record<string, unknown>;
      for (const key of Object.keys(q)) delete q[key];
      Object.assign(q, result.data);
    } else {
      req[source] = result.data;
    }
    next();
  };
}
