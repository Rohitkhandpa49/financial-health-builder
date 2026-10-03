import type {
  AnalyticsSummary,
  CashFlowData,
  CashFlowPeriod,
  CategorySpending,
  CategoryIncome,
  SpendingData,
  IncomeData,
  BudgetAnalyticsItem,
  BudgetsAnalyticsData,
  GoalAnalyticsItem,
  GoalsAnalyticsData,
} from "../../../../packages/contracts/src/analytics/analytics.js";
import type { AnalyticsRepository, DateRangeFilter } from "./analytics.repository.js";
import type { CategoryRepository } from "../categories/category.repository.js";

// Safe decimal arithmetic using string → integer cents → string
function addDecimals(a: string, b: string): string {
  const scale = 10000;
  const ai = Math.round(parseFloat(a) * scale);
  const bi = Math.round(parseFloat(b) * scale);
  return ((ai + bi) / scale).toFixed(4);
}

function subtractDecimals(a: string, b: string): string {
  const scale = 10000;
  const ai = Math.round(parseFloat(a) * scale);
  const bi = Math.round(parseFloat(b) * scale);
  return ((ai - bi) / scale).toFixed(4);
}

function divideToPercentage(numerator: string, denominator: string): string {
  const d = parseFloat(denominator);
  if (d === 0) return "0.00";
  const n = parseFloat(numerator);
  return ((n / d) * 100).toFixed(2);
}

export function buildDefaultDateRange(): { startDate: Date; endDate: Date } {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { startDate, endDate };
}

export function buildDateRange(startStr?: string, endStr?: string): { startDate: Date; endDate: Date } {
  if (!startStr && !endStr) return buildDefaultDateRange();
  const startDate = startStr ? new Date(`${startStr}T00:00:00.000Z`) : buildDefaultDateRange().startDate;
  const endDate = endStr ? new Date(`${endStr}T23:59:59.999Z`) : buildDefaultDateRange().endDate;
  return { startDate, endDate };
}

function formatDateRange(filter: DateRangeFilter): { startDate: string; endDate: string } {
  return {
    startDate: filter.startDate.toISOString().split("T")[0],
    endDate: filter.endDate.toISOString().split("T")[0],
  };
}

export class AnalyticsService {
  constructor(
    private readonly analytics: AnalyticsRepository,
    private readonly categories: CategoryRepository,
  ) {}

  async getSummary(userId: string, filter: DateRangeFilter): Promise<AnalyticsSummary> {
    const totals = await this.analytics.getTransactionTotals(userId, filter);
    const net = subtractDecimals(totals.totalIncome, totals.totalExpenses);

    // Savings rate = (income - expenses) / income * 100, or null if no income
    let savingsRate: string | null = null;
    if (parseFloat(totals.totalIncome) > 0) {
      savingsRate = divideToPercentage(net, totals.totalIncome);
    }

    return {
      totalIncome: totals.totalIncome,
      totalExpenses: totals.totalExpenses,
      netCashFlow: net,
      transactionCount: totals.transactionCount,
      transferCount: totals.transferCount,
      savingsAmount: net,
      savingsRate,
      dateRange: formatDateRange(filter),
    };
  }

  async getCashFlow(userId: string, filter: DateRangeFilter): Promise<CashFlowData> {
    const rows = await this.analytics.getCashFlowByMonth(userId, filter);

    let totalIncome = "0.0000";
    let totalExpenses = "0.0000";

    const periods: CashFlowPeriod[] = rows.map((row) => {
      totalIncome = addDecimals(totalIncome, row.income);
      totalExpenses = addDecimals(totalExpenses, row.expenses);
      return {
        period: `${row.year}-${String(row.month).padStart(2, "0")}`,
        income: row.income,
        expenses: row.expenses,
        net: subtractDecimals(row.income, row.expenses),
      };
    });

    return {
      periods,
      totalIncome,
      totalExpenses,
      totalNet: subtractDecimals(totalIncome, totalExpenses),
    };
  }

  async getSpending(userId: string, filter: DateRangeFilter): Promise<SpendingData> {
    const [rows, categoryMap] = await Promise.all([
      this.analytics.getCategorySpending(userId, filter),
      this.buildCategoryMap(userId),
    ]);

    let total = "0.0000";
    for (const row of rows) {
      total = addDecimals(total, row.amount);
    }

    const categories: CategorySpending[] = rows.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryId ? (categoryMap.get(row.categoryId) ?? "Unknown") : "Uncategorized",
      amount: row.amount,
      percentage: divideToPercentage(row.amount, total),
      transactionCount: row.transactionCount,
    }));

    return { categories, total };
  }

  async getIncome(userId: string, filter: DateRangeFilter): Promise<IncomeData> {
    const [rows, categoryMap] = await Promise.all([
      this.analytics.getCategoryIncome(userId, filter),
      this.buildCategoryMap(userId),
    ]);

    let total = "0.0000";
    for (const row of rows) {
      total = addDecimals(total, row.amount);
    }

    const categories: CategoryIncome[] = rows.map((row) => ({
      categoryId: row.categoryId,
      categoryName: row.categoryId ? (categoryMap.get(row.categoryId) ?? "Unknown") : "Uncategorized",
      amount: row.amount,
      percentage: divideToPercentage(row.amount, total),
      transactionCount: row.transactionCount,
    }));

    return { categories, total };
  }

  async getBudgetsAnalytics(userId: string): Promise<BudgetsAnalyticsData> {
    const rows = await this.analytics.getBudgetsWithSpending(userId);

    let totalBudgeted = "0.0000";
    let totalSpent = "0.0000";

    const budgets: BudgetAnalyticsItem[] = rows.map((row) => {
      const remaining = subtractDecimals(row.budgetAmount, row.spentAmount);
      const utilization = divideToPercentage(row.spentAmount, row.budgetAmount);
      const overBudget = parseFloat(row.spentAmount) > parseFloat(row.budgetAmount);
      totalBudgeted = addDecimals(totalBudgeted, row.budgetAmount);
      totalSpent = addDecimals(totalSpent, row.spentAmount);
      return {
        budgetId: row.budgetId,
        name: row.name,
        budgetAmount: row.budgetAmount,
        spentAmount: row.spentAmount,
        remainingAmount: remaining,
        utilizationPercentage: utilization,
        overBudget,
        currency: row.currency,
      };
    });

    return { budgets, totalBudgeted, totalSpent };
  }

  async getGoalsAnalytics(userId: string): Promise<GoalsAnalyticsData> {
    const rows = await this.analytics.getGoalsSummary(userId);

    let totalActive = 0;
    let totalCompleted = 0;
    let totalOverdue = 0;
    let totalTarget = "0.0000";
    let totalCurrent = "0.0000";

    const goals: GoalAnalyticsItem[] = rows.map((row) => {
      const remaining = subtractDecimals(row.targetAmount, row.currentAmount);
      const target = parseFloat(row.targetAmount);
      const progressPercentage = target === 0 ? "100.00" : divideToPercentage(row.currentAmount, row.targetAmount);

      if (row.status === "ACTIVE") totalActive++;
      else if (row.status === "COMPLETED") totalCompleted++;
      else if (row.status === "OVERDUE") totalOverdue++;

      totalTarget = addDecimals(totalTarget, row.targetAmount);
      totalCurrent = addDecimals(totalCurrent, row.currentAmount);

      return {
        goalId: row.goalId,
        name: row.name,
        targetAmount: row.targetAmount,
        currentAmount: row.currentAmount,
        remainingAmount: remaining,
        progressPercentage,
        status: row.status,
        currency: row.currency,
      };
    });

    return {
      goals,
      totalActiveGoals: totalActive,
      totalCompletedGoals: totalCompleted,
      totalOverdueGoals: totalOverdue,
      totalTargetAmount: totalTarget,
      totalCurrentAmount: totalCurrent,
    };
  }

  private async buildCategoryMap(userId: string): Promise<Map<string, string>> {
    const result = await this.categories.listForUser(userId, {
      page: 1,
      pageSize: 1000,
      archived: false,
    });
    const map = new Map<string, string>();
    for (const cat of result.categories) map.set(cat.id, cat.name);
    return map;
  }
}
