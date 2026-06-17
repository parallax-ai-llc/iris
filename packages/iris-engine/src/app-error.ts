/**
 * Base application error.
 *
 * Relocated here from `core/server/src/core/errors/app-error.ts` so the engine
 * (and its error classes in `./errors`) can carry HTTP-mappable errors without
 * depending on the server. The server now re-exports THIS class from its old
 * path, so class identity is preserved: every `instanceof AppError` check across
 * the server keeps working, and engine-thrown errors are recognized as
 * AppErrors by the server's global error handler.
 *
 * Framework-agnostic: just `Error` + `statusCode` / `code` / `details`. The
 * open-source local host maps these to HTTP responses with its own handler.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 400,
    code: string = 'APP_ERROR',
    details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
