import type { Request, RequestHandler } from "express";
import type { ZodType } from "zod";
import { HttpError } from "../http/errors.js";

declare global {
  namespace Express {
    interface Request {
      validatedBody?: unknown;
    }
  }
}

export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body);

    if (!result.success) {
      next(new HttpError({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "The request body is invalid.",
        details: {
          fields: result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            code: issue.code,
            message: issue.message,
          })),
        },
      }));
      return;
    }

    request.validatedBody = result.data;
    next();
  };
}

export function getValidatedBody<T>(request: Request): T {
  if (request.validatedBody === undefined) {
    throw new Error("Validated request body is unavailable.");
  }

  return request.validatedBody as T;
}