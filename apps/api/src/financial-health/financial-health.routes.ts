import { Router } from "express";
import type { AccessTokenService } from "../auth/access-token.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import { FinancialHealthService } from "./financial-health.service.js";
import { createFinancialHealthController } from "./financial-health.controller.js";
import { validateAnalyticsDateRange } from "../analytics/analytics.validation.js";

export interface FinancialHealthRouterOptions {
  service: FinancialHealthService;
  accessTokenService: AccessTokenService;
}

export function createFinancialHealthRouter(options: FinancialHealthRouterOptions): Router {
  const router = Router();
  const controller = createFinancialHealthController(options.service);
  const authenticate = requireAuthentication(options.accessTokenService);

  router.get("/", authenticate, validateAnalyticsDateRange, controller.getScore);

  return router;
}
