import { Router } from "express";
import type { AccessTokenService } from "../auth/access-token.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import { CategoryService } from "./category.service.js";
import { createCategoryController } from "./category.controller.js";
import {
  validateCategoryId,
  validateCategoryListQuery,
  validateCreateCategoryBody,
  validateUpdateCategoryBody,
} from "./category.validation.js";

export interface CategoryRouterOptions {
  service: CategoryService;
  accessTokenService: AccessTokenService;
}

export function createCategoryRouter(options: CategoryRouterOptions): Router {
  const router = Router();
  const controller = createCategoryController(options.service);
  const authenticate = requireAuthentication(options.accessTokenService);

  router.post("/", authenticate, validateCreateCategoryBody, controller.create);
  router.get("/", authenticate, validateCategoryListQuery, controller.list);
  router.get("/:categoryId", authenticate, validateCategoryId, controller.get);
  router.patch("/:categoryId/archive", authenticate, validateCategoryId, controller.archive);
  router.patch("/:categoryId", authenticate, validateCategoryId, validateUpdateCategoryBody, controller.update);

  return router;
}
