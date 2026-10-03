import { Router } from "express";
import type { AccessTokenService } from "../auth/access-token.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import { AnalyticsService } from "./analytics.service.js";
import { createAnalyticsController } from "./analytics.controller.js";
import { validateAnalyticsDateRange } from "./analytics.validation.js";

export interface AnalyticsRouterOptions {
  service: AnalyticsService;
  accessTokenService: AccessTokenService;
}

export function createAnalyticsRouter(options: AnalyticsRouterOptions): Router {
  const router = Router();
  const controller = createAnalyticsController(options.service);
  const authenticate = requireAuthentication(options.accessTokenService);

  router.get("/summary", authenticate, validateAnalyticsDateRange, controller.summary);
  router.get("/cash-flow", authenticate, validateAnalyticsDateRange, controller.cashFlow);
  router.get("/spending", authenticate, validateAnalyticsDateRange, controller.spending);
  router.get("/income", authenticate, validateAnalyticsDateRange, controller.income);
  router.get("/budgets", authenticate, controller.budgets);
  router.get("/goals", authenticate, controller.goals);

  return router;
}
