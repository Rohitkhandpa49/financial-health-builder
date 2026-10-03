import type { RequestHandler } from "express";
import { HttpError } from "../http/errors.js";
import { ReportService } from "./report.service.js";
import { buildDateRange } from "../analytics/analytics.service.js";
import {
  getValidatedReportDateRange,
  getValidatedMonthlyQuery,
  getValidatedYearlyQuery,
} from "./report.validation.js";

function authenticatedUserId(request: Express.Request): string {
  const userId = request.auth?.userId;
  if (!userId) {
    throw new HttpError({ statusCode: 401, code: "AUTH_REQUIRED", message: "Authentication is required." });
  }
  return userId;
}

function currentYear(): number { return new Date().getFullYear(); }
function currentMonth(): number { return new Date().getMonth() + 1; }

export function createReportController(service: ReportService) {
  const monthly: RequestHandler = async (request, response) => {
    const userId = authenticatedUserId(request);
    const query = getValidatedMonthlyQuery(request);
    const year = query.year ?? currentYear();
    const month = query.month ?? currentMonth();
    const report = await service.getMonthlyReport(userId, year, month);
    response.status(200).json({ report });
  };

  const yearly: RequestHandler = async (request, response) => {
    const userId = authenticatedUserId(request);
    const query = getValidatedYearlyQuery(request);
    const year = query.year ?? currentYear();
    const report = await service.getYearlyReport(userId, year);
    response.status(200).json({ report });
  };

  const categorySpending: RequestHandler = async (request, response) => {
    const userId = authenticatedUserId(request);
    const query = getValidatedReportDateRange(request);
    const filter = buildDateRange(query.startDate, query.endDate);
    const report = await service.getCategorySpendingReport(userId, filter);
    response.status(200).json({ report });
  };

  const accountSummary: RequestHandler = async (request, response) => {
    const userId = authenticatedUserId(request);
    const query = getValidatedReportDateRange(request);
    const filter = buildDateRange(query.startDate, query.endDate);
    const report = await service.getAccountSummaryReport(userId, filter);
    response.status(200).json({ report });
  };

  const cashFlow: RequestHandler = async (request, response) => {
    const userId = authenticatedUserId(request);
    const query = getValidatedReportDateRange(request);
    const filter = buildDateRange(query.startDate, query.endDate);
    const report = await service.getCashFlowReport(userId, filter);
    response.status(200).json({ report });
  };

  const insights: RequestHandler = async (request, response) => {
    const userId = authenticatedUserId(request);
    const query = getValidatedReportDateRange(request);
    const filter = buildDateRange(query.startDate, query.endDate);
    const report = await service.getInsights(userId, filter);
    response.status(200).json({ report });
  };

  return { monthly, yearly, categorySpending, accountSummary, cashFlow, insights };
}
