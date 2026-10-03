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
import type { CategoryRecord, CategoryRepository } from "../src/categories/category.repository.js";
import type { ReportRepository, AccountActivityRow, TransactionExportRow } from "../src/reports/report.repository.js";
import { ReportService } from "../src/reports/report.service.js";

const userA = "00000000-0000-4000-8000-000000000001";
const testJwtSecret = "report-export-test-secret-at-least-32-chars";

// ── In-memory stubs ──────────────────────────────────────────────────────────

class MemoryAnalyticsRepository implements AnalyticsRepository {
  async getTransactionTotals(): Promise<TransactionTotals> {
    return { totalIncome: "0.0000", totalExpenses: "0.0000", transactionCount: 0, transferCount: 0 };
  }
  async getCategorySpending(): Promise<CategorySpendingRow[]> { return []; }
  async getCategoryIncome(): Promise<CategoryIncomeRow[]> { return []; }
  async getCashFlowByMonth(): Promise<CashFlowRow[]> { return []; }
  async getBudgetsWithSpending(): Promise<BudgetWithSpending[]> { return []; }
  async getGoalsSummary(): Promise<GoalSummaryRow[]> { return []; }
}

class MemoryCategoryRepository implements CategoryRepository {
  async findByIdForUserOrSystem(): Promise<CategoryRecord | null> { return null; }
  async createForUser(): Promise<CategoryRecord> { return null as unknown as CategoryRecord; }
  async listForUser(): Promise<{ categories: CategoryRecord[]; totalItems: number }> { return { categories: [], totalItems: 0 }; }
  async updateNameForUser(): Promise<CategoryRecord | null> { return null; }
  async archiveForUser(): Promise<CategoryRecord | null> { return null; }
}

class MemoryReportRepository implements ReportRepository {
  constructor(private rows: TransactionExportRow[] = []) {}
  async getAccountActivity(): Promise<AccountActivityRow[]> { return []; }
  async getTransactionsForExport(
    userId: string,
    filter: { startDate?: Date; endDate?: Date },
  ): Promise<TransactionExportRow[]> {
    let result = this.rows.filter((r) => r.type !== "TRANSFER");
    if (filter.startDate) result = result.filter((r) => r.effectiveAt >= filter.startDate!);
    if (filter.endDate) result = result.filter((r) => r.effectiveAt <= filter.endDate!);
    void userId;
    return result;
  }
}

function makeDecimal(val: string) {
  return { toString: () => val, toFixed: (n: number) => parseFloat(val).toFixed(n) };
}

function sampleRow(overrides: Partial<TransactionExportRow> = {}): TransactionExportRow {
  return {
    id: "00000000-0000-4000-8001-000000000001",
    type: "EXPENSE",
    amount: makeDecimal("42.5000") as unknown as TransactionExportRow["amount"],
    currency: "USD",
    description: "Groceries",
    effectiveAt: new Date("2026-01-15T12:00:00.000Z"),
    categoryId: "00000000-0000-4000-8002-000000000001",
    accountId: "00000000-0000-4000-8003-000000000001",
    createdAt: new Date("2026-01-15T12:00:00.000Z"),
    ...overrides,
  };
}

function createTestApp(exportRows: TransactionExportRow[] = []) {
  const analyticsRepo = new MemoryAnalyticsRepository();
  const categoryRepo = new MemoryCategoryRepository();
  const reportRepo = new MemoryReportRepository(exportRows);
  const analyticsService = new AnalyticsService(analyticsRepo, categoryRepo);
  const reportService = new ReportService(analyticsService, reportRepo);
  const accessTokenService = new JoseAccessTokenService(testJwtSecret);
  const app = createApp({
    reports: { service: reportService, accessTokenService, repository: reportRepo },
  });
  return { app, accessTokenService };
}

async function withServer<T>(
  callback: (ctx: { baseUrl: string }) => Promise<T>,
  exportRows?: TransactionExportRow[],
): Promise<T> {
  const { app } = createTestApp(exportRows);
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await callback({ baseUrl });
  } finally {
    await new Promise<void>((r, j) => { server.close((e) => e ? j(e) : r()); });
  }
}

async function exportReq(baseUrl: string, userId: string | undefined, qs: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (userId) {
    headers.Cookie = `${ACCESS_COOKIE_NAME}=${await new JoseAccessTokenService(testJwtSecret).issue(userId)}`;
  }
  return fetch(`${baseUrl}/api/v1/reports/export/csv${qs}`, { headers });
}

// ── AUTH ─────────────────────────────────────────────────────────────────────

test("CSV export unauthenticated returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await exportReq(baseUrl, undefined, "?type=transactions");
    assert.equal(r.status, 401);
  });
});

// ── VALIDATION ───────────────────────────────────────────────────────────────

test("CSV export without type param returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await exportReq(baseUrl, userA, "");
    assert.equal(r.status, 400);
  });
});

test("CSV export with unknown extra param returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await exportReq(baseUrl, userA, "?type=transactions&userId=hack");
    assert.equal(r.status, 400);
  });
});

test("CSV export with invalid date format returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await exportReq(baseUrl, userA, "?type=transactions&startDate=not-a-date");
    assert.equal(r.status, 400);
  });
});

// ── SUCCESS ───────────────────────────────────────────────────────────────────

test("CSV export with type=transactions returns 200 and text/csv content-type", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await exportReq(baseUrl, userA, "?type=transactions");
    assert.equal(r.status, 200);
    assert.ok(r.headers.get("content-type")?.includes("text/csv"), "content-type should include text/csv");
  }, [sampleRow()]);
});

test("CSV export response contains correct header row", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await exportReq(baseUrl, userA, "?type=transactions");
    const text = await r.text();
    const firstLine = text.split("\r\n")[0];
    assert.equal(firstLine, "id,type,amount,currency,description,effectiveAt,categoryId,accountId,createdAt");
  }, []);
});

test("CSV export excludes TRANSFER type transactions", async () => {
  const rows = [
    sampleRow({ id: "00000000-0000-4000-8001-000000000001", type: "EXPENSE" }),
    sampleRow({ id: "00000000-0000-4000-8001-000000000002", type: "TRANSFER" }),
  ];
  await withServer(async ({ baseUrl }) => {
    const r = await exportReq(baseUrl, userA, "?type=transactions");
    const text = await r.text();
    assert.ok(text.includes("00000000-0000-4000-8001-000000000001"), "EXPENSE row should appear");
    assert.ok(!text.includes("00000000-0000-4000-8001-000000000002"), "TRANSFER row should not appear");
  }, rows);
});

test("CSV export date filter excludes transactions outside range", async () => {
  const inRange = sampleRow({
    id: "00000000-0000-4000-8001-000000000010",
    effectiveAt: new Date("2026-01-15T00:00:00.000Z"),
  });
  const outOfRange = sampleRow({
    id: "00000000-0000-4000-8001-000000000011",
    effectiveAt: new Date("2026-03-01T00:00:00.000Z"),
  });
  await withServer(async ({ baseUrl }) => {
    const r = await exportReq(baseUrl, userA, "?type=transactions&startDate=2026-01-01&endDate=2026-01-31");
    const text = await r.text();
    assert.ok(text.includes("00000000-0000-4000-8001-000000000010"), "in-range transaction should appear");
    assert.ok(!text.includes("00000000-0000-4000-8001-000000000011"), "out-of-range transaction should not appear");
  }, [inRange, outOfRange]);
});
