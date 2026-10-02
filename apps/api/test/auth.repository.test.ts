import assert from "node:assert/strict";
import type { PrismaClient } from "../../../database/prisma/generated/client/client.js";
import { test } from "node:test";
import { createPrismaAuthRepository } from "../src/auth/auth.repository.js";
import { DuplicateEmailError } from "../src/auth/auth.errors.js";

test("Prisma unique-constraint failures map to a safe duplicate-email error", async () => {
  const prismaError = Object.assign(new Error("database constraint detail"), { code: "P2002" });
  const prisma = {
    user: {
      create: async () => {
        throw prismaError;
      },
    },
  } as unknown as PrismaClient;
  const repository = createPrismaAuthRepository(prisma);

  await assert.rejects(
    repository.createUser({
      name: "Example User",
      email: "user@example.test",
      passwordHash: "test-hash-only",
    }),
    DuplicateEmailError,
  );
});