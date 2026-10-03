import { Router } from "express";
import type { AccessTokenService } from "../auth/access-token.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import { ReportService } from "./report.service.js";
import { createReportController } from "./report.controller.js";
import {
  validateReportDateRange,
  validateMonthlyQuery,
  validateYearlyQuery,
} from "./report.validation.js";

export interface ReportRouterOptions {
  service: ReportService;
  accessTokenService: AccessTokenService;
}

export function createReportRouter(options: ReportRouterOptions): Router {
  const router = Router();
  const controller = createReportController(options.service);
  const authenticate = requireAuthentication(options.accessTokenService);

  router.get("/monthly", authenticate, validateMonthlyQuery, controller.monthly);
  router.get("/yearly", authenticate, validateYearlyQuery, controller.yearly);
  router.get("/category-spending", authenticate, validateReportDateRange, controller.categorySpending);
  router.get("/account-summary", authenticate, validateReportDateRange, controller.accountSummary);
  router.get("/cash-flow", authenticate, validateReportDateRange, controller.cashFlow);
  router.get("/insights", authenticate, validateReportDateRange, controller.insights);

  return router;
}
