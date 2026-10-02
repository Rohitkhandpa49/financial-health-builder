import type { ApiSuccessResponse } from "../common/api";
import type { PaginationMetadata } from "../common/pagination";

export const TRANSACTION_TYPES = ["INCOME", "EXPENSE"] as const;
export type TransactionType = typeof TRANSACTION_TYPES[number];

export const TRANSACTION_COLLECTION_ENDPOINT = "/api/v1/transactions";

export interface CreateTransactionRequest {
  accountId: string;
  categoryId?: string | null;
  type: TransactionType;
  amount: string;
  description: string;
  effectiveAt: string;
}

export interface UpdateTransactionRequest {
  categoryId?: string | null;
  type?: TransactionType;
  amount?: string;
  description?: string;
  effectiveAt?: string;
}

export interface TransactionListQuery {
  page?: number;
  pageSize?: number;
  accountId?: string;
  type?: TransactionType;
}

export interface TransactionResponse {
  id: string;
  accountId: string;
  categoryId: string | null;
  type: string;
  amount: string;
  currency: string;
  description: string;
  effectiveAt: string;
  createdAt: string;
  updatedAt: string;
}

export type TransactionResponseBody = ApiSuccessResponse<{
  transaction: TransactionResponse;
}>;

export type TransactionListResponse = ApiSuccessResponse<{
  transactions: TransactionResponse[];
  pagination: PaginationMetadata;
}>;
