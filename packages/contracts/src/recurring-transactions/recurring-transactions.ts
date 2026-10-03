import type { ApiSuccessResponse } from "../common/api";
import type { PaginationMetadata } from "../common/pagination";

export const RECURRENCE_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export type RecurrenceFrequency = typeof RECURRENCE_FREQUENCIES[number];

export const RECURRING_TRANSACTION_TYPES = ["INCOME", "EXPENSE"] as const;
export type RecurringTransactionType = typeof RECURRING_TRANSACTION_TYPES[number];

export const RECURRING_TRANSACTION_COLLECTION_ENDPOINT = "/api/v1/recurring-transactions";

export interface CreateRecurringTransactionRequest {
  accountId: string;
  categoryId?: string;
  type: RecurringTransactionType;
  amount: string;
  description: string;
  frequency: RecurrenceFrequency;
  startDate: string;   // YYYY-MM-DD
  endDate?: string;    // YYYY-MM-DD optional
  nextDate: string;    // YYYY-MM-DD
}

export interface UpdateRecurringTransactionRequest {
  categoryId?: string | null;
  amount?: string;
  description?: string;
  endDate?: string | null;
  nextDate?: string;
  active?: boolean;
}

export interface RecurringTransactionListQuery {
  page?: number;
  pageSize?: number;
  accountId?: string;
  active?: boolean;
}

export interface RecurringTransactionResponse {
  id: string;
  accountId: string;
  categoryId: string | null;
  type: RecurringTransactionType;
  amount: string;
  currency: string;
  description: string;
  frequency: RecurrenceFrequency;
  startDate: string;
  endDate: string | null;
  nextDate: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RecurringTransactionResponseBody = ApiSuccessResponse<{
  recurringTransaction: RecurringTransactionResponse;
}>;

export type RecurringTransactionListResponse = ApiSuccessResponse<{
  recurringTransactions: RecurringTransactionResponse[];
  pagination: PaginationMetadata;
}>;
