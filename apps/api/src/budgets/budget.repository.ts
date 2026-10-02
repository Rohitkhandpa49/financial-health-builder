import type {
  Budget as PrismaBudget,
  PrismaClient,
} from "../../../../database/prisma/generated/client/client.js";
import { BudgetPeriod } from "../../../../database/prisma/generated/client/enums.js";
import type { CreateBudgetRequest } from "../../../../packages/contracts/src/budgets/budgets.js";

export interface BudgetRecord {
  id: string;
  userId: string;
  categoryId: string | null;
  name: string;
  amount: string;
  currency: string;
  period: string;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetListResult {
  budgets: BudgetRecord[];
  totalItems: number;
}

export interface ResolvedBudgetListQuery {
  page: number;
  pageSize: number;
  categoryId?: string;
  period?: string;
}

export interface BudgetUpdatePatch {
  name?: string;
  categoryId?: string | null;
  amount?: string;
  endDate?: Date;
}

export interface BudgetRepository {
  createForUser(userId: string, input: CreateBudgetRequest): Promise<BudgetRecord>;
  listForUser(userId: string, query: ResolvedBudgetListQuery): Promise<BudgetListResult>;
  findByIdForUser(budgetId: string, userId: string): Promise<BudgetRecord | null>;
  updateForUser(budgetId: string, userId: string, patch: BudgetUpdatePatch): Promise<BudgetRecord | null>;
  deleteForUser(budgetId: string, userId: string): Promise<boolean>;
}

const budgetSelect = {
  id: true,
  userId: true,
  categoryId: true,
  name: true,
  amount: true,
  currency: true,
  period: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toBudgetRecord(b: PrismaBudget): BudgetRecord {
  return {
    id: b.id,
    userId: b.userId,
    categoryId: b.categoryId,
    name: b.name,
    amount: b.amount.toFixed(4),
    currency: b.currency,
    period: b.period,
    startDate: b.startDate,
    endDate: b.endDate,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

function isRecordNotFoundError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "P2025";
}

export function createPrismaBudgetRepository(prisma: PrismaClient): BudgetRepository {
  return {
    async createForUser(userId, input) {
      const budget = await prisma.budget.create({
        data: {
          userId,
          categoryId: input.categoryId ?? null,
          name: input.name,
          amount: input.amount,
          currency: input.currency,
          period: input.period as BudgetPeriod,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        },
        select: budgetSelect,
      });

      return toBudgetRecord(budget);
    },

    async listForUser(userId, query) {
      const where: Record<string, unknown> = { userId };

      if (query.categoryId !== undefined) {
        where.categoryId = query.categoryId;
      }

      if (query.period !== undefined) {
        where.period = query.period as BudgetPeriod;
      }

      const skip = (query.page - 1) * query.pageSize;
      const take = query.pageSize;

      const [budgets, totalItems] = await Promise.all([
        prisma.budget.findMany({
          where,
          orderBy: [
            { startDate: "desc" },
            { createdAt: "desc" },
            { id: "desc" },
          ],
          skip,
          take,
          select: budgetSelect,
        }),
        prisma.budget.count({ where }),
      ]);

      return {
        budgets: budgets.map(toBudgetRecord),
        totalItems,
      };
    },

    async findByIdForUser(budgetId, userId) {
      const budget = await prisma.budget.findFirst({
        where: { id: budgetId, userId },
        select: budgetSelect,
      });

      return budget ? toBudgetRecord(budget) : null;
    },

    async updateForUser(budgetId, userId, patch) {
      const existing = await prisma.budget.findFirst({
        where: { id: budgetId, userId },
        select: budgetSelect,
      });

      if (!existing) {
        return null;
      }

      const data: Record<string, unknown> = {};
      if (patch.name !== undefined) data.name = patch.name;
      if (patch.categoryId !== undefined) data.categoryId = patch.categoryId;
      if (patch.amount !== undefined) data.amount = patch.amount;
      if (patch.endDate !== undefined) data.endDate = patch.endDate;

      try {
        const updated = await prisma.budget.update({
          where: { id: budgetId },
          data,
          select: budgetSelect,
        });

        return toBudgetRecord(updated);
      } catch (error) {
        if (isRecordNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },

    async deleteForUser(budgetId, userId) {
      const result = await prisma.budget.deleteMany({
        where: { id: budgetId, userId },
      });

      return result.count > 0;
    },
  };
}
