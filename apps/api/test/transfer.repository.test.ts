import assert from "node:assert/strict";
import type { PrismaClient } from "../../../database/prisma/generated/client/client.js";
import { test } from "node:test";
import { createPrismaTransferRepository } from "../src/transfers/transfer.repository.js";

const userA = "00000000-0000-4000-8000-000000000001";
const accountA1 = "10000000-0000-4000-8000-000000000001";
const accountA2 = "10000000-0000-4000-8000-000000000002";
const transferGroupId = "70000000-0000-4000-8000-000000000001";

function makeSide(accountId: string, direction: "OUTGOING" | "INCOMING") {
  return {
    id: direction === "OUTGOING" ? "80000000-0000-4000-8000-000000000001" : "80000000-0000-4000-8000-000000000002",
    userId: userA,
    accountId,
    amount: { toFixed: (n: number) => (250).toFixed(n) },
    currency: "USD",
    description: "Transfer",
    effectiveAt: new Date("2026-01-15T00:00:00.000Z"),
    transferGroupId,
    transferDirection: direction,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function makePrismaStub() {
  const outgoing = makeSide(accountA1, "OUTGOING");
  const incoming = makeSide(accountA2, "INCOMING");
  const calls: Record<string, unknown> = {};

  const prisma = {
    transaction: {
      create: async (args: unknown) => {
        calls.create = args;
        const data = (args as { data: { transferDirection: string; accountId: string } }).data;
        return data.transferDirection === "OUTGOING" ? outgoing : incoming;
      },
      findMany: async (args: unknown) => {
        calls.findMany = args;
        return [outgoing, incoming];
      },
      deleteMany: async (args: unknown) => {
        calls.deleteMany = args;
        return { count: 2 };
      },
    },
    $transaction: async (ops: unknown[]) => {
      calls.$transaction = ops;
      return await Promise.all((ops as Array<Promise<unknown>>));
    },
  } as unknown as PrismaClient;

  return { prisma, calls, outgoing, incoming };
}

test("createTransfer calls $transaction with two create operations", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaTransferRepository(prisma);
  const result = await repository.createTransfer(userA, {
    sourceAccountId: accountA1,
    destinationAccountId: accountA2,
    sourceCurrency: "USD",
    destinationCurrency: "USD",
    amount: "250.0000",
    description: "Transfer",
    effectiveAt: new Date("2026-01-15T00:00:00.000Z"),
  });

  assert.ok(calls.$transaction, "$transaction should be called for atomicity");
  assert.ok(result.outgoing, "outgoing side should exist");
  assert.ok(result.incoming, "incoming side should exist");
  assert.equal(result.outgoing.accountId, accountA1);
  assert.equal(result.incoming.accountId, accountA2);
  assert.equal(result.outgoing.transferGroupId, result.incoming.transferGroupId);
});

test("createTransfer result has matching amount on both sides", async () => {
  const { prisma } = makePrismaStub();
  const repository = createPrismaTransferRepository(prisma);
  const result = await repository.createTransfer(userA, {
    sourceAccountId: accountA1,
    destinationAccountId: accountA2,
    sourceCurrency: "USD",
    destinationCurrency: "USD",
    amount: "250.0000",
    description: "Transfer",
    effectiveAt: new Date("2026-01-15T00:00:00.000Z"),
  });

  assert.equal(result.outgoing.amount, "250.0000");
  assert.equal(result.incoming.amount, "250.0000");
});

test("findByGroupId queries with transferGroupId, userId, type TRANSFER and returns pair", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaTransferRepository(prisma);
  const result = await repository.findByGroupId(transferGroupId, userA);

  const findManyArgs = calls.findMany as { where: Record<string, unknown> };
  assert.equal(findManyArgs.where.transferGroupId, transferGroupId);
  assert.equal(findManyArgs.where.userId, userA);
  assert.equal(findManyArgs.where.type, "TRANSFER");
  assert.ok(result, "result should not be null");
  assert.ok(result!.outgoing, "outgoing side should be present");
  assert.ok(result!.incoming, "incoming side should be present");
});

test("findByGroupId returns null when no transactions found", async () => {
  const prisma = {
    transaction: {
      findMany: async () => [],
    },
  } as unknown as PrismaClient;
  const repository = createPrismaTransferRepository(prisma);
  const result = await repository.findByGroupId(transferGroupId, userA);
  assert.equal(result, null);
});

test("deleteByGroupId uses deleteMany with transferGroupId, userId, type TRANSFER", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaTransferRepository(prisma);
  const result = await repository.deleteByGroupId(transferGroupId, userA);

  const deleteManyArgs = calls.deleteMany as { where: Record<string, unknown> };
  assert.equal(deleteManyArgs.where.transferGroupId, transferGroupId);
  assert.equal(deleteManyArgs.where.userId, userA);
  assert.equal(deleteManyArgs.where.type, "TRANSFER");
  assert.equal(result, true);
});

test("deleteByGroupId returns false when count is 0", async () => {
  const prisma = {
    transaction: {
      deleteMany: async () => ({ count: 0 }),
    },
  } as unknown as PrismaClient;
  const repository = createPrismaTransferRepository(prisma);
  const result = await repository.deleteByGroupId(transferGroupId, userA);
  assert.equal(result, false);
});

test("amount on both sides is serialized as toFixed(4) string", async () => {
  const { prisma } = makePrismaStub();
  const repository = createPrismaTransferRepository(prisma);
  const result = await repository.findByGroupId(transferGroupId, userA);

  assert.equal(typeof result!.outgoing.amount, "string");
  assert.equal(typeof result!.incoming.amount, "string");
  assert.ok(result!.outgoing.amount.includes("."), "amount should have decimal point");
});
