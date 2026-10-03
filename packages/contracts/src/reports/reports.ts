import type { ApiSuccessResponse } from "../common/api";
import type { CashFlowPeriod, CategorySpending, BudgetAnalyticsItem, GoalAnalyticsItem } from "../analytics/analytics";

// Shared date range shape used across all report types
export interface ReportDateRange {
  startDate: string;
  endDate: string;
}

// --- Monthly Report ---

export interface MonthlyReport {
  year: number;
  month: number;
  totalIncome: string;
  totalExpenses: string;
  netCashFlow: string;
  savingsRate: string | null;
  transactionCount: number;
  transferCount: number;
  topSpendingCategories: CategorySpending[];
  budgets: BudgetAnalyticsItem[];
  dateRange: ReportDateRange;
}

export type MonthlyReportResponse = ApiSuccessResponse<{ report: MonthlyReport }>;

// --- Yearly Report ---

export interface YearlyReport {
  year: number;
  totalIncome: string;
  totalExpenses: string;
  netCashFlow: string;
  savingsRate: string | null;
  transactionCount: number;
  transferCount: number;
  monthlyBreakdown: CashFlowPeriod[];
  topSpendingCategories: CategorySpending[];
  goals: GoalAnalyticsItem[];
  dateRange: ReportDateRange;
}

export type YearlyReportResponse = ApiSuccessResponse<{ report: YearlyReport }>;

// --- Category Spending Report ---

export interface CategorySpendingReport {
  categories: CategorySpending[];
  totalSpent: string;
  dateRange: ReportDateRange;
}

export type CategorySpendingReportResponse = ApiSuccessResponse<{ report: CategorySpendingReport }>;

// --- Account Summary Report ---

export interface AccountActivitySummary {
  accountId: string;
  accountName: string;
  currency: string;
  openingBalance: string;
  totalIncome: string;
  totalExpenses: string;
  netActivity: string;
  transactionCount: number;
}

export interface AccountSummaryReport {
  accounts: AccountActivitySummary[];
  dateRange: ReportDateRange;
}

export type AccountSummaryReportResponse = ApiSuccessResponse<{ report: AccountSummaryReport }>;

// --- Cash Flow Report ---

export interface CashFlowReport {
  periods: CashFlowPeriod[];
  totalIncome: string;
  totalExpenses: string;
  totalNet: string;
  trend: "improving" | "declining" | "stable" | "insufficient_data";
  dateRange: ReportDateRange;
}

export type CashFlowReportResponse = ApiSuccessResponse<{ report: CashFlowReport }>;

// --- Insights Report ---

export interface FinancialInsight {
  type: "positive" | "warning" | "neutral" | "info";
  category: string;
  title: string;
  message: string;
  priority: number; // 1 = highest
}

export interface InsightsReport {
  insights: FinancialInsight[];
  generatedAt: string;
  dateRange: ReportDateRange;
}

export type InsightsReportResponse = ApiSuccessResponse<{ report: InsightsReport }>;
