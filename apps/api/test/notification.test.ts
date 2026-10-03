import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { ACCESS_COOKIE_NAME } from "../src/auth/auth.middleware.js";
import { JoseAccessTokenService } from "../src/auth/access-token.js";
import { MemoryNotificationRepository } from "../src/notifications/notification.repository.js";
import { NotificationService } from "../src/notifications/notification.service.js";

const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const validUuid = "00000000-0000-4000-8000-000000000099";
const testJwtSecret = "notification-test-secret-at-least-32-chars-x";

function createTestApp(repo?: MemoryNotificationRepository) {
  const notificationRepo = repo ?? new MemoryNotificationRepository();
  const notificationService = new NotificationService(notificationRepo);
  const accessTokenService = new JoseAccessTokenService(testJwtSecret);
  const app = createApp({ notifications: { service: notificationService, accessTokenService } });
  return { app, notificationRepo, accessTokenService };
}

async function withServer<T>(
  callback: (ctx: { baseUrl: string; repo: MemoryNotificationRepository; accessTokenService: JoseAccessTokenService }) => Promise<T>,
  repo?: MemoryNotificationRepository,
): Promise<T> {
  const { app, notificationRepo, accessTokenService } = createTestApp(repo);
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await callback({ baseUrl, repo: notificationRepo, accessTokenService });
  } finally {
    await new Promise<void>((r, j) => { server.close((e) => e ? j(e) : r()); });
  }
}

async function req(
  baseUrl: string,
  userId: string | undefined,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId) {
    headers.Cookie = `${ACCESS_COOKIE_NAME}=${await new JoseAccessTokenService(testJwtSecret).issue(userId)}`;
  }
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── AUTH ────────────────────────────────────────────────────────────────────

test("GET /notifications without auth returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await req(baseUrl, undefined, "GET", "/api/v1/notifications")).status, 401);
  });
});

test("GET /notifications/preferences without auth returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await req(baseUrl, undefined, "GET", "/api/v1/notifications/preferences")).status, 401);
  });
});

test("GET /notifications/:id without auth returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await req(baseUrl, undefined, "GET", `/api/v1/notifications/${validUuid}`)).status, 401);
  });
});

test("PATCH /notifications/read-all without auth returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await req(baseUrl, undefined, "PATCH", "/api/v1/notifications/read-all")).status, 401);
  });
});

test("PATCH /notifications/:id/read without auth returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await req(baseUrl, undefined, "PATCH", `/api/v1/notifications/${validUuid}/read`)).status, 401);
  });
});

test("DELETE /notifications/:id without auth returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await req(baseUrl, undefined, "DELETE", `/api/v1/notifications/${validUuid}`)).status, 401);
  });
});

test("POST /notifications/generate without auth returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await req(baseUrl, undefined, "POST", "/api/v1/notifications/generate")).status, 401);
  });
});

test("PATCH /notifications/preferences without auth returns 401", async () => {
  await withServer(async ({ baseUrl }) => {
    assert.equal((await req(baseUrl, undefined, "PATCH", "/api/v1/notifications/preferences")).status, 401);
  });
});

// ── CRUD ────────────────────────────────────────────────────────────────────

test("GET /notifications returns empty list initially", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await req(baseUrl, userA, "GET", "/api/v1/notifications");
    const body = await r.json() as { data: unknown[]; total: number };
    assert.equal(r.status, 200);
    assert.deepEqual(body.data, []);
    assert.equal(body.total, 0);
  });
});

test("GET /notifications returns notifications after creation", async () => {
  const repo = new MemoryNotificationRepository();
  await repo.create({ userId: userA, type: "GENERAL", title: "Hello", message: "World" });
  await withServer(async ({ baseUrl }) => {
    const r = await req(baseUrl, userA, "GET", "/api/v1/notifications");
    const body = await r.json() as { data: unknown[]; total: number };
    assert.equal(r.status, 200);
    assert.equal(body.total, 1);
    assert.equal(body.data.length, 1);
  }, repo);
});

test("GET /notifications with read=false filter returns only unread", async () => {
  const repo = new MemoryNotificationRepository();
  const n1 = await repo.create({ userId: userA, type: "GENERAL", title: "Unread", message: "msg" });
  const n2 = await repo.create({ userId: userA, type: "GENERAL", title: "To read", message: "msg" });
  await repo.markReadForUser(n2.id, userA);
  await withServer(async ({ baseUrl }) => {
    const r = await req(baseUrl, userA, "GET", "/api/v1/notifications?read=false");
    const body = await r.json() as { data: Array<{ id: string }>; total: number };
    assert.equal(r.status, 200);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, n1.id);
  }, repo);
});

test("GET /notifications/:id returns the notification", async () => {
  const repo = new MemoryNotificationRepository();
  const n = await repo.create({ userId: userA, type: "GENERAL", title: "T", message: "M" });
  await withServer(async ({ baseUrl }) => {
    const r = await req(baseUrl, userA, "GET", `/api/v1/notifications/${n.id}`);
    const body = await r.json() as { notification: { id: string; title: string } };
    assert.equal(r.status, 200);
    assert.equal(body.notification.id, n.id);
    assert.equal(body.notification.title, "T");
  }, repo);
});

test("GET /notifications/:id with non-existent ID returns 404", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await req(baseUrl, userA, "GET", `/api/v1/notifications/${validUuid}`);
    assert.equal(r.status, 404);
  });
});

test("PATCH /notifications/:id/read marks notification as read", async () => {
  const repo = new MemoryNotificationRepository();
  const n = await repo.create({ userId: userA, type: "GENERAL", title: "T", message: "M" });
  await withServer(async ({ baseUrl }) => {
    const r = await req(baseUrl, userA, "PATCH", `/api/v1/notifications/${n.id}/read`);
    const body = await r.json() as { notification: { read: boolean } };
    assert.equal(r.status, 200);
    assert.equal(body.notification.read, true);
  }, repo);
});

test("PATCH /notifications/read-all returns count", async () => {
  const repo = new MemoryNotificationRepository();
  await repo.create({ userId: userA, type: "GENERAL", title: "T1", message: "M" });
  await repo.create({ userId: userA, type: "GENERAL", title: "T2", message: "M" });
  await withServer(async ({ baseUrl }) => {
    const r = await req(baseUrl, userA, "PATCH", "/api/v1/notifications/read-all");
    const body = await r.json() as { count: number };
    assert.equal(r.status, 200);
    assert.equal(body.count, 2);
  }, repo);
});

test("DELETE /notifications/:id returns 204", async () => {
  const repo = new MemoryNotificationRepository();
  const n = await repo.create({ userId: userA, type: "GENERAL", title: "T", message: "M" });
  await withServer(async ({ baseUrl }) => {
    const r = await req(baseUrl, userA, "DELETE", `/api/v1/notifications/${n.id}`);
    assert.equal(r.status, 204);
  }, repo);
});

test("DELETE /notifications/:id with non-existent ID returns 404", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await req(baseUrl, userA, "DELETE", `/api/v1/notifications/${validUuid}`);
    assert.equal(r.status, 404);
  });
});

// ── PREFERENCES ─────────────────────────────────────────────────────────────

test("GET /notifications/preferences returns default preferences (all true)", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await req(baseUrl, userA, "GET", "/api/v1/notifications/preferences");
    const body = await r.json() as { preferences: Record<string, unknown> };
    assert.equal(r.status, 200);
    assert.equal(body.preferences.budgetAlerts, true);
    assert.equal(body.preferences.goalAlerts, true);
    assert.equal(body.preferences.recurringReminders, true);
    assert.equal(body.preferences.financialHealthAlerts, true);
    assert.equal(body.preferences.billReminders, true);
    assert.equal(body.preferences.generalAlerts, true);
  });
});

test("PATCH /notifications/preferences updates preferences", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await req(baseUrl, userA, "PATCH", "/api/v1/notifications/preferences", { budgetAlerts: false });
    const body = await r.json() as { preferences: { budgetAlerts: boolean } };
    assert.equal(r.status, 200);
    assert.equal(body.preferences.budgetAlerts, false);
  });
});

test("PATCH /notifications/preferences with unknown field returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await req(baseUrl, userA, "PATCH", "/api/v1/notifications/preferences", { unknownField: true });
    assert.equal(r.status, 400);
  });
});

// ── VALIDATION ───────────────────────────────────────────────────────────────

test("GET /notifications with pageSize > 100 returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await req(baseUrl, userA, "GET", "/api/v1/notifications?pageSize=101");
    assert.equal(r.status, 400);
  });
});

test("GET /notifications/:id with invalid UUID returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await req(baseUrl, userA, "GET", "/api/v1/notifications/not-a-uuid");
    assert.equal(r.status, 400);
  });
});

test("PATCH /notifications/preferences with non-boolean returns 400", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await req(baseUrl, userA, "PATCH", "/api/v1/notifications/preferences", { budgetAlerts: "yes" });
    assert.equal(r.status, 400);
  });
});

// ── SECURITY ─────────────────────────────────────────────────────────────────

test("getting another user's notification returns 404 (not 403)", async () => {
  const repo = new MemoryNotificationRepository();
  const n = await repo.create({ userId: userA, type: "GENERAL", title: "T", message: "M" });
  await withServer(async ({ baseUrl }) => {
    // userB tries to access userA's notification
    const r = await req(baseUrl, userB, "GET", `/api/v1/notifications/${n.id}`);
    assert.equal(r.status, 404);
  }, repo);
});

test("userId is NOT present in notification response", async () => {
  const repo = new MemoryNotificationRepository();
  await repo.create({ userId: userA, type: "GENERAL", title: "T", message: "M" });
  await withServer(async ({ baseUrl }) => {
    const r = await req(baseUrl, userA, "GET", "/api/v1/notifications");
    const text = await r.text();
    assert.ok(!text.includes(userA), "userId should not appear in notification list response");
  }, repo);
});

// ── GENERATE ─────────────────────────────────────────────────────────────────

test("POST /notifications/generate returns generated count", async () => {
  await withServer(async ({ baseUrl }) => {
    const r = await req(baseUrl, userA, "POST", "/api/v1/notifications/generate");
    const body = await r.json() as { generated: number };
    assert.equal(r.status, 200);
    assert.equal(typeof body.generated, "number");
    assert.ok(body.generated >= 0);
  });
});
