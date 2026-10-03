import type { Request, RequestHandler } from "express";
import { z, type ZodType } from "zod";
import {
  RECURRENCE_FREQUENCIES,
  RECURRING_TRANSACTION_TYPES,
  type RecurringTransactionListQuery,
  type CreateRecurringTransactionRequest,
  type UpdateRecurringTransactionRequest,
} from "../../../../packages/contracts/src/recurring-transactions/recurring-transactions.js";
import { HttpError } from "../http/errors.js";

const amountSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/, "Amount must be a positive decimal with at most four fractional digits.")
  .refine((v) => v.split(".")[0].length <= 15, "Amount exceeds DECIMAL(19,4) precision.");

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
  .refine((v) => !isNaN(new Date(v).getTime()), "Date must be a valid calendar date.");

const pageSchema = z.coerce.number().int().min(1).max(1_000_000).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(25);

export const createRecurringTransactionBodySchema = z.strictObject({
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  type: z.enum(RECURRING_TRANSACTION_TYPES),
  amount: amountSchema,
  description: z.string().trim().min(1).max(500),
  frequency: z.enum(RECURRENCE_FREQUENCIES),
  startDate: dateSchema,
  endDate: dateSchema.optional(),
  nextDate: dateSchema,
});

export const updateRecurringTransactionBodySchema = z.strictObject({
  categoryId: z.string().uuid().nullable().optional(),
  amount: amountSchema.optional(),
  description: z.string().trim().min(1).max(500).optional(),
  endDate: dateSchema.nullable().optional(),
  nextDate: dateSchema.optional(),
  active: z.boolean().optional(),
});

export const recurringTransactionIdParamsSchema = z.strictObject({
  recurringTransactionId: z.string().uuid(),
});

export const recurringTransactionListQuerySchema = z.strictObject({
  page: pageSchema,
  pageSize: pageSizeSchema,
  accountId: z.string().uuid().optional(),
  active: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});

declare global {
  namespace Express {
    interface Request {
      validatedRecurringTransactionBody?: unknown;
      validatedRecurringTransactionId?: string;
      validatedRecurringTransactionQuery?: RecurringTransactionListQuery;
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

export const validateCreateRecurringTransactionBody = validate<CreateRecurringTransactionRequest>(
  createRecurringTransactionBodySchema,
  (request) => request.body,
  (request, body) => { request.validatedRecurringTransactionBody = body; },
);

export const validateUpdateRecurringTransactionBody = validate<UpdateRecurringTransactionRequest>(
  updateRecurringTransactionBodySchema,
  (request) => request.body,
  (request, body) => { request.validatedRecurringTransactionBody = body; },
);

export const validateRecurringTransactionId = validate<{ recurringTransactionId: string }>(
  recurringTransactionIdParamsSchema,
  (request) => request.params,
  (request, params) => { request.validatedRecurringTransactionId = params.recurringTransactionId; },
);

export const validateRecurringTransactionListQuery = validate<RecurringTransactionListQuery>(
  recurringTransactionListQuerySchema,
  (request) => request.query,
  (request, query) => { request.validatedRecurringTransactionQuery = query; },
);

export function getValidatedRecurringTransactionBody<T>(request: Request): T {
  if (request.validatedRecurringTransactionBody === undefined) {
    throw new Error("Validated recurring transaction body is unavailable.");
  }
  return request.validatedRecurringTransactionBody as T;
}

export function getValidatedRecurringTransactionId(request: Request): string {
  if (!request.validatedRecurringTransactionId) {
    throw new Error("Validated recurring transaction ID is unavailable.");
  }
  return request.validatedRecurringTransactionId;
}

export function getValidatedRecurringTransactionQuery(request: Request): RecurringTransactionListQuery {
  if (!request.validatedRecurringTransactionQuery) {
    throw new Error("Validated recurring transaction query is unavailable.");
  }
  return request.validatedRecurringTransactionQuery;
}
