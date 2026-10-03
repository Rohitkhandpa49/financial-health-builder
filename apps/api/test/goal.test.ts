import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { ACCESS_COOKIE_NAME } from "../src/auth/auth.middleware.js";
import { JoseAccessTokenService } from "../src/auth/access-token.js";
import type {
  GoalListQuery,
  CreateGoalRequest,
  GoalResponse,
} from "../../../packages/contracts/src/goals/goals.js";
import type {
  GoalListResult,
  GoalRecord,
  GoalRepository,
  ResolvedGoalListQuery,
  GoalUpdatePatch,
} from "../src/goals/goal.repository.js";
import { GoalService } from "../src/goals/goal.service.js";

const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const goalA1 = "50000000-0000-4000-8000-000000000001"; // owned by userA
const goalB1 = "50000000-0000-4000-8000-000000000003"; // owned by userB
const testJwtSecret = "goal-test-secret-with-at-least-32-characters";

function makeGoalRecord(id: string, ownerId: string, overrides: Partial<GoalRecord> = {}): GoalRecord {
  return {
    id,
    userId: ownerId,
    name: "Emergency fund",
    targetAmount: "1000.0000",
    currentAmount: "0.0000",
    currency: "USD",
    targetDate: new Date("2026-12-31"),
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

class MemoryGoalRepository implements GoalRepository {
  readonly records = new Map<string, GoalRecord>();

  constructor(initial: GoalRecord[] = []) {
    for (const goal of initial) {
      this.records.set(goal.id, goal);
    }
  }

  async createForUser(userId: string, input: CreateGoalRequest): Promise<GoalRecord> {
    const normalize = (v: string) =>
      v.includes(".")
        ? v.padEnd(v.indexOf(".") + 5, "0")
        : `${v}.0000`;

    const record: GoalRecord = {
      id: randomUUID(),
      userId,
      name: input.name,
      targetAmount: normalize(input.targetAmount),
      currentAmount: normalize(input.currentAmount ?? "0"),
      currency: input.currency,
      targetDate: new Date(input.targetDate),
      status: input.status ?? "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.records.set(record.id, record);
    return record;
  }

  async listForUser(userId: string, query: ResolvedGoalListQuery): Promise<GoalListResult> {
    const matching = [...this.records.values()]
      .filter((goal) => {
        if (goal.userId !== userId) return false;
        if (query.status !== undefined && goal.status !== query.status) return false;
        return true;
      })
      .sort((a, b) => {
        const byTargetDate = a.targetDate.getTime() - b.targetDate.getTime();
        if (byTargetDate !== 0) return byTargetDate;
        const byCreatedAt = b.createdAt.getTime() - a.createdAt.getTime();
        if (byCreatedAt !== 0) return byCreatedAt;
        return b.id.localeCompare(a.id);
      });
    const start = (query.page - 1) * query.pageSize;
    return {
      goals: matching.slice(start, start + query.pageSize),
      totalItems: matching.length,
    };
  }

  async findByIdForUser(goalId: string, userId: string): Promise<GoalRecord | null> {
    const goal = this.records.get(goalId);
    if (!goal) return null;
    if (goal.userId !== userId) return null;
    return goal;
  }

  async updateForUser(goalId: string, userId: string, patch: GoalUpdatePatch): Promise<GoalRecord | null> {
    const goal = this.records.get(goalId);
    if (!goal) return null;
    if (goal.userId !== userId) return null;
    const updated: GoalRecord = {
      ...goal,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.targetAmount !== undefined ? { targetAmount: patch.targetAmount } : {}),
      ...(patch.currentAmount !== undefined ? { currentAmount: patch.currentAmount } : {}),
      ...(patch.targetDate !== undefined ? { targetDate: patch.targetDate } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      updatedAt: new Date(),
    };
    this.records.set(goalId, updated);
    return updated;
  }

  async deleteForUser(goalId: string, userId: string): Promise<boolean> {
    const goal = this.records.get(goalId);
    if (!goal) return false;
    if (goal.userId !== userId) return false;
    this.records.delete(goalId);
    return true;
  }
}

function createGoalTestContext(initialGoals: GoalRecord[] = []) {
  const goalRepo = new MemoryGoalRepository(initialGoals);
  const goalService = new GoalService(goalRepo);
  const accessTokenService = new JoseAccessTokenService(testJwtSecret);
  const app = createApp({ goals: { service: goalService, accessTokenService } });
  return { app, goalService, goalRepo, accessTokenService };
}

async function withGoalServer<T>(
  callback: (context: { baseUrl: string } & ReturnType<typeof createGoalTestContext>) => Promise<T>,
  initialGoals: GoalRecord[] = [],
): Promise<T> {
  const context = createGoalTestContext(initialGoals);
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

async function goalRequest(
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

function createBody(overrides: Partial<CreateGoalRequest> = {}): Record<string, unknown> {
  return {
    name: "Emergency fund",
    targetAmount: "1000.0000",
    currency: "USD",
    targetDate: "2026-12-31",
    ...overrides,
  };
}

// AUTH
test("unauthenticated POST /goals returns 401 AUTH_REQUIRED", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, undefined, "POST", "/api/v1/goals", createBody());
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTH_REQUIRED");
  });
});

test("unauthenticated GET /goals returns 401 AUTH_REQUIRED", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, undefined, "GET", "/api/v1/goals");
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTH_REQUIRED");
  });
});

test("unauthenticated GET /goals/:goalId returns 401 AUTH_REQUIRED", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, undefined, "GET", `/api/v1/goals/${goalA1}`);
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTH_REQUIRED");
  });
});

test("unauthenticated PATCH /goals/:goalId returns 401 AUTH_REQUIRED", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, undefined, "PATCH", `/api/v1/goals/${goalA1}`, { name: "Changed" });
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTH_REQUIRED");
  });
});

test("unauthenticated DELETE /goals/:goalId returns 401 AUTH_REQUIRED", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, undefined, "DELETE", `/api/v1/goals/${goalA1}`);
    const body = await response.json() as { error: { code: string } };
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTH_REQUIRED");
  });
});

// OWNERSHIP
test("userA can create own goal returns 201", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "POST", "/api/v1/goals", createBody());
    assert.equal(response.status, 201);
  });
});

test("userA GET goalB1 (owned by userB) returns 404", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "GET", `/api/v1/goals/${goalB1}`);
    assert.equal(response.status, 404);
  }, [makeGoalRecord(goalB1, userB)]);
});

test("userA PATCH goalB1 (owned by userB) returns 404", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "PATCH", `/api/v1/goals/${goalB1}`, { name: "Hijacked" });
    assert.equal(response.status, 404);
  }, [makeGoalRecord(goalB1, userB)]);
});

test("userA DELETE goalB1 (owned by userB) returns 404", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "DELETE", `/api/v1/goals/${goalB1}`);
    assert.equal(response.status, 404);
  }, [makeGoalRecord(goalB1, userB)]);
});

test("userB list returns no userA goals", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userB, "GET", "/api/v1/goals");
    const body = await response.json() as { goals: GoalResponse[] };
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.goals));
    assert.equal(body.goals.length, 0);
  }, [makeGoalRecord(goalA1, userA)]);
});

// INJECTION
test("POST body with userId field returns 400 (unknown field — strictObject)", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "POST", "/api/v1/goals", createBody({ userId: userB } as unknown as Partial<CreateGoalRequest>));
    assert.equal(response.status, 400);
  });
});

test("GET /api/v1/goals?userId=... returns 400 (unknown query field)", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "GET", `/api/v1/goals?userId=${userB}`);
    assert.equal(response.status, 400);
  });
});

// VALIDATION
test("targetAmount '-100' returns 400", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "POST", "/api/v1/goals", createBody({ targetAmount: "-100" }));
    assert.equal(response.status, 400);
  });
});

test("targetAmount '1.00001' (5 decimal places) returns 400", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "POST", "/api/v1/goals", createBody({ targetAmount: "1.00001" }));
    assert.equal(response.status, 400);
  });
});

test("currency 'usd' (lowercase) returns 400", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "POST", "/api/v1/goals", createBody({ currency: "usd" }));
    assert.equal(response.status, 400);
  });
});

test("currency 'ZZZ' (unsupported code) returns 400", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "POST", "/api/v1/goals", createBody({ currency: "ZZZ" }));
    assert.equal(response.status, 400);
  });
});

test("status 'PENDING' (invalid enum value) returns 400", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "POST", "/api/v1/goals", createBody({ status: "PENDING" as unknown as CreateGoalRequest["status"] }));
    assert.equal(response.status, 400);
  });
});

test("invalid date format '01/31/2026' returns 400", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "POST", "/api/v1/goals", createBody({ targetDate: "01/31/2026" }));
    assert.equal(response.status, 400);
  });
});

test("name 121 chars returns 400", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "POST", "/api/v1/goals", createBody({ name: "x".repeat(121) }));
    assert.equal(response.status, 400);
  });
});

test("unknown body field returns 400", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "POST", "/api/v1/goals", createBody({ unknownField: "value" } as unknown as Partial<CreateGoalRequest>));
    assert.equal(response.status, 400);
  });
});

test("malformed goalId UUID in route returns 400", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "GET", "/api/v1/goals/not-a-uuid");
    assert.equal(response.status, 400);
  });
});

test("unknown query param returns 400", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "GET", "/api/v1/goals?unknownField=value");
    assert.equal(response.status, 400);
  });
});

// CRUD
test("create returns 201 with goal body; no userId, correct fields, targetAmount '1000.0000', currentAmount '0.0000'", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "POST", "/api/v1/goals", createBody());
    const body = await response.json() as { goal: Record<string, unknown> };
    assert.equal(response.status, 201);
    assert.ok(body.goal, "response should have goal");
    assert.equal(body.goal.userId, undefined, "userId should not be in response");
    assert.equal(body.goal.targetAmount, "1000.0000");
    assert.equal(body.goal.currentAmount, "0.0000");
    assert.equal(typeof body.goal.id, "string");
    assert.equal(body.goal.name, "Emergency fund");
    assert.equal(body.goal.currency, "USD");
    assert.equal(body.goal.targetDate, "2026-12-31");
    assert.equal(body.goal.status, "ACTIVE");
  });
});

test("GET own goal returns 200 with correct goal", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "GET", `/api/v1/goals/${goalA1}`);
    const body = await response.json() as { goal: Record<string, unknown> };
    assert.equal(response.status, 200);
    assert.equal(body.goal.id, goalA1);
  }, [makeGoalRecord(goalA1, userA)]);
});

test("list returns 200 with goals and pagination shape { page, pageSize, totalItems, totalPages }", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "GET", "/api/v1/goals");
    const body = await response.json() as { goals: unknown[]; pagination: Record<string, unknown> };
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.goals));
    assert.ok(body.pagination, "response should have pagination");
    assert.ok(typeof body.pagination.page === "number");
    assert.ok(typeof body.pagination.pageSize === "number");
    assert.ok(typeof body.pagination.totalItems === "number");
    assert.ok(typeof body.pagination.totalPages === "number");
  }, [makeGoalRecord(goalA1, userA)]);
});

test("update name returns 200 with updated name", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "PATCH", `/api/v1/goals/${goalA1}`, { name: "Vacation fund" });
    const body = await response.json() as { goal: Record<string, unknown> };
    assert.equal(response.status, 200);
    assert.equal(body.goal.name, "Vacation fund");
  }, [makeGoalRecord(goalA1, userA)]);
});

test("update status to COMPLETED returns 200 with updated status", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "PATCH", `/api/v1/goals/${goalA1}`, { status: "COMPLETED" });
    const body = await response.json() as { goal: Record<string, unknown> };
    assert.equal(response.status, 200);
    assert.equal(body.goal.status, "COMPLETED");
  }, [makeGoalRecord(goalA1, userA)]);
});

test("update currentAmount returns 200 with updated currentAmount", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "PATCH", `/api/v1/goals/${goalA1}`, { currentAmount: "500.0000" });
    const body = await response.json() as { goal: Record<string, unknown> };
    assert.equal(response.status, 200);
    assert.equal(body.goal.currentAmount, "500.0000");
  }, [makeGoalRecord(goalA1, userA)]);
});

test("delete returns 204 with empty body", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "DELETE", `/api/v1/goals/${goalA1}`);
    assert.equal(response.status, 204);
  }, [makeGoalRecord(goalA1, userA)]);
});

test("after delete, GET returns 404", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    await goalRequest(baseUrl, userA, "DELETE", `/api/v1/goals/${goalA1}`);
    const response = await goalRequest(baseUrl, userA, "GET", `/api/v1/goals/${goalA1}`);
    assert.equal(response.status, 404);
  }, [makeGoalRecord(goalA1, userA)]);
});

// FILTERING
test("filter by status=ACTIVE returns only ACTIVE goals", async () => {
  const completedGoalId = "50000000-0000-4000-8000-000000000002";
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "GET", "/api/v1/goals?status=ACTIVE");
    const body = await response.json() as { goals: Array<{ status: string }> };
    assert.equal(response.status, 200);
    assert.ok(body.goals.every((g) => g.status === "ACTIVE"));
  }, [
    makeGoalRecord(goalA1, userA, { status: "ACTIVE" }),
    makeGoalRecord(completedGoalId, userA, { status: "COMPLETED" }),
  ]);
});

test("pagination: page=1 pageSize=1 returns 1 item; page=2 returns next item", async () => {
  const goal2Id = "50000000-0000-4000-8000-000000000002";
  await withGoalServer(async ({ baseUrl }) => {
    const response1 = await goalRequest(baseUrl, userA, "GET", "/api/v1/goals?page=1&pageSize=1");
    const body1 = await response1.json() as { goals: unknown[]; pagination: { page: number; pageSize: number; totalItems: number; totalPages: number } };
    assert.equal(response1.status, 200);
    assert.equal(body1.goals.length, 1);
    assert.equal(body1.pagination.page, 1);
    assert.equal(body1.pagination.pageSize, 1);
    assert.equal(body1.pagination.totalItems, 2);
    assert.equal(body1.pagination.totalPages, 2);

    const response2 = await goalRequest(baseUrl, userA, "GET", "/api/v1/goals?page=2&pageSize=1");
    const body2 = await response2.json() as { goals: unknown[] };
    assert.equal(response2.status, 200);
    assert.equal(body2.goals.length, 1);
  }, [
    makeGoalRecord(goalA1, userA, { targetDate: new Date("2026-06-30") }),
    makeGoalRecord(goal2Id, userA, { targetDate: new Date("2026-12-31") }),
  ]);
});

// MONEY PRECISION
test("targetAmount '1000' (no decimal) stored and returned as '1000.0000'", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "POST", "/api/v1/goals", createBody({ targetAmount: "1000" }));
    const body = await response.json() as { goal: { targetAmount: string } };
    assert.equal(response.status, 201);
    assert.equal(body.goal.targetAmount, "1000.0000");
  });
});

test("targetAmount '0' (zero) stored and returned as '0.0000'", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "POST", "/api/v1/goals", createBody({ targetAmount: "0" }));
    const body = await response.json() as { goal: { targetAmount: string } };
    assert.equal(response.status, 201);
    assert.equal(body.goal.targetAmount, "0.0000");
  });
});

test("currentAmount defaults to '0.0000' when not provided in create", async () => {
  await withGoalServer(async ({ baseUrl }) => {
    const response = await goalRequest(baseUrl, userA, "POST", "/api/v1/goals", createBody());
    const body = await response.json() as { goal: { currentAmount: string } };
    assert.equal(response.status, 201);
    assert.equal(body.goal.currentAmount, "0.0000");
  });
});
