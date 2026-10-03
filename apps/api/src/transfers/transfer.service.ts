import type {
  CreateTransferRequest,
  TransferListQuery,
  TransferListResponse,
  TransferResponse,
} from "../../../../packages/contracts/src/transfers/transfers.js";
import { HttpError } from "../http/errors.js";
import type { AccountRepository } from "../accounts/account.repository.js";
import type { TransferRepository } from "./transfer.repository.js";
import { toTransferResponse } from "./transfer.repository.js";

export class TransferService {
  constructor(
    private readonly transfers: TransferRepository,
    private readonly accounts: AccountRepository,
  ) {}

  async create(userId: string, input: CreateTransferRequest): Promise<TransferResponse> {
    const sourceAccount = await this.accounts.findByIdForUser(input.sourceAccountId, userId);
    if (!sourceAccount) {
      throw new HttpError({
        statusCode: 400,
        code: "TRANSFER_INVALID_SOURCE",
        message: "The source account does not exist or does not belong to you.",
      });
    }

    const destinationAccount = await this.accounts.findByIdForUser(input.destinationAccountId, userId);
    if (!destinationAccount) {
      throw new HttpError({
        statusCode: 400,
        code: "TRANSFER_INVALID_DESTINATION",
        message: "The destination account does not exist or does not belong to you.",
      });
    }

    if (input.sourceAccountId === input.destinationAccountId) {
      throw new HttpError({
        statusCode: 400,
        code: "TRANSFER_SAME_ACCOUNT",
        message: "Source and destination accounts must be different.",
      });
    }

    if (sourceAccount.currency !== destinationAccount.currency) {
      throw new HttpError({
        statusCode: 400,
        code: "TRANSFER_CURRENCY_MISMATCH",
        message: "Source and destination accounts must have the same currency.",
      });
    }

    const pair = await this.transfers.createTransfer(userId, {
      sourceAccountId: input.sourceAccountId,
      destinationAccountId: input.destinationAccountId,
      sourceCurrency: sourceAccount.currency,
      destinationCurrency: destinationAccount.currency,
      amount: input.amount,
      description: input.description,
      effectiveAt: new Date(input.effectiveAt),
    });

    return toTransferResponse(pair);
  }

  async list(userId: string, query: TransferListQuery): Promise<TransferListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const result = await this.transfers.listForUser(userId, {
      page,
      pageSize,
      accountId: query.accountId,
    });

    return {
      transfers: result.transfers.map(toTransferResponse),
      pagination: {
        page,
        pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / pageSize),
      },
    };
  }

  async get(transferGroupId: string, userId: string): Promise<TransferResponse> {
    const pair = await this.transfers.findByGroupId(transferGroupId, userId);
    if (!pair) {
      throw new HttpError({ statusCode: 404, code: "NOT_FOUND", message: "The requested resource was not found." });
    }
    return toTransferResponse(pair);
  }

  async delete(transferGroupId: string, userId: string): Promise<void> {
    const deleted = await this.transfers.deleteByGroupId(transferGroupId, userId);
    if (!deleted) {
      throw new HttpError({ statusCode: 404, code: "NOT_FOUND", message: "The requested resource was not found." });
    }
  }
}
