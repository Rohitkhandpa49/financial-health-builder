import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { ACCESS_COOKIE_NAME } from "../src/auth/auth.middleware.js";
import { JoseAccessTokenService } from "../src/auth/access-token.js";
import type {
  AnalyticsRepository,
  DateRangeFilter,
  TransactionTotals,
  CategorySpendingRow,
  CategoryIncomeRow,
  CashFlowRow,
  BudgetWithSpending,
  GoalSummaryRow,
} from "../src/analytics/analytics.repository.js";
import { AnalyticsService } from "../src/analytics/analytics.service.js";
import type { ReportRepository, AccountActivityRow } from "../src/reports/report.repository.js";
import { ReportService } from "../src/reports/report.service.js";
import type { CategoryRecord, CategoryRepository } from "../src/categories/category.repository.js";

const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const testJwtSecret = "report-test-secret-with-at-least-32-chars-x";

// ---- In-memory stubs ----

class MemoryAnalyticsRepository implements AnalyticsRepository {
  constructor(
    public totals: TransactionTotals = { totalIncome: "1000.0000", totalExpenses: "700.0000", transactionCount: 10, transferCount: 1 },
    public spendingRows: CategorySpendingRow[] = [],
    public incomeRows: CategoryIncomeRow[] = [],
    public cashFlowRows: CashFlowRow[] = [],
    public budgetRows: BudgetWithSpending[] = [],
    public goalRows: GoalSummaryRow[] = [],
  ) {}
  async getTransactionTotals(_userId: string, _filter: DateRangeFilter): Promise<TransactionTotals> { return this.totals; }
  async getCategorySpending(): Promise<CategorySpendingRow[]> { return this.spendingRows; }
  async getCategoryIncome(): Promise<CategoryIncomeRow[]> { return this.incomeRows; }
  async getCashFlowByMonth(): Promise<CashFlowRow[]> { return this.cashFlowRows; }
  async getBudgetsWithSpending(): Promise<BudgetWithSpending[]> { return this.budgetRows; }
  async getGoalsSummary(): Promise<GoalSummaryRow[]> { return this.goalRows; }
}

class MemoryCategoryRepository implements CategoryRepository {
  async findByIdForUserOrSystem(): Promise<CategoryRecord | null> { return null; }
  async createForUser(): Promise<CategoryRecord> { return null as unknown as CategoryRecord; }
  async listForUser(): Promise<{ categories: CategoryRecord[]; totalItems: number }> { return { categories: [], totalItems: 0 }; }
  async updateNameForUser(): Promise<CategoryRecord | null> { return null; }
  async archiveForUser(): Promise<CategoryRecord | null> { return null; }
}

class MemoryReportRepository implements ReportRepository {
  constructor(public accountRows: AccountActivityRow[] = []) {}
  async getAccountActivity(): Promise<AccountActivityRow[]> { return this.accountRows; }
}

function createTestContext(analyticsOverrides?: Partial<MemoryAnalyticsRepository>, accountRows?: AccountActivityRow[]) {
  const analyticsRepo = new MemoryAnalyticsRepository(
    analyticsOverrides?.totals,
    analyticsOverrides?.spendingRows,
    analyticsOverrides?.incomeRows,
    analyticsOverrides?.cashFlowRows,
    analyticsOverrides?.budgetRows,
    analyticsOverrides?.goalRows,
  );
  const categoryRepo = new MemoryCategoryRepository();
  const reportRepo = new MemoryReportRepository(accountRows ?? []);
  const analyticsService = new AnalyticsService(analyticsRepo, categoryRepo);
  const reportService = new ReportService(analyticsService, reportRepo);
  const accessTokenService = new JoseAccessTokenService(testJwtSecret);
  const app = createApp({ reports: { service: reportService, accessTokenService } });
  return { app, accessTokenService };
}

async function withServer<T>(
  callback: (ctx: { baseUrl: string } & ReturnType<typeof createTestContext>) => Promise<T>,
  overrides?: Partial<MemoryAnalyticsRepository>,
  accountRows?: AccountActivityRow[],
): Promise<T> {
  const ctx = createTestContext(overrides, accountRows);
  const server = createServer(ctx.app);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try { return await callback({ baseUrl, ...ctx }); }
  finally { await new Promise<void>((r, j) => { server.close((e) => e ? j(e) : r()); }); }
}

async function reportRequest(baseUrl: string, userId: string | undefined, path: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (userId) headers.Cookie = `${ACCESS_COOKIE_NAME}=${await new JoseAccessTokenService(testJwtSecret).issue(userId)}`;
  return fetch(`${baseUrl}${path}`, { headers });
}

// ---- AUTH ----
test("unauthenticated GET /reports/monthly returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, undefined, "/api/v1/reports/monthly");
    assert.equal(r.status, 401);
    assert.equal((await r.json() as { error: { code: string } }).error.code, "AUTH_REQUIRED");
  });
});

test("unauthenticated GET /reports/yearly returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await reportRequest(baseUrl, undefined, "/api/v1/reports/yearly")).status, 401);
  });
});

test("unauthenticated GET /reports/category-spending returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await reportRequest(baseUrl, undefined, "/api/v1/reports/category-spending")).status, 401);
  });
});

test("unauthenticated GET /reports/account-summary returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await reportRequest(baseUrl, undefined, "/api/v1/reports/account-summary")).status, 401);
  });
});

test("unauthenticated GET /reports/cash-flow returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await reportRequest(baseUrl, undefined, "/api/v1/reports/cash-flow")).status, 401);
  });
});

test("unauthenticated GET /reports/insights returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await reportRequest(baseUrl, undefined, "/api/v1/reports/insights")).status, 401);
  });
});

// ---- VALIDATION ----
test("invalid startDate returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/category-spending?startDate=not-a-date");
    assert.equal(r.status, 400);
  });
});

test("endDate before startDate returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/cash-flow?startDate=2026-06-01&endDate=2026-01-01");
    assert.equal(r.status, 400);
  });
});

test("unknown query param on date-range endpoint returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await reportRequest(baseUrl, userA, "/api/v1/reports/category-spending?userId=x")).status, 400);
  });
});

test("invalid year on monthly endpoint returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/monthly?year=1999");
    assert.equal(r.status, 400);
  });
});

test("invalid month on monthly endpoint returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/monthly?month=13");
    assert.equal(r.status, 400);
  });
});

test("unknown param on monthly endpoint returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await reportRequest(baseUrl, userA, "/api/v1/reports/monthly?userId=x")).status, 400);
  });
});

// ---- MONTHLY REPORT ----
test("GET /reports/monthly returns 200 with correct shape", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/monthly?year=2026&month=1");
    const body = await r.json() as { report: Record<string, unknown> };
    assert.equal(r.status, 200);
    assert.ok(body.report);
    assert.equal(typeof body.report.year, "number");
    assert.equal(typeof body.report.month, "number");
    assert.ok("totalIncome" in body.report);
    assert.ok("totalExpenses" in body.report);
    assert.ok("netCashFlow" in body.report);
    assert.ok("topSpendingCategories" in body.report);
    assert.ok("dateRange" in body.report);
  });
});

test("GET /reports/monthly defaults to current month when params omitted", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/monthly");
    assert.equal(r.status, 200);
    const body = await r.json() as { report: { month: number; year: number } };
    assert.ok(body.report.year >= 2026);
    assert.ok(body.report.month >= 1 && body.report.month <= 12);
  });
});

test("monthly report does not expose userId", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/monthly");
    assert.ok(!(await r.text()).includes(userA));
  });
});

// ---- YEARLY REPORT ----
test("GET /reports/yearly returns 200 with correct shape", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/yearly?year=2026");
    const body = await r.json() as { report: Record<string, unknown> };
    assert.equal(r.status, 200);
    assert.equal(body.report.year, 2026);
    assert.ok("totalIncome" in body.report);
    assert.ok("monthlyBreakdown" in body.report);
    assert.ok(Array.isArray(body.report.monthlyBreakdown));
    assert.ok("goals" in body.report);
  });
});

test("GET /reports/yearly defaults to current year when param omitted", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/yearly");
    assert.equal(r.status, 200);
    const body = await r.json() as { report: { year: number } };
    assert.ok(body.report.year >= 2026);
  });
});

// ---- CATEGORY SPENDING REPORT ----
test("GET /reports/category-spending returns 200 with categories and total", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/category-spending?startDate=2026-01-01&endDate=2026-01-31");
    const body = await r.json() as { report: { categories: unknown[]; totalSpent: string; dateRange: Record<string, string> } };
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(body.report.categories));
    assert.match(body.report.totalSpent, /^\d+\.\d{4}$/);
    assert.equal(body.report.dateRange.startDate, "2026-01-01");
    assert.equal(body.report.dateRange.endDate, "2026-01-31");
  }, { spendingRows: [{ categoryId: "cat1", amount: "200.0000", transactionCount: 3 }] });
});

// ---- ACCOUNT SUMMARY REPORT ----
test("GET /reports/account-summary returns 200 with accounts array", async () => {
  const accountRows: AccountActivityRow[] = [
    { accountId: "acc1", accountName: "Savings", currency: "USD", openingBalance: "1000.0000", totalIncome: "500.0000", totalExpenses: "300.0000", transactionCount: 5 },
  ];
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/account-summary");
    const body = await r.json() as { report: { accounts: Array<{ accountId: string; netActivity: string }> } };
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(body.report.accounts));
    assert.equal(body.report.accounts.length, 1);
    assert.equal(body.report.accounts[0].accountId, "acc1");
    assert.match(body.report.accounts[0].netActivity, /^-?\d+\.\d{4}$/);
  }, undefined, accountRows);
});

test("account summary netActivity = income - expenses", async () => {
  const accountRows: AccountActivityRow[] = [
    { accountId: "acc1", accountName: "Savings", currency: "USD", openingBalance: "0.0000", totalIncome: "500.0000", totalExpenses: "300.0000", transactionCount: 5 },
  ];
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/account-summary");
    const body = await r.json() as { report: { accounts: Array<{ netActivity: string }> } };
    assert.equal(body.report.accounts[0].netActivity, "200.0000");
  }, undefined, accountRows);
});

// ---- CASH FLOW REPORT ----
test("GET /reports/cash-flow returns 200 with periods and trend", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/cash-flow");
    const body = await r.json() as { report: { periods: unknown[]; trend: string; totalNet: string } };
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(body.report.periods));
    assert.ok(["improving", "declining", "stable", "insufficient_data"].includes(body.report.trend));
    assert.match(body.report.totalNet, /^-?\d+\.\d{4}$/);
  }, { cashFlowRows: [{ year: 2026, month: 1, income: "1000.0000", expenses: "700.0000" }] });
});

test("cash flow trend is insufficient_data with less than 2 periods", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/cash-flow");
    const body = await r.json() as { report: { trend: string } };
    assert.equal(r.status, 200);
    assert.equal(body.report.trend, "insufficient_data");
  });
});

test("cash flow trend is improving when last period net > previous net", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/cash-flow");
    const body = await r.json() as { report: { trend: string } };
    assert.equal(body.report.trend, "improving");
  }, { cashFlowRows: [
    { year: 2026, month: 1, income: "500.0000", expenses: "400.0000" },  // net 100
    { year: 2026, month: 2, income: "800.0000", expenses: "400.0000" },  // net 400 — improving
  ] });
});

// ---- INSIGHTS ----
test("GET /reports/insights returns 200 with insights array", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/insights");
    const body = await r.json() as { report: { insights: Array<{ type: string; category: string; message: string }> } };
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(body.report.insights));
    assert.ok(body.report.insights.length > 0);
    const first = body.report.insights[0];
    assert.ok(["positive", "warning", "neutral", "info"].includes(first.type));
    assert.ok(typeof first.category === "string");
    assert.ok(typeof first.message === "string");
  }, { totals: { totalIncome: "1000.0000", totalExpenses: "700.0000", transactionCount: 5, transferCount: 0 } });
});

test("insights includes a warning when expenses exceed income", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/insights");
    const body = await r.json() as { report: { insights: Array<{ type: string; category: string }> } };
    assert.equal(r.status, 200);
    const warnings = body.report.insights.filter((i) => i.type === "warning" && i.category === "Cash Flow");
    assert.ok(warnings.length > 0, "should have a cash flow warning when expenses > income");
  }, { totals: { totalIncome: "500.0000", totalExpenses: "800.0000", transactionCount: 5, transferCount: 0 } });
});

test("insights has deterministic output for identical inputs", async () => {
  const overrides = { totals: { totalIncome: "1000.0000", totalExpenses: "600.0000", transactionCount: 8, transferCount: 0 } };
  let first: string, second: string;
  await withServer(async ({ baseUrl }) => {
    first = JSON.stringify((await (await reportRequest(baseUrl, userA, "/api/v1/reports/insights")).json() as { report: { insights: unknown[] } }).report.insights.map((i: unknown) => (i as Record<string, string>).message));
  }, overrides);
  await withServer(async ({ baseUrl }) => {
    second = JSON.stringify((await (await reportRequest(baseUrl, userA, "/api/v1/reports/insights")).json() as { report: { insights: unknown[] } }).report.insights.map((i: unknown) => (i as Record<string, string>).message));
  }, overrides);
  assert.equal(first!, second!);
});

test("insights generatedAt is an ISO timestamp", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/insights");
    const body = await r.json() as { report: { generatedAt: string } };
    assert.ok(!isNaN(new Date(body.report.generatedAt).getTime()));
  });
});

test("insights does not expose userId", async () => {
  await withServer(async ({ baseUrl }) => {
    const text = await (await reportRequest(baseUrl, userA, "/api/v1/reports/insights")).text();
    assert.ok(!text.includes(userA));
    assert.ok(!text.includes(userB));
  });
});

// ---- DATE FILTER ACCEPTANCE ----
test("date filter is reflected in dateRange of returned report", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await reportRequest(baseUrl, userA, "/api/v1/reports/cash-flow?startDate=2026-01-01&endDate=2026-03-31");
    const body = await r.json() as { report: { dateRange: { startDate: string; endDate: string } } };
    assert.equal(r.status, 200);
    assert.equal(body.report.dateRange.startDate, "2026-01-01");
    assert.equal(body.report.dateRange.endDate, "2026-03-31");
  });
});

// ---- EMPTY / NEW USER ----
test("all report endpoints return 200 with empty/zero data for new user", async () => {
  await withServer(async ({ baseUrl }) => {
    const paths = ["/api/v1/reports/monthly", "/api/v1/reports/yearly", "/api/v1/reports/category-spending", "/api/v1/reports/cash-flow", "/api/v1/reports/insights"];
    for (const path of paths) {
      const r = await reportRequest(baseUrl, userA, path);
      assert.equal(r.status, 200, `${path} should return 200 for empty data`);
    }
  });
});
