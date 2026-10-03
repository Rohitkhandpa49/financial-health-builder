import type { Request, RequestHandler } from "express";
import { z, type ZodType } from "zod";
import { HttpError } from "../http/errors.js";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
  .refine((v) => !isNaN(new Date(v).getTime()), "Date must be a valid calendar date.");

const yearSchema = z.coerce.number().int().min(2000).max(2100);
const monthSchema = z.coerce.number().int().min(1).max(12);

export const reportDateRangeSchema = z
  .strictObject({
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) return data.endDate >= data.startDate;
      return true;
    },
    { message: "endDate must be on or after startDate", path: ["endDate"] },
  );

export const monthlyReportQuerySchema = z.strictObject({
  year: yearSchema.optional(),
  month: monthSchema.optional(),
});

export const yearlyReportQuerySchema = z.strictObject({
  year: yearSchema.optional(),
});

export interface ReportDateRangeQuery {
  startDate?: string;
  endDate?: string;
}

export interface MonthlyReportQuery {
  year?: number;
  month?: number;
}

export interface YearlyReportQuery {
  year?: number;
}

declare global {
  namespace Express {
    interface Request {
      validatedReportDateRange?: ReportDateRangeQuery;
      validatedMonthlyQuery?: MonthlyReportQuery;
      validatedYearlyQuery?: YearlyReportQuery;
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

export const validateReportDateRange = validate<ReportDateRangeQuery>(
  reportDateRangeSchema,
  (req) => req.query,
  (req, v) => { req.validatedReportDateRange = v; },
);

export const validateMonthlyQuery = validate<MonthlyReportQuery>(
  monthlyReportQuerySchema,
  (req) => req.query,
  (req, v) => { req.validatedMonthlyQuery = v; },
);

export const validateYearlyQuery = validate<YearlyReportQuery>(
  yearlyReportQuerySchema,
  (req) => req.query,
  (req, v) => { req.validatedYearlyQuery = v; },
);

export function getValidatedReportDateRange(request: Request): ReportDateRangeQuery {
  return request.validatedReportDateRange ?? {};
}

export function getValidatedMonthlyQuery(request: Request): MonthlyReportQuery {
  return request.validatedMonthlyQuery ?? {};
}

export function getValidatedYearlyQuery(request: Request): YearlyReportQuery {
  return request.validatedYearlyQuery ?? {};
}

export const csvExportQuerySchema = z
  .strictObject({
    type: z.enum(['transactions']),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    },
    { message: 'startDate must be before or equal to endDate' },
  );

export type CsvExportQuery = z.infer<typeof csvExportQuerySchema>;

declare global {
  namespace Express {
    interface Request {
      validatedCsvExportQuery?: CsvExportQuery;
    }
  }
}

export const validateCsvExportQuery = validate<CsvExportQuery>(
  csvExportQuerySchema,
  (req) => req.query,
  (req, v) => { req.validatedCsvExportQuery = v; },
);
