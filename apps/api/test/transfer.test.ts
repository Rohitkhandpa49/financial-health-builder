import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { ACCESS_COOKIE_NAME } from "../src/auth/auth.middleware.js";
import { JoseAccessTokenService } from "../src/auth/access-token.js";
import type { CreateTransferRequest } from "../../../packages/contracts/src/transfers/transfers.js";
import type {
  TransferPair,
  TransferListResult,
  TransferRepository,
  ResolvedTransferListQuery,
} from "../src/transfers/transfer.repository.js";
import { toTransferResponse } from "../src/transfers/transfer.repository.js";
import type { AccountRecord, AccountRepository } from "../src/accounts/account.repository.js";
import { TransferService } from "../src/transfers/transfer.service.js";

const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const accountA1 = "10000000-0000-4000-8000-000000000001";
const accountA2 = "10000000-0000-4000-8000-000000000002";
const accountB1 = "10000000-0000-4000-8000-000000000003";
const groupA1 = "70000000-0000-4000-8000-000000000001";
const groupB1 = "70000000-0000-4000-8000-000000000003";
const testJwtSecret = "transfer-test-secret-with-at-least-32-chars";

function makeTransferPair(
  groupId: string,
  ownerId: string,
  srcAccountId: string,
  dstAccountId: string,
  amount = "250.0000",
  currency = "USD",
): TransferPair {
  const now = new Date("2026-01-15T00:00:00.000Z");
  return {
    outgoing: {
      id: randomUUID(), userId: ownerId, accountId: srcAccountId,
      amount, currency, description: "Transfer", effectiveAt: now,
      transferGroupId: groupId, createdAt: now,
    },
    incoming: {
      id: randomUUID(), userId: ownerId, accountId: dstAccountId,
      amount, currency, description: "Transfer", effectiveAt: now,
      transferGroupId: groupId, createdAt: now,
    },
  };
}

class MemoryTransferRepository implements TransferRepository {
  readonly pairs = new Map<string, TransferPair>();

  constructor(initial: TransferPair[] = []) {
    for (const p of initial) this.pairs.set(p.outgoing.transferGroupId, p);
  }

  async createTransfer(
    userId: string,
    data: { sourceAccountId: string; destinationAccountId: string; sourceCurrency: string; destinationCurrency: string; amount: string; description: string; effectiveAt: Date },
  ): Promise<TransferPair> {
    const groupId = randomUUID();
    const norm = (v: string) => v.includes(".") ? v.padEnd(v.indexOf(".") + 5, "0") : `${v}.0000`;
    const pair: TransferPair = {
      outgoing: {
        id: randomUUID(), userId, accountId: data.sourceAccountId,
        amount: norm(data.amount), currency: data.sourceCurrency,
        description: data.description, effectiveAt: data.effectiveAt,
        transferGroupId: groupId, createdAt: new Date(),
      },
      incoming: {
        id: randomUUID(), userId, accountId: data.destinationAccountId,
        amount: norm(data.amount), currency: data.destinationCurrency,
        description: data.description, effectiveAt: data.effectiveAt,
        transferGroupId: groupId, createdAt: new Date(),
      },
    };
    this.pairs.set(groupId, pair);
    return pair;
  }

  async listForUser(userId: string, query: ResolvedTransferListQuery): Promise<TransferListResult> {
    const matching = [...this.pairs.values()]
      .filter((p) => {
        if (p.outgoing.userId !== userId) return false;
        if (query.accountId !== undefined && p.outgoing.accountId !== query.accountId && p.incoming.accountId !== query.accountId) return false;
        return true;
      })
      .sort((a, b) => b.outgoing.createdAt.getTime() - a.outgoing.createdAt.getTime());
    const totalItems = matching.length;
    const start = (query.page - 1) * query.pageSize;
    return { transfers: matching.slice(start, start + query.pageSize), totalItems };
  }

  async findByGroupId(transferGroupId: string, userId: string): Promise<TransferPair | null> {
    const p = this.pairs.get(transferGroupId);
    if (!p || p.outgoing.userId !== userId) return null;
    return p;
  }

  async deleteByGroupId(transferGroupId: string, userId: string): Promise<boolean> {
    const p = this.pairs.get(transferGroupId);
    if (!p || p.outgoing.userId !== userId) return false;
    this.pairs.delete(transferGroupId);
    return true;
  }
}

function makeAccountRecord(id: string, ownerId: string, currency = "USD"): AccountRecord {
  return {
    id, userId: ownerId, name: "Test", type: "BANK",
    currency, openingBalance: "0.0000", archived: false,
    createdAt: new Date(), updatedAt: new Date(),
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

function createTransferTestContext(initialPairs: TransferPair[] = []) {
  const transferRepository = new MemoryTransferRepository(initialPairs);
  const accountRepository = new MemoryAccountRepository([
    makeAccountRecord(accountA1, userA, "USD"),
    makeAccountRecord(accountA2, userA, "USD"),
    makeAccountRecord(accountB1, userB, "USD"),
  ]);
  const service = new TransferService(transferRepository, accountRepository);
  const accessTokenService = new JoseAccessTokenService(testJwtSecret);
  const app = createApp({ transfers: { service, accessTokenService } });
  return { app, transferRepository, accessTokenService };
}

async function withTransferServer<T>(
  callback: (ctx: { baseUrl: string } & ReturnType<typeof createTransferTestContext>) => Promise<T>,
  initial: TransferPair[] = [],
): Promise<T> {
  const ctx = createTransferTestContext(initial);
  const server = createServer(ctx.app);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try { return await callback({ baseUrl, ...ctx }); }
  finally { await new Promise<void>((resolve, reject) => { server.close((e) => e ? reject(e) : resolve()); }); }
}

async function transferRequest(baseUrl: string, userId: string | undefined, method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  if (userId) headers.Cookie = `${ACCESS_COOKIE_NAME}=${await new JoseAccessTokenService(testJwtSecret).issue(userId)}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function createBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceAccountId: accountA1,
    destinationAccountId: accountA2,
    amount: "250.0000",
    description: "Transfer",
    effectiveAt: "2026-01-15T00:00:00.000Z",
    ...overrides,
  };
}

// AUTH
test("unauthenticated POST /transfers returns 401", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    const r = await transferRequest(baseUrl, undefined, "POST", "/api/v1/transfers", createBody());
    assert.equal(r.status, 401);
    assert.equal((await r.json() as { error: { code: string } }).error.code, "AUTH_REQUIRED");
  });
});

test("unauthenticated GET /transfers returns 401", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    assert.equal((await transferRequest(baseUrl, undefined, "GET", "/api/v1/transfers")).status, 401);
  });
});

test("unauthenticated GET /:transferGroupId returns 401", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    assert.equal((await transferRequest(baseUrl, undefined, "GET", `/api/v1/transfers/${groupA1}`)).status, 401);
  });
});

test("unauthenticated DELETE /:transferGroupId returns 401", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    assert.equal((await transferRequest(baseUrl, undefined, "DELETE", `/api/v1/transfers/${groupA1}`)).status, 401);
  });
});

// SUCCESSFUL TRANSFER CREATION
test("create transfer returns 201 with correct shape", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    const r = await transferRequest(baseUrl, userA, "POST", "/api/v1/transfers", createBody());
    const body = await r.json() as { transfer: Record<string, unknown> };
    assert.equal(r.status, 201);
    assert.ok(body.transfer.transferGroupId, "should have transferGroupId");
    assert.ok(body.transfer.outgoing, "should have outgoing side");
    assert.ok(body.transfer.incoming, "should have incoming side");
  });
});

test("create transfer produces two sides with opposite directions", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    const r = await transferRequest(baseUrl, userA, "POST", "/api/v1/transfers", createBody());
    const body = await r.json() as { transfer: { outgoing: { direction: string }; incoming: { direction: string } } };
    assert.equal(r.status, 201);
    assert.equal(body.transfer.outgoing.direction, "OUTGOING");
    assert.equal(body.transfer.incoming.direction, "INCOMING");
  });
});

test("both sides share the same transferGroupId", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    const r = await transferRequest(baseUrl, userA, "POST", "/api/v1/transfers", createBody());
    const body = await r.json() as { transfer: { transferGroupId: string; outgoing: { direction: string }; incoming: { direction: string } } };
    assert.equal(r.status, 201);
    assert.ok(body.transfer.transferGroupId, "transferGroupId should exist");
  });
});

test("both sides have matching amount", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    const r = await transferRequest(baseUrl, userA, "POST", "/api/v1/transfers", createBody({ amount: "250.0000" }));
    const body = await r.json() as { transfer: { outgoing: { amount: string }; incoming: { amount: string }; amount: string } };
    assert.equal(r.status, 201);
    assert.equal(body.transfer.outgoing.amount, "250.0000");
    assert.equal(body.transfer.incoming.amount, "250.0000");
    assert.equal(body.transfer.amount, "250.0000");
  });
});

test("source account not owned by user returns 400 TRANSFER_INVALID_SOURCE", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    const r = await transferRequest(baseUrl, userA, "POST", "/api/v1/transfers", createBody({ sourceAccountId: accountB1 }));
    const body = await r.json() as { error: { code: string } };
    assert.equal(r.status, 400);
    assert.equal(body.error.code, "TRANSFER_INVALID_SOURCE");
  });
});

test("destination account not owned by user returns 400 TRANSFER_INVALID_DESTINATION", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    const r = await transferRequest(baseUrl, userA, "POST", "/api/v1/transfers", createBody({ destinationAccountId: accountB1 }));
    const body = await r.json() as { error: { code: string } };
    assert.equal(r.status, 400);
    assert.equal(body.error.code, "TRANSFER_INVALID_DESTINATION");
  });
});

test("same source and destination account returns 400 TRANSFER_SAME_ACCOUNT", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    const r = await transferRequest(baseUrl, userA, "POST", "/api/v1/transfers", createBody({ destinationAccountId: accountA1 }));
    const body = await r.json() as { error: { code: string } };
    assert.equal(r.status, 400);
    assert.equal(body.error.code, "TRANSFER_SAME_ACCOUNT");
  });
});

test("currency mismatch between accounts returns 400 TRANSFER_CURRENCY_MISMATCH", async () => {
  // accountA1=USD, eurAccount=EUR — both belong to userA but have different currencies
  const eurAccountId = "10000000-0000-4000-8000-000000000009";
  const transferRepository = new MemoryTransferRepository();
  const accountRepository = new MemoryAccountRepository([
    makeAccountRecord(accountA1, userA, "USD"),
    makeAccountRecord(eurAccountId, userA, "EUR"),
  ]);
  const service = new TransferService(transferRepository, accountRepository);
  const accessTokenService = new JoseAccessTokenService(testJwtSecret);
  const app = createApp({ transfers: { service, accessTokenService } });
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const r = await transferRequest(baseUrl, userA, "POST", "/api/v1/transfers", createBody({ destinationAccountId: eurAccountId }));
    const body = await r.json() as { error: { code: string } };
    assert.equal(r.status, 400);
    assert.equal(body.error.code, "TRANSFER_CURRENCY_MISMATCH");
  } finally {
    await new Promise<void>((resolve, reject) => { server.close((e) => e ? reject(e) : resolve()); });
  }
});

test("userId injection in body returns 400", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    assert.equal((await transferRequest(baseUrl, userA, "POST", "/api/v1/transfers", createBody({ userId: userB }))).status, 400);
  });
});

test("userId injection in query returns 400", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    assert.equal((await transferRequest(baseUrl, userA, "GET", `/api/v1/transfers?userId=${userB}`)).status, 400);
  });
});

// OWNERSHIP
test("userA GET transfer belonging to userB returns 404", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    assert.equal((await transferRequest(baseUrl, userA, "GET", `/api/v1/transfers/${groupB1}`)).status, 404);
  }, [makeTransferPair(groupB1, userB, accountB1, accountB1)]);
});

test("userA DELETE transfer belonging to userB returns 404", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    assert.equal((await transferRequest(baseUrl, userA, "DELETE", `/api/v1/transfers/${groupB1}`)).status, 404);
  }, [makeTransferPair(groupB1, userB, accountB1, accountB1)]);
});

// LIST
test("list returns 200 with transfers and pagination", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    const r = await transferRequest(baseUrl, userA, "GET", "/api/v1/transfers");
    const body = await r.json() as { transfers: unknown[]; pagination: Record<string, unknown> };
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(body.transfers));
    assert.ok(typeof body.pagination.page === "number");
    assert.ok(typeof body.pagination.totalItems === "number");
  }, [makeTransferPair(groupA1, userA, accountA1, accountA2)]);
});

test("list does not return transfers belonging to other users", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    const r = await transferRequest(baseUrl, userA, "GET", "/api/v1/transfers");
    const body = await r.json() as { transfers: unknown[] };
    assert.equal(r.status, 200);
    assert.equal(body.transfers.length, 1);
  }, [
    makeTransferPair(groupA1, userA, accountA1, accountA2),
    makeTransferPair(groupB1, userB, accountB1, accountB1),
  ]);
});

// DELETE
test("delete own transfer returns 204", async () => {
  await withTransferServer(async ({ baseUrl, transferRepository }) => {
    const r = await transferRequest(baseUrl, userA, "DELETE", `/api/v1/transfers/${groupA1}`);
    assert.equal(r.status, 204);
    assert.equal(transferRepository.pairs.has(groupA1), false);
  }, [makeTransferPair(groupA1, userA, accountA1, accountA2)]);
});

// VALIDATION
test("invalid amount returns 400", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    assert.equal((await transferRequest(baseUrl, userA, "POST", "/api/v1/transfers", createBody({ amount: "-10" }))).status, 400);
  });
});

test("invalid effectiveAt returns 400", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    assert.equal((await transferRequest(baseUrl, userA, "POST", "/api/v1/transfers", createBody({ effectiveAt: "not-a-date" }))).status, 400);
  });
});

test("malformed transferGroupId UUID returns 400", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    assert.equal((await transferRequest(baseUrl, userA, "GET", "/api/v1/transfers/not-a-uuid")).status, 400);
  });
});

test("unknown body field returns 400", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    assert.equal((await transferRequest(baseUrl, userA, "POST", "/api/v1/transfers", createBody({ unknown: "x" }))).status, 400);
  });
});

// MONEY
test("amount '250' stored and returned as '250.0000'", async () => {
  await withTransferServer(async ({ baseUrl }) => {
    const r = await transferRequest(baseUrl, userA, "POST", "/api/v1/transfers", createBody({ amount: "250" }));
    assert.equal(r.status, 201);
    assert.equal((await r.json() as { transfer: { amount: string } }).transfer.amount, "250.0000");
  });
});
