import { isAppException } from '../common/exceptions/app.exception';
import { ErrorCode } from './error-codes';

/**
 * Standardized error response format.
 * Extracts code and userMessage from AppException when available.
 */
export const errorResponse = (error: any) => {
  // Handle AppException with structured error codes
  if (isAppException(error)) {
    const response = error.getResponse() as {
      code: ErrorCode;
      message: string;
      userMessage: string | null;
    };
    return {
      statusCode: error.getStatus(),
      code: response.code,
      message: response.message,
      userMessage: response.userMessage,
      error: error.name || 'AppException',
      data: null,
    };
  }

  // Handle NestJS HttpException with structured response (existing pattern in codebase)
  if (error?.response && typeof error.response === 'object') {
    const response = error.response;
    return {
      statusCode: error?.status || error?.statusCode || 400,
      code: response.code || ErrorCode.BAD_REQUEST,
      message: response.message || error.message || 'Bad Request',
      userMessage: response.userMessage || null,
      error: error.name || 'HttpException',
      data: null,
    };
  }

  // Handle plain string errors
  if (typeof error === 'string') {
    return {
      statusCode: 400,
      code: ErrorCode.BAD_REQUEST,
      message: error,
      userMessage: null,
      error: 'Error',
      data: null,
    };
  }

  // Handle generic errors
  return {
    statusCode: error?.statusCode || error?.status || 400,
    code: ErrorCode.BAD_REQUEST,
    message: error?.message || 'Bad Request',
    userMessage: null,
    error: error?.name || 'Error',
    data: null,
  };
};

export const successResponse = (
  data: object,
  message: string,
  statusCode?: number,
) => {
  return {
    statusCode: statusCode || 200,
    message: message,
    data: data,
    error: null,
  };
};
