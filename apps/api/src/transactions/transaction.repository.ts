import type {
  Transaction as PrismaTransaction,
  PrismaClient,
} from "../../../../database/prisma/generated/client/client.js";

export interface TransactionRecord {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string | null;
  type: string;
  amount: string;
  currency: string;
  description: string;
  effectiveAt: Date;
  transferGroupId: string | null;
  transferDirection: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionListResult {
  transactions: TransactionRecord[];
  total: number;
}

export interface ResolvedTransactionListQuery {
  page: number;
  pageSize: number;
  accountId?: string;
  type?: string;
}

export interface TransactionUpdatePatch {
  categoryId?: string | null;
  type?: string;
  amount?: string;
  description?: string;
  effectiveAt?: Date;
}

export interface TransactionRepository {
  createForUser(
    userId: string,
    data: {
      accountId: string;
      categoryId?: string | null;
      type: string;
      amount: string;
      currency: string;
      description: string;
      effectiveAt: Date;
    },
  ): Promise<TransactionRecord>;
  listForUser(userId: string, query: ResolvedTransactionListQuery): Promise<TransactionListResult>;
  findByIdForUser(id: string, userId: string): Promise<TransactionRecord | null>;
  updateForUser(id: string, userId: string, patch: TransactionUpdatePatch): Promise<TransactionRecord | null>;
  deleteForUser(id: string, userId: string): Promise<boolean>;
}

const transactionSelect = {
  id: true,
  userId: true,
  accountId: true,
  categoryId: true,
  type: true,
  amount: true,
  currency: true,
  description: true,
  effectiveAt: true,
  transferGroupId: true,
  transferDirection: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toTransactionRecord(tx: PrismaTransaction): TransactionRecord {
  return {
    id: tx.id,
    userId: tx.userId,
    accountId: tx.accountId,
    categoryId: tx.categoryId,
    type: tx.type,
    amount: tx.amount.toFixed(4),
    currency: tx.currency.trim(),
    description: tx.description,
    effectiveAt: tx.effectiveAt,
    transferGroupId: tx.transferGroupId,
    transferDirection: tx.transferDirection,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  };
}

export function createPrismaTransactionRepository(prisma: PrismaClient): TransactionRepository {
  return {
    async createForUser(userId, data) {
      const tx = await prisma.transaction.create({
        data: {
          userId,
          accountId: data.accountId,
          categoryId: data.categoryId ?? null,
          type: data.type as PrismaTransaction["type"],
          amount: data.amount,
          currency: data.currency,
          description: data.description,
          effectiveAt: data.effectiveAt,
        },
        select: transactionSelect,
      });

      return toTransactionRecord(tx);
    },

    async listForUser(userId, query) {
      const where: Record<string, unknown> = {
        userId,
        NOT: { type: "TRANSFER" },
      };

      if (query.accountId !== undefined) {
        where.accountId = query.accountId;
      }

      if (query.type !== undefined) {
        where.type = query.type;
      }

      const skip = (query.page - 1) * query.pageSize;
      const take = query.pageSize;

      const [transactions, total] = await prisma.$transaction([
        prisma.transaction.findMany({
          where,
          orderBy: [
            { effectiveAt: "desc" },
            { createdAt: "desc" },
            { id: "desc" },
          ],
          skip,
          take,
          select: transactionSelect,
        }),
        prisma.transaction.count({ where }),
      ]);

      return {
        transactions: transactions.map(toTransactionRecord),
        total,
      };
    },

    async findByIdForUser(id, userId) {
      const tx = await prisma.transaction.findFirst({
        where: {
          id,
          userId,
          NOT: { type: "TRANSFER" },
        },
        select: transactionSelect,
      });

      return tx ? toTransactionRecord(tx) : null;
    },

    async updateForUser(id, userId, patch) {
      const existing = await prisma.transaction.findFirst({
        where: {
          id,
          userId,
          NOT: { type: "TRANSFER" },
        },
        select: transactionSelect,
      });

      if (!existing) {
        return null;
      }

      const data: Record<string, unknown> = {};
      if (patch.categoryId !== undefined) data.categoryId = patch.categoryId;
      if (patch.type !== undefined) data.type = patch.type;
      if (patch.amount !== undefined) data.amount = patch.amount;
      if (patch.description !== undefined) data.description = patch.description;
      if (patch.effectiveAt !== undefined) data.effectiveAt = patch.effectiveAt;

      const updated = await prisma.transaction.update({
        where: { id },
        data,
        select: transactionSelect,
      });

      return toTransactionRecord(updated);
    },

    async deleteForUser(id, userId) {
      const result = await prisma.transaction.deleteMany({
        where: { id, userId },
      });

      return result.count > 0;
    },
  };
}
