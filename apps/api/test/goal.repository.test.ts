import assert from "node:assert/strict";
import type { SavingsGoal as PrismaSavingsGoal, PrismaClient } from "../../../database/prisma/generated/client/client.js";
import { SavingsGoalStatus as PrismaSavingsGoalStatus } from "../../../database/prisma/generated/client/enums.js";
import { describe, test } from "node:test";
import { GOAL_STATUSES } from "../../../packages/contracts/src/goals/goals.js";
import { createPrismaGoalRepository } from "../src/goals/goal.repository.js";

const userA = "00000000-0000-4000-8000-000000000001";
const goalA = "50000000-0000-4000-8000-000000000001";

function makePrismaSavingsGoal(overrides: Partial<PrismaSavingsGoal> = {}): PrismaSavingsGoal {
  return {
    id: goalA,
    userId: userA,
    name: "Emergency fund",
    targetAmount: { toFixed: (d: number) => "1000." + "0".repeat(d) } as unknown as PrismaSavingsGoal["targetAmount"],
    currentAmount: { toFixed: (d: number) => "250." + "0".repeat(d) } as unknown as PrismaSavingsGoal["currentAmount"],
    currency: "USD",
    targetDate: new Date("2026-12-31"),
    status: PrismaSavingsGoalStatus.ACTIVE,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  } as unknown as PrismaSavingsGoal;
}

function makePrismaStub(goal = makePrismaSavingsGoal()) {
  const calls: Record<string, unknown> = {};
  const prisma = {
    savingsGoal: {
      create: async (args: unknown) => { calls.create = args; return goal; },
      findMany: async (args: unknown) => { calls.findMany = args; return [goal]; },
      count: async (args: unknown) => { calls.count = args; return 1; },
      findFirst: async (args: unknown) => { calls.findFirst = args; return goal; },
      update: async (args: unknown) => { calls.update = args; return goal; },
      deleteMany: async (args: unknown) => { calls.deleteMany = args; return { count: 1 }; },
    },
  } as unknown as PrismaClient;
  return { prisma, calls };
}

describe("GoalRepository", () => {
  test("GOAL_STATUSES values all exist in Object.values(PrismaSavingsGoalStatus)", () => {
    const prismaValues = Object.values(PrismaSavingsGoalStatus);
    for (const status of GOAL_STATUSES) {
      assert.ok(prismaValues.includes(status as PrismaSavingsGoalStatus), `${status} should be in Prisma enum`);
    }
  });

  test("createForUser passes correct data shape: userId, name, targetAmount, currentAmount defaults to '0' when not provided, currency, targetDate as Date, status defaults to 'ACTIVE' when not provided", async () => {
    const { prisma, calls } = makePrismaStub();
    const repository = createPrismaGoalRepository(prisma);
    await repository.createForUser(userA, {
      name: "Emergency fund",
      targetAmount: "1000.0000",
      currency: "USD",
      targetDate: "2026-12-31",
    });
    const createArgs = calls.create as { data: Record<string, unknown> };
    assert.equal(createArgs.data.userId, userA);
    assert.equal(createArgs.data.name, "Emergency fund");
    assert.equal(createArgs.data.targetAmount, "1000.0000");
    assert.equal(createArgs.data.currentAmount, "0"); // defaults to '0'
    assert.equal(createArgs.data.currency, "USD");
    assert.ok(createArgs.data.targetDate instanceof Date, "targetDate should be a Date");
    assert.equal(createArgs.data.status, "ACTIVE"); // defaults to ACTIVE
  });

  test("createForUser with explicit currentAmount uses provided value", async () => {
    const { prisma, calls } = makePrismaStub();
    const repository = createPrismaGoalRepository(prisma);
    await repository.createForUser(userA, {
      name: "Emergency fund",
      targetAmount: "1000.0000",
      currentAmount: "250.0000",
      currency: "USD",
      targetDate: "2026-12-31",
    });
    const createArgs = calls.create as { data: Record<string, unknown> };
    assert.equal(createArgs.data.currentAmount, "250.0000");
  });

  test("listForUser: userId in where, pagination skip/take correct (page=2 pageSize=10 → skip=10, take=10), ordering [{targetDate:'asc'},{createdAt:'desc'},{id:'desc'}]", async () => {
    const { prisma, calls } = makePrismaStub();
    const repository = createPrismaGoalRepository(prisma);
    await repository.listForUser(userA, { page: 2, pageSize: 10 });
    const findManyArgs = calls.findMany as {
      where: Record<string, unknown>;
      orderBy: unknown[];
      skip: number;
      take: number;
    };
    assert.equal(findManyArgs.where.userId, userA);
    assert.deepEqual(findManyArgs.orderBy, [
      { targetDate: "asc" },
      { createdAt: "desc" },
      { id: "desc" },
    ]);
    assert.equal(findManyArgs.skip, 10);
    assert.equal(findManyArgs.take, 10);
    const countArgs = calls.count as { where: Record<string, unknown> };
    assert.equal(countArgs.where.userId, userA);
  });

  test("listForUser with status filter: status appears in where", async () => {
    const { prisma, calls } = makePrismaStub();
    const repository = createPrismaGoalRepository(prisma);
    await repository.listForUser(userA, { page: 1, pageSize: 25, status: "ACTIVE" });
    const findManyArgs = calls.findMany as { where: Record<string, unknown> };
    assert.equal(findManyArgs.where.status, "ACTIVE");
  });

  test("findByIdForUser: where predicate includes id AND userId", async () => {
    const { prisma, calls } = makePrismaStub();
    const repository = createPrismaGoalRepository(prisma);
    await repository.findByIdForUser(goalA, userA);
    const findFirstArgs = calls.findFirst as { where: Record<string, unknown> };
    assert.equal(findFirstArgs.where.id, goalA);
    assert.equal(findFirstArgs.where.userId, userA);
  });

  test("updateForUser: findFirst called first for ownership, then update called with where: { id } only (not userId)", async () => {
    const { prisma, calls } = makePrismaStub();
    const repository = createPrismaGoalRepository(prisma);
    await repository.updateForUser(goalA, userA, { name: "Updated name" });
    const findFirstArgs = calls.findFirst as { where: Record<string, unknown> };
    assert.equal(findFirstArgs.where.id, goalA);
    assert.equal(findFirstArgs.where.userId, userA);
    const updateArgs = calls.update as { where: Record<string, unknown>; data: Record<string, unknown> };
    assert.deepEqual(updateArgs.where, { id: goalA });
    assert.equal(updateArgs.data.name, "Updated name");
  });

  test("deleteForUser returns true when deleteMany returns { count: 1 }", async () => {
    const { prisma } = makePrismaStub();
    const repository = createPrismaGoalRepository(prisma);
    const result = await repository.deleteForUser(goalA, userA);
    assert.equal(result, true);
  });

  test("deleteForUser returns false when deleteMany returns { count: 0 }", async () => {
    const calls: Record<string, unknown> = {};
    const prisma = {
      savingsGoal: {
        deleteMany: async (args: unknown) => { calls.deleteMany = args; return { count: 0 }; },
        findFirst: async () => null,
      },
    } as unknown as PrismaClient;
    const repository = createPrismaGoalRepository(prisma);
    const result = await repository.deleteForUser(goalA, userA);
    assert.equal(result, false);
  });

  test("toGoalRecord maps targetAmount and currentAmount via toFixed(4)", async () => {
    const { prisma } = makePrismaStub();
    const repository = createPrismaGoalRepository(prisma);
    const result = await repository.findByIdForUser(goalA, userA);
    assert.ok(result, "result should not be null");
    assert.equal(result!.targetAmount, "1000.0000");
    assert.equal(result!.currentAmount, "250.0000");
    assert.equal(typeof result!.targetAmount, "string");
    assert.equal(typeof result!.currentAmount, "string");
  });
});
