import cors from "cors";
import express from "express";
import helmet from "helmet";
import { createAccountRouter, type AccountRouterOptions } from "./accounts/account.routes.js";
import { createAuthRouter, type AuthRouterOptions } from "./auth/auth.routes.js";
import { createCategoryRouter, type CategoryRouterOptions } from "./categories/category.routes.js";
import { createTransactionRouter, type TransactionRouterOptions } from "./transactions/transaction.routes.js";
import { createBudgetRouter, type BudgetRouterOptions } from "./budgets/budget.routes.js";
import { createGoalRouter, type GoalRouterOptions } from "./goals/goal.routes.js";
import { createRecurringTransactionRouter, type RecurringTransactionRouterOptions } from "./recurring-transactions/recurring-transaction.routes.js";
import { createTransferRouter, type TransferRouterOptions } from "./transfers/transfer.routes.js";
import { createAnalyticsRouter, type AnalyticsRouterOptions } from "./analytics/analytics.routes.js";
import { createFinancialHealthRouter, type FinancialHealthRouterOptions } from "./financial-health/financial-health.routes.js";
import { createReportRouter, type ReportRouterOptions } from "./reports/report.routes.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { requestIdMiddleware } from "./http/request-id.js";
import { v1Router } from "./routes/v1.js";

export interface AppOptions {
  frontendUrl?: string;
  auth?: AuthRouterOptions;
  accounts?: AccountRouterOptions;
  categories?: CategoryRouterOptions;
  transactions?: TransactionRouterOptions;
  budgets?: BudgetRouterOptions;
  goals?: GoalRouterOptions;
  recurringTransactions?: RecurringTransactionRouterOptions;
  transfers?: TransferRouterOptions;
  analytics?: AnalyticsRouterOptions;
  financialHealth?: FinancialHealthRouterOptions;
  reports?: ReportRouterOptions;
}

export function createApp(options: AppOptions = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      callback(null, Boolean(origin && origin === options.frontendUrl));
    },
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Request-Id"],
    credentials: true,
  }));
  app.use(express.json({ limit: "100kb", strict: true }));
  app.use("/api/v1", v1Router);
  if (options.auth) {
    app.use("/api/v1/auth", createAuthRouter(options.auth));
  }
  if (options.accounts) {
    app.use("/api/v1/accounts", createAccountRouter(options.accounts));
  }
  if (options.categories) {
    app.use("/api/v1/categories", createCategoryRouter(options.categories));
  }
  if (options.transactions) {
    app.use("/api/v1/transactions", createTransactionRouter(options.transactions));
  }
  if (options.budgets) {
    app.use("/api/v1/budgets", createBudgetRouter(options.budgets));
  }
  if (options.goals) {
    app.use("/api/v1/goals", createGoalRouter(options.goals));
  }
  if (options.recurringTransactions) {
    app.use("/api/v1/recurring-transactions", createRecurringTransactionRouter(options.recurringTransactions));
  }
  if (options.transfers) {
    app.use("/api/v1/transfers", createTransferRouter(options.transfers));
  }
  if (options.analytics) {
    app.use("/api/v1/analytics", createAnalyticsRouter(options.analytics));
  }
  if (options.financialHealth) {
    app.use("/api/v1/financial-health", createFinancialHealthRouter(options.financialHealth));
  }
  if (options.reports) {
    app.use("/api/v1/reports", createReportRouter(options.reports));
  }
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}