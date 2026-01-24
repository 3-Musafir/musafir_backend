import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../constants/error-codes';

/**
 * Custom application exception that includes:
 * - code: Machine-readable error code for frontend mapping
 * - message: Developer/debug message (logged, not shown to user by default)
 * - userMessage: Optional user-friendly message (safe to display)
 * - statusCode: HTTP status code
 *
 * Usage:
 * ```typescript
 * throw new AppException(
 *   ErrorCode.REFERRAL_USER_NOT_VERIFIED,
 *   'Referral codes must belong to verified users.',
 *   HttpStatus.BAD_REQUEST,
 *   'The referral codes you entered belong to unverified users. Please ask verified Musafirs for their codes.'
 * );
 * ```
 */
export class AppException extends HttpException {
  constructor(
    code: ErrorCode,
    message: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    userMessage?: string,
  ) {
    super(
      {
        code,
        message,
        userMessage: userMessage || null,
      },
      statusCode,
    );
  }

  /**
   * Get the error code
   */
  getCode(): ErrorCode {
    const response = this.getResponse() as { code: ErrorCode };
    return response.code;
  }

  /**
   * Get the user-facing message (if provided)
   */
  getUserMessage(): string | null {
    const response = this.getResponse() as { userMessage: string | null };
    return response.userMessage;
  }
}

/**
 * Helper function to create an AppException with common patterns
 */
export function createAppException(
  code: ErrorCode,
  message: string,
  statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
  userMessage?: string,
): AppException {
  return new AppException(code, message, statusCode, userMessage);
}

/**
 * Type guard to check if an error is an AppException
 */
export function isAppException(error: unknown): error is AppException {
  return error instanceof AppException;
}
