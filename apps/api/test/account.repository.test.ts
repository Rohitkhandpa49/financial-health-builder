import assert from "node:assert/strict";
import type { Account as PrismaAccount, PrismaClient } from "../../../database/prisma/generated/client/client.js";
import { AccountType as PrismaAccountType } from "../../../database/prisma/generated/client/enums.js";
import { test } from "node:test";
import { ACCOUNT_TYPES } from "../../../packages/contracts/src/accounts/accounts.js";
import { createPrismaAccountRepository } from "../src/accounts/account.repository.js";

const userA = "00000000-0000-4000-8000-000000000001";
const accountA = "10000000-0000-4000-8000-000000000001";

test("shared AccountType contract stays aligned with the Prisma enum", () => {
  assert.deepEqual([...ACCOUNT_TYPES].sort(), Object.values(PrismaAccountType).sort());
});

function makePrismaAccount(overrides: Partial<PrismaAccount> = {}): PrismaAccount {
  return {
    id: accountA,
    userId: userA,
    name: "Everyday account",
    type: "BANK",
    currency: "USD",
    openingBalance: { toFixed: () => "123.4500" },
    archived: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  } as unknown as PrismaAccount;
}

function makePrismaStub(account = makePrismaAccount()) {
  const calls: Record<string, unknown> = {};
  const prisma = {
    account: {
      create: async (args: unknown) => {
        calls.create = args;
        return account;
      },
      findMany: async (args: unknown) => {
        calls.findMany = args;
        return [account];
      },
      count: async (args: unknown) => {
        calls.count = args;
        return 1;
      },
      findFirst: async (args: unknown) => {
        calls.findFirst = args;
        return account;
      },
      update: async (args: unknown) => {
        calls.update = args;
        return account;
      },
    },
  } as unknown as PrismaClient;

  return { prisma, calls };
}

test("create assigns the authenticated owner and persists exact decimal input", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaAccountRepository(prisma);
  const account = await repository.createForUser(userA, {
    name: "Everyday account",
    type: "BANK",
    currency: "USD",
    openingBalance: "123.4500",
  });

  assert.deepEqual(calls.create, {
    data: {
      userId: userA,
      name: "Everyday account",
      type: "BANK",
      currency: "USD",
      openingBalance: "123.4500",
    },
    select: {
      id: true,
      userId: true,
      name: true,
      type: true,
      currency: true,
      openingBalance: true,
      archived: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  assert.equal(account.openingBalance, "123.4500");
});

test("list query scopes by user before pagination and uses deterministic ordering", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaAccountRepository(prisma);
  const result = await repository.listForUser(userA, {
    page: 2,
    pageSize: 10,
    archived: false,
  });

  assert.deepEqual(calls.findMany, {
    where: { userId: userA, archived: false },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: 10,
    take: 10,
    select: {
      id: true,
      userId: true,
      name: true,
      type: true,
      currency: true,
      openingBalance: true,
      archived: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  assert.deepEqual(calls.count, { where: { userId: userA, archived: false } });
  assert.equal(result.totalItems, 1);
});

test("get, update, and archive predicates include both account ID and owner", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaAccountRepository(prisma);

  await repository.findByIdForUser(accountA, userA);
  assert.deepEqual((calls.findFirst as { where: unknown }).where, {
    id: accountA,
    userId: userA,
  });

  await repository.updateNameForUser(accountA, userA, "Renamed account");
  assert.deepEqual((calls.update as { where: unknown }).where, {
    id: accountA,
    userId: userA,
    archived: false,
  });
  assert.deepEqual((calls.update as { data: unknown }).data, { name: "Renamed account" });

  await repository.archiveForUser(accountA, userA);
  assert.deepEqual((calls.update as { where: unknown }).where, {
    id: accountA,
    userId: userA,
  });
  assert.deepEqual((calls.update as { data: unknown }).data, { archived: true });
});

test("opening balance is mapped to a fixed-scale decimal string", async () => {
  const { prisma } = makePrismaStub(makePrismaAccount({
    openingBalance: { toFixed: () => "0.1000" } as unknown as PrismaAccount["openingBalance"],
  }));
  const account = await createPrismaAccountRepository(prisma).findByIdForUser(accountA, userA);

  assert.equal(account?.openingBalance, "0.1000");
  assert.equal(typeof account?.openingBalance, "string");
});