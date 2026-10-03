import type { ApiSuccessResponse } from "../common/api";

export interface AnalyticsDateRangeQuery {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

// --- Summary ---

export interface AnalyticsSummary {
  totalIncome: string;
  totalExpenses: string;
  netCashFlow: string;
  transactionCount: number;
  transferCount: number;
  savingsAmount: string;
  savingsRate: string | null;
  dateRange: { startDate: string; endDate: string };
}

export type AnalyticsSummaryResponse = ApiSuccessResponse<{ summary: AnalyticsSummary }>;

// --- Cash Flow ---

export interface CashFlowPeriod {
  period: string; // YYYY-MM
  income: string;
  expenses: string;
  net: string;
}

export interface CashFlowData {
  periods: CashFlowPeriod[];
  totalIncome: string;
  totalExpenses: string;
  totalNet: string;
}

export type CashFlowResponse = ApiSuccessResponse<{ cashFlow: CashFlowData }>;

// --- Spending by Category ---

export interface CategorySpending {
  categoryId: string | null;
  categoryName: string;
  amount: string;
  percentage: string;
  transactionCount: number;
}

export interface SpendingData {
  categories: CategorySpending[];
  total: string;
}

export type SpendingResponse = ApiSuccessResponse<{ spending: SpendingData }>;

// --- Income by Category ---

export interface CategoryIncome {
  categoryId: string | null;
  categoryName: string;
  amount: string;
  percentage: string;
  transactionCount: number;
}

export interface IncomeData {
  categories: CategoryIncome[];
  total: string;
}

export type IncomeResponse = ApiSuccessResponse<{ income: IncomeData }>;

// --- Budget Analytics ---

export interface BudgetAnalyticsItem {
  budgetId: string;
  name: string;
  budgetAmount: string;
  spentAmount: string;
  remainingAmount: string;
  utilizationPercentage: string;
  overBudget: boolean;
  currency: string;
}

export interface BudgetsAnalyticsData {
  budgets: BudgetAnalyticsItem[];
  totalBudgeted: string;
  totalSpent: string;
}

export type BudgetsAnalyticsResponse = ApiSuccessResponse<{ budgetsAnalytics: BudgetsAnalyticsData }>;

// --- Goal Analytics ---

export interface GoalAnalyticsItem {
  goalId: string;
  name: string;
  targetAmount: string;
  currentAmount: string;
  remainingAmount: string;
  progressPercentage: string;
  status: string;
  currency: string;
}

export interface GoalsAnalyticsData {
  goals: GoalAnalyticsItem[];
  totalActiveGoals: number;
  totalCompletedGoals: number;
  totalOverdueGoals: number;
  totalTargetAmount: string;
  totalCurrentAmount: string;
}

export type GoalsAnalyticsResponse = ApiSuccessResponse<{ goalsAnalytics: GoalsAnalyticsData }>;
