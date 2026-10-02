import type { ErrorRequestHandler, RequestHandler } from "express";
import type { ApiErrorResponse } from "../../../../packages/contracts/src/common/errors.js";

interface HttpErrorOptions {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(options: HttpErrorOptions) {
    super(options.message);
    this.name = "HttpError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
  }
}

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new HttpError({
    statusCode: 404,
    code: "NOT_FOUND",
    message: "The requested resource was not found.",
  }));
};

function hasParserErrorType(error: unknown, type: string): boolean {
  return typeof error === "object"
    && error !== null
    && "type" in error
    && error.type === type;
}

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  let statusCode = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "An unexpected error occurred.";
  let details: Record<string, unknown> | undefined;

  if (error instanceof HttpError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (hasParserErrorType(error, "entity.parse.failed")) {
    statusCode = 400;
    code = "INVALID_JSON";
    message = "Request body must be valid JSON.";
  } else if (hasParserErrorType(error, "entity.too.large")) {
    statusCode = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request body exceeds the allowed size.";
  } else {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error(JSON.stringify({
      event: "http.unhandled_error",
      requestId: request.requestId,
      errorName,
    }));
  }

  const responseBody: ApiErrorResponse = {
    error: {
      code,
      message,
      details: { ...details, requestId: request.requestId },
    },
  };

  response.status(statusCode).json(responseBody);
};