import type {
  MonthlyReport,
  YearlyReport,
  CategorySpendingReport,
  AccountSummaryReport,
  CashFlowReport,
  InsightsReport,
  FinancialInsight,
  AccountActivitySummary,
} from "../../../../packages/contracts/src/reports/reports.js";
import type { AnalyticsService } from "../analytics/analytics.service.js";
import { buildDateRange } from "../analytics/analytics.service.js";
import type { DateRangeFilter } from "../analytics/analytics.repository.js";
import type { ReportRepository } from "./report.repository.js";

// Re-export for convenience
export type { DateRangeFilter };

// Decimal arithmetic helpers (same as analytics)
function addDecimals(a: string, b: string): string {
  const scale = 10000;
  return ((Math.round(parseFloat(a) * scale) + Math.round(parseFloat(b) * scale)) / scale).toFixed(4);
}

function subtractDecimals(a: string, b: string): string {
  const scale = 10000;
  return ((Math.round(parseFloat(a) * scale) - Math.round(parseFloat(b) * scale)) / scale).toFixed(4);
}

function divideToPercentage(numerator: string, denominator: string): string {
  const d = parseFloat(denominator);
  if (d === 0) return "0.00";
  return ((parseFloat(numerator) / d) * 100).toFixed(2);
}

function formatDateRange(filter: DateRangeFilter): { startDate: string; endDate: string } {
  return {
    startDate: filter.startDate.toISOString().split("T")[0],
    endDate: filter.endDate.toISOString().split("T")[0],
  };
}

function buildMonthFilter(year: number, month: number): DateRangeFilter {
  return {
    startDate: new Date(year, month - 1, 1),
    endDate: new Date(year, month, 0, 23, 59, 59, 999),
  };
}

function buildYearFilter(year: number): DateRangeFilter {
  return {
    startDate: new Date(year, 0, 1),
    endDate: new Date(year, 11, 31, 23, 59, 59, 999),
  };
}

// Previous period: same duration, ending the day before startDate
function buildPreviousPeriodFilter(filter: DateRangeFilter): DateRangeFilter {
  const duration = filter.endDate.getTime() - filter.startDate.getTime();
  const endDate = new Date(filter.startDate.getTime() - 1);
  const startDate = new Date(endDate.getTime() - duration);
  return { startDate, endDate };
}

// Cash-flow trend: compare last two periods
function detectTrend(periods: Array<{ net: string }>): "improving" | "declining" | "stable" | "insufficient_data" {
  if (periods.length < 2) return "insufficient_data";
  const last = parseFloat(periods[periods.length - 1].net);
  const prev = parseFloat(periods[periods.length - 2].net);
  const diff = last - prev;
  if (Math.abs(diff) < 0.01) return "stable";
  return diff > 0 ? "improving" : "declining";
}

export class ReportService {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly reports: ReportRepository,
  ) {}

  async getMonthlyReport(userId: string, year: number, month: number): Promise<MonthlyReport> {
    const filter = buildMonthFilter(year, month);
    const [summary, spending, budgets] = await Promise.all([
      this.analytics.getSummary(userId, filter),
      this.analytics.getSpending(userId, filter),
      this.analytics.getBudgetsAnalytics(userId),
    ]);

    return {
      year,
      month,
      totalIncome: summary.totalIncome,
      totalExpenses: summary.totalExpenses,
      netCashFlow: summary.netCashFlow,
      savingsRate: summary.savingsRate,
      transactionCount: summary.transactionCount,
      transferCount: summary.transferCount,
      topSpendingCategories: spending.categories.slice(0, 5),
      budgets: budgets.budgets,
      dateRange: formatDateRange(filter),
    };
  }

  async getYearlyReport(userId: string, year: number): Promise<YearlyReport> {
    const filter = buildYearFilter(year);
    const [summary, cashFlow, spending, goals] = await Promise.all([
      this.analytics.getSummary(userId, filter),
      this.analytics.getCashFlow(userId, filter),
      this.analytics.getSpending(userId, filter),
      this.analytics.getGoalsAnalytics(userId),
    ]);

    return {
      year,
      totalIncome: summary.totalIncome,
      totalExpenses: summary.totalExpenses,
      netCashFlow: summary.netCashFlow,
      savingsRate: summary.savingsRate,
      transactionCount: summary.transactionCount,
      transferCount: summary.transferCount,
      monthlyBreakdown: cashFlow.periods,
      topSpendingCategories: spending.categories.slice(0, 10),
      goals: goals.goals,
      dateRange: formatDateRange(filter),
    };
  }

  async getCategorySpendingReport(userId: string, filter: DateRangeFilter): Promise<CategorySpendingReport> {
    const spending = await this.analytics.getSpending(userId, filter);
    return {
      categories: spending.categories,
      totalSpent: spending.total,
      dateRange: formatDateRange(filter),
    };
  }

  async getAccountSummaryReport(userId: string, filter: DateRangeFilter): Promise<AccountSummaryReport> {
    const rows = await this.reports.getAccountActivity(userId, filter);

    const accounts: AccountActivitySummary[] = rows.map((row) => ({
      accountId: row.accountId,
      accountName: row.accountName,
      currency: row.currency,
      openingBalance: row.openingBalance,
      totalIncome: row.totalIncome,
      totalExpenses: row.totalExpenses,
      netActivity: subtractDecimals(row.totalIncome, row.totalExpenses),
      transactionCount: row.transactionCount,
    }));

    return { accounts, dateRange: formatDateRange(filter) };
  }

  async getCashFlowReport(userId: string, filter: DateRangeFilter): Promise<CashFlowReport> {
    const cashFlow = await this.analytics.getCashFlow(userId, filter);
    return {
      periods: cashFlow.periods,
      totalIncome: cashFlow.totalIncome,
      totalExpenses: cashFlow.totalExpenses,
      totalNet: cashFlow.totalNet,
      trend: detectTrend(cashFlow.periods),
      dateRange: formatDateRange(filter),
    };
  }

  async getInsights(userId: string, filter: DateRangeFilter): Promise<InsightsReport> {
    const prevFilter = buildPreviousPeriodFilter(filter);

    const [summary, prevSummary, spending, budgets, goals, cashFlow] = await Promise.all([
      this.analytics.getSummary(userId, filter),
      this.analytics.getSummary(userId, prevFilter),
      this.analytics.getSpending(userId, filter),
      this.analytics.getBudgetsAnalytics(userId),
      this.analytics.getGoalsAnalytics(userId),
      this.analytics.getCashFlow(userId, filter),
    ]);

    const insights: FinancialInsight[] = [];

    // 1. Cash flow direction
    const net = parseFloat(summary.netCashFlow);
    const prevNet = parseFloat(prevSummary.netCashFlow);
    if (net < 0) {
      insights.push({
        type: "warning", category: "Cash Flow", priority: 1,
        title: "Expenses exceed income",
        message: `Your expenses (${summary.totalExpenses}) exceeded your income (${summary.totalIncome}) this period.`,
      });
    } else if (net > 0 && prevNet <= 0) {
      insights.push({
        type: "positive", category: "Cash Flow", priority: 2,
        title: "Cash flow turned positive",
        message: "Your net cash flow improved from negative to positive compared to the previous period.",
      });
    } else if (net > 0) {
      insights.push({
        type: "positive", category: "Cash Flow", priority: 4,
        title: "Positive cash flow",
        message: `You had a positive net cash flow of ${summary.netCashFlow} this period.`,
      });
    }

    // 2. Spending change vs previous period
    const currentExpenses = parseFloat(summary.totalExpenses);
    const prevExpenses = parseFloat(prevSummary.totalExpenses);
    if (prevExpenses > 0 && currentExpenses > 0) {
      const changePercent = ((currentExpenses - prevExpenses) / prevExpenses) * 100;
      if (changePercent > 20) {
        insights.push({
          type: "warning", category: "Spending", priority: 2,
          title: "Spending increased significantly",
          message: `Your expenses increased by ${changePercent.toFixed(1)}% compared to the previous period.`,
        });
      } else if (changePercent < -15) {
        insights.push({
          type: "positive", category: "Spending", priority: 3,
          title: "Spending decreased",
          message: `Your expenses decreased by ${Math.abs(changePercent).toFixed(1)}% compared to the previous period.`,
        });
      }
    }

    // 3. Savings rate
    if (summary.savingsRate !== null) {
      const rate = parseFloat(summary.savingsRate);
      if (rate < 0) {
        insights.push({
          type: "warning", category: "Savings", priority: 1,
          title: "Negative savings rate",
          message: "You are spending more than you earn. Review your expenses.",
        });
      } else if (rate < 10) {
        insights.push({
          type: "warning", category: "Savings", priority: 3,
          title: "Low savings rate",
          message: `Your savings rate is ${rate.toFixed(1)}%. Aim for at least 20%.`,
        });
      } else if (rate >= 20) {
        insights.push({
          type: "positive", category: "Savings", priority: 4,
          title: "Healthy savings rate",
          message: `Your savings rate of ${rate.toFixed(1)}% is above the recommended 20%.`,
        });
      }
    } else {
      insights.push({
        type: "neutral", category: "Savings", priority: 5,
        title: "No income recorded",
        message: "Add income transactions to track your savings rate.",
      });
    }

    // 4. Budget alerts
    for (const budget of budgets.budgets) {
      const util = parseFloat(budget.utilizationPercentage);
      if (budget.overBudget) {
        insights.push({
          type: "warning", category: "Budget", priority: 2,
          title: `Over budget: ${budget.name}`,
          message: `"${budget.name}" is ${util.toFixed(1)}% utilized — you have exceeded the budget limit.`,
        });
      } else if (util > 80) {
        insights.push({
          type: "warning", category: "Budget", priority: 3,
          title: `Budget nearing limit: ${budget.name}`,
          message: `"${budget.name}" is ${util.toFixed(1)}% utilized. You are close to the limit.`,
        });
      }
    }
    if (budgets.budgets.length === 0) {
      insights.push({
        type: "neutral", category: "Budget", priority: 5,
        title: "No budgets set",
        message: "Create budgets to track your spending limits.",
      });
    }

    // 5. High category concentration
    if (spending.categories.length > 0) {
      const top = spending.categories[0];
      const topPercent = parseFloat(top.percentage);
      if (topPercent > 50 && parseFloat(spending.total) > 0) {
        insights.push({
          type: "info", category: "Spending", priority: 4,
          title: "High spending concentration",
          message: `"${top.categoryName}" accounts for ${topPercent.toFixed(1)}% of total expenses this period.`,
        });
      }
    }

    // 6. Goal progress
    if (goals.totalActiveGoals > 0) {
      const totalTarget = parseFloat(goals.totalTargetAmount);
      const totalCurrent = parseFloat(goals.totalCurrentAmount);
      if (totalTarget > 0) {
        const overallProgress = (totalCurrent / totalTarget) * 100;
        if (overallProgress < 10) {
          insights.push({
            type: "warning", category: "Goals", priority: 3,
            title: "Goals progressing slowly",
            message: `Overall savings goal progress is ${overallProgress.toFixed(1)}%. Keep contributing to reach your targets.`,
          });
        } else if (overallProgress >= 75) {
          insights.push({
            type: "positive", category: "Goals", priority: 4,
            title: "Strong goal progress",
            message: `Overall savings goal progress is ${overallProgress.toFixed(1)}% — well on track!`,
          });
        }
      }
    } else {
      insights.push({
        type: "neutral", category: "Goals", priority: 5,
        title: "No active savings goals",
        message: "Set savings goals to build your financial future.",
      });
    }

    // 7. Cash flow trend
    const trend = detectTrend(cashFlow.periods);
    if (trend === "improving" && cashFlow.periods.length >= 2) {
      insights.push({
        type: "positive", category: "Trend", priority: 4,
        title: "Improving cash flow trend",
        message: "Your net cash flow has improved compared to the previous month.",
      });
    } else if (trend === "declining" && cashFlow.periods.length >= 2) {
      insights.push({
        type: "warning", category: "Trend", priority: 3,
        title: "Declining cash flow trend",
        message: "Your net cash flow has declined compared to the previous month.",
      });
    }

    // Sort by priority ascending (lower = more important)
    insights.sort((a, b) => a.priority - b.priority);

    return {
      insights,
      generatedAt: new Date().toISOString(),
      dateRange: formatDateRange(filter),
    };
  }
}

// Helper for routes
export function buildMonthFilterFromParams(year: number, month: number): DateRangeFilter {
  return {
    startDate: new Date(year, month - 1, 1),
    endDate: new Date(year, month, 0, 23, 59, 59, 999),
  };
}

export function buildYearFilterFromParams(year: number): DateRangeFilter {
  return {
    startDate: new Date(year, 0, 1),
    endDate: new Date(year, 11, 31, 23, 59, 59, 999),
  };
}
