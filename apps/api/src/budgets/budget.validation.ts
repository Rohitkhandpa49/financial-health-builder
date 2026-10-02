import type { Request, RequestHandler } from "express";
import { z, type ZodType } from "zod";
import { BUDGET_PERIODS, type BudgetListQuery, type CreateBudgetRequest, type UpdateBudgetRequest } from "../../../../packages/contracts/src/budgets/budgets.js";
import { HttpError } from "../http/errors.js";

const currencyCodes = new Set(Intl.supportedValuesOf("currency"));

const amountSchema = z.string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/, "Amount must be a positive decimal with at most four fractional digits.")
  .refine((v) => v.split(".")[0].length <= 15, "Amount exceeds DECIMAL(19,4) precision.");

const currencySchema = z.string()
  .regex(/^[A-Z]{3}$/, "Currency must be an uppercase three-letter code.")
  .refine((c) => currencyCodes.has(c), "Currency must be a supported ISO-style currency code.");

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
  .refine((v) => !isNaN(new Date(v).getTime()), "Date must be a valid calendar date.");

const nameSchema = z.string().trim().min(1).max(120);

const pageSchema = z.coerce.number().int().min(1).max(1_000_000).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(25);

export const createBudgetBodySchema = z.strictObject({
  name: nameSchema,
  categoryId: z.string().uuid().optional(),
  amount: amountSchema,
  currency: currencySchema,
  period: z.enum(BUDGET_PERIODS),
  startDate: dateSchema,
  endDate: dateSchema,
}).refine((data) => data.endDate >= data.startDate, {
  message: "endDate must be on or after startDate",
  path: ["endDate"],
});

export const updateBudgetBodySchema = z.strictObject({
  name: nameSchema.optional(),
  categoryId: z.string().uuid().nullable().optional(),
  amount: amountSchema.optional(),
  endDate: dateSchema.optional(),
});

export const budgetIdParamsSchema = z.strictObject({
  budgetId: z.string().uuid(),
});

export const budgetListQuerySchema = z.strictObject({
  page: pageSchema,
  pageSize: pageSizeSchema,
  categoryId: z.string().uuid().optional(),
  period: z.enum(BUDGET_PERIODS).optional(),
});

declare global {
  namespace Express {
    interface Request {
      validatedBudgetBody?: unknown;
      validatedBudgetId?: string;
      validatedBudgetQuery?: BudgetListQuery;
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

export const validateCreateBudgetBody = validate<CreateBudgetRequest>(
  createBudgetBodySchema,
  (request) => request.body,
  (request, body) => { request.validatedBudgetBody = body; },
);

export const validateUpdateBudgetBody = validate<UpdateBudgetRequest>(
  updateBudgetBodySchema,
  (request) => request.body,
  (request, body) => { request.validatedBudgetBody = body; },
);

export const validateBudgetId = validate<{ budgetId: string }>(
  budgetIdParamsSchema,
  (request) => request.params,
  (request, params) => { request.validatedBudgetId = params.budgetId; },
);

export const validateBudgetListQuery = validate<BudgetListQuery>(
  budgetListQuerySchema,
  (request) => request.query,
  (request, query) => { request.validatedBudgetQuery = query; },
);

export function getValidatedBudgetBody<T>(request: Request): T {
  if (request.validatedBudgetBody === undefined) {
    throw new Error("Validated budget body is unavailable.");
  }

  return request.validatedBudgetBody as T;
}

export function getValidatedBudgetId(request: Request): string {
  if (!request.validatedBudgetId) {
    throw new Error("Validated budget ID is unavailable.");
  }

  return request.validatedBudgetId;
}

export function getValidatedBudgetQuery(request: Request): BudgetListQuery {
  if (!request.validatedBudgetQuery) {
    throw new Error("Validated budget query is unavailable.");
  }

  return request.validatedBudgetQuery;
}
