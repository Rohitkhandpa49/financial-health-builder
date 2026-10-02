import type {
  Account as PrismaAccount,
  PrismaClient,
} from "../../../../database/prisma/generated/client/client.js";
import type {
  AccountListQuery,
  AccountType,
  CreateAccountRequest,
} from "../../../../packages/contracts/src/accounts/accounts.js";

export interface AccountRecord {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: string;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountListResult {
  accounts: AccountRecord[];
  totalItems: number;
}

export interface AccountRepository {
  createForUser(userId: string, input: CreateAccountRequest): Promise<AccountRecord>;
  listForUser(userId: string, query: Required<AccountListQuery>): Promise<AccountListResult>;
  findByIdForUser(accountId: string, userId: string): Promise<AccountRecord | null>;
  updateNameForUser(accountId: string, userId: string, name: string): Promise<AccountRecord | null>;
  archiveForUser(accountId: string, userId: string): Promise<AccountRecord | null>;
}

const accountSelect = {
  id: true,
  userId: true,
  name: true,
  type: true,
  currency: true,
  openingBalance: true,
  archived: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toAccountRecord(account: PrismaAccount): AccountRecord {
  return {
    id: account.id,
    userId: account.userId,
    name: account.name,
    type: account.type,
    currency: account.currency.trim(),
    openingBalance: account.openingBalance.toFixed(4),
    archived: account.archived,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function isRecordNotFoundError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "P2025";
}

export function createPrismaAccountRepository(prisma: PrismaClient): AccountRepository {
  return {
    async createForUser(userId, input) {
      const account = await prisma.account.create({
        data: {
          userId,
          name: input.name,
          type: input.type,
          currency: input.currency,
          openingBalance: input.openingBalance,
        },
        select: accountSelect,
      });

      return toAccountRecord(account);
    },

    async listForUser(userId, query) {
      const where = {
        userId,
        archived: query.archived,
      };
      const [accounts, totalItems] = await Promise.all([
        prisma.account.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: accountSelect,
        }),
        prisma.account.count({ where }),
      ]);

      return {
        accounts: accounts.map(toAccountRecord),
        totalItems,
      };
    },

    async findByIdForUser(accountId, userId) {
      const account = await prisma.account.findFirst({
        where: { id: accountId, userId },
        select: accountSelect,
      });

      return account ? toAccountRecord(account) : null;
    },

    async updateNameForUser(accountId, userId, name) {
      try {
        const account = await prisma.account.update({
          where: { id: accountId, userId, archived: false },
          data: { name },
          select: accountSelect,
        });

        return toAccountRecord(account);
      } catch (error) {
        if (isRecordNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },

    async archiveForUser(accountId, userId) {
      try {
        const account = await prisma.account.update({
          where: { id: accountId, userId },
          data: { archived: true },
          select: accountSelect,
        });

        return toAccountRecord(account);
      } catch (error) {
        if (isRecordNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },
  };
}