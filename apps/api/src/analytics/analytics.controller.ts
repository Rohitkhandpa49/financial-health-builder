import type { RequestHandler } from "express";
import { HttpError } from "../http/errors.js";
import { AnalyticsService, buildDateRange } from "./analytics.service.js";
import { getValidatedAnalyticsQuery } from "./analytics.validation.js";

function authenticatedUserId(request: Express.Request): string {
  const userId = request.auth?.userId;
  if (!userId) {
    throw new HttpError({ statusCode: 401, code: "AUTH_REQUIRED", message: "Authentication is required." });
  }
  return userId;
}

export function createAnalyticsController(service: AnalyticsService) {
  const summary: RequestHandler = async (request, response) => {
    const userId = authenticatedUserId(request);
    const query = getValidatedAnalyticsQuery(request);
    const filter = buildDateRange(query.startDate, query.endDate);
    const result = await service.getSummary(userId, filter);
    response.status(200).json({ summary: result });
  };

  const cashFlow: RequestHandler = async (request, response) => {
    const userId = authenticatedUserId(request);
    const query = getValidatedAnalyticsQuery(request);
    const filter = buildDateRange(query.startDate, query.endDate);
    const result = await service.getCashFlow(userId, filter);
    response.status(200).json({ cashFlow: result });
  };

  const spending: RequestHandler = async (request, response) => {
    const userId = authenticatedUserId(request);
    const query = getValidatedAnalyticsQuery(request);
    const filter = buildDateRange(query.startDate, query.endDate);
    const result = await service.getSpending(userId, filter);
    response.status(200).json({ spending: result });
  };

  const income: RequestHandler = async (request, response) => {
    const userId = authenticatedUserId(request);
    const query = getValidatedAnalyticsQuery(request);
    const filter = buildDateRange(query.startDate, query.endDate);
    const result = await service.getIncome(userId, filter);
    response.status(200).json({ income: result });
  };

  const budgets: RequestHandler = async (request, response) => {
    const userId = authenticatedUserId(request);
    const result = await service.getBudgetsAnalytics(userId);
    response.status(200).json({ budgetsAnalytics: result });
  };

  const goals: RequestHandler = async (request, response) => {
    const userId = authenticatedUserId(request);
    const result = await service.getGoalsAnalytics(userId);
    response.status(200).json({ goalsAnalytics: result });
  };

  return { summary, cashFlow, spending, income, budgets, goals };
}
