import assert from "node:assert/strict";
import { test } from "node:test";
import { Argon2PasswordHasher } from "../src/auth/password-hasher.js";

test("Argon2id stores a one-way hash and verifies only the matching password", async () => {
  const password = "test-only-password-for-argon2";
  const hasher = new Argon2PasswordHasher();
  const passwordHash = await hasher.hash(password);

  assert.notEqual(passwordHash, password);
  assert.match(passwordHash, /^\$argon2id\$/);
  assert.equal(await hasher.verify(passwordHash, password), true);
  assert.equal(await hasher.verify(passwordHash, "wrong test password"), false);
});