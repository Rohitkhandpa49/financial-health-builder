import assert from "node:assert/strict";
import type { Category as PrismaCategory, PrismaClient } from "../../../database/prisma/generated/client/client.js";
import { CategoryType as PrismaCategoryType } from "../../../database/prisma/generated/client/enums.js";
import { test } from "node:test";
import { CATEGORY_TYPES } from "../../../packages/contracts/src/categories/categories.js";
import { createPrismaCategoryRepository } from "../src/categories/category.repository.js";

const userA = "00000000-0000-4000-8000-000000000001";
const categoryA = "20000000-0000-4000-8000-000000000001";

test("shared CategoryType contract stays aligned with the Prisma enum", () => {
  assert.deepEqual([...CATEGORY_TYPES].sort(), Object.values(PrismaCategoryType).sort());
});

function makePrismaCategory(overrides: Partial<PrismaCategory> = {}): PrismaCategory {
  return {
    id: categoryA,
    userId: userA,
    name: "Test category",
    type: "EXPENSE",
    systemDefined: false,
    archived: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  } as unknown as PrismaCategory;
}

function makePrismaStub(category = makePrismaCategory()) {
  const calls: Record<string, unknown> = {};
  const prisma = {
    category: {
      create: async (args: unknown) => {
        calls.create = args;
        return category;
      },
      findMany: async (args: unknown) => {
        calls.findMany = args;
        return [category];
      },
      count: async (args: unknown) => {
        calls.count = args;
        return 1;
      },
      findFirst: async (args: unknown) => {
        calls.findFirst = args;
        return category;
      },
      update: async (args: unknown) => {
        calls.update = args;
        return category;
      },
    },
  } as unknown as PrismaClient;

  return { prisma, calls };
}

test("createForUser sets userId, systemDefined=false, correct fields", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaCategoryRepository(prisma);
  await repository.createForUser(userA, {
    name: "Test category",
    type: "EXPENSE",
  });

  assert.deepEqual(calls.create, {
    data: {
      userId: userA,
      systemDefined: false,
      name: "Test category",
      type: "EXPENSE",
    },
    select: {
      id: true,
      userId: true,
      name: true,
      type: true,
      systemDefined: true,
      archived: true,
      createdAt: true,
      updatedAt: true,
    },
  });
});

test("listForUser uses OR predicate and deterministic ordering", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaCategoryRepository(prisma);
  const result = await repository.listForUser(userA, {
    page: 2,
    pageSize: 10,
    archived: false,
    type: undefined as unknown as never,
  } as Parameters<typeof repository.listForUser>[1]);

  assert.deepEqual((calls.findMany as { where: unknown }).where, {
    OR: [
      { userId: userA, archived: false },
      { userId: null, systemDefined: true, archived: false },
    ],
  });
  assert.deepEqual((calls.findMany as { orderBy: unknown }).orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.equal((calls.findMany as { skip: number }).skip, 10);
  assert.equal((calls.findMany as { take: number }).take, 10);
  assert.equal(result.totalItems, 1);
});

test("listForUser includes type filter when provided", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaCategoryRepository(prisma);
  await repository.listForUser(userA, {
    page: 1,
    pageSize: 10,
    archived: false,
    type: "INCOME",
  });

  const where = (calls.findMany as { where: { OR: Array<Record<string, unknown>> } }).where;
  assert.equal(where.OR[0].type, "INCOME");
  assert.equal(where.OR[1].type, "INCOME");
});

test("findByIdForUserOrSystem predicate includes OR clause for userId or system", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaCategoryRepository(prisma);
  await repository.findByIdForUserOrSystem(categoryA, userA);

  assert.deepEqual((calls.findFirst as { where: unknown }).where, {
    id: categoryA,
    OR: [{ userId: userA }, { userId: null, systemDefined: true }],
  });
});

test("updateNameForUser predicate includes userId, systemDefined:false, archived:false", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaCategoryRepository(prisma);
  await repository.updateNameForUser(categoryA, userA, "Renamed");

  assert.deepEqual((calls.update as { where: unknown }).where, {
    id: categoryA,
    userId: userA,
    systemDefined: false,
    archived: false,
  });
  assert.deepEqual((calls.update as { data: unknown }).data, { name: "Renamed" });
});

test("archiveForUser predicate includes userId and systemDefined:false", async () => {
  const { prisma, calls } = makePrismaStub();
  const repository = createPrismaCategoryRepository(prisma);
  await repository.archiveForUser(categoryA, userA);

  assert.deepEqual((calls.update as { where: unknown }).where, {
    id: categoryA,
    userId: userA,
    systemDefined: false,
  });
  assert.deepEqual((calls.update as { data: unknown }).data, { archived: true });
});

test("P2025 from updateNameForUser and archiveForUser returns null", async () => {
  const p2025Error = Object.assign(new Error("Record not found"), { code: "P2025" });
  const calls: Record<string, unknown> = {};
  const prisma = {
    category: {
      update: async (args: unknown) => {
        calls.update = args;
        throw p2025Error;
      },
    },
  } as unknown as PrismaClient;

  const repository = createPrismaCategoryRepository(prisma);

  const updateResult = await repository.updateNameForUser(categoryA, userA, "Renamed");
  assert.equal(updateResult, null);

  const archiveResult = await repository.archiveForUser(categoryA, userA);
  assert.equal(archiveResult, null);
});
