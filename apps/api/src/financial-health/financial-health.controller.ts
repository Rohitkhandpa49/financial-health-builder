import type { RequestHandler } from "express";
import { HttpError } from "../http/errors.js";
import { FinancialHealthService } from "./financial-health.service.js";
import { buildDateRange } from "../analytics/analytics.service.js";
import { getValidatedAnalyticsQuery } from "../analytics/analytics.validation.js";

function authenticatedUserId(request: Express.Request): string {
  const userId = request.auth?.userId;
  if (!userId) {
    throw new HttpError({ statusCode: 401, code: "AUTH_REQUIRED", message: "Authentication is required." });
  }
  return userId;
}

export function createFinancialHealthController(service: FinancialHealthService) {
  const getScore: RequestHandler = async (request, response) => {
    const userId = authenticatedUserId(request);
    const query = getValidatedAnalyticsQuery(request);
    const filter = buildDateRange(query.startDate, query.endDate);
    const financialHealth = await service.getFinancialHealth(userId, filter);
    response.status(200).json({ financialHealth });
  };

  return { getScore };
}
