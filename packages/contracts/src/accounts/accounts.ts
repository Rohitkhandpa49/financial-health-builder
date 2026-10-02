import type { ApiSuccessResponse } from "../common/api";
import type { PaginationMetadata } from "../common/pagination";

export const ACCOUNT_TYPES = ["BANK", "CASH", "SAVINGS", "CREDIT", "OTHER"] as const;
export type AccountType = typeof ACCOUNT_TYPES[number];

export const ACCOUNT_COLLECTION_ENDPOINT = "/api/v1/accounts";

export interface CreateAccountRequest {
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: string;
}

export interface UpdateAccountRequest {
  name: string;
}

export interface AccountListQuery {
  page?: number;
  pageSize?: number;
  archived?: boolean;
}

export interface AccountResponse {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AccountResponseBody = ApiSuccessResponse<{
  account: AccountResponse;
}>;

export type AccountListResponse = ApiSuccessResponse<{
  accounts: AccountResponse[];
  pagination: PaginationMetadata;
}>;