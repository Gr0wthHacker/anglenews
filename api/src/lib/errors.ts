/**
 * Typed error classes for structured API error responses.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class RateLimitError extends AppError {
  public resetAt: string;

  constructor(resetAt: string) {
    super("Rate limit exceeded", 429, "RATE_LIMIT_EXCEEDED");
    this.name = "RateLimitError";
    this.resetAt = resetAt;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ExternalServiceError extends AppError {
  public cause?: Error;

  constructor(service: string, cause?: Error) {
    super(`External service error: ${service}`, 502, "EXTERNAL_SERVICE_ERROR");
    this.name = "ExternalServiceError";
    this.cause = cause;
  }
}
