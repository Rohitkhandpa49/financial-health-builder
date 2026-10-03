import type { Request, RequestHandler } from "express";
import { z, type ZodType } from "zod";
import type {
  CreateTransferRequest,
  TransferListQuery,
} from "../../../../packages/contracts/src/transfers/transfers.js";
import { HttpError } from "../http/errors.js";

const amountSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/, "Amount must be a positive decimal with at most four fractional digits.")
  .refine((v) => v.split(".")[0].length <= 15, "Amount exceeds DECIMAL(19,4) precision.");

const pageSchema = z.coerce.number().int().min(1).max(1_000_000).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(25);

export const createTransferBodySchema = z.strictObject({
  sourceAccountId: z.string().uuid(),
  destinationAccountId: z.string().uuid(),
  amount: amountSchema,
  description: z.string().trim().min(1).max(500),
  effectiveAt: z.string().datetime({ offset: true }),
});

export const transferGroupIdParamsSchema = z.strictObject({
  transferGroupId: z.string().uuid(),
});

export const transferListQuerySchema = z.strictObject({
  page: pageSchema,
  pageSize: pageSizeSchema,
  accountId: z.string().uuid().optional(),
});

declare global {
  namespace Express {
    interface Request {
      validatedTransferBody?: unknown;
      validatedTransferGroupId?: string;
      validatedTransferQuery?: TransferListQuery;
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

export const validateCreateTransferBody = validate<CreateTransferRequest>(
  createTransferBodySchema,
  (request) => request.body,
  (request, body) => { request.validatedTransferBody = body; },
);

export const validateTransferGroupId = validate<{ transferGroupId: string }>(
  transferGroupIdParamsSchema,
  (request) => request.params,
  (request, params) => { request.validatedTransferGroupId = params.transferGroupId; },
);

export const validateTransferListQuery = validate<TransferListQuery>(
  transferListQuerySchema,
  (request) => request.query,
  (request, query) => { request.validatedTransferQuery = query; },
);

export function getValidatedTransferBody<T>(request: Request): T {
  if (request.validatedTransferBody === undefined) {
    throw new Error("Validated transfer body is unavailable.");
  }
  return request.validatedTransferBody as T;
}

export function getValidatedTransferGroupId(request: Request): string {
  if (!request.validatedTransferGroupId) {
    throw new Error("Validated transfer group ID is unavailable.");
  }
  return request.validatedTransferGroupId;
}

export function getValidatedTransferQuery(request: Request): TransferListQuery {
  if (!request.validatedTransferQuery) {
    throw new Error("Validated transfer query is unavailable.");
  }
  return request.validatedTransferQuery;
}
