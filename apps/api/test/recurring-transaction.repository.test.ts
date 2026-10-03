import assert from "node:assert/strict";
import type {
  RecurringTransaction as PrismaRecurringTransaction,
  PrismaClient,
} from "../../../database/prisma/generated/client/client.js";
import { RecurrenceFrequency as PrismaRecurrenceFrequency } from "../../../database/prisma/generated/client/enums.js";
import { test } from "node:test";
import {
  RECURRENCE_FREQUENCIES,
  RECURRING_TRANSACTION_TYPES,
} from "../../../packages/contracts/src/recurring-transactions/recurring-transactions.js";
import { createPrismaRecurringTransactionRepository } from "../src/recurring-transactions/recurring-transaction.repository.js";

const userA = "00000000-0000-4000-8000-000000000001";
const accountA1 = "10000000-0000-4000-8000-000000000001";
const rtA1 = "60000000-0000-4000-8000-000000000001";

test("RECURRENCE_FREQUENCIES values all exist in Prisma RecurrenceFrequency enum", () => {
  const prismaValues = Object.values(PrismaRecurrenceFrequency);
  for (const freq of RECURRENCE_FREQUENCIES) {
    assert.ok(prismaValues.includes(freq as PrismaRecurrenceFrequency), `${freq} should be in Prisma enum`);
  }
});

test("RECURRING_TRANSACTION_TYPES excludes TRANSFER", () => {
  assert.ok(!RECURRING_TRANSACTION_TYPES.includes("TRANSFER" as never), "TRANSFER should not be in RECURRING_TRANSACTION_TYPES");
});

function makePrismaRecurring(overrides: Partial<PrismaRecurringTransaction> = {}): PrismaRecurringTransaction {
  return {
    id: rtA1,
    userId: userA,
    accountId: accountA1,
    categoryId: null,
    type: "EXPENSE",
    amount: { toFixed: (n: number) => (100).toFixed(n) },
    currency: "USD",
    description: "Monthly rent",
    frequency: "MONTHLY",
    startDate: new Date("2026-01-01"),
    endDate: null,
    nextDate: new Date("2026-02-01"),
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  } as unknown as PrismaRecurringTransaction;
}

function makePrismaStub(record = makePrismaRecurring()) {
  const calls: Record<string, unknown> = {};
  const prisma = {
    recurringTransaction: {
      create: async (args: unknown) => { calls.create = args; return record; },
      findMany: async (args: unknown) => { calls.findMany = args; return [record]; },
      count: async (args: unknown) => { calls.count = args; return 1; },
      findFirst: async (args: unknown) => { calls.findFirst = args; return record; },
      update: async (args: unknown) => { calls.update = args; return record; },
      deleteMany: async (args: unknown) => { calls.deleteMany = args; return { count: 1 }; },
    },
  } as unknown as PrismaClient;
  return { prisma, calls };
}

test("createForUser sets correct fields including currency from parameter", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaRecurringTransactionRepository(prisma);
  await repository.createForUser(userA, {
    accountId: accountA1,
    type: "EXPENSE",
    amount: "100.0000",
    description: "Monthly rent",
    frequency: "MONTHLY",
    startDate: "2026-01-01",
    nextDate: "2026-02-01",
  }, "USD");

  const createArgs = calls.create as { data: Record<string, unknown> };
  assert.equal(createArgs.data.userId, userA);
  assert.equal(createArgs.data.accountId, accountA1);
  assert.equal(createArgs.data.type, "EXPENSE");
  assert.equal(createArgs.data.amount, "100.0000");
  assert.equal(createArgs.data.currency, "USD");
  assert.equal(createArgs.data.description, "Monthly rent");
  assert.equal(createArgs.data.frequency, "MONTHLY");
  assert.ok(createArgs.data.startDate instanceof Date);
  assert.ok(createArgs.data.nextDate instanceof Date);
  assert.equal(createArgs.data.categoryId, null);
  assert.equal(createArgs.data.endDate, null);
});

test("listForUser applies NOT TRANSFER filter, userId scoping, pagination, and ordering", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaRecurringTransactionRepository(prisma);
  await repository.listForUser(userA, { page: 2, pageSize: 10 });

  const findManyArgs = calls.findMany as {
    where: Record<string, unknown>;
    orderBy: unknown[];
    skip: number;
    take: number;
  };
  assert.equal(findManyArgs.where.userId, userA);
  assert.deepEqual(findManyArgs.where.NOT, { type: "TRANSFER" });
  assert.deepEqual(findManyArgs.orderBy, [
    { nextDate: "asc" },
    { createdAt: "desc" },
    { id: "desc" },
  ]);
  assert.equal(findManyArgs.skip, 10);
  assert.equal(findManyArgs.take, 10);

  const countArgs = calls.count as { where: Record<string, unknown> };
  assert.equal(countArgs.where.userId, userA);
  assert.deepEqual(countArgs.where.NOT, { type: "TRANSFER" });
});

test("listForUser includes active filter when provided", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaRecurringTransactionRepository(prisma);
  await repository.listForUser(userA, { page: 1, pageSize: 25, active: false });

  const findManyArgs = calls.findMany as { where: Record<string, unknown> };
  assert.equal(findManyArgs.where.active, false);
});

test("listForUser includes accountId filter when provided", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaRecurringTransactionRepository(prisma);
  await repository.listForUser(userA, { page: 1, pageSize: 25, accountId: accountA1 });

  const findManyArgs = calls.findMany as { where: Record<string, unknown> };
  assert.equal(findManyArgs.where.accountId, accountA1);
});

test("findByIdForUser where predicate includes id, userId, and NOT TRANSFER", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaRecurringTransactionRepository(prisma);
  await repository.findByIdForUser(rtA1, userA);

  const findFirstArgs = calls.findFirst as { where: Record<string, unknown> };
  assert.equal(findFirstArgs.where.id, rtA1);
  assert.equal(findFirstArgs.where.userId, userA);
  assert.deepEqual(findFirstArgs.where.NOT, { type: "TRANSFER" });
});

test("updateForUser two-step: findFirst called first for ownership, then update by id", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaRecurringTransactionRepository(prisma);
  await repository.updateForUser(rtA1, userA, { description: "Updated rent", active: false });

  const findFirstArgs = calls.findFirst as { where: Record<string, unknown> };
  assert.equal(findFirstArgs.where.id, rtA1);
  assert.equal(findFirstArgs.where.userId, userA);
  assert.deepEqual(findFirstArgs.where.NOT, { type: "TRANSFER" });

  const updateArgs = calls.update as { where: Record<string, unknown>; data: Record<string, unknown> };
  assert.deepEqual(updateArgs.where, { id: rtA1 });
  assert.equal(updateArgs.data.description, "Updated rent");
  assert.equal(updateArgs.data.active, false);
});

test("deleteForUser returns true when deleteMany count is 1", async () => {
  const { prisma } = makePrismaStub();
  const repository = createPrismaRecurringTransactionRepository(prisma);
  const result = await repository.deleteForUser(rtA1, userA);
  assert.equal(result, true);
});

test("deleteForUser returns false when deleteMany count is 0", async () => {
  const prisma = {
    recurringTransaction: {
      deleteMany: async () => ({ count: 0 }),
    },
  } as unknown as PrismaClient;
  const repository = createPrismaRecurringTransactionRepository(prisma);
  const result = await repository.deleteForUser(rtA1, userA);
  assert.equal(result, false);
});

test("amount is serialized as toFixed(4) string", async () => {
  const record = makePrismaRecurring({
    amount: { toFixed: (n: number) => (75.5).toFixed(n) } as unknown as PrismaRecurringTransaction["amount"],
  });
  const { prisma } = makePrismaStub(record);
  const repository = createPrismaRecurringTransactionRepository(prisma);
  const result = await repository.findByIdForUser(rtA1, userA);
  assert.equal(result?.amount, "75.5000");
  assert.equal(typeof result?.amount, "string");
});
