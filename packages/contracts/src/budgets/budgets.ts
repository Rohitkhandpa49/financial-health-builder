import type { ApiSuccessResponse } from "../common/api";
import type { PaginationMetadata } from "../common/pagination";

export const BUDGET_PERIODS = ["WEEKLY", "MONTHLY", "CUSTOM"] as const;
export type BudgetPeriod = typeof BUDGET_PERIODS[number];

export const BUDGET_COLLECTION_ENDPOINT = "/api/v1/budgets";

export interface CreateBudgetRequest {
  name: string;
  categoryId?: string;
  amount: string;
  currency: string;
  period: BudgetPeriod;
  startDate: string;
  endDate: string;
}

export interface UpdateBudgetRequest {
  name?: string;
  categoryId?: string | null;
  amount?: string;
  endDate?: string;
}

export interface BudgetListQuery {
  page?: number;
  pageSize?: number;
  categoryId?: string;
  period?: BudgetPeriod;
}

export interface BudgetResponse {
  id: string;
  name: string;
  categoryId: string | null;
  amount: string;
  currency: string;
  period: BudgetPeriod;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

export type BudgetResponseBody = ApiSuccessResponse<{
  budget: BudgetResponse;
}>;

export type BudgetListResponse = ApiSuccessResponse<{
  budgets: BudgetResponse[];
  pagination: PaginationMetadata;
}>;
