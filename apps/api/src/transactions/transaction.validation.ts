import type { Request, RequestHandler } from "express";
import { z, type ZodType } from "zod";
import { TRANSACTION_TYPES, type TransactionListQuery, type CreateTransactionRequest, type UpdateTransactionRequest } from "../../../../packages/contracts/src/transactions/transactions.js";
import { HttpError } from "../http/errors.js";

const transactionIdSchema = z.string().uuid();

const amountSchema = z.string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/, "Amount must be a non-negative decimal with up to 4 decimal places")
  .refine((val) => {
    const parts = val.split(".");
    return parts[0].length <= 15;
  }, "Integer part must be at most 15 digits");

const effectiveAtSchema = z.string().datetime({ offset: true });

export const createTransactionSchema = z.strictObject({
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  type: z.enum(TRANSACTION_TYPES),
  amount: amountSchema,
  description: z.string().min(1).max(500),
  effectiveAt: effectiveAtSchema,
});

export const updateTransactionSchema = z.strictObject({
  categoryId: z.string().uuid().nullable().optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  amount: amountSchema.optional(),
  description: z.string().min(1).max(500).optional(),
  effectiveAt: effectiveAtSchema.optional(),
});

export const listTransactionSchema = z.strictObject({
  page: z.string().regex(/^[1-9]\d*$/).transform(Number).optional(),
  pageSize: z.string().regex(/^[1-9]\d*$/).transform(Number).optional(),
  accountId: z.string().uuid().optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
});

export const transactionIdParamSchema = z.strictObject({
  transactionId: transactionIdSchema,
});

declare global {
  namespace Express {
    interface Request {
      validatedTransactionBody?: unknown;
      validatedTransactionId?: string;
      validatedTransactionQuery?: TransactionListQuery;
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

export const validateCreateTransaction = validate<CreateTransactionRequest>(
  createTransactionSchema,
  (request) => request.body,
  (request, body) => { request.validatedTransactionBody = body; },
);

export const validateUpdateTransaction = validate<UpdateTransactionRequest>(
  updateTransactionSchema,
  (request) => request.body,
  (request, body) => { request.validatedTransactionBody = body; },
);

export const validateTransactionIdParam = validate<{ transactionId: string }>(
  transactionIdParamSchema,
  (request) => request.params,
  (request, params) => { request.validatedTransactionId = params.transactionId; },
);

export const validateListTransactions = validate<TransactionListQuery>(
  listTransactionSchema,
  (request) => request.query,
  (request, query) => { request.validatedTransactionQuery = query; },
);

export function getValidatedTransactionBody<T>(request: Request): T {
  if (request.validatedTransactionBody === undefined) {
    throw new Error("Validated transaction body is unavailable.");
  }

  return request.validatedTransactionBody as T;
}

export function getValidatedTransactionId(request: Request): string {
  if (!request.validatedTransactionId) {
    throw new Error("Validated transaction ID is unavailable.");
  }

  return request.validatedTransactionId;
}

export function getValidatedTransactionQuery(request: Request): TransactionListQuery {
  if (!request.validatedTransactionQuery) {
    throw new Error("Validated transaction query is unavailable.");
  }

  return request.validatedTransactionQuery;
}
