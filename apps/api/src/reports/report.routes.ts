import { Router } from "express";
import type { AccessTokenService } from "../auth/access-token.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import { ReportService } from "./report.service.js";
import { createReportController } from "./report.controller.js";
import {
  validateReportDateRange,
  validateMonthlyQuery,
  validateYearlyQuery,
  validateCsvExportQuery,
} from "./report.validation.js";
import { HttpError } from "../http/errors.js";
import { buildDateRange } from "../analytics/analytics.service.js";
import type { ReportRepository } from "./report.repository.js";

export interface ReportRouterOptions {
  service: ReportService;
  accessTokenService: AccessTokenService;
  repository?: ReportRepository;
}

// RFC 4180-compliant CSV value escaping
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildCsvRow(fields: string[]): string {
  return fields.map(csvEscape).join(',');
}

export function createReportRouter(options: ReportRouterOptions): Router {
  const router = Router();
  const controller = createReportController(options.service);
  const authenticate = requireAuthentication(options.accessTokenService);

  // CSV export — must be before the other named routes to avoid conflicts
  router.get(
    '/export/csv',
    authenticate,
    validateCsvExportQuery,
    async (req, res, next) => {
      try {
        const userId = req.auth?.userId;
        if (!userId) {
          throw new HttpError({ statusCode: 401, code: 'AUTH_REQUIRED', message: 'Authentication is required.' });
        }

        const query = req.validatedCsvExportQuery!;
        const filter = buildDateRange(query.startDate, query.endDate);

        // Use repo from options if provided, otherwise fall back to service's internal repo
        const repo = options.repository ?? (options.service as unknown as { reports: ReportRepository }).reports;

        if (!repo.getTransactionsForExport) {
          throw new HttpError({ statusCode: 501, code: 'NOT_IMPLEMENTED', message: 'CSV export is not available.' });
        }

        const rows = await repo.getTransactionsForExport(userId, {
          startDate: query.startDate ? filter.startDate : undefined,
          endDate: query.endDate ? filter.endDate : undefined,
        });

        const header = buildCsvRow(['id', 'type', 'amount', 'currency', 'description', 'effectiveAt', 'categoryId', 'accountId', 'createdAt']);
        const lines = rows.map((row) =>
          buildCsvRow([
            row.id,
            row.type,
            row.amount.toString(),
            row.currency,
            row.description ?? '',
            row.effectiveAt.toISOString(),
            row.categoryId ?? '',
            row.accountId,
            row.createdAt.toISOString(),
          ]),
        );

        const csv = [header, ...lines].join('\r\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
        res.status(200).send(csv);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get("/monthly", authenticate, validateMonthlyQuery, controller.monthly);
  router.get("/yearly", authenticate, validateYearlyQuery, controller.yearly);
  router.get("/category-spending", authenticate, validateReportDateRange, controller.categorySpending);
  router.get("/account-summary", authenticate, validateReportDateRange, controller.accountSummary);
  router.get("/cash-flow", authenticate, validateReportDateRange, controller.cashFlow);
  router.get("/insights", authenticate, validateReportDateRange, controller.insights);

  return router;
}
