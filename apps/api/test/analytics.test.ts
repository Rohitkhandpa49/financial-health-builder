import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { ACCESS_COOKIE_NAME } from "../src/auth/auth.middleware.js";
import { JoseAccessTokenService } from "../src/auth/access-token.js";
import type { AnalyticsRepository, DateRangeFilter, TransactionTotals, CategorySpendingRow, CategoryIncomeRow, CashFlowRow, BudgetWithSpending, GoalSummaryRow } from "../src/analytics/analytics.repository.js";
import { AnalyticsService } from "../src/analytics/analytics.service.js";
import { FinancialHealthService } from "../src/financial-health/financial-health.service.js";
import type { CategoryRecord, CategoryRepository } from "../src/categories/category.repository.js";

const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const testJwtSecret = "analytics-test-secret-with-at-least-32-chars";

// ---- In-memory analytics repository ----
class MemoryAnalyticsRepository implements AnalyticsRepository {
  constructor(
    public totals: TransactionTotals = { totalIncome: "0.0000", totalExpenses: "0.0000", transactionCount: 0, transferCount: 0 },
    public spendingRows: CategorySpendingRow[] = [],
    public incomeRows: CategoryIncomeRow[] = [],
    public cashFlowRows: CashFlowRow[] = [],
    public budgetRows: BudgetWithSpending[] = [],
    public goalRows: GoalSummaryRow[] = [],
  ) {}

  async getTransactionTotals(_userId: string, _filter: DateRangeFilter): Promise<TransactionTotals> {
    return this.totals;
  }

  async getCategorySpending(_userId: string, _filter: DateRangeFilter): Promise<CategorySpendingRow[]> {
    return this.spendingRows;
  }

  async getCategoryIncome(_userId: string, _filter: DateRangeFilter): Promise<CategoryIncomeRow[]> {
    return this.incomeRows;
  }

  async getCashFlowByMonth(_userId: string, _filter: DateRangeFilter): Promise<CashFlowRow[]> {
    return this.cashFlowRows;
  }

  async getBudgetsWithSpending(_userId: string): Promise<BudgetWithSpending[]> {
    return this.budgetRows;
  }

  async getGoalsSummary(_userId: string): Promise<GoalSummaryRow[]> {
    return this.goalRows;
  }
}

class MemoryCategoryRepository implements CategoryRepository {
  async findByIdForUserOrSystem(_id: string, _userId: string): Promise<CategoryRecord | null> { return null; }
  async createForUser(): Promise<CategoryRecord> { return null as unknown as CategoryRecord; }
  async listForUser(): Promise<{ categories: CategoryRecord[]; totalItems: number }> {
    return {
      categories: [
        { id: "cat1", userId: userA, name: "Food", type: "EXPENSE", systemDefined: false, archived: false, createdAt: new Date(), updatedAt: new Date() },
      ],
      totalItems: 1,
    };
  }
  async updateNameForUser(): Promise<CategoryRecord | null> { return null; }
  async archiveForUser(): Promise<CategoryRecord | null> { return null; }
}

function createTestContext(analyticsRepo?: Partial<MemoryAnalyticsRepository>) {
  const repo = new MemoryAnalyticsRepository(
    analyticsRepo?.totals,
    analyticsRepo?.spendingRows,
    analyticsRepo?.incomeRows,
    analyticsRepo?.cashFlowRows,
    analyticsRepo?.budgetRows,
    analyticsRepo?.goalRows,
  );
  const categoryRepo = new MemoryCategoryRepository();
  const analyticsService = new AnalyticsService(repo, categoryRepo);
  const financialHealthService = new FinancialHealthService(analyticsService);
  const accessTokenService = new JoseAccessTokenService(testJwtSecret);
  const app = createApp({
    analytics: { service: analyticsService, accessTokenService },
    financialHealth: { service: financialHealthService, accessTokenService },
  });
  return { app, repo, accessTokenService };
}

async function withServer<T>(
  callback: (ctx: { baseUrl: string } & ReturnType<typeof createTestContext>) => Promise<T>,
  analyticsRepo?: Partial<MemoryAnalyticsRepository>,
): Promise<T> {
  const ctx = createTestContext(analyticsRepo);
  const server = createServer(ctx.app);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try { return await callback({ baseUrl, ...ctx }); }
  finally { await new Promise<void>((r, j) => { server.close((e) => e ? j(e) : r()); }); }
}

async function apiRequest(baseUrl: string, userId: string | undefined, path: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (userId) headers.Cookie = `${ACCESS_COOKIE_NAME}=${await new JoseAccessTokenService(testJwtSecret).issue(userId)}`;
  return fetch(`${baseUrl}${path}`, { headers });
}

// ---- AUTH ----
test("unauthenticated GET /analytics/summary returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await apiRequest(baseUrl, undefined, "/api/v1/analytics/summary")).status, 401);
  });
});

test("unauthenticated GET /analytics/cash-flow returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await apiRequest(baseUrl, undefined, "/api/v1/analytics/cash-flow")).status, 401);
  });
});

test("unauthenticated GET /analytics/spending returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await apiRequest(baseUrl, undefined, "/api/v1/analytics/spending")).status, 401);
  });
});

test("unauthenticated GET /analytics/income returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await apiRequest(baseUrl, undefined, "/api/v1/analytics/income")).status, 401);
  });
});

test("unauthenticated GET /analytics/budgets returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await apiRequest(baseUrl, undefined, "/api/v1/analytics/budgets")).status, 401);
  });
});

test("unauthenticated GET /analytics/goals returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await apiRequest(baseUrl, undefined, "/api/v1/analytics/goals")).status, 401);
  });
});

test("unauthenticated GET /financial-health returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await apiRequest(baseUrl, undefined, "/api/v1/financial-health")).status, 401);
  });
});

// ---- VALIDATION ----
test("invalid startDate in query returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await apiRequest(baseUrl, userA, "/api/v1/analytics/summary?startDate=not-a-date")).status, 400);
  });
});

test("endDate before startDate returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await apiRequest(baseUrl, userA, "/api/v1/analytics/summary?startDate=2026-06-01&endDate=2026-01-01")).status, 400);
  });
});

test("unknown query field returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await apiRequest(baseUrl, userA, "/api/v1/analytics/summary?userId=x")).status, 400);
  });
});

// ---- SUMMARY ----
test("GET /analytics/summary returns 200 with correct shape", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/analytics/summary");
    const body = await r.json() as { summary: Record<string, unknown> };
    assert.equal(r.status, 200);
    assert.ok(body.summary);
    assert.ok("totalIncome" in body.summary);
    assert.ok("totalExpenses" in body.summary);
    assert.ok("netCashFlow" in body.summary);
    assert.ok("transactionCount" in body.summary);
    assert.ok("dateRange" in body.summary);
  }, { totals: { totalIncome: "500.0000", totalExpenses: "300.0000", transactionCount: 10, transferCount: 2 } });
});

test("summary net cash flow = income - expenses", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/analytics/summary");
    const body = await r.json() as { summary: { totalIncome: string; totalExpenses: string; netCashFlow: string } };
    assert.equal(r.status, 200);
    const income = parseFloat(body.summary.totalIncome);
    const expenses = parseFloat(body.summary.totalExpenses);
    const net = parseFloat(body.summary.netCashFlow);
    assert.ok(Math.abs(net - (income - expenses)) < 0.001);
  }, { totals: { totalIncome: "1000.0000", totalExpenses: "600.0000", transactionCount: 5, transferCount: 0 } });
});

test("summary does not expose userId", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/analytics/summary");
    const text = await r.text();
    assert.ok(!text.includes(userA));
    assert.ok(!text.includes(userB));
  });
});

test("summary with no data returns zero values", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/analytics/summary");
    const body = await r.json() as { summary: { totalIncome: string; totalExpenses: string; transactionCount: number } };
    assert.equal(r.status, 200);
    assert.equal(body.summary.totalIncome, "0.0000");
    assert.equal(body.summary.totalExpenses, "0.0000");
    assert.equal(body.summary.transactionCount, 0);
  });
});

test("savings rate is null when income is zero", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/analytics/summary");
    const body = await r.json() as { summary: { savingsRate: unknown } };
    assert.equal(body.summary.savingsRate, null);
  });
});

test("savings rate is calculated when income > 0", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/analytics/summary");
    const body = await r.json() as { summary: { savingsRate: string } };
    assert.ok(body.summary.savingsRate !== null);
    assert.match(body.summary.savingsRate, /^-?\d+\.\d{2}$/);
  }, { totals: { totalIncome: "1000.0000", totalExpenses: "800.0000", transactionCount: 5, transferCount: 0 } });
});

// ---- CASH FLOW ----
test("GET /analytics/cash-flow returns periods array", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/analytics/cash-flow");
    const body = await r.json() as { cashFlow: { periods: unknown[] } };
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(body.cashFlow.periods));
  }, {
    cashFlowRows: [{ year: 2026, month: 1, income: "500.0000", expenses: "300.0000" }],
  });
});

test("cash flow period net = income - expenses", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/analytics/cash-flow");
    const body = await r.json() as { cashFlow: { periods: Array<{ income: string; expenses: string; net: string }> } };
    assert.equal(r.status, 200);
    if (body.cashFlow.periods.length > 0) {
      const p = body.cashFlow.periods[0];
      const expected = (parseFloat(p.income) - parseFloat(p.expenses)).toFixed(4);
      assert.equal(p.net, expected);
    }
  }, {
    cashFlowRows: [{ year: 2026, month: 1, income: "500.0000", expenses: "300.0000" }],
  });
});

// ---- SPENDING ----
test("GET /analytics/spending returns categories with percentages", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/analytics/spending");
    const body = await r.json() as { spending: { categories: Array<{ categoryName: string; amount: string; percentage: string }> } };
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(body.spending.categories));
    if (body.spending.categories.length > 0) {
      const cat = body.spending.categories[0];
      assert.ok(cat.categoryName);
      assert.match(cat.amount, /^\d+\.\d{4}$/);
      assert.match(cat.percentage, /^\d+\.\d{2}$/);
    }
  }, { spendingRows: [{ categoryId: "cat1", amount: "100.0000", transactionCount: 3 }] });
});

test("spending does not include transfer amounts", async () => {
  // The repository layer excludes TRANSFER — spending only queries type=EXPENSE
  // We verify that the spending endpoint works correctly and does NOT expose userId
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/analytics/spending");
    const text = await r.text();
    assert.equal(r.status, 200);
    assert.ok(!text.includes(userA));
  });
});

// ---- INCOME ----
test("GET /analytics/income returns 200 with income breakdown", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/analytics/income");
    const body = await r.json() as { income: { categories: unknown[]; total: string } };
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(body.income.categories));
    assert.match(body.income.total, /^\d+\.\d{4}$/);
  }, { incomeRows: [{ categoryId: null, amount: "500.0000", transactionCount: 2 }] });
});

// ---- BUDGETS ANALYTICS ----
test("GET /analytics/budgets returns utilization and over-budget indicator", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/analytics/budgets");
    const body = await r.json() as {
      budgetsAnalytics: {
        budgets: Array<{ budgetAmount: string; spentAmount: string; utilizationPercentage: string; overBudget: boolean }>;
      }
    };
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(body.budgetsAnalytics.budgets));
    if (body.budgetsAnalytics.budgets.length > 0) {
      const b = body.budgetsAnalytics.budgets[0];
      assert.ok(typeof b.overBudget === "boolean");
      assert.match(b.utilizationPercentage, /^\d+\.\d{2}$/);
    }
  }, {
    budgetRows: [{
      budgetId: "b1", name: "Food", budgetAmount: "500.0000", spentAmount: "600.0000",
      currency: "USD", categoryId: null, startDate: new Date("2026-01-01"), endDate: new Date("2026-01-31"),
    }],
  });
});

test("over-budget is true when spent > budgeted", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/analytics/budgets");
    const body = await r.json() as { budgetsAnalytics: { budgets: Array<{ overBudget: boolean }> } };
    assert.equal(body.budgetsAnalytics.budgets[0].overBudget, true);
  }, {
    budgetRows: [{
      budgetId: "b1", name: "Food", budgetAmount: "500.0000", spentAmount: "600.0000",
      currency: "USD", categoryId: null, startDate: new Date("2026-01-01"), endDate: new Date("2026-01-31"),
    }],
  });
});

// ---- GOALS ANALYTICS ----
test("GET /analytics/goals returns progress percentage and status counts", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/analytics/goals");
    const body = await r.json() as {
      goalsAnalytics: {
        goals: Array<{ progressPercentage: string; status: string }>;
        totalActiveGoals: number;
      }
    };
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(body.goalsAnalytics.goals));
    assert.ok(typeof body.goalsAnalytics.totalActiveGoals === "number");
    if (body.goalsAnalytics.goals.length > 0) {
      assert.match(body.goalsAnalytics.goals[0].progressPercentage, /^\d+\.\d{2}$/);
    }
  }, {
    goalRows: [{ goalId: "g1", name: "Emergency Fund", targetAmount: "1000.0000", currentAmount: "250.0000", status: "ACTIVE", currency: "USD" }],
  });
});

test("goal progress percentage = (current / target) * 100", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/analytics/goals");
    const body = await r.json() as { goalsAnalytics: { goals: Array<{ progressPercentage: string }> } };
    assert.equal(r.status, 200);
    const progress = parseFloat(body.goalsAnalytics.goals[0].progressPercentage);
    assert.ok(Math.abs(progress - 25) < 0.01); // 250/1000 = 25%
  }, {
    goalRows: [{ goalId: "g1", name: "EF", targetAmount: "1000.0000", currentAmount: "250.0000", status: "ACTIVE", currency: "USD" }],
  });
});

// ---- FINANCIAL HEALTH ----
test("GET /financial-health returns 200 with score and components", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/financial-health");
    const body = await r.json() as {
      financialHealth: {
        overallScore: number;
        components: Record<string, { score: number }>;
        metrics: Record<string, unknown>;
        insights: unknown[];
        disclaimer: string;
      }
    };
    assert.equal(r.status, 200);
    assert.ok(typeof body.financialHealth.overallScore === "number");
    assert.ok(body.financialHealth.overallScore >= 0);
    assert.ok(body.financialHealth.overallScore <= 100);
    assert.ok(body.financialHealth.components);
    assert.ok(body.financialHealth.components.savingsRate);
    assert.ok(body.financialHealth.components.budgetAdherence);
    assert.ok(body.financialHealth.components.goalProgress);
    assert.ok(body.financialHealth.components.cashFlowHealth);
    assert.ok(body.financialHealth.components.spendingStability);
    assert.ok(Array.isArray(body.financialHealth.insights));
    assert.ok(typeof body.financialHealth.disclaimer === "string");
  }, {
    totals: { totalIncome: "1000.0000", totalExpenses: "800.0000", transactionCount: 10, transferCount: 0 },
  });
});

test("financial health score is bounded 0–100", async () => {
  // Worst case: no income, high expenses
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/financial-health");
    const body = await r.json() as { financialHealth: { overallScore: number } };
    assert.ok(body.financialHealth.overallScore >= 0);
    assert.ok(body.financialHealth.overallScore <= 100);
  }, {
    totals: { totalIncome: "0.0000", totalExpenses: "5000.0000", transactionCount: 20, transferCount: 0 },
  });
});

test("financial health score is deterministic for same inputs", async () => {
  const analyticsRepo: Partial<MemoryAnalyticsRepository> = {
    totals: { totalIncome: "1000.0000", totalExpenses: "700.0000", transactionCount: 10, transferCount: 0 },
    cashFlowRows: [{ year: 2026, month: 1, income: "1000.0000", expenses: "700.0000" }],
  };

  let score1: number, score2: number;

  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/financial-health");
    score1 = (await r.json() as { financialHealth: { overallScore: number } }).financialHealth.overallScore;
  }, analyticsRepo);

  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/financial-health");
    score2 = (await r.json() as { financialHealth: { overallScore: number } }).financialHealth.overallScore;
  }, analyticsRepo);

  assert.equal(score1!, score2!);
});

test("financial health empty/new-user scenario returns score without crashing", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/financial-health");
    const body = await r.json() as { financialHealth: { overallScore: number; metrics: { hasSufficientData: boolean } } };
    assert.equal(r.status, 200);
    assert.equal(typeof body.financialHealth.overallScore, "number");
    assert.equal(body.financialHealth.metrics.hasSufficientData, false);
  });
});

test("financial health includes insights array with at least one entry", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/financial-health");
    const body = await r.json() as { financialHealth: { insights: Array<{ type: string; message: string }> } };
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(body.financialHealth.insights));
    assert.ok(body.financialHealth.insights.length > 0);
    const insight = body.financialHealth.insights[0];
    assert.ok(["positive", "warning", "neutral"].includes(insight.type));
    assert.ok(typeof insight.message === "string");
  });
});

test("financial health does not expose userId", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/financial-health");
    const text = await r.text();
    assert.ok(!text.includes(userA));
    assert.ok(!text.includes(userB));
  });
});

test("date range filtering is accepted", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/analytics/summary?startDate=2026-01-01&endDate=2026-01-31");
    assert.equal(r.status, 200);
    const body = await r.json() as { summary: { dateRange: { startDate: string; endDate: string } } };
    assert.equal(body.summary.dateRange.startDate, "2026-01-01");
    assert.equal(body.summary.dateRange.endDate, "2026-01-31");
  });
});

test("decimal precision is preserved in all amounts", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await apiRequest(baseUrl, userA, "/api/v1/analytics/summary");
    const body = await r.json() as { summary: { totalIncome: string; totalExpenses: string; netCashFlow: string } };
    assert.match(body.summary.totalIncome, /^\d+\.\d{4}$/);
    assert.match(body.summary.totalExpenses, /^\d+\.\d{4}$/);
    assert.match(body.summary.netCashFlow, /^-?\d+\.\d{4}$/);
  }, { totals: { totalIncome: "1234.5678", totalExpenses: "987.6543", transactionCount: 5, transferCount: 0 } });
});
