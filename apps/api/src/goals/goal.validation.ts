import type { Request, RequestHandler } from "express";
import { z, type ZodType } from "zod";
import {
  GOAL_STATUSES,
  type GoalListQuery,
  type CreateGoalRequest,
  type UpdateGoalRequest,
} from "../../../../packages/contracts/src/goals/goals.js";
import { HttpError } from "../http/errors.js";

const currencyCodes = new Set(Intl.supportedValuesOf("currency"));

const amountSchema = z
  .string()
  .regex(
    /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/,
    "Amount must be a positive decimal with at most four fractional digits.",
  )
  .refine(
    (v) => v.split(".")[0].length <= 15,
    "Amount exceeds DECIMAL(19,4) precision.",
  );

const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "Currency must be an uppercase three-letter code.")
  .refine(
    (c) => currencyCodes.has(c),
    "Currency must be a supported ISO-style currency code.",
  );

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format.")
  .refine((v) => !isNaN(new Date(v).getTime()), "Date must be a valid calendar date.");

const nameSchema = z.string().trim().min(1).max(120);

const pageSchema = z.coerce.number().int().min(1).max(1_000_000).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(25);

export const createGoalBodySchema = z.strictObject({
  name: nameSchema,
  targetAmount: amountSchema,
  currentAmount: amountSchema.optional(),
  currency: currencySchema,
  targetDate: dateSchema,
  status: z.enum(GOAL_STATUSES).optional(),
});

export const updateGoalBodySchema = z.strictObject({
  name: nameSchema.optional(),
  targetAmount: amountSchema.optional(),
  currentAmount: amountSchema.optional(),
  targetDate: dateSchema.optional(),
  status: z.enum(GOAL_STATUSES).optional(),
});

export const goalIdParamsSchema = z.strictObject({
  goalId: z.string().uuid(),
});

export const goalListQuerySchema = z.strictObject({
  page: pageSchema,
  pageSize: pageSizeSchema,
  status: z.enum(GOAL_STATUSES).optional(),
});

declare global {
  namespace Express {
    interface Request {
      validatedGoalBody?: unknown;
      validatedGoalId?: string;
      validatedGoalQuery?: GoalListQuery;
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

export const validateCreateGoalBody = validate<CreateGoalRequest>(
  createGoalBodySchema,
  (request) => request.body,
  (request, body) => {
    request.validatedGoalBody = body;
  },
);

export const validateUpdateGoalBody = validate<UpdateGoalRequest>(
  updateGoalBodySchema,
  (request) => request.body,
  (request, body) => {
    request.validatedGoalBody = body;
  },
);

export const validateGoalId = validate<{ goalId: string }>(
  goalIdParamsSchema,
  (request) => request.params,
  (request, params) => {
    request.validatedGoalId = params.goalId;
  },
);

export const validateGoalListQuery = validate<GoalListQuery>(
  goalListQuerySchema,
  (request) => request.query,
  (request, query) => {
    request.validatedGoalQuery = query;
  },
);

export function getValidatedGoalBody<T>(request: Request): T {
  if (request.validatedGoalBody === undefined) {
    throw new Error("Validated goal body is unavailable.");
  }

  return request.validatedGoalBody as T;
}

export function getValidatedGoalId(request: Request): string {
  if (!request.validatedGoalId) {
    throw new Error("Validated goal ID is unavailable.");
  }

  return request.validatedGoalId;
}

export function getValidatedGoalQuery(request: Request): GoalListQuery {
  if (!request.validatedGoalQuery) {
    throw new Error("Validated goal query is unavailable.");
  }

  return request.validatedGoalQuery;
}
