import type { Request, RequestHandler } from "express";
import { z, type ZodType } from "zod";
import { ACCOUNT_TYPES, type AccountListQuery, type CreateAccountRequest, type UpdateAccountRequest } from "../../../../packages/contracts/src/accounts/accounts.js";
import { HttpError } from "../http/errors.js";

const currencyCodes = new Set(Intl.supportedValuesOf("currency"));
const accountNameSchema = z.string().trim().min(1).max(120);
const accountIdSchema = z.string().uuid();
const pageSchema = z.coerce.number().int().min(1).max(1_000_000).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(25);

const openingBalanceSchema = z.string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,4})?$/, "Use a plain decimal with at most four fractional digits.")
  .refine((value) => value.split(".")[0].replace("-", "").length <= 15, "Amount exceeds DECIMAL(19,4) precision.");

const accountCurrencySchema = z.string()
  .regex(/^[A-Z]{3}$/, "Currency must be an uppercase three-letter code.")
  .refine((currency) => currencyCodes.has(currency), "Currency must be a supported ISO-style currency code.");

export const createAccountBodySchema = z.strictObject({
  name: accountNameSchema,
  type: z.enum(ACCOUNT_TYPES),
  currency: accountCurrencySchema,
  openingBalance: openingBalanceSchema,
});

export const updateAccountBodySchema = z.strictObject({
  name: accountNameSchema,
});

export const accountIdParamsSchema = z.strictObject({
  accountId: accountIdSchema,
});

export const accountListQuerySchema = z.strictObject({
  page: pageSchema,
  pageSize: pageSizeSchema,
  archived: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
});

declare global {
  namespace Express {
    interface Request {
      validatedAccountBody?: unknown;
      validatedAccountId?: string;
      validatedAccountQuery?: AccountListQuery;
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

export const validateCreateAccountBody = validate<CreateAccountRequest>(
  createAccountBodySchema,
  (request) => request.body,
  (request, body) => { request.validatedAccountBody = body; },
);

export const validateUpdateAccountBody = validate<UpdateAccountRequest>(
  updateAccountBodySchema,
  (request) => request.body,
  (request, body) => { request.validatedAccountBody = body; },
);

export const validateAccountId = validate<{ accountId: string }>(
  accountIdParamsSchema,
  (request) => request.params,
  (request, params) => { request.validatedAccountId = params.accountId; },
);

export const validateAccountListQuery = validate<AccountListQuery>(
  accountListQuerySchema,
  (request) => request.query,
  (request, query) => { request.validatedAccountQuery = query; },
);

export function getValidatedAccountBody<T>(request: Request): T {
  if (request.validatedAccountBody === undefined) {
    throw new Error("Validated account body is unavailable.");
  }

  return request.validatedAccountBody as T;
}

export function getValidatedAccountId(request: Request): string {
  if (!request.validatedAccountId) {
    throw new Error("Validated account ID is unavailable.");
  }

  return request.validatedAccountId;
}

export function getValidatedAccountQuery(request: Request): AccountListQuery {
  if (!request.validatedAccountQuery) {
    throw new Error("Validated account query is unavailable.");
  }

  return request.validatedAccountQuery;
}