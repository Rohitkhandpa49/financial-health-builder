import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthenticatedRequestContext } from "../src/auth/auth.middleware.js";
import { assertResourceOwnedByAuthenticatedUser } from "../src/authorization/ownership.js";
import { HttpError } from "../src/http/errors.js";

const userA = "00000000-0000-4000-8000-000000000001";
const userB = "00000000-0000-4000-8000-000000000002";
const authenticatedUserA: AuthenticatedRequestContext = Object.freeze({ userId: userA });

test("authenticated user can pass the ownership check for their resource", () => {
  assert.doesNotThrow(() => {
    assertResourceOwnedByAuthenticatedUser(authenticatedUserA, { userId: userA });
  });
});

test("foreign-owned resources fail with a non-enumerating not-found error", () => {
  assert.throws(
    () => assertResourceOwnedByAuthenticatedUser(authenticatedUserA, { userId: userB }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.statusCode, 404);
      assert.equal(error.code, "NOT_FOUND");
      assert.equal(error.message, "The requested resource was not found.");
      assert.equal(error.message.includes(userB), false);
      return true;
    },
  );
});

test("related resources are checked individually against the authenticated identity", () => {
  const userAAccount = { userId: userA };
  const userACategory = { userId: userA };
  const userBAccount = { userId: userB };
  const userBCategory = { userId: userB };

  assert.doesNotThrow(() => {
    assertResourceOwnedByAuthenticatedUser(authenticatedUserA, userAAccount);
    assertResourceOwnedByAuthenticatedUser(authenticatedUserA, userACategory);
  });
  assert.throws(() => assertResourceOwnedByAuthenticatedUser(authenticatedUserA, userBAccount), HttpError);
  assert.throws(() => assertResourceOwnedByAuthenticatedUser(authenticatedUserA, userBCategory), HttpError);
});