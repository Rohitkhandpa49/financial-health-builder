import type {
  RecurringTransaction as PrismaRecurringTransaction,
  PrismaClient,
} from "../../../../database/prisma/generated/client/client.js";
import type {
  CreateRecurringTransactionRequest,
  RecurringTransactionType,
} from "../../../../packages/contracts/src/recurring-transactions/recurring-transactions.js";

export interface RecurringTransactionRecord {
  id: string;
  userId: string;
  accountId: string;
  categoryId: string | null;
  type: RecurringTransactionType;
  amount: string;
  currency: string;
  description: string;
  frequency: string;
  startDate: Date;
  endDate: Date | null;
  nextDate: Date;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecurringTransactionListResult {
  recurringTransactions: RecurringTransactionRecord[];
  totalItems: number;
}

export interface ResolvedRecurringTransactionListQuery {
  page: number;
  pageSize: number;
  accountId?: string;
  active?: boolean;
}

export interface RecurringTransactionUpdatePatch {
  categoryId?: string | null;
  amount?: string;
  description?: string;
  endDate?: Date | null;
  nextDate?: Date;
  active?: boolean;
}

export interface RecurringTransactionRepository {
  createForUser(userId: string, input: CreateRecurringTransactionRequest, currency: string): Promise<RecurringTransactionRecord>;
  listForUser(userId: string, query: ResolvedRecurringTransactionListQuery): Promise<RecurringTransactionListResult>;
  findByIdForUser(id: string, userId: string): Promise<RecurringTransactionRecord | null>;
  updateForUser(id: string, userId: string, patch: RecurringTransactionUpdatePatch): Promise<RecurringTransactionRecord | null>;
  deleteForUser(id: string, userId: string): Promise<boolean>;
}

const recurringTransactionSelect = {
  id: true,
  userId: true,
  accountId: true,
  categoryId: true,
  type: true,
  amount: true,
  currency: true,
  description: true,
  frequency: true,
  startDate: true,
  endDate: true,
  nextDate: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toRecord(r: PrismaRecurringTransaction): RecurringTransactionRecord {
  return {
    id: r.id,
    userId: r.userId,
    accountId: r.accountId,
    categoryId: r.categoryId,
    type: r.type as RecurringTransactionType,
    amount: r.amount.toFixed(4),
    currency: r.currency.trim(),
    description: r.description,
    frequency: r.frequency,
    startDate: r.startDate,
    endDate: r.endDate,
    nextDate: r.nextDate,
    active: r.active,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2025"
  );
}

export function createPrismaRecurringTransactionRepository(prisma: PrismaClient): RecurringTransactionRepository {
  return {
    async createForUser(userId, input, currency) {
      const record = await prisma.recurringTransaction.create({
        data: {
          userId,
          accountId: input.accountId,
          categoryId: input.categoryId ?? null,
          type: input.type as PrismaRecurringTransaction["type"],
          amount: input.amount,
          currency,
          description: input.description,
          frequency: input.frequency as PrismaRecurringTransaction["frequency"],
          startDate: new Date(input.startDate),
          endDate: input.endDate ? new Date(input.endDate) : null,
          nextDate: new Date(input.nextDate),
        },
        select: recurringTransactionSelect,
      });
      return toRecord(record);
    },

    async listForUser(userId, query) {
      const where: Record<string, unknown> = {
        userId,
        NOT: { type: "TRANSFER" },
      };
      if (query.accountId !== undefined) where.accountId = query.accountId;
      if (query.active !== undefined) where.active = query.active;

      const skip = (query.page - 1) * query.pageSize;
      const take = query.pageSize;

      const [records, totalItems] = await Promise.all([
        prisma.recurringTransaction.findMany({
          where,
          orderBy: [{ nextDate: "asc" }, { createdAt: "desc" }, { id: "desc" }],
          skip,
          take,
          select: recurringTransactionSelect,
        }),
        prisma.recurringTransaction.count({ where }),
      ]);

      return { recurringTransactions: records.map(toRecord), totalItems };
    },

    async findByIdForUser(id, userId) {
      const record = await prisma.recurringTransaction.findFirst({
        where: { id, userId, NOT: { type: "TRANSFER" } },
        select: recurringTransactionSelect,
      });
      return record ? toRecord(record) : null;
    },

    async updateForUser(id, userId, patch) {
      const existing = await prisma.recurringTransaction.findFirst({
        where: { id, userId, NOT: { type: "TRANSFER" } },
        select: recurringTransactionSelect,
      });
      if (!existing) return null;

      const data: Record<string, unknown> = {};
      if (patch.categoryId !== undefined) data.categoryId = patch.categoryId;
      if (patch.amount !== undefined) data.amount = patch.amount;
      if (patch.description !== undefined) data.description = patch.description;
      if (patch.endDate !== undefined) data.endDate = patch.endDate;
      if (patch.nextDate !== undefined) data.nextDate = patch.nextDate;
      if (patch.active !== undefined) data.active = patch.active;

      try {
        const updated = await prisma.recurringTransaction.update({
          where: { id },
          data,
          select: recurringTransactionSelect,
        });
        return toRecord(updated);
      } catch (error) {
        if (isRecordNotFoundError(error)) return null;
        throw error;
      }
    },

    async deleteForUser(id, userId) {
      const result = await prisma.recurringTransaction.deleteMany({
        where: { id, userId },
      });
      return result.count > 0;
    },
  };
}
