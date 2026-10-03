import type { ApiSuccessResponse } from "../common/api";
import type { PaginationMetadata } from "../common/pagination";

export const GOAL_STATUSES = ["ACTIVE", "COMPLETED", "OVERDUE", "ARCHIVED"] as const;
export type GoalStatus = typeof GOAL_STATUSES[number];

export const GOAL_COLLECTION_ENDPOINT = "/api/v1/goals";

export interface CreateGoalRequest {
  name: string;
  targetAmount: string;
  currentAmount?: string;
  currency: string;
  targetDate: string; // YYYY-MM-DD
  status?: GoalStatus;
}

export interface UpdateGoalRequest {
  name?: string;
  targetAmount?: string;
  currentAmount?: string;
  targetDate?: string;
  status?: GoalStatus;
}

export interface GoalListQuery {
  page?: number;
  pageSize?: number;
  status?: GoalStatus;
}

export interface GoalResponse {
  id: string;
  name: string;
  targetAmount: string;
  currentAmount: string;
  currency: string;
  targetDate: string; // YYYY-MM-DD
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
  // NO userId field
}

export type GoalResponseBody = ApiSuccessResponse<{
  goal: GoalResponse;
}>;

export type GoalListResponse = ApiSuccessResponse<{
  goals: GoalResponse[];
  pagination: PaginationMetadata;
}>;
