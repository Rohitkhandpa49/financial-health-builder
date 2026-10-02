import type { ApiSuccessResponse } from "../common/api";
import type { PaginationMetadata } from "../common/pagination";

export const CATEGORY_TYPES = ["INCOME", "EXPENSE"] as const;
export type CategoryType = typeof CATEGORY_TYPES[number];

export const CATEGORY_COLLECTION_ENDPOINT = "/api/v1/categories";

export interface CreateCategoryRequest {
  name: string;
  type: CategoryType;
}

export interface UpdateCategoryRequest {
  name: string;
}

export interface CategoryListQuery {
  page?: number;
  pageSize?: number;
  archived?: boolean;
  type?: CategoryType;
}

export interface CategoryResponse {
  id: string;
  name: string;
  type: CategoryType;
  systemDefined: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CategoryResponseBody = ApiSuccessResponse<{
  category: CategoryResponse;
}>;

export type CategoryListResponse = ApiSuccessResponse<{
  categories: CategoryResponse[];
  pagination: PaginationMetadata;
}>;
