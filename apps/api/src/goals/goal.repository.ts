import type {
  SavingsGoal as PrismaSavingsGoal,
  PrismaClient,
} from "../../../../database/prisma/generated/client/client.js";
import { SavingsGoalStatus } from "../../../../database/prisma/generated/client/enums.js";
import type { CreateGoalRequest } from "../../../../packages/contracts/src/goals/goals.js";

export interface GoalRecord {
  id: string;
  userId: string;
  name: string;
  targetAmount: string; // toFixed(4)
  currentAmount: string; // toFixed(4)
  currency: string;
  targetDate: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoalListResult {
  goals: GoalRecord[];
  totalItems: number;
}

export interface ResolvedGoalListQuery {
  page: number;
  pageSize: number;
  status?: string;
}

export interface GoalUpdatePatch {
  name?: string;
  targetAmount?: string;
  currentAmount?: string;
  targetDate?: Date;
  status?: string;
}

export interface GoalRepository {
  createForUser(userId: string, input: CreateGoalRequest): Promise<GoalRecord>;
  listForUser(userId: string, query: ResolvedGoalListQuery): Promise<GoalListResult>;
  findByIdForUser(goalId: string, userId: string): Promise<GoalRecord | null>;
  updateForUser(goalId: string, userId: string, patch: GoalUpdatePatch): Promise<GoalRecord | null>;
  deleteForUser(goalId: string, userId: string): Promise<boolean>;
}

const goalSelect = {
  id: true,
  userId: true,
  name: true,
  targetAmount: true,
  currentAmount: true,
  currency: true,
  targetDate: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toGoalRecord(g: PrismaSavingsGoal): GoalRecord {
  return {
    id: g.id,
    userId: g.userId,
    name: g.name,
    targetAmount: g.targetAmount.toFixed(4),
    currentAmount: g.currentAmount.toFixed(4),
    currency: g.currency,
    targetDate: g.targetDate,
    status: g.status,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
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

export function createPrismaGoalRepository(prisma: PrismaClient): GoalRepository {
  return {
    async createForUser(userId, input) {
      const goal = await prisma.savingsGoal.create({
        data: {
          userId,
          name: input.name,
          targetAmount: input.targetAmount,
          currentAmount: input.currentAmount ?? "0",
          currency: input.currency,
          targetDate: new Date(input.targetDate),
          status: (input.status ?? "ACTIVE") as SavingsGoalStatus,
        },
        select: goalSelect,
      });

      return toGoalRecord(goal);
    },

    async listForUser(userId, query) {
      const where: Record<string, unknown> = { userId };

      if (query.status !== undefined) {
        where.status = query.status as SavingsGoalStatus;
      }

      const skip = (query.page - 1) * query.pageSize;
      const take = query.pageSize;

      const [goals, totalItems] = await Promise.all([
        prisma.savingsGoal.findMany({
          where,
          orderBy: [
            { targetDate: "asc" },
            { createdAt: "desc" },
            { id: "desc" },
          ],
          skip,
          take,
          select: goalSelect,
        }),
        prisma.savingsGoal.count({ where }),
      ]);

      return {
        goals: goals.map(toGoalRecord),
        totalItems,
      };
    },

    async findByIdForUser(goalId, userId) {
      const goal = await prisma.savingsGoal.findFirst({
        where: { id: goalId, userId },
        select: goalSelect,
      });

      return goal ? toGoalRecord(goal) : null;
    },

    async updateForUser(goalId, userId, patch) {
      const existing = await prisma.savingsGoal.findFirst({
        where: { id: goalId, userId },
        select: goalSelect,
      });

      if (!existing) {
        return null;
      }

      const data: Record<string, unknown> = {};
      if (patch.name !== undefined) data.name = patch.name;
      if (patch.targetAmount !== undefined) data.targetAmount = patch.targetAmount;
      if (patch.currentAmount !== undefined) data.currentAmount = patch.currentAmount;
      if (patch.targetDate !== undefined) data.targetDate = patch.targetDate;
      if (patch.status !== undefined) data.status = patch.status as SavingsGoalStatus;

      try {
        const updated = await prisma.savingsGoal.update({
          where: { id: goalId },
          data,
          select: goalSelect,
        });

        return toGoalRecord(updated);
      } catch (error) {
        if (isRecordNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },

    async deleteForUser(goalId, userId) {
      const result = await prisma.savingsGoal.deleteMany({
        where: { id: goalId, userId },
      });

      return result.count > 0;
    },
  };
}
