export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'CONFIGURATION_ERROR'
  | 'METADATA_UNAVAILABLE'
  | 'METADATA_PARSE_ERROR'
  | 'D365_UPSTREAM_ERROR'
  | 'D365_AUTH_ERROR'
  | 'AI_UNAVAILABLE'
  | 'AI_AUTH_ERROR'
  | 'AI_MODEL_ERROR'
  | 'AI_RATE_LIMITED'
  | 'AI_CONTEXT_LENGTH'
  | 'AI_INVALID_RESPONSE'
  | 'TOOL_ERROR'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly publicMessage: string;
  readonly details?: Record<string, unknown>;
  readonly retryAfterSeconds?: number;

  constructor(options: {
    status: number;
    code: ErrorCode;
    publicMessage: string;
    message?: string;
    details?: Record<string, unknown>;
    retryAfterSeconds?: number;
    cause?: unknown;
  }) {
    super(options.message ?? options.publicMessage, { cause: options.cause });
    this.name = 'AppError';
    this.status = options.status;
    this.code = options.code;
    this.publicMessage = options.publicMessage;
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({ status: 400, code: 'VALIDATION_ERROR', publicMessage: message, details });
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required.') {
    super({ status: 401, code: 'UNAUTHORIZED', publicMessage: message });
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super({ status: 403, code: 'FORBIDDEN', publicMessage: message });
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found.') {
    super({ status: 404, code: 'NOT_FOUND', publicMessage: message });
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number, message = 'Too many requests. Please try again shortly.') {
    super({
      status: 429,
      code: 'RATE_LIMITED',
      publicMessage: message,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)),
    });
    this.name = 'RateLimitError';
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({ status: 503, code: 'CONFIGURATION_ERROR', publicMessage: message, details });
    this.name = 'ConfigurationError';
  }
}

export class MetadataError extends AppError {
  constructor(message: string, options: { code?: 'METADATA_UNAVAILABLE' | 'METADATA_PARSE_ERROR'; cause?: unknown } = {}) {
    super({
      status: 503,
      code: options.code ?? 'METADATA_UNAVAILABLE',
      publicMessage: message,
      cause: options.cause,
    });
    this.name = 'MetadataError';
  }
}

export class D365Error extends AppError {
  constructor(options: {
    upstreamStatus?: number;
    code?: 'D365_UPSTREAM_ERROR' | 'D365_AUTH_ERROR';
    publicMessage: string;
    message?: string;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    const status = options.upstreamStatus === 401 || options.upstreamStatus === 403 ? 502 : 502;
    super({
      status,
      code: options.code ?? 'D365_UPSTREAM_ERROR',
      publicMessage: options.publicMessage,
      message: options.message,
      details: options.details,
      cause: options.cause,
    });
    this.name = 'D365Error';
  }
}

export class AIProviderError extends AppError {
  constructor(options: {
    code: 'AI_UNAVAILABLE' | 'AI_AUTH_ERROR' | 'AI_MODEL_ERROR' | 'AI_RATE_LIMITED' | 'AI_CONTEXT_LENGTH' | 'AI_INVALID_RESPONSE';
    publicMessage: string;
    message?: string;
    retryAfterSeconds?: number;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    const status = options.code === 'AI_RATE_LIMITED' ? 429 : 502;
    super({
      status,
      code: options.code,
      publicMessage: options.publicMessage,
      message: options.message,
      retryAfterSeconds: options.retryAfterSeconds,
      details: options.details,
      cause: options.cause,
    });
    this.name = 'AIProviderError';
  }
}

export interface PublicErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
    retryAfterSeconds?: number;
  };
}

/**
 * Converts any thrown value to a safe, user-facing error body. Internal
 * details, stack traces and upstream secrets are never included.
 */
export function toPublicError(error: unknown): { status: number; body: PublicErrorBody } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.publicMessage,
          ...(error.details ? { details: error.details } : {}),
          ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred. Please try again.',
      },
    },
  };
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('name' in error && (error as { name?: string }).name === 'AbortError')
  );
}
