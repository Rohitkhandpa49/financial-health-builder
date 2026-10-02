import type { Request, RequestHandler } from "express";
import { z, type ZodType } from "zod";
import { CATEGORY_TYPES, type CategoryListQuery, type CreateCategoryRequest, type UpdateCategoryRequest } from "../../../../packages/contracts/src/categories/categories.js";
import { HttpError } from "../http/errors.js";

const categoryNameSchema = z.string().trim().min(1).max(100);
const categoryIdSchema = z.string().uuid();
const pageSchema = z.coerce.number().int().min(1).max(1_000_000).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(25);

export const createCategoryBodySchema = z.strictObject({
  name: categoryNameSchema,
  type: z.enum(CATEGORY_TYPES),
});

export const updateCategoryBodySchema = z.strictObject({
  name: categoryNameSchema,
});

export const categoryIdParamsSchema = z.strictObject({
  categoryId: categoryIdSchema,
});

export const categoryListQuerySchema = z.strictObject({
  page: pageSchema,
  pageSize: pageSizeSchema,
  archived: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  type: z.enum(CATEGORY_TYPES).optional(),
});

declare global {
  namespace Express {
    interface Request {
      validatedCategoryBody?: unknown;
      validatedCategoryId?: string;
      validatedCategoryQuery?: CategoryListQuery;
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

export const validateCreateCategoryBody = validate<CreateCategoryRequest>(
  createCategoryBodySchema,
  (request) => request.body,
  (request, body) => { request.validatedCategoryBody = body; },
);

export const validateUpdateCategoryBody = validate<UpdateCategoryRequest>(
  updateCategoryBodySchema,
  (request) => request.body,
  (request, body) => { request.validatedCategoryBody = body; },
);

export const validateCategoryId = validate<{ categoryId: string }>(
  categoryIdParamsSchema,
  (request) => request.params,
  (request, params) => { request.validatedCategoryId = params.categoryId; },
);

export const validateCategoryListQuery = validate<CategoryListQuery>(
  categoryListQuerySchema,
  (request) => request.query,
  (request, query) => { request.validatedCategoryQuery = query; },
);

export function getValidatedCategoryBody<T>(request: Request): T {
  if (request.validatedCategoryBody === undefined) {
    throw new Error("Validated category body is unavailable.");
  }

  return request.validatedCategoryBody as T;
}

export function getValidatedCategoryId(request: Request): string {
  if (!request.validatedCategoryId) {
    throw new Error("Validated category ID is unavailable.");
  }

  return request.validatedCategoryId;
}

export function getValidatedCategoryQuery(request: Request): CategoryListQuery {
  if (!request.validatedCategoryQuery) {
    throw new Error("Validated category query is unavailable.");
  }

  return request.validatedCategoryQuery;
}
