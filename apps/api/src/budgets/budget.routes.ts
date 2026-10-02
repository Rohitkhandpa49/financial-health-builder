import { Router } from "express";
import type { AccessTokenService } from "../auth/access-token.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import { BudgetService } from "./budget.service.js";
import { createBudgetController } from "./budget.controller.js";
import {
  validateBudgetId,
  validateBudgetListQuery,
  validateCreateBudgetBody,
  validateUpdateBudgetBody,
} from "./budget.validation.js";

export interface BudgetRouterOptions {
  service: BudgetService;
  accessTokenService: AccessTokenService;
}

export function createBudgetRouter(options: BudgetRouterOptions): Router {
  const router = Router();
  const controller = createBudgetController(options.service);
  const authenticate = requireAuthentication(options.accessTokenService);

  router.post("/", authenticate, validateCreateBudgetBody, controller.create);
  router.get("/", authenticate, validateBudgetListQuery, controller.list);
  router.get("/:budgetId", authenticate, validateBudgetId, controller.get);
  router.patch("/:budgetId", authenticate, validateBudgetId, validateUpdateBudgetBody, controller.update);
  router.delete("/:budgetId", authenticate, validateBudgetId, controller.deleteBudget);

  return router;
}
