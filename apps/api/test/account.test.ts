import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { ACCESS_COOKIE_NAME } from "../src/auth/auth.middleware.js";
import { JoseAccessTokenService } from "../src/auth/access-token.js";
import type {
  AccountListQuery,
  AccountType,
  CreateAccountRequest,
} from "../../../packages/contracts/src/accounts/accounts.js";
import type {
  AccountListResult,
  AccountRecord,
  AccountRepository,
} from "../src/accounts/account.repository.js";
import { AccountService } from "../src/accounts/account.service.js";

const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const accountA1 = "10000000-0000-4000-8000-000000000001";
const accountA2 = "10000000-0000-4000-8000-000000000002";
const accountB1 = "10000000-0000-4000-8000-000000000003";
const testJwtSecret = "account-test-secret-with-at-least-32-characters";

function makeAccount(
  id: string,
  ownerId: string,
  overrides: Partial<AccountRecord> = {},
): AccountRecord {
  return {
    id,
    userId: ownerId,
    name: "Test account",
    type: "BANK",
    currency: "USD",
    openingBalance: "123.4500",
    archived: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

class MemoryAccountRepository implements AccountRepository {
  readonly records = new Map<string, AccountRecord>();

  constructor(initial: AccountRecord[] = []) {
    for (const account of initial) {
      this.records.set(account.id, account);
    }
  }

  async createForUser(userId: string, input: CreateAccountRequest): Promise<AccountRecord> {
    const account = makeAccount(randomUUID(), userId, {
      ...input,
      openingBalance: formatAmount(input.openingBalance),
    });
    this.records.set(account.id, account);
    return account;
  }

  async listForUser(userId: string, query: Required<AccountListQuery>): Promise<AccountListResult> {
    const matching = [...this.records.values()]
      .filter((account) => account.userId === userId && account.archived === query.archived)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id));
    const start = (query.page - 1) * query.pageSize;

    return {
      accounts: matching.slice(start, start + query.pageSize),
      totalItems: matching.length,
    };
  }

  async findByIdForUser(accountId: string, userId: string): Promise<AccountRecord | null> {
    const account = this.records.get(accountId);
    return account?.userId === userId ? account : null;
  }

  async updateNameForUser(accountId: string, userId: string, name: string): Promise<AccountRecord | null> {
    const account = await this.findByIdForUser(accountId, userId);
    if (!account || account.archived) {
      return null;
    }

    const updated = { ...account, name, updatedAt: new Date() };
    this.records.set(accountId, updated);
    return updated;
  }

  async archiveForUser(accountId: string, userId: string): Promise<AccountRecord | null> {
    const account = await this.findByIdForUser(accountId, userId);
    if (!account) {
      return null;
    }

    const archived = { ...account, archived: true, updatedAt: new Date() };
    this.records.set(accountId, archived);
    return archived;
  }
}

function formatAmount(amount: string): string {
  const [whole, fraction = ""] = amount.split(".");
  return `${whole}.${fraction.padEnd(4, "0")}`;
}

function createAccountTestContext(initial: AccountRecord[] = []) {
  const repository = new MemoryAccountRepository(initial);
  const service = new AccountService(repository);
  const accessTokenService = new JoseAccessTokenService(testJwtSecret);
  const app = createApp({
    accounts: { service, accessTokenService },
  });

  return { app, repository, accessTokenService };
}

async function withAccountServer<T>(
  callback: (baseUrl: string, context: ReturnType<typeof createAccountTestContext>) => Promise<T>,
  initial: AccountRecord[] = [],
): Promise<T> {
  const context = createAccountTestContext(initial);
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

async function accountRequest(
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
    name: "Everyday account",
    type: "BANK",
    currency: "USD",
    openingBalance: "123.4500",
    ...overrides,
  };
}

test("all account routes require a verified authentication cookie", async () => {
  await withAccountServer(async (baseUrl) => {
    const responses = await Promise.all([
      accountRequest(baseUrl, undefined, "POST", "/api/v1/accounts", createBody()),
      accountRequest(baseUrl, undefined, "GET", "/api/v1/accounts"),
      accountRequest(baseUrl, undefined, "GET", `/api/v1/accounts/${accountA1}`),
      accountRequest(baseUrl, undefined, "PATCH", `/api/v1/accounts/${accountA1}`, { name: "Changed" }),
      accountRequest(baseUrl, undefined, "PATCH", `/api/v1/accounts/${accountA1}/archive`),
    ]);
    const errorBodies = await Promise.all(responses.map(async (response) =>
      response.json() as Promise<{ error: { code: string } }>,
    ));

    assert.deepEqual(responses.map((response) => response.status), [401, 401, 401, 401, 401]);
    assert.deepEqual(errorBodies.map((body) => body.error.code), Array(5).fill("AUTH_REQUIRED"));
  });
});

test("create derives owner from authentication and returns exact safe DTO fields", async () => {
  await withAccountServer(async (baseUrl, context) => {
    const response = await accountRequest(baseUrl, userA, "POST", "/api/v1/accounts", createBody({ openingBalance: "0.1" }));
    const body = await response.json() as { account: Record<string, unknown> };

    assert.equal(response.status, 201);
    assert.equal(body.account.name, "Everyday account");
    assert.equal(body.account.currency, "USD");
    assert.equal(body.account.openingBalance, "0.1000");
    assert.equal(body.account.userId, undefined);
    assert.equal(context.repository.records.get(body.account.id as string)?.userId, userA);
  });
});

test("negative opening balances are accepted as exact decimal strings", async () => {
  await withAccountServer(async (baseUrl, context) => {
    const response = await accountRequest(baseUrl, userA, "POST", "/api/v1/accounts", createBody({ openingBalance: "-250.5" }));
    const body = await response.json() as { account: { openingBalance: string } };

    assert.equal(response.status, 201);
    assert.equal(body.account.openingBalance, "-250.5000");
    assert.equal([...context.repository.records.values()][0].openingBalance, "-250.5000");
  });
});

test("create rejects client-supplied ownership and protected fields", async () => {
  await withAccountServer(async (baseUrl, context) => {
    const response = await accountRequest(baseUrl, userA, "POST", "/api/v1/accounts", createBody({
      userId: userB,
      archived: true,
      id: accountB1,
    }));

    assert.equal(response.status, 400);
    assert.equal(context.repository.records.size, 0);
  });
});

test("create validates names, account type, supported currency, and exact decimal bounds", async () => {
  await withAccountServer(async (baseUrl, context) => {
    const requests = [
      createBody({ name: "   " }),
      createBody({ name: "n".repeat(121) }),
      createBody({ type: "CRYPTO" }),
      createBody({ currency: "usd" }),
      createBody({ currency: "ZZZ" }),
      createBody({ openingBalance: 12.34 }),
      createBody({ openingBalance: "1.00001" }),
      createBody({ openingBalance: "1e3" }),
      createBody({ openingBalance: "1000000000000000" }),
    ];
    const responses = await Promise.all(requests.map((body) =>
      accountRequest(baseUrl, userA, "POST", "/api/v1/accounts", body),
    ));

    assert.deepEqual(responses.map((response) => response.status), Array(requests.length).fill(400));
    assert.equal(context.repository.records.size, 0);
  });
});

test("lists only the authenticated user's accounts with bounded deterministic pagination", async () => {
  await withAccountServer(async (baseUrl, context) => {
    const response = await accountRequest(baseUrl, userA, "GET", "/api/v1/accounts?page=1&pageSize=1");
    const body = await response.json() as { accounts: Array<Record<string, unknown>>; pagination: { page: number; pageSize: number; totalItems: number; totalPages: number } };
    const userBResponse = await accountRequest(baseUrl, userB, "GET", "/api/v1/accounts");
    const userBBody = await userBResponse.json() as { accounts: Array<{ id: string }> };

    assert.equal(response.status, 200);
    assert.deepEqual(body.accounts.map((account) => account.id), [accountA2]);
    assert.deepEqual(body.pagination, { page: 1, pageSize: 1, totalItems: 2, totalPages: 2 });
    assert.equal(body.accounts.some((account) => account.id === accountB1), false);
    assert.deepEqual(userBBody.accounts.map((account) => account.id), [accountB1]);
    assert.equal(context.repository.records.size, 3);
  }, [
    makeAccount(accountA1, userA, { createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    makeAccount(accountA2, userA, { createdAt: new Date("2026-01-02T00:00:00.000Z") }),
    makeAccount(accountB1, userB, { createdAt: new Date("2026-01-03T00:00:00.000Z") }),
  ]);
});

test("list rejects oversized pagination and client-supplied owner filters", async () => {
  await withAccountServer(async (baseUrl) => {
    const oversized = await accountRequest(baseUrl, userA, "GET", "/api/v1/accounts?pageSize=101");
    const injectedOwner = await accountRequest(baseUrl, userA, "GET", `/api/v1/accounts?userId=${userB}`);
    const invalidArchiveFilter = await accountRequest(baseUrl, userA, "GET", "/api/v1/accounts?archived=maybe");

    assert.equal(oversized.status, 400);
    assert.equal(injectedOwner.status, 400);
    assert.equal(invalidArchiveFilter.status, 400);
  });
});

test("get, update, and archive conceal another user's account", async () => {
  await withAccountServer(async (baseUrl) => {
    const getResponse = await accountRequest(baseUrl, userA, "GET", `/api/v1/accounts/${accountB1}`);
    const updateResponse = await accountRequest(baseUrl, userA, "PATCH", `/api/v1/accounts/${accountB1}`, { name: "Hijacked" });
    const archiveResponse = await accountRequest(baseUrl, userA, "PATCH", `/api/v1/accounts/${accountB1}/archive`);
    const getBody = await getResponse.json() as { error: { code: string; message: string } };

    assert.equal(getResponse.status, 404);
    assert.equal(updateResponse.status, 404);
    assert.equal(archiveResponse.status, 404);
    assert.equal(getBody.error.code, "NOT_FOUND");
    assert.equal(JSON.stringify(getBody).includes(userB), false);
  }, [makeAccount(accountB1, userB)]);
});

test("owner can retrieve and update account name, but not currency or archived accounts", async () => {
  await withAccountServer(async (baseUrl) => {
    const getResponse = await accountRequest(baseUrl, userA, "GET", `/api/v1/accounts/${accountA1}`);
    const updateResponse = await accountRequest(baseUrl, userA, "PATCH", `/api/v1/accounts/${accountA1}`, { name: "Renamed" });
    const injectedOwner = await accountRequest(baseUrl, userA, "PATCH", `/api/v1/accounts/${accountA1}`, { name: "Hijacked", userId: userB });
    const currencyUpdate = await accountRequest(baseUrl, userA, "PATCH", `/api/v1/accounts/${accountA1}`, { currency: "EUR" });
    const updateArchived = await accountRequest(baseUrl, userA, "PATCH", `/api/v1/accounts/${accountA2}`, { name: "Archived edit" });

    assert.equal(getResponse.status, 200);
    assert.equal((await getResponse.json() as { account: { openingBalance: string } }).account.openingBalance, "123.4500");
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json() as { account: { name: string } }).account.name, "Renamed");
    assert.equal(injectedOwner.status, 400);
    assert.equal(currencyUpdate.status, 400);
    assert.equal(updateArchived.status, 404);
  }, [
    makeAccount(accountA1, userA),
    makeAccount(accountA2, userA, { archived: true }),
  ]);
});

test("archive is idempotent, remains retrievable, and is hidden from the default list", async () => {
  await withAccountServer(async (baseUrl) => {
    const archive = await accountRequest(baseUrl, userA, "PATCH", `/api/v1/accounts/${accountA1}/archive`);
    const archiveAgain = await accountRequest(baseUrl, userA, "PATCH", `/api/v1/accounts/${accountA1}/archive`);
    const getArchived = await accountRequest(baseUrl, userA, "GET", `/api/v1/accounts/${accountA1}`);
    const activeList = await accountRequest(baseUrl, userA, "GET", "/api/v1/accounts");
    const archivedList = await accountRequest(baseUrl, userA, "GET", "/api/v1/accounts?archived=true");

    assert.equal(archive.status, 200);
    assert.equal((await archive.json() as { account: { archived: boolean } }).account.archived, true);
    assert.equal(archiveAgain.status, 200);
    assert.equal(getArchived.status, 200);
    assert.deepEqual((await activeList.json() as { accounts: unknown[] }).accounts, []);
    assert.equal((await archivedList.json() as { accounts: Array<{ id: string }> }).accounts[0].id, accountA1);
  }, [makeAccount(accountA1, userA)]);
});

test("malformed account IDs are rejected before persistence access", async () => {
  await withAccountServer(async (baseUrl) => {
    const response = await accountRequest(baseUrl, userA, "GET", "/api/v1/accounts/not-a-uuid");

    assert.equal(response.status, 400);
  });
});