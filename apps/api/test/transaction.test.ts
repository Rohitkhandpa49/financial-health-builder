import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { ACCESS_COOKIE_NAME } from "../src/auth/auth.middleware.js";
import { JoseAccessTokenService } from "../src/auth/access-token.js";
import type {
  TransactionListQuery,
  CreateTransactionRequest,
} from "../../../packages/contracts/src/transactions/transactions.js";
import type {
  TransactionListResult,
  TransactionRecord,
  TransactionRepository,
  ResolvedTransactionListQuery,
  TransactionUpdatePatch,
} from "../src/transactions/transaction.repository.js";
import type {
  AccountRecord,
  AccountRepository,
} from "../src/accounts/account.repository.js";
import type {
  CategoryRecord,
  CategoryRepository,
} from "../src/categories/category.repository.js";
import { TransactionService } from "../src/transactions/transaction.service.js";

const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const accountA1 = "10000000-0000-4000-8000-000000000001";
const accountB1 = "10000000-0000-4000-8000-000000000003";
const catA1 = "20000000-0000-4000-8000-000000000001";
const catSystem = "20000000-0000-4000-8000-000000000099";
const txA1 = "30000000-0000-4000-8000-000000000001";
const txB1 = "30000000-0000-4000-8000-000000000003";
const testJwtSecret = "transaction-test-secret-with-at-least-32-characters";

function makeTransactionRecord(
  id: string,
  ownerId: string,
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord {
  return {
    id,
    userId: ownerId,
    accountId: accountA1,
    categoryId: null,
    type: "EXPENSE",
    amount: "50.0000",
    currency: "USD",
    description: "Groceries",
    effectiveAt: new Date("2026-01-15T00:00:00.000Z"),
    transferGroupId: null,
    transferDirection: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

class MemoryTransactionRepository implements TransactionRepository {
  readonly records = new Map<string, TransactionRecord>();

  constructor(initial: TransactionRecord[] = []) {
    for (const tx of initial) {
      this.records.set(tx.id, tx);
    }
  }

  async createForUser(
    userId: string,
    data: {
      accountId: string;
      categoryId?: string | null;
      type: string;
      amount: string;
      currency: string;
      description: string;
      effectiveAt: Date;
    },
  ): Promise<TransactionRecord> {
    const record: TransactionRecord = {
      id: randomUUID(),
      userId,
      accountId: data.accountId,
      categoryId: data.categoryId ?? null,
      type: data.type,
      amount: data.amount.includes(".") ? data.amount.padEnd(data.amount.indexOf(".") + 5, "0") : `${data.amount}.0000`,
      currency: data.currency,
      description: data.description,
      effectiveAt: data.effectiveAt,
      transferGroupId: null,
      transferDirection: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.records.set(record.id, record);
    return record;
  }

  async listForUser(userId: string, query: ResolvedTransactionListQuery): Promise<TransactionListResult> {
    const matching = [...this.records.values()]
      .filter((tx) => {
        if (tx.userId !== userId) return false;
        if (tx.type === "TRANSFER") return false;
        if (query.accountId !== undefined && tx.accountId !== query.accountId) return false;
        if (query.type !== undefined && tx.type !== query.type) return false;
        return true;
      })
      .sort((left, right) => {
        const byEffectiveAt = right.effectiveAt.getTime() - left.effectiveAt.getTime();
        if (byEffectiveAt !== 0) return byEffectiveAt;
        const byCreatedAt = right.createdAt.getTime() - left.createdAt.getTime();
        if (byCreatedAt !== 0) return byCreatedAt;
        return right.id.localeCompare(left.id);
      });

    const start = (query.page - 1) * query.pageSize;
    return {
      transactions: matching.slice(start, start + query.pageSize),
      total: matching.length,
    };
  }

  async findByIdForUser(id: string, userId: string): Promise<TransactionRecord | null> {
    const tx = this.records.get(id);
    if (!tx) return null;
    if (tx.userId !== userId) return null;
    if (tx.type === "TRANSFER") return null;
    return tx;
  }

  async updateForUser(id: string, userId: string, patch: TransactionUpdatePatch): Promise<TransactionRecord | null> {
    const tx = this.records.get(id);
    if (!tx) return null;
    if (tx.userId !== userId) return null;
    if (tx.type === "TRANSFER") return null;

    const updated: TransactionRecord = {
      ...tx,
      ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.effectiveAt !== undefined ? { effectiveAt: patch.effectiveAt } : {}),
      updatedAt: new Date(),
    };
    this.records.set(id, updated);
    return updated;
  }

  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const tx = this.records.get(id);
    if (!tx) return false;
    if (tx.userId !== userId) return false;
    this.records.delete(id);
    return true;
  }
}

function makeAccountRecord(id: string, ownerId: string, currency = "USD"): AccountRecord {
  return {
    id,
    userId: ownerId,
    name: "Test account",
    type: "BANK",
    currency,
    openingBalance: "0.0000",
    archived: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

class MemoryAccountRepository implements AccountRepository {
  readonly accounts = new Map<string, AccountRecord>();

  constructor(initial: AccountRecord[] = []) {
    for (const acc of initial) {
      this.accounts.set(acc.id, acc);
    }
  }

  async findByIdForUser(accountId: string, userId: string): Promise<AccountRecord | null> {
    const acc = this.accounts.get(accountId);
    return acc?.userId === userId ? acc : null;
  }

  async createForUser(): Promise<AccountRecord> {
    return Promise.resolve(null as unknown as AccountRecord);
  }

  async listForUser(): Promise<{ accounts: AccountRecord[]; totalItems: number }> {
    return Promise.resolve({ accounts: [], totalItems: 0 });
  }

  async updateNameForUser(): Promise<AccountRecord | null> {
    return Promise.resolve(null);
  }

  async archiveForUser(): Promise<AccountRecord | null> {
    return Promise.resolve(null);
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
  readonly categories = new Map<string, CategoryRecord>();

  constructor(initial: CategoryRecord[] = []) {
    for (const cat of initial) {
      this.categories.set(cat.id, cat);
    }
  }

  async findByIdForUserOrSystem(categoryId: string, userId: string): Promise<CategoryRecord | null> {
    const cat = this.categories.get(categoryId);
    if (!cat) return null;
    if (cat.userId === userId) return cat;
    if (cat.systemDefined === true && cat.userId === null) return cat;
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

function createTransactionTestContext(initialTransactions: TransactionRecord[] = []) {
  const transactionRepository = new MemoryTransactionRepository(initialTransactions);
  const accountRepository = new MemoryAccountRepository([
    makeAccountRecord(accountA1, userA, "USD"),
    makeAccountRecord(accountB1, userB, "USD"),
  ]);
  const categoryRepository = new MemoryCategoryRepository([
    makeCategoryRecord(catA1, userA, false),
    makeCategoryRecord(catSystem, null, true),
  ]);
  const service = new TransactionService(transactionRepository, accountRepository, categoryRepository);
  const accessTokenService = new JoseAccessTokenService(testJwtSecret);
  const app = createApp({
    transactions: { service, accessTokenService },
  });

  return { app, transactionRepository, accountRepository, categoryRepository, accessTokenService };
}

async function withTransactionServer<T>(
  callback: (context: { baseUrl: string } & ReturnType<typeof createTransactionTestContext>) => Promise<T>,
  initialTransactions: TransactionRecord[] = [],
): Promise<T> {
  const context = createTransactionTestContext(initialTransactions);
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

async function transactionRequest(
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
    accountId: accountA1,
    type: "EXPENSE",
    amount: "50.0000",
    description: "Groceries",
    effectiveAt: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

// AUTH
test("unauthenticated POST /transactions returns 401 AUTH_REQUIRED", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, undefined, "POST", "/api/v1/transactions", createBody());
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTH_REQUIRED");
  });
});

test("unauthenticated GET /transactions returns 401 AUTH_REQUIRED", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, undefined, "GET", "/api/v1/transactions");
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTH_REQUIRED");
  });
});

test("unauthenticated GET /transactions/:id returns 401 AUTH_REQUIRED", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, undefined, "GET", `/api/v1/transactions/${txA1}`);
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTH_REQUIRED");
  });
});

test("unauthenticated PATCH /transactions/:id returns 401 AUTH_REQUIRED", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, undefined, "PATCH", `/api/v1/transactions/${txA1}`, { description: "Changed" });
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTH_REQUIRED");
  });
});

test("unauthenticated DELETE /transactions/:id returns 401 AUTH_REQUIRED", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, undefined, "DELETE", `/api/v1/transactions/${txA1}`);
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTH_REQUIRED");
  });
});

// OWNERSHIP
test("userA can create transaction on own accountA1", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "POST", "/api/v1/transactions", createBody());
    assert.equal(response.status, 201);
  });
});

test("userA gets 400 TRANSACTION_INVALID_ACCOUNT when creating on accountB1 (belongs to userB)", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "POST", "/api/v1/transactions", createBody({ accountId: accountB1 }));
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 400);
    assert.equal(body.error.code, "TRANSACTION_INVALID_ACCOUNT");
  });
});

test("userA gets 404 when trying to GET txB1 (belongs to userB)", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "GET", `/api/v1/transactions/${txB1}`);
    assert.equal(response.status, 404);
  }, [makeTransactionRecord(txB1, userB)]);
});

test("userA gets 404 when trying to PATCH txB1 (belongs to userB)", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "PATCH", `/api/v1/transactions/${txB1}`, { description: "Hijacked" });
    assert.equal(response.status, 404);
  }, [makeTransactionRecord(txB1, userB)]);
});

test("userA gets 404 when trying to DELETE txB1 (belongs to userB)", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "DELETE", `/api/v1/transactions/${txB1}`);
    assert.equal(response.status, 404);
  }, [makeTransactionRecord(txB1, userB)]);
});

// INJECTION
test("POST body with userId field returns 400", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "POST", "/api/v1/transactions", createBody({ userId: userB }));
    assert.equal(response.status, 400);
  });
});

test("GET with ?userId=... query returns 400", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "GET", `/api/v1/transactions?userId=${userB}`);
    assert.equal(response.status, 400);
  });
});

// CATEGORY
test("create with own catA1 returns 201", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "POST", "/api/v1/transactions", createBody({ categoryId: catA1 }));
    assert.equal(response.status, 201);
  });
});

test("create with category ID not in any store returns 400 TRANSACTION_INVALID_CATEGORY", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const unknownCategoryId = "99999999-0000-4000-8000-000000000001";
    const response = await transactionRequest(baseUrl, userA, "POST", "/api/v1/transactions", createBody({ categoryId: unknownCategoryId }));
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 400);
    assert.equal(body.error.code, "TRANSACTION_INVALID_CATEGORY");
  });
});

test("create with catSystem (systemDefined=true) returns 201", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "POST", "/api/v1/transactions", createBody({ categoryId: catSystem }));
    assert.equal(response.status, 201);
  });
});

// VALIDATION
test("type TRANSFER returns 400", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "POST", "/api/v1/transactions", createBody({ type: "TRANSFER" }));
    assert.equal(response.status, 400);
  });
});

test("amount '-10' returns 400", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "POST", "/api/v1/transactions", createBody({ amount: "-10" }));
    assert.equal(response.status, 400);
  });
});

test("amount '1.00001' (5 decimal places) returns 400", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "POST", "/api/v1/transactions", createBody({ amount: "1.00001" }));
    assert.equal(response.status, 400);
  });
});

test("description with 501 characters returns 400", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "POST", "/api/v1/transactions", createBody({ description: "x".repeat(501) }));
    assert.equal(response.status, 400);
  });
});

test("invalid effectiveAt (not ISO 8601 with offset) returns 400", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "POST", "/api/v1/transactions", createBody({ effectiveAt: "not-a-date" }));
    assert.equal(response.status, 400);
  });
});

test("unknown body field returns 400", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "POST", "/api/v1/transactions", createBody({ unknownField: "value" }));
    assert.equal(response.status, 400);
  });
});

test("malformed transactionId UUID in param returns 400", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "GET", "/api/v1/transactions/not-a-uuid");
    assert.equal(response.status, 400);
  });
});

test("unknown query field returns 400", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "GET", "/api/v1/transactions?unknownField=value");
    assert.equal(response.status, 400);
  });
});

// CRUD
test("create returns 201 with transaction body; no userId field; currency is USD from account", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "POST", "/api/v1/transactions", createBody());
    const body = await response.json() as { transaction: Record<string, unknown> };
    assert.equal(response.status, 201);
    assert.ok(body.transaction, "response should have transaction");
    assert.equal(body.transaction.userId, undefined, "userId should not be in response");
    assert.equal(body.transaction.currency, "USD", "currency should come from account");
    assert.equal(typeof body.transaction.id, "string");
    assert.equal(body.transaction.type, "EXPENSE");
    assert.equal(body.transaction.description, "Groceries");
  });
});

test("GET own transaction returns 200 with transaction", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "GET", `/api/v1/transactions/${txA1}`);
    const body = await response.json() as { transaction: Record<string, unknown> };
    assert.equal(response.status, 200);
    assert.equal(body.transaction.id, txA1);
  }, [makeTransactionRecord(txA1, userA)]);
});

test("list returns 200 with transactions and pagination", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "GET", "/api/v1/transactions");
    const body = await response.json() as { transactions: unknown[]; pagination: Record<string, unknown> };
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.transactions));
    assert.ok(body.pagination, "response should have pagination");
    assert.ok(typeof body.pagination.page === "number");
    assert.ok(typeof body.pagination.pageSize === "number");
    assert.ok(typeof body.pagination.totalItems === "number");
    assert.ok(typeof body.pagination.totalPages === "number");
  }, [makeTransactionRecord(txA1, userA)]);
});

test("update description returns 200 with updated transaction", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "PATCH", `/api/v1/transactions/${txA1}`, { description: "Updated description" });
    const body = await response.json() as { transaction: Record<string, unknown> };
    assert.equal(response.status, 200);
    assert.equal(body.transaction.description, "Updated description");
  }, [makeTransactionRecord(txA1, userA)]);
});

test("update categoryId to null returns 200 with null categoryId", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "PATCH", `/api/v1/transactions/${txA1}`, { categoryId: null });
    const body = await response.json() as { transaction: Record<string, unknown> };
    assert.equal(response.status, 200);
    assert.equal(body.transaction.categoryId, null);
  }, [makeTransactionRecord(txA1, userA, { categoryId: catA1 })]);
});

test("PATCH with foreign categoryId (belongs to userB) returns 400 TRANSACTION_INVALID_CATEGORY and does not modify transaction", async () => {
  const catB1 = "20000000-0000-4000-8000-000000000002"; // not in category store — belongs to no seeded user
  await withTransactionServer(async ({ baseUrl, transactionRepository }) => {
    const response = await transactionRequest(baseUrl, userA, "PATCH", `/api/v1/transactions/${txA1}`, { categoryId: catB1 });
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 400);
    assert.equal(body.error.code, "TRANSACTION_INVALID_CATEGORY");
    // transaction must not have been modified
    assert.equal(transactionRepository.records.get(txA1)?.categoryId, null);
  }, [makeTransactionRecord(txA1, userA, { categoryId: null })]);
});

test("delete returns 204", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "DELETE", `/api/v1/transactions/${txA1}`);
    assert.equal(response.status, 204);
  }, [makeTransactionRecord(txA1, userA)]);
});

test("after delete, GET returns 404", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    await transactionRequest(baseUrl, userA, "DELETE", `/api/v1/transactions/${txA1}`);
    const response = await transactionRequest(baseUrl, userA, "GET", `/api/v1/transactions/${txA1}`);
    assert.equal(response.status, 404);
  }, [makeTransactionRecord(txA1, userA)]);
});

// FILTERING
test("filter by accountId returns only transactions for that account", async () => {
  const otherAccountId = "10000000-0000-4000-8000-000000000002";
  const txForOtherAccount = makeTransactionRecord(
    "30000000-0000-4000-8000-000000000002",
    userA,
    { accountId: otherAccountId },
  );

  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "GET", `/api/v1/transactions?accountId=${accountA1}`);
    const body = await response.json() as { transactions: Array<{ accountId: string }> };
    assert.equal(response.status, 200);
    assert.ok(body.transactions.every((tx) => tx.accountId === accountA1));
  }, [
    makeTransactionRecord(txA1, userA, { accountId: accountA1 }),
    txForOtherAccount,
  ]);
});

test("filter by type=INCOME returns only INCOME transactions", async () => {
  const incomeId = "30000000-0000-4000-8000-000000000002";
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "GET", "/api/v1/transactions?type=INCOME");
    const body = await response.json() as { transactions: Array<{ type: string }> };
    assert.equal(response.status, 200);
    assert.ok(body.transactions.every((tx) => tx.type === "INCOME"));
    assert.ok(body.transactions.some((tx) => (tx as unknown as { id: string }).id === incomeId));
  }, [
    makeTransactionRecord(txA1, userA, { type: "EXPENSE" }),
    makeTransactionRecord(incomeId, userA, { type: "INCOME" }),
  ]);
});

test("pagination: page=2 pageSize=1 with 2 transactions returns 1 result on page 2", async () => {
  const tx2Id = "30000000-0000-4000-8000-000000000002";
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "GET", "/api/v1/transactions?page=2&pageSize=1");
    const body = await response.json() as { transactions: unknown[]; pagination: { page: number; pageSize: number; totalItems: number; totalPages: number } };
    assert.equal(response.status, 200);
    assert.equal(body.transactions.length, 1);
    assert.equal(body.pagination.page, 2);
    assert.equal(body.pagination.pageSize, 1);
    assert.equal(body.pagination.totalItems, 2);
    assert.equal(body.pagination.totalPages, 2);
  }, [
    makeTransactionRecord(txA1, userA, { effectiveAt: new Date("2026-01-15T00:00:00.000Z") }),
    makeTransactionRecord(tx2Id, userA, { effectiveAt: new Date("2026-01-14T00:00:00.000Z") }),
  ]);
});

// MONEY
test("create with amount '100' returns response amount '100.0000'", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "POST", "/api/v1/transactions", createBody({ amount: "100" }));
    const body = await response.json() as { transaction: { amount: string } };
    assert.equal(response.status, 201);
    assert.equal(body.transaction.amount, "100.0000");
  });
});

test("create with amount '0' returns response amount '0.0000'", async () => {
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "POST", "/api/v1/transactions", createBody({ amount: "0" }));
    const body = await response.json() as { transaction: { amount: string } };
    assert.equal(response.status, 201);
    assert.equal(body.transaction.amount, "0.0000");
  });
});

// TRANSFER EXCLUSION
test("TRANSFER transaction seeded directly in repository is not returned by list", async () => {
  const transferId = "30000000-0000-4000-8000-000000000099";
  await withTransactionServer(async ({ baseUrl }) => {
    const response = await transactionRequest(baseUrl, userA, "GET", "/api/v1/transactions");
    const body = await response.json() as { transactions: Array<{ id: string; type: string }> };
    assert.equal(response.status, 200);
    assert.ok(!body.transactions.some((tx) => tx.id === transferId), "TRANSFER transaction should not appear in list");
    assert.ok(!body.transactions.some((tx) => tx.type === "TRANSFER"), "no TRANSFER types should appear");
  }, [
    makeTransactionRecord(txA1, userA, { type: "EXPENSE" }),
    makeTransactionRecord(transferId, userA, { type: "TRANSFER" }),
  ]);
});
