import assert from "node:assert/strict";
import type { Transaction as PrismaTransaction, PrismaClient } from "../../../database/prisma/generated/client/client.js";
import { TransactionType as PrismaTransactionType } from "../../../database/prisma/generated/client/enums.js";
import { test } from "node:test";
import { TRANSACTION_TYPES } from "../../../packages/contracts/src/transactions/transactions.js";
import { createPrismaTransactionRepository } from "../src/transactions/transaction.repository.js";

const userA = "00000000-0000-4000-8000-000000000001";
const transactionA = "30000000-0000-4000-8000-000000000001";

test("TRANSACTION_TYPES is a client-facing subset of the Prisma TransactionType enum (excludes TRANSFER)", () => {
  const prismaValues = Object.values(PrismaTransactionType);
  for (const type of TRANSACTION_TYPES) {
    assert.ok(prismaValues.includes(type), `${type} should be in Prisma enum`);
  }
  // TRANSFER exists in Prisma but not in TRANSACTION_TYPES
  assert.ok(!TRANSACTION_TYPES.includes("TRANSFER" as never), "TRANSFER should not be in TRANSACTION_TYPES");
  assert.ok(prismaValues.includes("TRANSFER"), "TRANSFER should be in Prisma enum");
  // They are NOT equal — Prisma has one more value
  assert.notDeepEqual([...TRANSACTION_TYPES].sort(), prismaValues.sort());
});

function makePrismaTransaction(overrides: Partial<PrismaTransaction> = {}): PrismaTransaction {
  return {
    id: transactionA,
    userId: userA,
    accountId: "10000000-0000-4000-8000-000000000001",
    categoryId: null,
    type: "EXPENSE",
    amount: { toFixed: (n: number) => (50).toFixed(n) },
    currency: "USD",
    description: "Groceries",
    effectiveAt: new Date("2026-01-15T00:00:00.000Z"),
    transferGroupId: null,
    transferDirection: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  } as unknown as PrismaTransaction;
}

function makePrismaStub(transaction = makePrismaTransaction()) {
  const calls: Record<string, unknown> = {};
  const prisma = {
    transaction: {
      create: async (args: unknown) => {
        calls.create = args;
        return transaction;
      },
      findMany: async (args: unknown) => {
        calls.findMany = args;
        return [transaction];
      },
      count: async (args: unknown) => {
        calls.count = args;
        return 1;
      },
      findFirst: async (args: unknown) => {
        calls.findFirst = args;
        return transaction;
      },
      update: async (args: unknown) => {
        calls.update = args;
        return transaction;
      },
      deleteMany: async (args: unknown) => {
        calls.deleteMany = args;
        return { count: 1 };
      },
    },
    $transaction: async (ops: unknown[]) => {
      calls.$transaction = ops;
      return await Promise.all((ops as Array<Promise<unknown>>));
    },
  } as unknown as PrismaClient;

  return { prisma, calls };
}

test("createForUser passes correct data shape and currency comes from param not client", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaTransactionRepository(prisma);
  const result = await repository.createForUser(userA, {
    accountId: "10000000-0000-4000-8000-000000000001",
    categoryId: null,
    type: "EXPENSE",
    amount: "50.0000",
    currency: "USD",
    description: "Groceries",
    effectiveAt: new Date("2026-01-15T00:00:00.000Z"),
  });

  const createArgs = calls.create as { data: Record<string, unknown>; select: Record<string, unknown> };
  assert.equal(createArgs.data.userId, userA);
  assert.equal(createArgs.data.accountId, "10000000-0000-4000-8000-000000000001");
  assert.equal(createArgs.data.type, "EXPENSE");
  assert.equal(createArgs.data.amount, "50.0000");
  assert.equal(createArgs.data.currency, "USD");
  assert.equal(createArgs.data.description, "Groceries");
  assert.equal(result.amount, "50.0000");
});

test("listForUser applies NOT TRANSFER filter, userId scoping, pagination, and ordering", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaTransactionRepository(prisma);
  await repository.listForUser(userA, { page: 2, pageSize: 10 });

  // $transaction was called
  assert.ok(calls.$transaction, "$transaction should be called");

  // findMany and count were both queued
  const findManyArgs = calls.findMany as {
    where: Record<string, unknown>;
    orderBy: unknown[];
    skip: number;
    take: number;
  };
  assert.equal(findManyArgs.where.userId, userA);
  assert.deepEqual(findManyArgs.where.NOT, { type: "TRANSFER" });
  assert.deepEqual(findManyArgs.orderBy, [
    { effectiveAt: "desc" },
    { createdAt: "desc" },
    { id: "desc" },
  ]);
  assert.equal(findManyArgs.skip, 10);
  assert.equal(findManyArgs.take, 10);

  const countArgs = calls.count as { where: Record<string, unknown> };
  assert.equal(countArgs.where.userId, userA);
  assert.deepEqual(countArgs.where.NOT, { type: "TRANSFER" });
});

test("listForUser includes accountId filter when provided", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaTransactionRepository(prisma);
  await repository.listForUser(userA, {
    page: 1,
    pageSize: 25,
    accountId: "10000000-0000-4000-8000-000000000001",
  });

  const findManyArgs = calls.findMany as { where: Record<string, unknown> };
  assert.equal(findManyArgs.where.accountId, "10000000-0000-4000-8000-000000000001");
});

test("findByIdForUser where predicate includes id, userId, and NOT TRANSFER", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaTransactionRepository(prisma);
  await repository.findByIdForUser(transactionA, userA);

  const findFirstArgs = calls.findFirst as { where: Record<string, unknown> };
  assert.equal(findFirstArgs.where.id, transactionA);
  assert.equal(findFirstArgs.where.userId, userA);
  assert.deepEqual(findFirstArgs.where.NOT, { type: "TRANSFER" });
});

test("updateForUser two-step: findFirst called first, then update by id only", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaTransactionRepository(prisma);
  await repository.updateForUser(transactionA, userA, { description: "Updated" });

  // findFirst is called first for ownership check
  const findFirstArgs = calls.findFirst as { where: Record<string, unknown> };
  assert.equal(findFirstArgs.where.id, transactionA);
  assert.equal(findFirstArgs.where.userId, userA);
  assert.deepEqual(findFirstArgs.where.NOT, { type: "TRANSFER" });

  // update is called with id only in where clause
  const updateArgs = calls.update as { where: Record<string, unknown>; data: Record<string, unknown> };
  assert.deepEqual(updateArgs.where, { id: transactionA });
  assert.equal(updateArgs.data.description, "Updated");
});

test("deleteForUser returns true when deleteMany count is 1", async () => {
  const { prisma } = makePrismaStub();
  const repository = createPrismaTransactionRepository(prisma);
  const result = await repository.deleteForUser(transactionA, userA);

  assert.equal(result, true);
});

test("deleteForUser returns false when deleteMany count is 0", async () => {
  const calls: Record<string, unknown> = {};
  const prisma = {
    transaction: {
      deleteMany: async (args: unknown) => {
        calls.deleteMany = args;
        return { count: 0 };
      },
    },
  } as unknown as PrismaClient;

  const repository = createPrismaTransactionRepository(prisma);
  const result = await repository.deleteForUser(transactionA, userA);

  assert.equal(result, false);
});

test("amount is serialized as toFixed(4) in createForUser", async () => {
  const txWithDecimal = makePrismaTransaction({
    amount: { toFixed: (n: number) => (12.5).toFixed(n) } as unknown as PrismaTransaction["amount"],
  });
  const { prisma } = makePrismaStub(txWithDecimal);
  const repository = createPrismaTransactionRepository(prisma);
  const result = await repository.createForUser(userA, {
    accountId: "10000000-0000-4000-8000-000000000001",
    categoryId: null,
    type: "EXPENSE",
    amount: "12.5000",
    currency: "USD",
    description: "Test",
    effectiveAt: new Date("2026-01-15T00:00:00.000Z"),
  });

  assert.equal(result.amount, "12.5000");
  assert.equal(typeof result.amount, "string");
});

test("amount is serialized as toFixed(4) in updateForUser", async () => {
  const txWithDecimal = makePrismaTransaction({
    amount: { toFixed: (n: number) => (99.99).toFixed(n) } as unknown as PrismaTransaction["amount"],
  });
  const { prisma } = makePrismaStub(txWithDecimal);
  const repository = createPrismaTransactionRepository(prisma);
  const result = await repository.updateForUser(transactionA, userA, { amount: "99.9900" });

  assert.ok(result, "result should not be null");
  assert.equal(result!.amount, "99.9900");
  assert.equal(typeof result!.amount, "string");
});
