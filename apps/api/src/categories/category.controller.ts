import type { RequestHandler } from "express";
import type { CreateCategoryRequest, UpdateCategoryRequest } from "../../../../packages/contracts/src/categories/categories.js";
import { HttpError } from "../http/errors.js";
import { CategoryService } from "./category.service.js";
import {
  getValidatedCategoryBody,
  getValidatedCategoryId,
  getValidatedCategoryQuery,
} from "./category.validation.js";

function authenticatedUserId(request: Express.Request): string {
  const userId = request.auth?.userId;
  if (!userId) {
    throw new HttpError({
      statusCode: 401,
      code: "AUTH_REQUIRED",
      message: "Authentication is required.",
    });
  }

  return userId;
}

export function createCategoryController(service: CategoryService) {
  const create: RequestHandler = async (request, response) => {
    const category = await service.create(
      authenticatedUserId(request),
      getValidatedCategoryBody<CreateCategoryRequest>(request),
    );
    response.status(201).json({ category });
  };

  const list: RequestHandler = async (request, response) => {
    const result = await service.list(
      authenticatedUserId(request),
      getValidatedCategoryQuery(request),
    );
    response.status(200).json(result);
  };

  const get: RequestHandler = async (request, response) => {
    const category = await service.get(
      getValidatedCategoryId(request),
      authenticatedUserId(request),
    );
    response.status(200).json({ category });
  };

  const update: RequestHandler = async (request, response) => {
    const category = await service.update(
      getValidatedCategoryId(request),
      authenticatedUserId(request),
      getValidatedCategoryBody<UpdateCategoryRequest>(request),
    );
    response.status(200).json({ category });
  };

  const archive: RequestHandler = async (request, response) => {
    const category = await service.archive(
      getValidatedCategoryId(request),
      authenticatedUserId(request),
    );
    response.status(200).json({ category });
  };

  return { create, list, get, update, archive };
}
