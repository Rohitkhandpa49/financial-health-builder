import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { ACCESS_COOKIE_NAME } from "../src/auth/auth.middleware.js";
import { JoseAccessTokenService } from "../src/auth/access-token.js";
import type {
  CategoryListQuery,
  CategoryType,
  CreateCategoryRequest,
} from "../../../packages/contracts/src/categories/categories.js";
import type {
  CategoryListResult,
  CategoryRecord,
  CategoryRepository,
} from "../src/categories/category.repository.js";
import { CategoryService } from "../src/categories/category.service.js";

const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const catA1 = "20000000-0000-4000-8000-000000000001";
const catA2 = "20000000-0000-4000-8000-000000000002";
const catB1 = "20000000-0000-4000-8000-000000000003";
const catSystem = "20000000-0000-4000-8000-000000000099";
const testJwtSecret = "category-test-secret-with-at-least-32-characters";

function makeCategory(
  id: string,
  ownerId: string | null,
  overrides: Partial<CategoryRecord> = {},
): CategoryRecord {
  return {
    id,
    userId: ownerId,
    name: "Test category",
    type: "EXPENSE",
    systemDefined: ownerId === null,
    archived: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

class MemoryCategoryRepository implements CategoryRepository {
  readonly records = new Map<string, CategoryRecord>();

  constructor(initial: CategoryRecord[] = []) {
    for (const category of initial) {
      this.records.set(category.id, category);
    }
  }

  async createForUser(userId: string, input: CreateCategoryRequest): Promise<CategoryRecord> {
    const category = makeCategory(randomUUID(), userId, {
      name: input.name,
      type: input.type,
      systemDefined: false,
    });
    this.records.set(category.id, category);
    return category;
  }

  async listForUser(userId: string, query: Required<CategoryListQuery>): Promise<CategoryListResult> {
    const matching = [...this.records.values()]
      .filter((category) => {
        const isOwn = category.userId === userId;
        const isSystem = category.systemDefined === true && category.userId === null;
        if (!isOwn && !isSystem) return false;
        if (category.archived !== query.archived) return false;
        if (query.type !== undefined && category.type !== query.type) return false;
        return true;
      })
      .sort((left, right) =>
        right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id),
      );
    const start = (query.page - 1) * query.pageSize;

    return {
      categories: matching.slice(start, start + query.pageSize),
      totalItems: matching.length,
    };
  }

  async findByIdForUserOrSystem(categoryId: string, userId: string): Promise<CategoryRecord | null> {
    const category = this.records.get(categoryId);
    if (!category) return null;
    if (category.userId === userId) return category;
    if (category.systemDefined === true && category.userId === null) return category;
    return null;
  }

  async updateNameForUser(categoryId: string, userId: string, name: string): Promise<CategoryRecord | null> {
    const category = this.records.get(categoryId);
    if (!category) return null;
    if (category.userId !== userId) return null;
    if (category.systemDefined) return null;
    if (category.archived) return null;

    const updated = { ...category, name, updatedAt: new Date() };
    this.records.set(categoryId, updated);
    return updated;
  }

  async archiveForUser(categoryId: string, userId: string): Promise<CategoryRecord | null> {
    const category = this.records.get(categoryId);
    if (!category) return null;
    if (category.userId !== userId) return null;
    if (category.systemDefined) return null;

    const archived = { ...category, archived: true, updatedAt: new Date() };
    this.records.set(categoryId, archived);
    return archived;
  }
}

function createCategoryTestContext(initial: CategoryRecord[] = []) {
  const repository = new MemoryCategoryRepository(initial);
  const service = new CategoryService(repository);
  const accessTokenService = new JoseAccessTokenService(testJwtSecret);
  const app = createApp({
    categories: { service, accessTokenService },
  });

  return { app, repository, accessTokenService };
}

async function withCategoryServer<T>(
  callback: (baseUrl: string, context: ReturnType<typeof createCategoryTestContext>) => Promise<T>,
  initial: CategoryRecord[] = [],
): Promise<T> {
  const context = createCategoryTestContext(initial);
  const server = createServer(context.app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await callback(baseUrl, context);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function categoryRequest(
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

function createBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Groceries",
    type: "EXPENSE",
    ...overrides,
  };
}

test("all category routes require authentication", async () => {
  await withCategoryServer(async (baseUrl) => {
    const responses = await Promise.all([
      categoryRequest(baseUrl, undefined, "POST", "/api/v1/categories", createBody()),
      categoryRequest(baseUrl, undefined, "GET", "/api/v1/categories"),
      categoryRequest(baseUrl, undefined, "GET", `/api/v1/categories/${catA1}`),
      categoryRequest(baseUrl, undefined, "PATCH", `/api/v1/categories/${catA1}`, { name: "Changed" }),
      categoryRequest(baseUrl, undefined, "PATCH", `/api/v1/categories/${catA1}/archive`),
    ]);
    const errorBodies = await Promise.all(responses.map(async (response) =>
      response.json() as Promise<{ error: { code: string } }>,
    ));

    assert.deepEqual(responses.map((response) => response.status), [401, 401, 401, 401, 401]);
    assert.deepEqual(errorBodies.map((body) => body.error.code), Array(5).fill("AUTH_REQUIRED"));
  });
});

test("create derives owner from authentication, returns safe DTO", async () => {
  await withCategoryServer(async (baseUrl, context) => {
    const response = await categoryRequest(baseUrl, userA, "POST", "/api/v1/categories", createBody());
    const body = await response.json() as { category: Record<string, unknown> };

    assert.equal(response.status, 201);
    assert.equal(body.category.name, "Groceries");
    assert.equal(body.category.type, "EXPENSE");
    assert.equal(typeof body.category.id, "string");
    assert.equal(body.category.systemDefined, false);
    assert.equal(body.category.archived, false);
    assert.equal(typeof body.category.createdAt, "string");
    assert.equal(typeof body.category.updatedAt, "string");
    assert.equal(body.category.userId, undefined);

    const record = context.repository.records.get(body.category.id as string);
    assert.equal(record?.userId, userA);
  });
});

test("create rejects client-supplied ownership and protected fields", async () => {
  await withCategoryServer(async (baseUrl, context) => {
    const responses = await Promise.all([
      categoryRequest(baseUrl, userA, "POST", "/api/v1/categories", createBody({ userId: userB })),
      categoryRequest(baseUrl, userA, "POST", "/api/v1/categories", createBody({ systemDefined: true })),
      categoryRequest(baseUrl, userA, "POST", "/api/v1/categories", createBody({ archived: true })),
      categoryRequest(baseUrl, userA, "POST", "/api/v1/categories", createBody({ id: catA1 })),
    ]);

    assert.deepEqual(responses.map((r) => r.status), [400, 400, 400, 400]);
    assert.equal(context.repository.records.size, 0);
  });
});

test("create validates name and type", async () => {
  await withCategoryServer(async (baseUrl, context) => {
    const responses = await Promise.all([
      categoryRequest(baseUrl, userA, "POST", "/api/v1/categories", createBody({ name: "" })),
      categoryRequest(baseUrl, userA, "POST", "/api/v1/categories", createBody({ name: "   " })),
      categoryRequest(baseUrl, userA, "POST", "/api/v1/categories", createBody({ name: "x".repeat(101) })),
      categoryRequest(baseUrl, userA, "POST", "/api/v1/categories", createBody({ type: "TRANSFER" })),
    ]);

    assert.deepEqual(responses.map((r) => r.status), [400, 400, 400, 400]);
    assert.equal(context.repository.records.size, 0);
  });
});

test("list returns own and system categories, excludes other users", async () => {
  const initial = [
    makeCategory(catA1, userA, { type: "EXPENSE", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    makeCategory(catB1, userB, { type: "INCOME", createdAt: new Date("2026-01-02T00:00:00.000Z") }),
    makeCategory(catSystem, null, { type: "INCOME", createdAt: new Date("2026-01-03T00:00:00.000Z") }),
  ];

  await withCategoryServer(async (baseUrl) => {
    const userAResponse = await categoryRequest(baseUrl, userA, "GET", "/api/v1/categories");
    const userABody = await userAResponse.json() as { categories: Array<{ id: string }>; pagination: { totalItems: number } };

    const userBResponse = await categoryRequest(baseUrl, userB, "GET", "/api/v1/categories");
    const userBBody = await userBResponse.json() as { categories: Array<{ id: string }>; pagination: { totalItems: number } };

    assert.equal(userAResponse.status, 200);
    const userAIds = userABody.categories.map((c) => c.id);
    assert.ok(userAIds.includes(catA1), "userA should see their own category");
    assert.ok(userAIds.includes(catSystem), "userA should see system category");
    assert.ok(!userAIds.includes(catB1), "userA should NOT see userB's category");

    assert.equal(userBResponse.status, 200);
    const userBIds = userBBody.categories.map((c) => c.id);
    assert.ok(userBIds.includes(catB1), "userB should see their own category");
    assert.ok(userBIds.includes(catSystem), "userB should see system category");
    assert.ok(!userBIds.includes(catA1), "userB should NOT see userA's category");
  }, initial);
});

test("list supports type filter", async () => {
  const initial = [
    makeCategory(catA1, userA, { type: "EXPENSE", createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    makeCategory(catA2, userA, { type: "INCOME", createdAt: new Date("2026-01-02T00:00:00.000Z") }),
    makeCategory(catSystem, null, { type: "EXPENSE", createdAt: new Date("2026-01-03T00:00:00.000Z") }),
  ];

  await withCategoryServer(async (baseUrl) => {
    const expenseResponse = await categoryRequest(baseUrl, userA, "GET", "/api/v1/categories?type=EXPENSE");
    const expenseBody = await expenseResponse.json() as { categories: Array<{ id: string; type: string }> };

    const incomeResponse = await categoryRequest(baseUrl, userA, "GET", "/api/v1/categories?type=INCOME");
    const incomeBody = await incomeResponse.json() as { categories: Array<{ id: string; type: string }> };

    assert.equal(expenseResponse.status, 200);
    assert.ok(expenseBody.categories.every((c) => c.type === "EXPENSE"));
    const expenseIds = expenseBody.categories.map((c) => c.id);
    assert.ok(expenseIds.includes(catA1));
    assert.ok(expenseIds.includes(catSystem));
    assert.ok(!expenseIds.includes(catA2));

    assert.equal(incomeResponse.status, 200);
    assert.ok(incomeBody.categories.every((c) => c.type === "INCOME"));
    const incomeIds = incomeBody.categories.map((c) => c.id);
    assert.ok(incomeIds.includes(catA2));
    assert.ok(!incomeIds.includes(catA1));
  }, initial);
});

test("list supports archived filter and pagination", async () => {
  const initial = [
    makeCategory(catA1, userA, { archived: false, createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    makeCategory(catA2, userA, { archived: true, createdAt: new Date("2026-01-02T00:00:00.000Z") }),
  ];

  await withCategoryServer(async (baseUrl) => {
    const defaultList = await categoryRequest(baseUrl, userA, "GET", "/api/v1/categories");
    const defaultBody = await defaultList.json() as { categories: Array<{ id: string }> };

    const archivedList = await categoryRequest(baseUrl, userA, "GET", "/api/v1/categories?archived=true");
    const archivedBody = await archivedList.json() as { categories: Array<{ id: string }> };

    const pageResponse = await categoryRequest(baseUrl, userA, "GET", "/api/v1/categories?page=1&pageSize=1");
    const pageBody = await pageResponse.json() as { categories: Array<{ id: string }>; pagination: { page: number; pageSize: number; totalItems: number; totalPages: number } };

    assert.equal(defaultList.status, 200);
    assert.ok(!defaultBody.categories.some((c) => c.id === catA2), "archived should be hidden by default");
    assert.ok(defaultBody.categories.some((c) => c.id === catA1));

    assert.equal(archivedList.status, 200);
    assert.ok(archivedBody.categories.some((c) => c.id === catA2));
    assert.ok(!archivedBody.categories.some((c) => c.id === catA1));

    assert.equal(pageResponse.status, 200);
    assert.equal(pageBody.pagination.pageSize, 1);
    assert.equal(pageBody.categories.length, 1);
    assert.equal(pageBody.pagination.totalItems, 1);
  }, initial);
});

test("list rejects oversized pagination and unknown query params", async () => {
  await withCategoryServer(async (baseUrl) => {
    const oversized = await categoryRequest(baseUrl, userA, "GET", "/api/v1/categories?pageSize=101");
    const injectedOwner = await categoryRequest(baseUrl, userA, "GET", `/api/v1/categories?userId=${userB}`);
    const invalidArchivedFilter = await categoryRequest(baseUrl, userA, "GET", "/api/v1/categories?archived=maybe");

    assert.equal(oversized.status, 400);
    assert.equal(injectedOwner.status, 400);
    assert.equal(invalidArchivedFilter.status, 400);
  });
});

test("get returns own category or system category, 404 for others", async () => {
  const initial = [
    makeCategory(catA1, userA),
    makeCategory(catB1, userB),
    makeCategory(catSystem, null),
  ];

  await withCategoryServer(async (baseUrl) => {
    const ownResponse = await categoryRequest(baseUrl, userA, "GET", `/api/v1/categories/${catA1}`);
    const ownBody = await ownResponse.json() as { category: Record<string, unknown> };

    const systemResponse = await categoryRequest(baseUrl, userA, "GET", `/api/v1/categories/${catSystem}`);
    const systemBody = await systemResponse.json() as { category: Record<string, unknown> };

    const otherResponse = await categoryRequest(baseUrl, userA, "GET", `/api/v1/categories/${catB1}`);
    const otherBody = await otherResponse.json() as { error: { code: string } };

    const nonExistentId = "99999999-0000-4000-8000-000000000001";
    const nonExistentResponse = await categoryRequest(baseUrl, userA, "GET", `/api/v1/categories/${nonExistentId}`);

    assert.equal(ownResponse.status, 200);
    assert.equal(ownBody.category.userId, undefined);

    assert.equal(systemResponse.status, 200);
    assert.equal(systemBody.category.systemDefined, true);
    assert.equal(systemBody.category.userId, undefined);

    assert.equal(otherResponse.status, 404);
    assert.equal(otherBody.error.code, "NOT_FOUND");
    assert.equal(JSON.stringify(otherBody).includes(userB), false);

    assert.equal(nonExistentResponse.status, 404);
  }, initial);
});

test("update allows name change for own non-archived category", async () => {
  await withCategoryServer(async (baseUrl) => {
    const response = await categoryRequest(baseUrl, userA, "PATCH", `/api/v1/categories/${catA1}`, { name: "Renamed" });
    const body = await response.json() as { category: Record<string, unknown> };

    assert.equal(response.status, 200);
    assert.equal(body.category.name, "Renamed");
    assert.equal(body.category.userId, undefined);
  }, [makeCategory(catA1, userA)]);
});

test("update rejects system categories with 403", async () => {
  await withCategoryServer(async (baseUrl) => {
    const response = await categoryRequest(baseUrl, userA, "PATCH", `/api/v1/categories/${catSystem}`, { name: "Hacked" });
    const body = await response.json() as { error: { code: string } };

    assert.equal(response.status, 403);
    assert.equal(body.error.code, "FORBIDDEN");
  }, [makeCategory(catSystem, null)]);
});

test("update rejects other user categories with 404", async () => {
  await withCategoryServer(async (baseUrl) => {
    const response = await categoryRequest(baseUrl, userA, "PATCH", `/api/v1/categories/${catB1}`, { name: "Hijacked" });

    assert.equal(response.status, 404);
  }, [makeCategory(catB1, userB)]);
});

test("update rejects archived categories with 404", async () => {
  await withCategoryServer(async (baseUrl) => {
    const response = await categoryRequest(baseUrl, userA, "PATCH", `/api/v1/categories/${catA1}`, { name: "Renamed" });

    assert.equal(response.status, 404);
  }, [makeCategory(catA1, userA, { archived: true })]);
});

test("update rejects unknown body fields", async () => {
  await withCategoryServer(async (baseUrl) => {
    const withUserId = await categoryRequest(baseUrl, userA, "PATCH", `/api/v1/categories/${catA1}`, { name: "ok", userId: userB });
    const withType = await categoryRequest(baseUrl, userA, "PATCH", `/api/v1/categories/${catA1}`, { name: "ok", type: "INCOME" });

    assert.equal(withUserId.status, 400);
    assert.equal(withType.status, 400);
  }, [makeCategory(catA1, userA)]);
});

test("archive is idempotent, remains retrievable, hidden from default list", async () => {
  await withCategoryServer(async (baseUrl) => {
    const archive1 = await categoryRequest(baseUrl, userA, "PATCH", `/api/v1/categories/${catA1}/archive`);
    const archive1Body = await archive1.json() as { category: { archived: boolean } };

    const archive2 = await categoryRequest(baseUrl, userA, "PATCH", `/api/v1/categories/${catA1}/archive`);

    const getArchived = await categoryRequest(baseUrl, userA, "GET", `/api/v1/categories/${catA1}`);
    const getArchivedBody = await getArchived.json() as { category: { archived: boolean } };

    const activeList = await categoryRequest(baseUrl, userA, "GET", "/api/v1/categories");
    const activeListBody = await activeList.json() as { categories: Array<{ id: string }> };

    const archivedList = await categoryRequest(baseUrl, userA, "GET", "/api/v1/categories?archived=true");
    const archivedListBody = await archivedList.json() as { categories: Array<{ id: string }> };

    assert.equal(archive1.status, 200);
    assert.equal(archive1Body.category.archived, true);
    assert.equal(archive2.status, 200);

    assert.equal(getArchived.status, 200);
    assert.equal(getArchivedBody.category.archived, true);

    assert.ok(!activeListBody.categories.some((c) => c.id === catA1), "archived should not appear in active list");
    assert.ok(archivedListBody.categories.some((c) => c.id === catA1), "archived should appear in archived list");
  }, [makeCategory(catA1, userA)]);
});

test("archive rejects system categories with 403", async () => {
  await withCategoryServer(async (baseUrl) => {
    const response = await categoryRequest(baseUrl, userA, "PATCH", `/api/v1/categories/${catSystem}/archive`);
    const body = await response.json() as { error: { code: string } };

    assert.equal(response.status, 403);
    assert.equal(body.error.code, "FORBIDDEN");
  }, [makeCategory(catSystem, null)]);
});

test("archive rejects other user categories with 404", async () => {
  await withCategoryServer(async (baseUrl) => {
    const response = await categoryRequest(baseUrl, userA, "PATCH", `/api/v1/categories/${catB1}/archive`);

    assert.equal(response.status, 404);
  }, [makeCategory(catB1, userB)]);
});

test("update after archive is rejected with 404", async () => {
  await withCategoryServer(async (baseUrl) => {
    const response = await categoryRequest(baseUrl, userA, "PATCH", `/api/v1/categories/${catA1}`, { name: "x" });

    assert.equal(response.status, 404);
  }, [makeCategory(catA1, userA, { archived: true })]);
});

test("malformed category IDs are rejected", async () => {
  await withCategoryServer(async (baseUrl) => {
    const response = await categoryRequest(baseUrl, userA, "GET", "/api/v1/categories/not-a-uuid");

    assert.equal(response.status, 400);
  });
});
