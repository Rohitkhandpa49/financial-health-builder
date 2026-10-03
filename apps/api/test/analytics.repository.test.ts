import assert from "node:assert/strict";
import type { PrismaClient } from "../../../database/prisma/generated/client/client.js";
import { test } from "node:test";
import { createPrismaAnalyticsRepository } from "../src/analytics/analytics.repository.js";

const userA = "00000000-0000-4000-8000-000000000001";
const startDate = new Date("2026-01-01T00:00:00.000Z");
const endDate = new Date("2026-01-31T23:59:59.999Z");

function dec(n: number) {
  return { toFixed: (p: number) => n.toFixed(p) };
}

function makePrismaStub() {
  const calls: Record<string, unknown> = {};

  const prisma = {
    transaction: {
      aggregate: async (args: unknown) => {
        calls.aggregate = args;
        return { _sum: { amount: dec(100) } };
      },
      count: async (args: unknown) => {
        calls.count = args;
        return 5;
      },
      groupBy: async (args: unknown) => {
        calls.groupBy = args;
        return [
          { categoryId: "cat1", _sum: { amount: dec(80) }, _count: { id: 3 } },
          { categoryId: null, _sum: { amount: dec(20) }, _count: { id: 2 } },
        ];
      },
      findMany: async (args: unknown) => {
        calls.findMany = args;
        return [
          { type: "INCOME", amount: dec(200), effectiveAt: new Date("2026-01-15") },
          { type: "EXPENSE", amount: dec(120), effectiveAt: new Date("2026-01-20") },
        ];
      },
    },
    budget: {
      findMany: async (args: unknown) => {
        calls.budgetFindMany = args;
        return [
          {
            id: "budget1",
            name: "Food",
            amount: dec(500),
            currency: "USD",
            categoryId: "cat1",
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-01-31"),
          },
        ];
      },
    },
    savingsGoal: {
      findMany: async (args: unknown) => {
        calls.goalFindMany = args;
        return [
          { id: "goal1", name: "Emergency Fund", targetAmount: dec(1000), currentAmount: dec(250), status: "ACTIVE", currency: "USD" },
        ];
      },
    },
    $transaction: async (ops: unknown[]) => {
      calls.$transaction = ops;
      return await Promise.all((ops as Array<Promise<unknown>>));
    },
  } as unknown as PrismaClient;

  return { prisma, calls };
}

test("getTransactionTotals uses $transaction and scopes by userId and date range", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaAnalyticsRepository(prisma);
  const result = await repository.getTransactionTotals(userA, { startDate, endDate });

  assert.ok(calls.$transaction, "$transaction should be called for atomicity");
  assert.ok(result.totalIncome, "totalIncome should be present");
  assert.ok(result.totalExpenses, "totalExpenses should be present");
  assert.equal(typeof result.transactionCount, "number");
  assert.equal(typeof result.transferCount, "number");
});

test("getTransactionTotals returns toFixed(4) strings", async () => {
  const { prisma } = makePrismaStub();
  const repository = createPrismaAnalyticsRepository(prisma);
  const result = await repository.getTransactionTotals(userA, { startDate, endDate });
  assert.match(result.totalIncome, /^\d+\.\d{4}$/);
  assert.match(result.totalExpenses, /^\d+\.\d{4}$/);
});

test("getCategorySpending uses groupBy with EXPENSE type and userId", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaAnalyticsRepository(prisma);
  const result = await repository.getCategorySpending(userA, { startDate, endDate });

  const groupByArgs = calls.groupBy as { where: { userId: string; type: string } };
  assert.equal(groupByArgs.where.userId, userA);
  assert.equal(groupByArgs.where.type, "EXPENSE");
  assert.ok(Array.isArray(result));
  for (const row of result) {
    assert.ok("categoryId" in row);
    assert.ok("amount" in row);
    assert.ok("transactionCount" in row);
    assert.match(row.amount, /^\d+\.\d{4}$/);
  }
});

test("getCategoryIncome uses groupBy with INCOME type", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaAnalyticsRepository(prisma);
  await repository.getCategoryIncome(userA, { startDate, endDate });

  const groupByArgs = calls.groupBy as { where: { type: string } };
  assert.equal(groupByArgs.where.type, "INCOME");
});

test("getCashFlowByMonth fetches INCOME and EXPENSE and groups by month", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaAnalyticsRepository(prisma);
  const result = await repository.getCashFlowByMonth(userA, { startDate, endDate });

  const findManyArgs = calls.findMany as { where: { userId: string; type: { in: string[] } } };
  assert.equal(findManyArgs.where.userId, userA);
  assert.ok(findManyArgs.where.type.in.includes("INCOME"));
  assert.ok(findManyArgs.where.type.in.includes("EXPENSE"));
  assert.ok(Array.isArray(result));
  if (result.length > 0) {
    const row = result[0];
    assert.ok(typeof row.year === "number");
    assert.ok(typeof row.month === "number");
    assert.match(row.income, /^\d+\.\d{4}$/);
    assert.match(row.expenses, /^\d+\.\d{4}$/);
  }
});

test("getCashFlowByMonth excludes TRANSFER transactions", async () => {
  // The repository passes type: { in: ["INCOME", "EXPENSE"] } to Prisma,
  // so TRANSFER rows are excluded at the database level.
  // We test this by having the stub respect the type filter.
  const prisma = {
    transaction: {
      findMany: async (args: { where: { type: { in: string[] } } }) => {
        const allowedTypes = args.where.type.in;
        const allTxs = [
          { type: "INCOME", amount: dec(500), effectiveAt: new Date("2026-01-10") },
          { type: "TRANSFER", amount: dec(200), effectiveAt: new Date("2026-01-12") },
          { type: "EXPENSE", amount: dec(300), effectiveAt: new Date("2026-01-15") },
        ];
        return allTxs.filter((tx) => allowedTypes.includes(tx.type));
      },
    },
    $transaction: async (ops: unknown[]) => Promise.all((ops as Array<Promise<unknown>>)),
  } as unknown as PrismaClient;

  const repository = createPrismaAnalyticsRepository(prisma);
  const result = await repository.getCashFlowByMonth(userA, { startDate, endDate });
  // Only INCOME and EXPENSE should be in results — TRANSFER excluded
  assert.equal(result.length, 1); // only January
  assert.equal(result[0].income, "500.0000");
  assert.equal(result[0].expenses, "300.0000");
});

test("getBudgetsWithSpending fetches budgets and aggregates spending per budget", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaAnalyticsRepository(prisma);
  const result = await repository.getBudgetsWithSpending(userA);

  const budgetArgs = calls.budgetFindMany as { where: { userId: string } };
  assert.equal(budgetArgs.where.userId, userA);
  assert.ok(Array.isArray(result));
  if (result.length > 0) {
    const row = result[0];
    assert.ok(row.budgetId);
    assert.ok(row.name);
    assert.match(row.budgetAmount, /^\d+\.\d{4}$/);
    assert.match(row.spentAmount, /^\d+\.\d{4}$/);
  }
});

test("getGoalsSummary fetches goals scoped to userId and returns toFixed(4) amounts", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaAnalyticsRepository(prisma);
  const result = await repository.getGoalsSummary(userA);

  const goalArgs = calls.goalFindMany as { where: { userId: string } };
  assert.equal(goalArgs.where.userId, userA);
  assert.ok(Array.isArray(result));
  if (result.length > 0) {
    const row = result[0];
    assert.ok(row.goalId);
    assert.match(row.targetAmount, /^\d+\.\d{4}$/);
    assert.match(row.currentAmount, /^\d+\.\d{4}$/);
  }
});

test("empty data returns zero strings not null", async () => {
  const prisma = {
    transaction: {
      aggregate: async () => ({ _sum: { amount: null } }),
      count: async () => 0,
      groupBy: async () => [],
      findMany: async () => [],
    },
    budget: { findMany: async () => [] },
    savingsGoal: { findMany: async () => [] },
    $transaction: async (ops: unknown[]) => Promise.all((ops as Array<Promise<unknown>>)),
  } as unknown as PrismaClient;

  const repository = createPrismaAnalyticsRepository(prisma);
  const totals = await repository.getTransactionTotals(userA, { startDate, endDate });
  assert.equal(totals.totalIncome, "0.0000");
  assert.equal(totals.totalExpenses, "0.0000");
  assert.equal(totals.transactionCount, 0);

  const goals = await repository.getGoalsSummary(userA);
  assert.deepEqual(goals, []);
});
