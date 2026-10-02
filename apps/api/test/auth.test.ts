import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { SignJWT } from "jose";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { JoseAccessTokenService } from "../src/auth/access-token.js";
import {
  DuplicateEmailError,
} from "../src/auth/auth.errors.js";
import type {
  AuthUserRecord,
  AuthUserRepository,
  CreateAuthUserInput,
} from "../src/auth/auth.repository.js";
import { AuthenticationService } from "../src/auth/auth.service.js";
import { ACCESS_COOKIE_NAME } from "../src/auth/auth.middleware.js";
import type { PasswordHasher } from "../src/auth/password-hasher.js";
import type { AuthLoginRequest, AuthRegisterRequest } from "../../../packages/contracts/src/auth/auth.js";

const frontendUrl = "https://app.example.test";
const jwtSecret = "test-only-secret-with-at-least-32-characters";

class MemoryAuthRepository implements AuthUserRepository {
  readonly usersById = new Map<string, AuthUserRecord>();
  readonly usersByEmail = new Map<string, AuthUserRecord>();

  async createUser(input: CreateAuthUserInput): Promise<AuthUserRecord> {
    if (this.usersByEmail.has(input.email)) {
      throw new DuplicateEmailError();
    }

    const user = { id: randomUUID(), ...input };
    this.usersById.set(user.id, user);
    this.usersByEmail.set(user.email, user);
    return user;
  }

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.usersByEmail.get(email) ?? null;
  }

  async findUserById(id: string) {
    const user = this.usersById.get(id);
    return user ? { id: user.id, name: user.name, email: user.email } : null;
  }
}

const testPasswordHasher: PasswordHasher = {
  async hash(password) {
    return `test-hash:${password}`;
  },
  async verify(passwordHash, password) {
    return passwordHash === `test-hash:${password}`;
  },
};

function createTestContext(secureCookies = false) {
  const repository = new MemoryAuthRepository();
  const authService = new AuthenticationService(repository, testPasswordHasher);
  const accessTokenService = new JoseAccessTokenService(jwtSecret);
  const app = createApp({
    frontendUrl,
    auth: {
      authService,
      accessTokenService,
      frontendUrl,
      secureCookies,
    },
  });

  return { app, repository, authService, accessTokenService };
}

async function withAuthServer<T>(
  callback: (baseUrl: string, context: ReturnType<typeof createTestContext>) => Promise<T>,
  secureCookies = false,
): Promise<T> {
  const context = createTestContext(secureCookies);
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

async function postJson(baseUrl: string, path: string, body: unknown, origin?: string): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) {
    headers.Origin = origin;
  }

  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function registerTestUser(baseUrl: string): Promise<AuthRegisterRequest> {
  const input = {
    name: "Example User",
    email: "user@example.test",
    password: "correct horse battery staple",
  };
  const response = await postJson(baseUrl, "/api/v1/auth/register", input);
  assert.equal(response.status, 201);
  return input;
}

test("registration normalizes allowed fields, hashes passwords, and excludes secrets", async () => {
  await withAuthServer(async (baseUrl, context) => {
    const response = await postJson(baseUrl, "/api/v1/auth/register", {
      name: "  Example User  ",
      email: "  User@Example.test ",
      password: "correct horse battery staple",
    });
    const body = await response.json() as { user: Record<string, unknown> };

    assert.equal(response.status, 201);
    assert.deepEqual(body.user, {
      id: [...context.repository.usersById.keys()][0],
      name: "Example User",
      email: "user@example.test",
    });
    assert.equal("password" in body.user, false);
    assert.equal("passwordHash" in body.user, false);

    const storedUser = context.repository.usersByEmail.get("user@example.test");
    assert.equal(storedUser?.passwordHash, "test-hash:correct horse battery staple");
  });
});

test("registration rejects invalid, short-password, and mass-assigned input", async () => {
  await withAuthServer(async (baseUrl, context) => {
    const invalidEmail = await postJson(baseUrl, "/api/v1/auth/register", {
      name: "Example User",
      email: "not-an-email",
      password: "correct horse battery staple",
    });
    const shortPassword = await postJson(baseUrl, "/api/v1/auth/register", {
      name: "Example User",
      email: "user@example.test",
      password: "short",
    });
    const massAssignment = await postJson(baseUrl, "/api/v1/auth/register", {
      name: "Example User",
      email: "user@example.test",
      password: "correct horse battery staple",
      userId: randomUUID(),
      passwordHash: "attacker-controlled",
      createdAt: "2000-01-01T00:00:00.000Z",
    });

    assert.equal(invalidEmail.status, 400);
    assert.equal(shortPassword.status, 400);
    assert.equal(massAssignment.status, 400);
    assert.equal(context.repository.usersById.size, 0);
    assert.equal((await massAssignment.text()).includes("attacker-controlled"), false);
  });
});

test("registration rejects missing or empty required fields", async () => {
  await withAuthServer(async (baseUrl, context) => {
    const missingName = await postJson(baseUrl, "/api/v1/auth/register", {
      email: "user@example.test",
      password: "correct horse battery staple",
    });
    const emptyName = await postJson(baseUrl, "/api/v1/auth/register", {
      name: "   ",
      email: "user@example.test",
      password: "correct horse battery staple",
    });
    const missingEmail = await postJson(baseUrl, "/api/v1/auth/register", {
      name: "Example User",
      password: "correct horse battery staple",
    });
    const missingPassword = await postJson(baseUrl, "/api/v1/auth/register", {
      name: "Example User",
      email: "user@example.test",
    });

    assert.deepEqual([
      missingName.status,
      emptyName.status,
      missingEmail.status,
      missingPassword.status,
    ], [400, 400, 400, 400]);
    assert.equal(context.repository.usersById.size, 0);
  });
});

test("registration rejects values beyond documented field limits", async () => {
  await withAuthServer(async (baseUrl, context) => {
    const oversizedName = await postJson(baseUrl, "/api/v1/auth/register", {
      name: "n".repeat(121),
      email: "user@example.test",
      password: "correct horse battery staple",
    });
    const oversizedEmail = await postJson(baseUrl, "/api/v1/auth/register", {
      name: "Example User",
      email: `${"a".repeat(243)}@example.test`,
      password: "correct horse battery staple",
    });
    const oversizedPassword = await postJson(baseUrl, "/api/v1/auth/register", {
      name: "Example User",
      email: "user@example.test",
      password: "p".repeat(129),
    });

    assert.deepEqual([
      oversizedName.status,
      oversizedEmail.status,
      oversizedPassword.status,
    ], [400, 400, 400]);
    assert.equal(context.repository.usersById.size, 0);
  });
});

test("duplicate registration returns a generic conflict", async () => {
  await withAuthServer(async (baseUrl) => {
    const input = {
      name: "Example User",
      email: "user@example.test",
      password: "correct horse battery staple",
    };

    assert.equal((await postJson(baseUrl, "/api/v1/auth/register", input)).status, 201);
    const duplicate = await postJson(baseUrl, "/api/v1/auth/register", input);
    const body = await duplicate.json() as { error: { code: string; message: string } };

    assert.equal(duplicate.status, 409);
    assert.deepEqual(body.error, {
      code: "AUTH_CONFLICT",
      message: "Unable to register this account.",
      details: { requestId: duplicate.headers.get("x-request-id") },
    });
    assert.equal(JSON.stringify(body).includes(input.email), false);
  });
});

test("login uses one safe error for unknown emails and incorrect passwords", async () => {
  await withAuthServer(async (baseUrl) => {
    await registerTestUser(baseUrl);
    const incorrectPassword = await postJson(baseUrl, "/api/v1/auth/login", {
      email: "user@example.test",
      password: "incorrect password",
    });
    const unknownEmail = await postJson(baseUrl, "/api/v1/auth/login", {
      email: "missing@example.test",
      password: "incorrect password",
    });
    const incorrectBody = await incorrectPassword.json();
    const unknownBody = await unknownEmail.json();

    assert.equal(incorrectPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.deepEqual(incorrectBody.error, {
      code: "AUTH_INVALID_CREDENTIALS",
      message: "Email or password is invalid.",
      details: { requestId: incorrectPassword.headers.get("x-request-id") },
    });
    assert.equal(unknownBody.error.code, incorrectBody.error.code);
    assert.equal(unknownBody.error.message, incorrectBody.error.message);
    assert.equal(JSON.stringify(unknownBody).includes("missing@example.test"), false);
  });
});

test("login rejects missing fields and unexpected properties", async () => {
  await withAuthServer(async (baseUrl) => {
    const missingEmail = await postJson(baseUrl, "/api/v1/auth/login", {
      password: "correct horse battery staple",
    });
    const missingPassword = await postJson(baseUrl, "/api/v1/auth/login", {
      email: "user@example.test",
    });
    const extraField = await postJson(baseUrl, "/api/v1/auth/login", {
      email: "user@example.test",
      password: "correct horse battery staple",
      userId: randomUUID(),
    });

    assert.deepEqual([missingEmail.status, missingPassword.status, extraField.status], [400, 400, 400]);
  });
});

test("login sets an HttpOnly cookie and /me derives identity only from its verified subject", async () => {
  await withAuthServer(async (baseUrl) => {
    await registerTestUser(baseUrl);
    const login = await postJson(baseUrl, "/api/v1/auth/login", {
      email: " USER@EXAMPLE.TEST ",
      password: "correct horse battery staple",
    }, frontendUrl);
    const loginBody = await login.json() as { user: Record<string, unknown> };
    const setCookie = login.headers.get("set-cookie") ?? "";
    const cookiePair = setCookie.split(";")[0];

    assert.equal(login.status, 200);
    assert.equal(loginBody.user.email, "user@example.test");
    assert.equal("passwordHash" in loginBody.user, false);
    assert.equal("password" in loginBody.user, false);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.match(setCookie, /Path=\/api\/v1\/auth/i);
    assert.equal(JSON.stringify(loginBody).includes(cookiePair.split("=")[1]), false);

    const currentUser = await fetch(`${baseUrl}/api/v1/auth/me?userId=${randomUUID()}`, {
      headers: { Cookie: cookiePair },
    });
    const currentBody = await currentUser.json() as { user: Record<string, unknown> };

    assert.equal(currentUser.status, 200);
    assert.deepEqual(currentBody.user, loginBody.user);
    assert.equal("passwordHash" in currentBody.user, false);
  });
});

test("/me requires a valid cookie and maps malformed credentials safely", async () => {
  await withAuthServer(async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/api/v1/auth/me`);
    const invalid = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Cookie: `${ACCESS_COOKIE_NAME}=not.a.valid.token` },
    });
    const missingBody = await missing.json() as { error: { code: string } };
    const invalidBody = await invalid.json() as { error: { code: string } };

    assert.equal(missing.status, 401);
    assert.equal(missingBody.error.code, "AUTH_REQUIRED");
    assert.equal(invalid.status, 401);
    assert.equal(invalidBody.error.code, "AUTH_INVALID_TOKEN");
  });
});

test("/me ignores client-supplied user IDs and Authorization headers", async () => {
  await withAuthServer(async (baseUrl, context) => {
    const user = await context.authService.register({
      name: "Example User",
      email: "user@example.test",
      password: "correct horse battery staple",
    });
    const otherwiseValidToken = await context.accessTokenService.issue(user.id);
    const response = await fetch(`${baseUrl}/api/v1/auth/me?userId=${user.id}`, {
      headers: { Authorization: `Bearer ${otherwiseValidToken}` },
    });

    assert.equal(response.status, 401);
  });
});

test("expired credentials are rejected", async () => {
  await withAuthServer(async (baseUrl, context) => {
    const user = await context.authService.register({
      name: "Example User",
      email: "user@example.test",
      password: "correct horse battery staple",
    });
    const key = new TextEncoder().encode(jwtSecret);
    const expiredToken = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer("financial-health-builder")
      .setAudience("financial-health-builder-api")
      .setSubject(user.id)
      .setJti(randomUUID())
      .setIssuedAt(Math.floor(Date.now() / 1000) - 1200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 600)
      .sign(key);
    const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Cookie: `${ACCESS_COOKIE_NAME}=${expiredToken}` },
    });
    const body = await response.json() as { error: { code: string } };

    assert.equal(response.status, 401);
    assert.equal(body.error.code, "AUTH_TOKEN_EXPIRED");
  });
});

test("logout clears the cookie; copied stateless tokens remain valid only until expiry", async () => {
  await withAuthServer(async (baseUrl) => {
    await registerTestUser(baseUrl);
    const login = await postJson(baseUrl, "/api/v1/auth/login", {
      email: "user@example.test",
      password: "correct horse battery staple",
    });
    const cookiePair = (login.headers.get("set-cookie") ?? "").split(";")[0];
    const logout = await postJson(baseUrl, "/api/v1/auth/logout", {}, frontendUrl);
    const afterLogout = await fetch(`${baseUrl}/api/v1/auth/me`);
    const copiedTokenReplay = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Cookie: cookiePair },
    });

    assert.equal(logout.status, 204);
    assert.match(logout.headers.get("set-cookie") ?? "", /Expires=Thu, 01 Jan 1970/i);
    assert.equal(afterLogout.status, 401);
    assert.equal(copiedTokenReplay.status, 200);
  });
});

test("unsafe auth requests reject a foreign Origin", async () => {
  await withAuthServer(async (baseUrl) => {
    const response = await postJson(baseUrl, "/api/v1/auth/login", {
      email: "user@example.test",
      password: "correct horse battery staple",
    }, "https://attacker.example.test");
    const body = await response.json() as { error: { code: string } };

    assert.equal(response.status, 403);
    assert.equal(body.error.code, "AUTH_ORIGIN_INVALID");
  });
});

test("login rate limit returns a structured 429 response", async () => {
  await withAuthServer(async (baseUrl) => {
    let lastResponse: Response | undefined;

    for (let attempt = 0; attempt < 11; attempt += 1) {
      lastResponse = await postJson(baseUrl, "/api/v1/auth/login", {
        email: "missing@example.test",
        password: "incorrect password",
      });
    }

    assert.equal(lastResponse?.status, 429);
    const body = await lastResponse?.json() as { error: { code: string } };
    assert.equal(body.error.code, "AUTH_RATE_LIMITED");
  });
});

test("production authentication cookies include Secure", async () => {
  await withAuthServer(async (baseUrl) => {
    await registerTestUser(baseUrl);
    const login = await postJson(baseUrl, "/api/v1/auth/login", {
      email: "user@example.test",
      password: "correct horse battery staple",
    });

    assert.match(login.headers.get("set-cookie") ?? "", /Secure/i);
  }, true);
});