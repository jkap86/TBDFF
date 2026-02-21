export const ErrorCode = {
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppException extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode: ErrorCodeType = ErrorCode.UNKNOWN_ERROR
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationException extends AppException {
  constructor(message: string) {
    super(message, 400, ErrorCode.VALIDATION_ERROR);
  }
}

export class InvalidCredentialsException extends AppException {
  constructor(message: string = 'Invalid credentials') {
    super(message, 401, ErrorCode.INVALID_CREDENTIALS);
  }
}

export class ConflictException extends AppException {
  constructor(message: string) {
    super(message, 409, ErrorCode.CONFLICT);
  }
}

export class NotFoundException extends AppException {
  constructor(message: string = 'Not found') {
    super(message, 404, ErrorCode.NOT_FOUND);
  }
}

export class ForbiddenException extends AppException {
  constructor(message: string = 'Forbidden') {
    super(message, 403, ErrorCode.FORBIDDEN);
  }
}
