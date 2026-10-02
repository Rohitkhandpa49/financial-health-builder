import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";

test("configuration parses PostgreSQL URL and bounded port", () => {
  const config = loadConfig({
    NODE_ENV: "test",
    PORT: "5300",
    DATABASE_URL: "postgresql://test:test@localhost:5432/testdb",
    JWT_SECRET: "test-only-secret-with-at-least-32-characters",
    FRONTEND_URL: "http://localhost:3000",
  });

  assert.deepEqual(config, {
    nodeEnv: "test",
    port: 5300,
    databaseUrl: "postgresql://test:test@localhost:5432/testdb",
    jwtSecret: "test-only-secret-with-at-least-32-characters",
    frontendUrl: "http://localhost:3000",
  });
});

test("configuration rejects missing or non-PostgreSQL database URLs without echoing values", () => {
  assert.throws(() => loadConfig({}), /DATABASE_URL/);
  assert.throws(() => loadConfig({
    DATABASE_URL: "mysql://user:secret@localhost/db",
    JWT_SECRET: "test-only-secret-with-at-least-32-characters",
  }), /DATABASE_URL/);
  assert.throws(() => loadConfig({
    DATABASE_URL: "postgresql://test:test@localhost:5432/testdb",
  }), /JWT_SECRET/);
});

test("configuration rejects invalid ports and non-origin CORS URLs", () => {
  const baseEnvironment = {
    DATABASE_URL: "postgresql://test:test@localhost:5432/testdb",
    JWT_SECRET: "test-only-secret-with-at-least-32-characters",
  };

  assert.throws(() => loadConfig({ ...baseEnvironment, PORT: "70000" }), /PORT/);
  assert.throws(() => loadConfig({
    ...baseEnvironment,
    FRONTEND_URL: "https://example.test/app",
  }), /FRONTEND_URL/);
});

test("configuration canonicalizes a frontend origin with a trailing slash", () => {
  const config = loadConfig({
    DATABASE_URL: "postgresql://test:test@localhost:5432/testdb",
    JWT_SECRET: "test-only-secret-with-at-least-32-characters",
    FRONTEND_URL: "https://app.example.test/",
  });

  assert.equal(config.frontendUrl, "https://app.example.test");
});