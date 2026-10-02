import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { ACCESS_COOKIE_NAME } from "../src/auth/auth.middleware.js";
import { JoseAccessTokenService } from "../src/auth/access-token.js";
import type {
  BudgetListQuery,
  CreateBudgetRequest,
  BudgetResponse,
} from "../../../packages/contracts/src/budgets/budgets.js";
import type {
  BudgetListResult,
  BudgetRecord,
  BudgetRepository,
  ResolvedBudgetListQuery,
  BudgetUpdatePatch,
} from "../src/budgets/budget.repository.js";
import type {
  CategoryRecord,
  CategoryRepository,
} from "../src/categories/category.repository.js";
import { BudgetService } from "../src/budgets/budget.service.js";

const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const catA1 = "20000000-0000-4000-8000-000000000001"; // userA, EXPENSE, systemDefined: false
const catSystem = "20000000-0000-4000-8000-000000000099"; // systemDefined: true, userId: null
const budgetA1 = "40000000-0000-4000-8000-000000000001"; // owned by userA
const budgetB1 = "40000000-0000-4000-8000-000000000003"; // owned by userB
const testJwtSecret = "budget-test-secret-with-at-least-32-characters";

function makeBudgetRecord(
  id: string,
  ownerId: string,
  overrides: Partial<BudgetRecord> = {},
): BudgetRecord {
  return {
    id,
    userId: ownerId,
    categoryId: null,
    name: "Monthly food",
    amount: "500.0000",
    currency: "USD",
    period: "MONTHLY",
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-01-31"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

class MemoryBudgetRepository implements BudgetRepository {
  readonly records = new Map<string, BudgetRecord>();

  constructor(initial: BudgetRecord[] = []) {
    for (const budget of initial) {
      this.records.set(budget.id, budget);
    }
  }

  async createForUser(userId: string, input: CreateBudgetRequest): Promise<BudgetRecord> {
    const amountNormalized = input.amount.includes(".")
      ? input.amount.padEnd(input.amount.indexOf(".") + 5, "0")
      : `${input.amount}.0000`;

    const record: BudgetRecord = {
      id: randomUUID(),
      userId,
      categoryId: input.categoryId ?? null,
      name: input.name,
      amount: amountNormalized,
      currency: input.currency,
      period: input.period,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.records.set(record.id, record);
    return record;
  }

  async listForUser(userId: string, query: ResolvedBudgetListQuery): Promise<BudgetListResult> {
    const matching = [...this.records.values()]
      .filter((budget) => {
        if (budget.userId !== userId) return false;
        if (query.categoryId !== undefined && budget.categoryId !== query.categoryId) return false;
        if (query.period !== undefined && budget.period !== query.period) return false;
        return true;
      })
      .sort((a, b) => {
        const byStartDate = b.startDate.getTime() - a.startDate.getTime();
        if (byStartDate !== 0) return byStartDate;
        const byCreatedAt = b.createdAt.getTime() - a.createdAt.getTime();
        if (byCreatedAt !== 0) return byCreatedAt;
        return b.id.localeCompare(a.id);
      });

    const start = (query.page - 1) * query.pageSize;
    return {
      budgets: matching.slice(start, start + query.pageSize),
      totalItems: matching.length,
    };
  }

  async findByIdForUser(budgetId: string, userId: string): Promise<BudgetRecord | null> {
    const budget = this.records.get(budgetId);
    if (!budget) return null;
    if (budget.userId !== userId) return null;
    return budget;
  }

  async updateForUser(budgetId: string, userId: string, patch: BudgetUpdatePatch): Promise<BudgetRecord | null> {
    const budget = this.records.get(budgetId);
    if (!budget) return null;
    if (budget.userId !== userId) return null;

    const updated: BudgetRecord = {
      ...budget,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
      ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
      ...(patch.endDate !== undefined ? { endDate: patch.endDate } : {}),
      updatedAt: new Date(),
    };
    this.records.set(budgetId, updated);
    return updated;
  }

  async deleteForUser(budgetId: string, userId: string): Promise<boolean> {
    const budget = this.records.get(budgetId);
    if (!budget) return false;
    if (budget.userId !== userId) return false;
    this.records.delete(budgetId);
    return true;
  }
}

function makeCategoryRecord(id: string, ownerId: string | null, systemDefined: boolean): CategoryRecord {
  return {
    id,
    userId: ownerId,
    name: "Test category",
    type: "EXPENSE",
    systemDefined,
    archived: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

class MemoryCategoryRepository implements CategoryRepository {
  async findByIdForUserOrSystem(categoryId: string, userId: string): Promise<CategoryRecord | null> {
    if (categoryId === catA1 && userId === userA) {
      return makeCategoryRecord(catA1, userA, false);
    }
    if (categoryId === catSystem) {
      return makeCategoryRecord(catSystem, null, true);
    }
    return null;
  }

  async createForUser(): Promise<CategoryRecord> {
    return Promise.resolve(null as unknown as CategoryRecord);
  }

  async listForUser(): Promise<{ categories: CategoryRecord[]; totalItems: number }> {
    return Promise.resolve({ categories: [], totalItems: 0 });
  }

  async updateNameForUser(): Promise<CategoryRecord | null> {
    return Promise.resolve(null);
  }

  async archiveForUser(): Promise<CategoryRecord | null> {
    return Promise.resolve(null);
  }
}

function createBudgetTestContext(initialBudgets: BudgetRecord[] = []) {
  const budgetRepo = new MemoryBudgetRepository(initialBudgets);
  const categoryRepo = new MemoryCategoryRepository();
  const budgetService = new BudgetService(budgetRepo, categoryRepo);
  const accessTokenService = new JoseAccessTokenService(testJwtSecret);
  const app = createApp({ budgets: { service: budgetService, accessTokenService } });

  return { app, budgetService, budgetRepo, categoryRepo, accessTokenService };
}

async function withBudgetServer<T>(
  callback: (context: { baseUrl: string } & ReturnType<typeof createBudgetTestContext>) => Promise<T>,
  initialBudgets: BudgetRecord[] = [],
): Promise<T> {
  const context = createBudgetTestContext(initialBudgets);
  const server = createServer(context.app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await callback({ baseUrl, ...context });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function budgetRequest(
  baseUrl: string,
  userId: string | undefined,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (userId) {
    headers.Cookie = `${ACCESS_COOKIE_NAME}=${await new JoseAccessTokenService(testJwtSecret).issue(userId)}`;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function createBody(overrides: Partial<CreateBudgetRequest> = {}): Record<string, unknown> {
  return {
    name: "Monthly food",
    amount: "500.0000",
    currency: "USD",
    period: "MONTHLY",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    ...overrides,
  };
}

// AUTH
test("unauthenticated POST /budgets returns 401 AUTH_REQUIRED", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, undefined, "POST", "/api/v1/budgets", createBody());
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTH_REQUIRED");
  });
});

test("unauthenticated GET /budgets returns 401 AUTH_REQUIRED", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, undefined, "GET", "/api/v1/budgets");
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTH_REQUIRED");
  });
});

test("unauthenticated GET /budgets/:budgetId returns 401 AUTH_REQUIRED", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, undefined, "GET", `/api/v1/budgets/${budgetA1}`);
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTH_REQUIRED");
  });
});

test("unauthenticated PATCH /budgets/:budgetId returns 401 AUTH_REQUIRED", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, undefined, "PATCH", `/api/v1/budgets/${budgetA1}`, { name: "Changed" });
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTH_REQUIRED");
  });
});

test("unauthenticated DELETE /budgets/:budgetId returns 401 AUTH_REQUIRED", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, undefined, "DELETE", `/api/v1/budgets/${budgetA1}`);
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTH_REQUIRED");
  });
});

// OWNERSHIP
test("userA can create own budget returns 201", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody());
    assert.equal(response.status, 201);
  });
});

test("userA GET budgetB1 (owned by userB) returns 404", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "GET", `/api/v1/budgets/${budgetB1}`);
    assert.equal(response.status, 404);
  }, [makeBudgetRecord(budgetB1, userB)]);
});

test("userA PATCH budgetB1 (owned by userB) returns 404", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "PATCH", `/api/v1/budgets/${budgetB1}`, { name: "Hijacked" });
    assert.equal(response.status, 404);
  }, [makeBudgetRecord(budgetB1, userB)]);
});

test("userA DELETE budgetB1 (owned by userB) returns 404", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "DELETE", `/api/v1/budgets/${budgetB1}`);
    assert.equal(response.status, 404);
  }, [makeBudgetRecord(budgetB1, userB)]);
});

test("userB list returns no userA budgets", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userB, "GET", "/api/v1/budgets");
    const body = await response.json() as { budgets: BudgetResponse[] };
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.budgets));
    assert.equal(body.budgets.length, 0);
  }, [makeBudgetRecord(budgetA1, userA)]);
});

// INJECTION
test("POST body with userId field returns 400 (unknown field — strictObject)", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody({ userId: userB } as unknown as Partial<CreateBudgetRequest>));
    assert.equal(response.status, 400);
  });
});

test("GET /api/v1/budgets?userId=... returns 400 (unknown query field)", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "GET", `/api/v1/budgets?userId=${userB}`);
    assert.equal(response.status, 400);
  });
});

// CATEGORY
test("create with own catA1 returns 201 with categoryId in response", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody({ categoryId: catA1 }));
    const body = await response.json() as { budget: BudgetResponse };
    assert.equal(response.status, 201);
    assert.equal(body.budget.categoryId, catA1);
  });
});

test("create with unknown categoryId returns 400 BUDGET_INVALID_CATEGORY", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const unknownCategoryId = "99999999-0000-4000-8000-000000000001";
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody({ categoryId: unknownCategoryId }));
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 400);
    assert.equal(body.error.code, "BUDGET_INVALID_CATEGORY");
  });
});

test("create with catSystem (systemDefined) returns 201", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody({ categoryId: catSystem }));
    assert.equal(response.status, 201);
  });
});

test("PATCH with foreign category (catB1 not seeded) returns 400 BUDGET_INVALID_CATEGORY", async () => {
  const catB1 = "20000000-0000-4000-8000-000000000002";
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "PATCH", `/api/v1/budgets/${budgetA1}`, { categoryId: catB1 });
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 400);
    assert.equal(body.error.code, "BUDGET_INVALID_CATEGORY");
  }, [makeBudgetRecord(budgetA1, userA)]);
});

test("PATCH set categoryId to null returns 200 (removes category link)", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "PATCH", `/api/v1/budgets/${budgetA1}`, { categoryId: null });
    const body = await response.json() as { budget: BudgetResponse };
    assert.equal(response.status, 200);
    assert.equal(body.budget.categoryId, null);
  }, [makeBudgetRecord(budgetA1, userA, { categoryId: catA1 })]);
});

// VALIDATION
test("amount '-100' returns 400", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody({ amount: "-100" }));
    assert.equal(response.status, 400);
  });
});

test("amount '1.00001' (5 decimal places) returns 400", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody({ amount: "1.00001" }));
    assert.equal(response.status, 400);
  });
});

test("currency 'usd' (lowercase) returns 400", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody({ currency: "usd" }));
    assert.equal(response.status, 400);
  });
});

test("currency 'ZZZ' (invalid code) returns 400", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody({ currency: "ZZZ" }));
    assert.equal(response.status, 400);
  });
});

test("period 'YEARLY' returns 400", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody({ period: "YEARLY" as unknown as "MONTHLY" }));
    assert.equal(response.status, 400);
  });
});

test("endDate before startDate returns 400", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody({ startDate: "2026-02-01", endDate: "2026-01-01" }));
    assert.equal(response.status, 400);
  });
});

test("invalid date format '01/01/2026' returns 400", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody({ startDate: "01/01/2026" }));
    assert.equal(response.status, 400);
  });
});

test("name 121 chars returns 400", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody({ name: "x".repeat(121) }));
    assert.equal(response.status, 400);
  });
});

test("unknown body field returns 400", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody({ unknownField: "value" } as unknown as Partial<CreateBudgetRequest>));
    assert.equal(response.status, 400);
  });
});

test("malformed budgetId UUID in route returns 400", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "GET", "/api/v1/budgets/not-a-uuid");
    assert.equal(response.status, 400);
  });
});

test("unknown query param returns 400", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "GET", "/api/v1/budgets?unknownField=value");
    assert.equal(response.status, 400);
  });
});

// CRUD
test("create returns 201 with budget body; no userId, correct fields, amount '500.0000'", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody());
    const body = await response.json() as { budget: Record<string, unknown> };
    assert.equal(response.status, 201);
    assert.ok(body.budget, "response should have budget");
    assert.equal(body.budget.userId, undefined, "userId should not be in response");
    assert.equal(body.budget.amount, "500.0000");
    assert.equal(typeof body.budget.id, "string");
    assert.equal(body.budget.name, "Monthly food");
    assert.equal(body.budget.currency, "USD");
    assert.equal(body.budget.period, "MONTHLY");
    assert.equal(body.budget.startDate, "2026-01-01");
    assert.equal(body.budget.endDate, "2026-01-31");
  });
});

test("GET own budget returns 200 with correct budget", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "GET", `/api/v1/budgets/${budgetA1}`);
    const body = await response.json() as { budget: Record<string, unknown> };
    assert.equal(response.status, 200);
    assert.equal(body.budget.id, budgetA1);
  }, [makeBudgetRecord(budgetA1, userA)]);
});

test("list returns 200 with budgets and pagination shape { page, pageSize, totalItems, totalPages }", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "GET", "/api/v1/budgets");
    const body = await response.json() as { budgets: unknown[]; pagination: Record<string, unknown> };
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.budgets));
    assert.ok(body.pagination, "response should have pagination");
    assert.ok(typeof body.pagination.page === "number");
    assert.ok(typeof body.pagination.pageSize === "number");
    assert.ok(typeof body.pagination.totalItems === "number");
    assert.ok(typeof body.pagination.totalPages === "number");
  }, [makeBudgetRecord(budgetA1, userA)]);
});

test("update name returns 200 with updated name", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "PATCH", `/api/v1/budgets/${budgetA1}`, { name: "Weekly groceries" });
    const body = await response.json() as { budget: Record<string, unknown> };
    assert.equal(response.status, 200);
    assert.equal(body.budget.name, "Weekly groceries");
  }, [makeBudgetRecord(budgetA1, userA)]);
});

test("delete returns 204 with empty body", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "DELETE", `/api/v1/budgets/${budgetA1}`);
    assert.equal(response.status, 204);
  }, [makeBudgetRecord(budgetA1, userA)]);
});

test("after delete, GET returns 404", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    await budgetRequest(baseUrl, userA, "DELETE", `/api/v1/budgets/${budgetA1}`);
    const response = await budgetRequest(baseUrl, userA, "GET", `/api/v1/budgets/${budgetA1}`);
    assert.equal(response.status, 404);
  }, [makeBudgetRecord(budgetA1, userA)]);
});

// FILTERING
test("filter by period=MONTHLY returns only MONTHLY budgets", async () => {
  const weeklyId = "40000000-0000-4000-8000-000000000002";
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "GET", "/api/v1/budgets?period=MONTHLY");
    const body = await response.json() as { budgets: Array<{ period: string }> };
    assert.equal(response.status, 200);
    assert.ok(body.budgets.every((b) => b.period === "MONTHLY"));
  }, [
    makeBudgetRecord(budgetA1, userA, { period: "MONTHLY" }),
    makeBudgetRecord(weeklyId, userA, { period: "WEEKLY" }),
  ]);
});

test("filter by categoryId returns only matching category budgets", async () => {
  const budgetWithCat = "40000000-0000-4000-8000-000000000002";
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "GET", `/api/v1/budgets?categoryId=${catA1}`);
    const body = await response.json() as { budgets: Array<{ categoryId: string | null }> };
    assert.equal(response.status, 200);
    assert.ok(body.budgets.every((b) => b.categoryId === catA1));
  }, [
    makeBudgetRecord(budgetA1, userA, { categoryId: null }),
    makeBudgetRecord(budgetWithCat, userA, { categoryId: catA1 }),
  ]);
});

test("pagination: page=1 pageSize=1 returns 1 item; page=2 returns next item", async () => {
  const budget2Id = "40000000-0000-4000-8000-000000000002";
  await withBudgetServer(async ({ baseUrl }) => {
    const response1 = await budgetRequest(baseUrl, userA, "GET", "/api/v1/budgets?page=1&pageSize=1");
    const body1 = await response1.json() as { budgets: unknown[]; pagination: { page: number; pageSize: number; totalItems: number; totalPages: number } };
    assert.equal(response1.status, 200);
    assert.equal(body1.budgets.length, 1);
    assert.equal(body1.pagination.page, 1);
    assert.equal(body1.pagination.pageSize, 1);
    assert.equal(body1.pagination.totalItems, 2);
    assert.equal(body1.pagination.totalPages, 2);

    const response2 = await budgetRequest(baseUrl, userA, "GET", "/api/v1/budgets?page=2&pageSize=1");
    const body2 = await response2.json() as { budgets: unknown[] };
    assert.equal(response2.status, 200);
    assert.equal(body2.budgets.length, 1);
  }, [
    makeBudgetRecord(budgetA1, userA, { startDate: new Date("2026-01-01") }),
    makeBudgetRecord(budget2Id, userA, { startDate: new Date("2025-12-01") }),
  ]);
});

// MONEY PRECISION
test("amount '500' (no decimal) stored and returned as '500.0000'", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody({ amount: "500" }));
    const body = await response.json() as { budget: { amount: string } };
    assert.equal(response.status, 201);
    assert.equal(body.budget.amount, "500.0000");
  });
});

test("amount '0' (zero) stored and returned as '0.0000'", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody({ amount: "0" }));
    const body = await response.json() as { budget: { amount: string } };
    assert.equal(response.status, 201);
    assert.equal(body.budget.amount, "0.0000");
  });
});

test("amount '1.00001' (5 decimal places) returns 400", async () => {
  await withBudgetServer(async ({ baseUrl }) => {
    const response = await budgetRequest(baseUrl, userA, "POST", "/api/v1/budgets", createBody({ amount: "1.00001" }));
    assert.equal(response.status, 400);
  });
});
