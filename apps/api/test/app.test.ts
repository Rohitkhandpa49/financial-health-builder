import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createApp } from "../src/app.js";

async function withServer<T>(
  callback: (baseUrl: string) => Promise<T>,
  frontendUrl?: string,
): Promise<T> {
  const server = createServer(createApp({ frontendUrl }));

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await callback(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("health endpoint is versioned and returns no configuration", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    const body: unknown = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { status: "ok" });
    assert.match(response.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/i);
    assert.equal(response.headers.get("x-powered-by"), null);
  });
});

test("valid request IDs are returned unchanged", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { "X-Request-Id": "audit.request-123" },
    });

    assert.equal(response.headers.get("x-request-id"), "audit.request-123");
  });
});

test("unknown routes return the shared structured error shape", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/missing`);
    const body = await response.json() as { error: { code: string; details: { requestId: string } } };

    assert.equal(response.status, 404);
    assert.equal(body.error.code, "NOT_FOUND");
    assert.equal(body.error.details.requestId, response.headers.get("x-request-id"));
  });
});

test("malformed JSON returns a safe structured client error", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid",
    });
    const body = await response.json() as { error: { code: string; message: string } };

    assert.equal(response.status, 400);
    assert.equal(body.error.code, "INVALID_JSON");
    assert.equal(body.error.message, "Request body must be valid JSON.");
  });
});

test("CORS allows only the configured frontend origin", async () => {
  await withServer(async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { Origin: "https://app.example.test" },
    });
    const denied = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { Origin: "https://other.example.test" },
    });

    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://app.example.test");
    assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
  }, "https://app.example.test");
});