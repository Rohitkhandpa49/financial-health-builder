import type { PrismaClient } from "../../../../database/prisma/generated/client/client.js";

export interface DateRangeFilter {
  startDate: Date;
  endDate: Date;
}

export interface TransactionTotals {
  totalIncome: string;   // toFixed(4)
  totalExpenses: string; // toFixed(4)
  transactionCount: number;
  transferCount: number;
}

export interface CategorySpendingRow {
  categoryId: string | null;
  amount: string; // toFixed(4)
  transactionCount: number;
}

export interface CategoryIncomeRow {
  categoryId: string | null;
  amount: string; // toFixed(4)
  transactionCount: number;
}

export interface CashFlowRow {
  year: number;
  month: number;
  income: string;   // toFixed(4)
  expenses: string; // toFixed(4)
}

export interface BudgetWithSpending {
  budgetId: string;
  name: string;
  budgetAmount: string; // toFixed(4)
  currency: string;
  categoryId: string | null;
  startDate: Date;
  endDate: Date;
  spentAmount: string;  // toFixed(4)
}

export interface GoalSummaryRow {
  goalId: string;
  name: string;
  targetAmount: string;  // toFixed(4)
  currentAmount: string; // toFixed(4)
  status: string;
  currency: string;
}

export interface AnalyticsRepository {
  getTransactionTotals(userId: string, filter: DateRangeFilter): Promise<TransactionTotals>;
  getCategorySpending(userId: string, filter: DateRangeFilter): Promise<CategorySpendingRow[]>;
  getCategoryIncome(userId: string, filter: DateRangeFilter): Promise<CategoryIncomeRow[]>;
  getCashFlowByMonth(userId: string, filter: DateRangeFilter): Promise<CashFlowRow[]>;
  getBudgetsWithSpending(userId: string): Promise<BudgetWithSpending[]>;
  getGoalsSummary(userId: string): Promise<GoalSummaryRow[]>;
}

// Decimal helper — converts Prisma Decimal aggregation result to fixed-4 string
function decimalToString(value: unknown): string {
  if (value === null || value === undefined) return "0.0000";
  if (typeof value === "object" && value !== null && "toFixed" in value) {
    return (value as { toFixed: (n: number) => string }).toFixed(4);
  }
  if (typeof value === "string") {
    const n = parseFloat(value);
    return isNaN(n) ? "0.0000" : n.toFixed(4);
  }
  if (typeof value === "number") {
    return value.toFixed(4);
  }
  return "0.0000";
}

export function createPrismaAnalyticsRepository(prisma: PrismaClient): AnalyticsRepository {
  return {
    async getTransactionTotals(userId, filter) {
      const [incomeAgg, expenseAgg, incomeCount, expenseCount, transferCount] = await prisma.$transaction([
        prisma.transaction.aggregate({
          where: {
            userId,
            type: "INCOME",
            effectiveAt: { gte: filter.startDate, lte: filter.endDate },
          },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: {
            userId,
            type: "EXPENSE",
            effectiveAt: { gte: filter.startDate, lte: filter.endDate },
          },
          _sum: { amount: true },
        }),
        prisma.transaction.count({
          where: {
            userId,
            type: "INCOME",
            effectiveAt: { gte: filter.startDate, lte: filter.endDate },
          },
        }),
        prisma.transaction.count({
          where: {
            userId,
            type: "EXPENSE",
            effectiveAt: { gte: filter.startDate, lte: filter.endDate },
          },
        }),
        prisma.transaction.count({
          where: {
            userId,
            type: "TRANSFER",
            effectiveAt: { gte: filter.startDate, lte: filter.endDate },
          },
        }),
      ]);

      return {
        totalIncome: decimalToString(incomeAgg._sum.amount),
        totalExpenses: decimalToString(expenseAgg._sum.amount),
        transactionCount: incomeCount + expenseCount,
        transferCount,
      };
    },

    async getCategorySpending(userId, filter) {
      const groups = await prisma.transaction.groupBy({
        by: ["categoryId"],
        where: {
          userId,
          type: "EXPENSE",
          effectiveAt: { gte: filter.startDate, lte: filter.endDate },
        },
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { _sum: { amount: "desc" } },
      });

      return groups.map((g: { categoryId: string | null; _sum: { amount: unknown }; _count: { id: number } }) => ({
        categoryId: g.categoryId,
        amount: decimalToString(g._sum.amount),
        transactionCount: g._count.id,
      }));
    },

    async getCategoryIncome(userId, filter) {
      const groups = await prisma.transaction.groupBy({
        by: ["categoryId"],
        where: {
          userId,
          type: "INCOME",
          effectiveAt: { gte: filter.startDate, lte: filter.endDate },
        },
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { _sum: { amount: "desc" } },
      });

      return groups.map((g: { categoryId: string | null; _sum: { amount: unknown }; _count: { id: number } }) => ({
        categoryId: g.categoryId,
        amount: decimalToString(g._sum.amount),
        transactionCount: g._count.id,
      }));
    },

    async getCashFlowByMonth(userId, filter) {
      // Fetch all INCOME and EXPENSE transactions in range — grouped in JS by month
      // Prisma does not support date_trunc groupBy in a cross-DB way, so we pull
      // per-month sums using two parallel aggregations per month via raw groupBy on
      // the effectiveAt truncated. We use a small in-memory grouping for safety.
      const transactions = await prisma.transaction.findMany({
        where: {
          userId,
          type: { in: ["INCOME", "EXPENSE"] },
          effectiveAt: { gte: filter.startDate, lte: filter.endDate },
        },
        select: {
          type: true,
          amount: true,
          effectiveAt: true,
        },
      });

      // Group by YYYY-MM
      const byMonth = new Map<string, { income: number; expenses: number }>();
      for (const tx of transactions) {
        const d = tx.effectiveAt;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!byMonth.has(key)) byMonth.set(key, { income: 0, expenses: 0 });
        const entry = byMonth.get(key)!;
        const amount = parseFloat(decimalToString(tx.amount));
        if (tx.type === "INCOME") entry.income += amount;
        else entry.expenses += amount;
      }

      return [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, { income, expenses }]) => {
          const [yearStr, monthStr] = key.split("-");
          return {
            year: parseInt(yearStr, 10),
            month: parseInt(monthStr, 10),
            income: income.toFixed(4),
            expenses: expenses.toFixed(4),
          };
        });
    },

    async getBudgetsWithSpending(userId) {
      const budgets = await prisma.budget.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          amount: true,
          currency: true,
          categoryId: true,
          startDate: true,
          endDate: true,
        },
      });

      const result: BudgetWithSpending[] = [];
      for (const budget of budgets) {
        const where: Record<string, unknown> = {
          userId,
          type: "EXPENSE",
          effectiveAt: { gte: budget.startDate, lte: budget.endDate },
          currency: budget.currency,
        };
        if (budget.categoryId) where.categoryId = budget.categoryId;

        const agg = await prisma.transaction.aggregate({
          where,
          _sum: { amount: true },
        });

        result.push({
          budgetId: budget.id,
          name: budget.name,
          budgetAmount: decimalToString(budget.amount),
          currency: budget.currency,
          categoryId: budget.categoryId,
          startDate: budget.startDate,
          endDate: budget.endDate,
          spentAmount: decimalToString(agg._sum.amount),
        });
      }

      return result;
    },

    async getGoalsSummary(userId) {
      const goals = await prisma.savingsGoal.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          targetAmount: true,
          currentAmount: true,
          status: true,
          currency: true,
        },
      });

      return goals.map((g: { id: string; name: string; targetAmount: unknown; currentAmount: unknown; status: string; currency: string }) => ({
        goalId: g.id,
        name: g.name,
        targetAmount: decimalToString(g.targetAmount),
        currentAmount: decimalToString(g.currentAmount),
        status: g.status,
        currency: g.currency,
      }));
    },
  };
}
