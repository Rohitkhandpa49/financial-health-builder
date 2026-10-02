import assert from "node:assert/strict";
import type { Budget as PrismaBudget, PrismaClient } from "../../../database/prisma/generated/client/client.js";
import { BudgetPeriod as PrismaBudgetPeriod } from "../../../database/prisma/generated/client/enums.js";
import { describe, test } from "node:test";
import { BUDGET_PERIODS } from "../../../packages/contracts/src/budgets/budgets.js";
import { createPrismaBudgetRepository } from "../src/budgets/budget.repository.js";

const userA = "00000000-0000-4000-8000-000000000001";
const budgetA = "40000000-0000-4000-8000-000000000001";

function makePrismaBudget(overrides: Partial<PrismaBudget> = {}): PrismaBudget {
  return {
    id: budgetA,
    userId: userA,
    categoryId: null,
    name: "Monthly food",
    amount: { toFixed: (d: number) => "500." + "0".repeat(d) } as unknown as PrismaBudget["amount"],
    currency: "USD",
    period: PrismaBudgetPeriod.MONTHLY,
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-01-31"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  } as unknown as PrismaBudget;
}

function makePrismaStub(budget = makePrismaBudget()) {
  const calls: Record<string, unknown> = {};
  const prisma = {
    budget: {
      create: async (args: unknown) => {
        calls.create = args;
        return budget;
      },
      findMany: async (args: unknown) => {
        calls.findMany = args;
        return [budget];
      },
      count: async (args: unknown) => {
        calls.count = args;
        return 1;
      },
      findFirst: async (args: unknown) => {
        calls.findFirst = args;
        return budget;
      },
      update: async (args: unknown) => {
        calls.update = args;
        return budget;
      },
      deleteMany: async (args: unknown) => {
        calls.deleteMany = args;
        return { count: 1 };
      },
    },
  } as unknown as PrismaClient;

  return { prisma, calls };
}

describe("BudgetRepository", () => {
  test("BUDGET_PERIODS values all exist in Object.values(PrismaBudgetPeriod)", () => {
    const prismaValues = Object.values(PrismaBudgetPeriod);
    for (const period of BUDGET_PERIODS) {
      assert.ok(prismaValues.includes(period as PrismaBudgetPeriod), `${period} should be in Prisma enum`);
    }
  });

  test("createForUser passes correct data shape: userId, null categoryId when not provided, name, amount as string, currency, period, startDate as Date, endDate as Date", async () => {
    const { prisma, calls } = makePrismaStub();
    const repository = createPrismaBudgetRepository(prisma);
    await repository.createForUser(userA, {
      name: "Monthly food",
      amount: "500.0000",
      currency: "USD",
      period: "MONTHLY",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });

    const createArgs = calls.create as { data: Record<string, unknown> };
    assert.equal(createArgs.data.userId, userA);
    assert.equal(createArgs.data.categoryId, null);
    assert.equal(createArgs.data.name, "Monthly food");
    assert.equal(createArgs.data.amount, "500.0000");
    assert.equal(createArgs.data.currency, "USD");
    assert.equal(createArgs.data.period, "MONTHLY");
    assert.ok(createArgs.data.startDate instanceof Date, "startDate should be a Date");
    assert.ok(createArgs.data.endDate instanceof Date, "endDate should be a Date");
  });

  test("listForUser: userId in where, pagination skip/take correct (page=2 pageSize=10 → skip=10, take=10), ordering [{startDate:'desc'},{createdAt:'desc'},{id:'desc'}]", async () => {
    const { prisma, calls } = makePrismaStub();
    const repository = createPrismaBudgetRepository(prisma);
    await repository.listForUser(userA, { page: 2, pageSize: 10 });

    const findManyArgs = calls.findMany as {
      where: Record<string, unknown>;
      orderBy: unknown[];
      skip: number;
      take: number;
    };
    assert.equal(findManyArgs.where.userId, userA);
    assert.deepEqual(findManyArgs.orderBy, [
      { startDate: "desc" },
      { createdAt: "desc" },
      { id: "desc" },
    ]);
    assert.equal(findManyArgs.skip, 10);
    assert.equal(findManyArgs.take, 10);

    const countArgs = calls.count as { where: Record<string, unknown> };
    assert.equal(countArgs.where.userId, userA);
  });

  test("listForUser with categoryId filter: categoryId appears in where", async () => {
    const { prisma, calls } = makePrismaStub();
    const repository = createPrismaBudgetRepository(prisma);
    const catId = "20000000-0000-4000-8000-000000000001";
    await repository.listForUser(userA, { page: 1, pageSize: 25, categoryId: catId });

    const findManyArgs = calls.findMany as { where: Record<string, unknown> };
    assert.equal(findManyArgs.where.categoryId, catId);
  });

  test("listForUser with period filter: period appears in where", async () => {
    const { prisma, calls } = makePrismaStub();
    const repository = createPrismaBudgetRepository(prisma);
    await repository.listForUser(userA, { page: 1, pageSize: 25, period: "MONTHLY" });

    const findManyArgs = calls.findMany as { where: Record<string, unknown> };
    assert.equal(findManyArgs.where.period, "MONTHLY");
  });

  test("findByIdForUser: where predicate includes id AND userId", async () => {
    const { prisma, calls } = makePrismaStub();
    const repository = createPrismaBudgetRepository(prisma);
    await repository.findByIdForUser(budgetA, userA);

    const findFirstArgs = calls.findFirst as { where: Record<string, unknown> };
    assert.equal(findFirstArgs.where.id, budgetA);
    assert.equal(findFirstArgs.where.userId, userA);
  });

  test("updateForUser: findFirst called first for ownership, then update called with where: { id } only (not userId)", async () => {
    const { prisma, calls } = makePrismaStub();
    const repository = createPrismaBudgetRepository(prisma);
    await repository.updateForUser(budgetA, userA, { name: "Updated name" });

    // findFirst called first for ownership check
    const findFirstArgs = calls.findFirst as { where: Record<string, unknown> };
    assert.equal(findFirstArgs.where.id, budgetA);
    assert.equal(findFirstArgs.where.userId, userA);

    // update called with id only in where clause
    const updateArgs = calls.update as { where: Record<string, unknown>; data: Record<string, unknown> };
    assert.deepEqual(updateArgs.where, { id: budgetA });
    assert.equal(updateArgs.data.name, "Updated name");
  });

  test("deleteForUser returns true when deleteMany returns { count: 1 }", async () => {
    const { prisma } = makePrismaStub();
    const repository = createPrismaBudgetRepository(prisma);
    const result = await repository.deleteForUser(budgetA, userA);

    assert.equal(result, true);
  });

  test("deleteForUser returns false when deleteMany returns { count: 0 }", async () => {
    const calls: Record<string, unknown> = {};
    const prisma = {
      budget: {
        deleteMany: async (args: unknown) => {
          calls.deleteMany = args;
          return { count: 0 };
        },
        findFirst: async () => null,
      },
    } as unknown as PrismaClient;

    const repository = createPrismaBudgetRepository(prisma);
    const result = await repository.deleteForUser(budgetA, userA);

    assert.equal(result, false);
  });

  test("toBudgetRecord maps amount via toFixed(4): amount field in BudgetRecord equals '500.0000'", async () => {
    const { prisma } = makePrismaStub();
    const repository = createPrismaBudgetRepository(prisma);
    const result = await repository.findByIdForUser(budgetA, userA);

    assert.ok(result, "result should not be null");
    assert.equal(result!.amount, "500.0000");
    assert.equal(typeof result!.amount, "string");
  });
});
