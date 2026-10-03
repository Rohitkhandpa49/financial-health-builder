import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { ACCESS_COOKIE_NAME } from "../src/auth/auth.middleware.js";
import { JoseAccessTokenService } from "../src/auth/access-token.js";
import type {
  RecurringTransactionListQuery,
  CreateRecurringTransactionRequest,
} from "../../../packages/contracts/src/recurring-transactions/recurring-transactions.js";
import type {
  RecurringTransactionListResult,
  RecurringTransactionRecord,
  RecurringTransactionRepository,
  ResolvedRecurringTransactionListQuery,
  RecurringTransactionUpdatePatch,
} from "../src/recurring-transactions/recurring-transaction.repository.js";
import type {
  AccountRecord,
  AccountRepository,
} from "../src/accounts/account.repository.js";
import type {
  CategoryRecord,
  CategoryRepository,
} from "../src/categories/category.repository.js";
import { RecurringTransactionService } from "../src/recurring-transactions/recurring-transaction.service.js";

const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const accountA1 = "10000000-0000-4000-8000-000000000001";
const accountB1 = "10000000-0000-4000-8000-000000000003";
const catA1 = "20000000-0000-4000-8000-000000000001";
const catSystem = "20000000-0000-4000-8000-000000000099";
const rtA1 = "60000000-0000-4000-8000-000000000001";
const rtB1 = "60000000-0000-4000-8000-000000000003";
const testJwtSecret = "recurring-test-secret-with-at-least-32-chars";

function makeRTRecord(id: string, ownerId: string, overrides: Partial<RecurringTransactionRecord> = {}): RecurringTransactionRecord {
  return {
    id,
    userId: ownerId,
    accountId: accountA1,
    categoryId: null,
    type: "EXPENSE",
    amount: "100.0000",
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
  };
}

class MemoryRecurringTransactionRepository implements RecurringTransactionRepository {
  readonly records = new Map<string, RecurringTransactionRecord>();

  constructor(initial: RecurringTransactionRecord[] = []) {
    for (const r of initial) this.records.set(r.id, r);
  }

  async createForUser(userId: string, input: CreateRecurringTransactionRequest, currency: string): Promise<RecurringTransactionRecord> {
    const norm = (v: string) => v.includes(".") ? v.padEnd(v.indexOf(".") + 5, "0") : `${v}.0000`;
    const record: RecurringTransactionRecord = {
      id: randomUUID(),
      userId,
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      type: input.type,
      amount: norm(input.amount),
      currency,
      description: input.description,
      frequency: input.frequency,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
      nextDate: new Date(input.nextDate),
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.records.set(record.id, record);
    return record;
  }

  async listForUser(userId: string, query: ResolvedRecurringTransactionListQuery): Promise<RecurringTransactionListResult> {
    const matching = [...this.records.values()]
      .filter((r) => {
        if (r.userId !== userId) return false;
        if (query.accountId !== undefined && r.accountId !== query.accountId) return false;
        if (query.active !== undefined && r.active !== query.active) return false;
        return true;
      })
      .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime() || b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
    const start = (query.page - 1) * query.pageSize;
    return { recurringTransactions: matching.slice(start, start + query.pageSize), totalItems: matching.length };
  }

  async findByIdForUser(id: string, userId: string): Promise<RecurringTransactionRecord | null> {
    const r = this.records.get(id);
    if (!r || r.userId !== userId) return null;
    return r;
  }

  async updateForUser(id: string, userId: string, patch: RecurringTransactionUpdatePatch): Promise<RecurringTransactionRecord | null> {
    const r = this.records.get(id);
    if (!r || r.userId !== userId) return null;
    const updated = { ...r, ...patch, updatedAt: new Date() };
    this.records.set(id, updated);
    return updated;
  }

  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const r = this.records.get(id);
    if (!r || r.userId !== userId) return false;
    this.records.delete(id);
    return true;
  }
}

function makeAccountRecord(id: string, ownerId: string, currency = "USD"): AccountRecord {
  return {
    id, userId: ownerId, name: "Test account", type: "BANK",
    currency, openingBalance: "0.0000", archived: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

class MemoryAccountRepository implements AccountRepository {
  readonly accounts = new Map<string, AccountRecord>();
  constructor(initial: AccountRecord[] = []) { for (const a of initial) this.accounts.set(a.id, a); }
  async findByIdForUser(id: string, userId: string): Promise<AccountRecord | null> {
    const a = this.accounts.get(id); return a?.userId === userId ? a : null;
  }
  async createForUser(): Promise<AccountRecord> { return null as unknown as AccountRecord; }
  async listForUser(): Promise<{ accounts: AccountRecord[]; totalItems: number }> { return { accounts: [], totalItems: 0 }; }
  async updateNameForUser(): Promise<AccountRecord | null> { return null; }
  async archiveForUser(): Promise<AccountRecord | null> { return null; }
}

function makeCategoryRecord(id: string, ownerId: string | null, systemDefined: boolean): CategoryRecord {
  return {
    id, userId: ownerId, name: "Test category", type: "EXPENSE",
    systemDefined, archived: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

class MemoryCategoryRepository implements CategoryRepository {
  readonly categories = new Map<string, CategoryRecord>();
  constructor(initial: CategoryRecord[] = []) { for (const c of initial) this.categories.set(c.id, c); }
  async findByIdForUserOrSystem(id: string, userId: string): Promise<CategoryRecord | null> {
    const c = this.categories.get(id);
    if (!c) return null;
    return c.userId === userId || (c.systemDefined && c.userId === null) ? c : null;
  }
  async createForUser(): Promise<CategoryRecord> { return null as unknown as CategoryRecord; }
  async listForUser(): Promise<{ categories: CategoryRecord[]; totalItems: number }> { return { categories: [], totalItems: 0 }; }
  async updateNameForUser(): Promise<CategoryRecord | null> { return null; }
  async archiveForUser(): Promise<CategoryRecord | null> { return null; }
}

function createRTTestContext(initialRecords: RecurringTransactionRecord[] = []) {
  const recurringRepository = new MemoryRecurringTransactionRepository(initialRecords);
  const accountRepository = new MemoryAccountRepository([
    makeAccountRecord(accountA1, userA, "USD"),
    makeAccountRecord(accountB1, userB, "USD"),
  ]);
  const categoryRepository = new MemoryCategoryRepository([
    makeCategoryRecord(catA1, userA, false),
    makeCategoryRecord(catSystem, null, true),
  ]);
  const service = new RecurringTransactionService(recurringRepository, accountRepository, categoryRepository);
  const accessTokenService = new JoseAccessTokenService(testJwtSecret);
  const app = createApp({ recurringTransactions: { service, accessTokenService } });
  return { app, recurringRepository, accessTokenService };
}

async function withRTServer<T>(
  callback: (ctx: { baseUrl: string } & ReturnType<typeof createRTTestContext>) => Promise<T>,
  initial: RecurringTransactionRecord[] = [],
): Promise<T> {
  const ctx = createRTTestContext(initial);
  const server = createServer(ctx.app);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try { return await callback({ baseUrl, ...ctx }); }
  finally { await new Promise<void>((resolve, reject) => { server.close((e) => e ? reject(e) : resolve()); }); }
}

async function rtRequest(baseUrl: string, userId: string | undefined, method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  if (userId) headers.Cookie = `${ACCESS_COOKIE_NAME}=${await new JoseAccessTokenService(testJwtSecret).issue(userId)}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function createBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    accountId: accountA1,
    type: "EXPENSE",
    amount: "100.0000",
    description: "Monthly rent",
    frequency: "MONTHLY",
    startDate: "2026-01-01",
    nextDate: "2026-02-01",
    ...overrides,
  };
}

// AUTH
test("unauthenticated POST /recurring-transactions returns 401", async () => {
  await withRTServer(async ({ baseUrl }) => {
    const r = await rtRequest(baseUrl, undefined, "POST", "/api/v1/recurring-transactions", createBody());
    assert.equal(r.status, 401);
    assert.equal((await r.json() as { error: { code: string } }).error.code, "AUTH_REQUIRED");
  });
});

test("unauthenticated GET /recurring-transactions returns 401", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, undefined, "GET", "/api/v1/recurring-transactions")).status, 401);
  });
});

test("unauthenticated GET /:id returns 401", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, undefined, "GET", `/api/v1/recurring-transactions/${rtA1}`)).status, 401);
  });
});

test("unauthenticated PATCH /:id returns 401", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, undefined, "PATCH", `/api/v1/recurring-transactions/${rtA1}`, { description: "x" })).status, 401);
  });
});

test("unauthenticated DELETE /:id returns 401", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, undefined, "DELETE", `/api/v1/recurring-transactions/${rtA1}`)).status, 401);
  });
});

// OWNERSHIP
test("userA can create recurring transaction on own account", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "POST", "/api/v1/recurring-transactions", createBody())).status, 201);
  });
});

test("userA using accountB1 returns 400 RECURRING_INVALID_ACCOUNT", async () => {
  await withRTServer(async ({ baseUrl }) => {
    const r = await rtRequest(baseUrl, userA, "POST", "/api/v1/recurring-transactions", createBody({ accountId: accountB1 }));
    const body = await r.json() as { error: { code: string } };
    assert.equal(r.status, 400);
    assert.equal(body.error.code, "RECURRING_INVALID_ACCOUNT");
  });
});

test("userA GET rtB1 returns 404", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "GET", `/api/v1/recurring-transactions/${rtB1}`)).status, 404);
  }, [makeRTRecord(rtB1, userB)]);
});

test("userA PATCH rtB1 returns 404", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "PATCH", `/api/v1/recurring-transactions/${rtB1}`, { description: "hijack" })).status, 404);
  }, [makeRTRecord(rtB1, userB)]);
});

test("userA DELETE rtB1 returns 404", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "DELETE", `/api/v1/recurring-transactions/${rtB1}`)).status, 404);
  }, [makeRTRecord(rtB1, userB)]);
});

// INJECTION
test("POST body with userId field returns 400", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "POST", "/api/v1/recurring-transactions", createBody({ userId: userB }))).status, 400);
  });
});

test("GET with ?userId=... returns 400", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "GET", `/api/v1/recurring-transactions?userId=${userB}`)).status, 400);
  });
});

// CATEGORY
test("create with own category returns 201", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "POST", "/api/v1/recurring-transactions", createBody({ categoryId: catA1 }))).status, 201);
  });
});

test("create with unknown categoryId returns 400 RECURRING_INVALID_CATEGORY", async () => {
  await withRTServer(async ({ baseUrl }) => {
    const r = await rtRequest(baseUrl, userA, "POST", "/api/v1/recurring-transactions", createBody({ categoryId: "99999999-0000-4000-8000-000000000001" }));
    assert.equal(r.status, 400);
    assert.equal((await r.json() as { error: { code: string } }).error.code, "RECURRING_INVALID_CATEGORY");
  });
});

test("create with system category returns 201", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "POST", "/api/v1/recurring-transactions", createBody({ categoryId: catSystem }))).status, 201);
  });
});

// VALIDATION
test("TRANSFER type returns 400", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "POST", "/api/v1/recurring-transactions", createBody({ type: "TRANSFER" }))).status, 400);
  });
});

test("negative amount returns 400", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "POST", "/api/v1/recurring-transactions", createBody({ amount: "-10" }))).status, 400);
  });
});

test("amount with 5 decimal places returns 400", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "POST", "/api/v1/recurring-transactions", createBody({ amount: "1.00001" }))).status, 400);
  });
});

test("invalid frequency returns 400", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "POST", "/api/v1/recurring-transactions", createBody({ frequency: "BIWEEKLY" }))).status, 400);
  });
});

test("invalid startDate returns 400", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "POST", "/api/v1/recurring-transactions", createBody({ startDate: "not-a-date" }))).status, 400);
  });
});

test("description 501 chars returns 400", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "POST", "/api/v1/recurring-transactions", createBody({ description: "x".repeat(501) }))).status, 400);
  });
});

test("unknown body field returns 400", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "POST", "/api/v1/recurring-transactions", createBody({ unknownField: "x" }))).status, 400);
  });
});

test("malformed recurringTransactionId UUID returns 400", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "GET", "/api/v1/recurring-transactions/not-a-uuid")).status, 400);
  });
});

test("unknown query field returns 400", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "GET", "/api/v1/recurring-transactions?unknownField=x")).status, 400);
  });
});

// CRUD
test("create returns 201 with correct fields, no userId in response, currency from account", async () => {
  await withRTServer(async ({ baseUrl }) => {
    const r = await rtRequest(baseUrl, userA, "POST", "/api/v1/recurring-transactions", createBody());
    const body = await r.json() as { recurringTransaction: Record<string, unknown> };
    assert.equal(r.status, 201);
    assert.ok(body.recurringTransaction.id);
    assert.equal(body.recurringTransaction.userId, undefined);
    assert.equal(body.recurringTransaction.currency, "USD");
    assert.equal(body.recurringTransaction.frequency, "MONTHLY");
    assert.equal(body.recurringTransaction.active, true);
    assert.equal(body.recurringTransaction.amount, "100.0000");
  });
});

test("GET own recurring transaction returns 200", async () => {
  await withRTServer(async ({ baseUrl }) => {
    const r = await rtRequest(baseUrl, userA, "GET", `/api/v1/recurring-transactions/${rtA1}`);
    assert.equal(r.status, 200);
    assert.equal((await r.json() as { recurringTransaction: { id: string } }).recurringTransaction.id, rtA1);
  }, [makeRTRecord(rtA1, userA)]);
});

test("list returns 200 with pagination shape", async () => {
  await withRTServer(async ({ baseUrl }) => {
    const r = await rtRequest(baseUrl, userA, "GET", "/api/v1/recurring-transactions");
    const body = await r.json() as { recurringTransactions: unknown[]; pagination: Record<string, unknown> };
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(body.recurringTransactions));
    assert.ok(typeof body.pagination.page === "number");
    assert.ok(typeof body.pagination.totalItems === "number");
  }, [makeRTRecord(rtA1, userA)]);
});

test("update description returns 200 with updated description", async () => {
  await withRTServer(async ({ baseUrl }) => {
    const r = await rtRequest(baseUrl, userA, "PATCH", `/api/v1/recurring-transactions/${rtA1}`, { description: "Updated rent" });
    assert.equal(r.status, 200);
    assert.equal((await r.json() as { recurringTransaction: { description: string } }).recurringTransaction.description, "Updated rent");
  }, [makeRTRecord(rtA1, userA)]);
});

test("update active to false returns 200", async () => {
  await withRTServer(async ({ baseUrl }) => {
    const r = await rtRequest(baseUrl, userA, "PATCH", `/api/v1/recurring-transactions/${rtA1}`, { active: false });
    assert.equal(r.status, 200);
    assert.equal((await r.json() as { recurringTransaction: { active: boolean } }).recurringTransaction.active, false);
  }, [makeRTRecord(rtA1, userA)]);
});

test("delete returns 204", async () => {
  await withRTServer(async ({ baseUrl }) => {
    assert.equal((await rtRequest(baseUrl, userA, "DELETE", `/api/v1/recurring-transactions/${rtA1}`)).status, 204);
  }, [makeRTRecord(rtA1, userA)]);
});

test("after delete GET returns 404", async () => {
  await withRTServer(async ({ baseUrl }) => {
    await rtRequest(baseUrl, userA, "DELETE", `/api/v1/recurring-transactions/${rtA1}`);
    assert.equal((await rtRequest(baseUrl, userA, "GET", `/api/v1/recurring-transactions/${rtA1}`)).status, 404);
  }, [makeRTRecord(rtA1, userA)]);
});

// FILTERING
test("filter by active=false returns only inactive records", async () => {
  await withRTServer(async ({ baseUrl }) => {
    const r = await rtRequest(baseUrl, userA, "GET", "/api/v1/recurring-transactions?active=false");
    const body = await r.json() as { recurringTransactions: Array<{ active: boolean }> };
    assert.equal(r.status, 200);
    assert.ok(body.recurringTransactions.every((rt) => rt.active === false));
  }, [
    makeRTRecord(rtA1, userA, { active: true }),
    makeRTRecord("60000000-0000-4000-8000-000000000002", userA, { active: false }),
  ]);
});

// MONEY
test("amount '100' is stored and returned as '100.0000'", async () => {
  await withRTServer(async ({ baseUrl }) => {
    const r = await rtRequest(baseUrl, userA, "POST", "/api/v1/recurring-transactions", createBody({ amount: "100" }));
    assert.equal(r.status, 201);
    assert.equal((await r.json() as { recurringTransaction: { amount: string } }).recurringTransaction.amount, "100.0000");
  });
});
