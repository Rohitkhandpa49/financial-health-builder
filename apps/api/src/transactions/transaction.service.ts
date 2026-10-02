import type {
  TransactionListQuery,
  TransactionListResponse,
  TransactionResponse,
  CreateTransactionRequest,
  UpdateTransactionRequest,
} from "../../../../packages/contracts/src/transactions/transactions.js";
import { HttpError } from "../http/errors.js";
import type { AccountRepository } from "../accounts/account.repository.js";
import type { CategoryRepository } from "../categories/category.repository.js";
import type { TransactionRecord, TransactionRepository } from "./transaction.repository.js";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;

function toTransactionResponse(record: TransactionRecord): TransactionResponse {
  return {
    id: record.id,
    accountId: record.accountId,
    categoryId: record.categoryId,
    type: record.type,
    amount: record.amount,
    currency: record.currency,
    description: record.description,
    effectiveAt: record.effectiveAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class TransactionService {
  constructor(
    private readonly transactionRepository: TransactionRepository,
    private readonly accountRepository: AccountRepository,
    private readonly categoryRepository: CategoryRepository,
  ) {}

  async create(userId: string, data: CreateTransactionRequest): Promise<TransactionResponse> {
    const account = await this.accountRepository.findByIdForUser(data.accountId, userId);
    if (!account) {
      throw new HttpError({
        statusCode: 400,
        code: "TRANSACTION_INVALID_ACCOUNT",
        message: "The specified account does not exist or does not belong to you.",
      });
    }

    if (data.categoryId != null) {
      const category = await this.categoryRepository.findByIdForUserOrSystem(data.categoryId, userId);
      if (!category) {
        throw new HttpError({
          statusCode: 400,
          code: "TRANSACTION_INVALID_CATEGORY",
          message: "The specified category does not exist or does not belong to you.",
        });
      }
    }

    const currency = account.currency;
    const record = await this.transactionRepository.createForUser(userId, {
      accountId: data.accountId,
      categoryId: data.categoryId ?? null,
      type: data.type,
      amount: data.amount,
      currency,
      description: data.description,
      effectiveAt: new Date(data.effectiveAt),
    });

    return toTransactionResponse(record);
  }

  async list(userId: string, query: TransactionListQuery): Promise<TransactionListResponse> {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const result = await this.transactionRepository.listForUser(userId, {
      page,
      pageSize,
      accountId: query.accountId,
      type: query.type,
    });

    return {
      transactions: result.transactions.map(toTransactionResponse),
      pagination: {
        page,
        pageSize,
        totalItems: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
  }

  async get(userId: string, id: string): Promise<TransactionResponse> {
    const record = await this.transactionRepository.findByIdForUser(id, userId);
    if (!record) {
      throw new HttpError({
        statusCode: 404,
        code: "TRANSACTION_NOT_FOUND",
        message: "The requested transaction was not found.",
      });
    }

    return toTransactionResponse(record);
  }

  async update(userId: string, id: string, patch: UpdateTransactionRequest): Promise<TransactionResponse> {
    if (patch.categoryId != null) {
      const category = await this.categoryRepository.findByIdForUserOrSystem(patch.categoryId, userId);
      if (!category) {
        throw new HttpError({
          statusCode: 400,
          code: "TRANSACTION_INVALID_CATEGORY",
          message: "The specified category does not exist or does not belong to you.",
        });
      }
    }

    const record = await this.transactionRepository.updateForUser(id, userId, {
      categoryId: patch.categoryId,
      type: patch.type,
      amount: patch.amount,
      description: patch.description,
      effectiveAt: patch.effectiveAt !== undefined ? new Date(patch.effectiveAt) : undefined,
    });

    if (!record) {
      throw new HttpError({
        statusCode: 404,
        code: "TRANSACTION_NOT_FOUND",
        message: "The requested transaction was not found.",
      });
    }

    return toTransactionResponse(record);
  }

  async delete(userId: string, id: string): Promise<void> {
    const deleted = await this.transactionRepository.deleteForUser(id, userId);
    if (!deleted) {
      throw new HttpError({
        statusCode: 404,
        code: "TRANSACTION_NOT_FOUND",
        message: "The requested transaction was not found.",
      });
    }
  }
}
