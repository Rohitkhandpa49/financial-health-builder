import type { Request, RequestHandler } from "express";
import { z, type ZodType } from "zod";
import type { AnalyticsDateRangeQuery } from "../../../../packages/contracts/src/analytics/analytics.js";
import { HttpError } from "../http/errors.js";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
  .refine((v) => !isNaN(new Date(v).getTime()), "Date must be a valid calendar date.");

export const analyticsDateRangeSchema = z
  .strictObject({
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.endDate >= data.startDate;
      }
      return true;
    },
    { message: "endDate must be on or after startDate", path: ["endDate"] },
  );

declare global {
  namespace Express {
    interface Request {
      validatedAnalyticsQuery?: AnalyticsDateRangeQuery;
    }
  }
}

function validationError(error: z.ZodError): HttpError {
  return new HttpError({
    statusCode: 400,
    code: "VALIDATION_ERROR",
    message: "The request is invalid.",
    details: {
      fields: error.issues.map((issue) => ({
        field: issue.path.join("."),
        code: issue.code,
        message: issue.message,
      })),
    },
  });
}

function validate<T>(
  schema: ZodType<T>,
  read: (request: Request) => unknown,
  write: (request: Request, value: T) => void,
): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(read(request));
    if (!result.success) {
      next(validationError(result.error));
      return;
    }
    write(request, result.data);
    next();
  };
}

export const validateAnalyticsDateRange = validate<AnalyticsDateRangeQuery>(
  analyticsDateRangeSchema,
  (request) => request.query,
  (request, query) => { request.validatedAnalyticsQuery = query; },
);

export function getValidatedAnalyticsQuery(request: Request): AnalyticsDateRangeQuery {
  return request.validatedAnalyticsQuery ?? {};
}
