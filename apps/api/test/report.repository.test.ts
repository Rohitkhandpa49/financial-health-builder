import assert from "node:assert/strict";
import type { PrismaClient } from "../../../database/prisma/generated/client/client.js";
import { test } from "node:test";
import { createPrismaReportRepository } from "../src/reports/report.repository.js";

const userA = "00000000-0000-4000-8000-000000000001";
const startDate = new Date("2026-01-01T00:00:00.000Z");
const endDate = new Date("2026-01-31T23:59:59.999Z");

function dec(n: number) {
  return { toFixed: (p: number) => n.toFixed(p) };
}

function makePrismaStub() {
  const calls: Record<string, unknown> = {};
  const prisma = {
    account: {
      findMany: async (args: unknown) => {
        calls.accountFindMany = args;
        return [
          { id: "acc1", name: "Savings", currency: "USD", openingBalance: dec(1000) },
          { id: "acc2", name: "Checking", currency: "USD", openingBalance: dec(500) },
        ];
      },
    },
    transaction: {
      aggregate: async (args: unknown) => {
        calls.aggregate = args;
        return { _sum: { amount: dec(200) } };
      },
      count: async () => 5,
    },
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
  } as unknown as PrismaClient;
  return { prisma, calls };
}

test("getAccountActivity scopes to userId and fetches non-archived accounts", async () => {
  const { prisma, calls } = makePrismaStub();
  const repo = createPrismaReportRepository(prisma);
  await repo.getAccountActivity(userA, { startDate, endDate });

  const args = calls.accountFindMany as { where: { userId: string; archived: boolean } };
  assert.equal(args.where.userId, userA);
  assert.equal(args.where.archived, false);
});

test("getAccountActivity returns toFixed(4) strings for all amounts", async () => {
  const { prisma } = makePrismaStub();
  const repo = createPrismaReportRepository(prisma);
  const result = await repo.getAccountActivity(userA, { startDate, endDate });

  assert.ok(Array.isArray(result));
  for (const row of result) {
    assert.match(row.openingBalance, /^\d+\.\d{4}$/);
    assert.match(row.totalIncome, /^\d+\.\d{4}$/);
    assert.match(row.totalExpenses, /^\d+\.\d{4}$/);
  }
});

test("getAccountActivity uses $transaction for atomic per-account queries", async () => {
  const { prisma, calls } = makePrismaStub();
  const repo = createPrismaReportRepository(prisma);
  await repo.getAccountActivity(userA, { startDate, endDate });
  assert.ok(calls.aggregate, "$transaction aggregate should be called");
});

test("getAccountActivity returns one row per account", async () => {
  const { prisma } = makePrismaStub();
  const repo = createPrismaReportRepository(prisma);
  const result = await repo.getAccountActivity(userA, { startDate, endDate });
  assert.equal(result.length, 2);
  assert.equal(result[0].accountName, "Savings");
  assert.equal(result[1].accountName, "Checking");
});

test("empty accounts returns empty array", async () => {
  const prisma = {
    account: { findMany: async () => [] },
    transaction: { aggregate: async () => ({ _sum: { amount: null } }), count: async () => 0 },
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
  } as unknown as PrismaClient;
  const repo = createPrismaReportRepository(prisma);
  const result = await repo.getAccountActivity(userA, { startDate, endDate });
  assert.deepEqual(result, []);
});
