import type { PrismaClient } from "../../../../database/prisma/generated/client/client.js";
import { DuplicateEmailError } from "./auth.errors.js";

export interface PublicAuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthUserRecord extends PublicAuthUser {
  passwordHash: string;
}

export interface CreateAuthUserInput {
  name: string;
  email: string;
  passwordHash: string;
}

export interface AuthUserRepository {
  createUser(input: CreateAuthUserInput): Promise<AuthUserRecord>;
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findUserById(id: string): Promise<PublicAuthUser | null>;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "P2002";
}

export function createPrismaAuthRepository(prisma: PrismaClient): AuthUserRepository {
  return {
    async createUser(input) {
      try {
        return await prisma.user.create({
          data: {
            name: input.name,
            email: input.email,
            passwordHash: input.passwordHash,
          },
          select: {
            id: true,
            name: true,
            email: true,
            passwordHash: true,
          },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new DuplicateEmailError();
        }

        throw error;
      }
    },

    findUserByEmail(email) {
      return prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          email: true,
          passwordHash: true,
        },
      });
    },

    findUserById(id) {
      return prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });
    },
  };
}