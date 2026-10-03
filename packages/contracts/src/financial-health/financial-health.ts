import type { ApiSuccessResponse } from "../common/api";
import type { AnalyticsDateRangeQuery } from "../analytics/analytics";

export interface HealthComponent {
  score: number;       // 0–100
  weight: number;      // contribution weight (0–1)
  label: string;
  explanation: string;
}

export interface HealthComponents {
  savingsRate: HealthComponent;
  budgetAdherence: HealthComponent;
  goalProgress: HealthComponent;
  cashFlowHealth: HealthComponent;
  spendingStability: HealthComponent;
}

export interface HealthMetrics {
  savingsRate: string | null;
  netCashFlow: string;
  totalIncome: string;
  totalExpenses: string;
  budgetUtilization: string | null;
  goalProgressPercentage: string | null;
  activeGoalCount: number;
  hasSufficientData: boolean;
}

export interface HealthInsight {
  type: "positive" | "warning" | "neutral";
  category: string;
  message: string;
}

export interface FinancialHealthResponse {
  overallScore: number;
  components: HealthComponents;
  metrics: HealthMetrics;
  insights: HealthInsight[];
  dateRange: { startDate: string; endDate: string };
  disclaimer: string;
}

export type FinancialHealthApiResponse = ApiSuccessResponse<{
  financialHealth: FinancialHealthResponse;
}>;

export type { AnalyticsDateRangeQuery };
