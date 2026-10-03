import type { ApiSuccessResponse } from "../common/api";
import type { PaginationMetadata } from "../common/pagination";

export const TRANSFER_COLLECTION_ENDPOINT = "/api/v1/transfers";

export interface CreateTransferRequest {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  description: string;
  effectiveAt: string; // ISO 8601 datetime with offset
}

export interface TransferSideResponse {
  transactionId: string;
  accountId: string;
  direction: "OUTGOING" | "INCOMING";
  amount: string;
  currency: string;
}

export interface TransferResponse {
  transferGroupId: string;
  amount: string;
  description: string;
  effectiveAt: string;
  outgoing: TransferSideResponse;
  incoming: TransferSideResponse;
  createdAt: string;
}

export type TransferResponseBody = ApiSuccessResponse<{
  transfer: TransferResponse;
}>;

export interface TransferListQuery {
  page?: number;
  pageSize?: number;
  accountId?: string;
}

export type TransferListResponse = ApiSuccessResponse<{
  transfers: TransferResponse[];
  pagination: PaginationMetadata;
}>;
