import type {
  CreateRecurringTransactionRequest,
  RecurringTransactionListQuery,
  RecurringTransactionListResponse,
  RecurringTransactionResponse,
  RecurrenceFrequency,
  RecurringTransactionType,
  UpdateRecurringTransactionRequest,
} from "../../../../packages/contracts/src/recurring-transactions/recurring-transactions.js";
import { HttpError } from "../http/errors.js";
import type { AccountRepository } from "../accounts/account.repository.js";
import type { CategoryRepository } from "../categories/category.repository.js";
import type {
  RecurringTransactionRecord,
  RecurringTransactionRepository,
} from "./recurring-transaction.repository.js";

function toResponse(record: RecurringTransactionRecord): RecurringTransactionResponse {
  return {
    id: record.id,
    accountId: record.accountId,
    categoryId: record.categoryId,
    type: record.type as RecurringTransactionType,
    amount: record.amount,
    currency: record.currency,
    description: record.description,
    frequency: record.frequency as RecurrenceFrequency,
    startDate: record.startDate.toISOString().split("T")[0],
    endDate: record.endDate ? record.endDate.toISOString().split("T")[0] : null,
    nextDate: record.nextDate.toISOString().split("T")[0],
    active: record.active,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class RecurringTransactionService {
  constructor(
    private readonly recurringTransactions: RecurringTransactionRepository,
    private readonly accounts: AccountRepository,
    private readonly categories: CategoryRepository,
  ) {}

  async create(userId: string, input: CreateRecurringTransactionRequest): Promise<RecurringTransactionResponse> {
    const account = await this.accounts.findByIdForUser(input.accountId, userId);
    if (!account) {
      throw new HttpError({
        statusCode: 400,
        code: "RECURRING_INVALID_ACCOUNT",
        message: "The specified account does not exist or does not belong to you.",
      });
    }

    if (input.categoryId != null) {
      const category = await this.categories.findByIdForUserOrSystem(input.categoryId, userId);
      if (!category) {
        throw new HttpError({
          statusCode: 400,
          code: "RECURRING_INVALID_CATEGORY",
          message: "The specified category does not exist or does not belong to you.",
        });
      }
    }

    const record = await this.recurringTransactions.createForUser(userId, input, account.currency);
    return toResponse(record);
  }

  async list(userId: string, query: RecurringTransactionListQuery): Promise<RecurringTransactionListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const result = await this.recurringTransactions.listForUser(userId, {
      page,
      pageSize,
      accountId: query.accountId,
      active: query.active,
    });

    return {
      recurringTransactions: result.recurringTransactions.map(toResponse),
      pagination: {
        page,
        pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / pageSize),
      },
    };
  }

  async get(id: string, userId: string): Promise<RecurringTransactionResponse> {
    const record = await this.recurringTransactions.findByIdForUser(id, userId);
    if (!record) {
      throw new HttpError({ statusCode: 404, code: "NOT_FOUND", message: "The requested resource was not found." });
    }
    return toResponse(record);
  }

  async update(id: string, userId: string, input: UpdateRecurringTransactionRequest): Promise<RecurringTransactionResponse> {
    if (input.categoryId != null && typeof input.categoryId === "string") {
      const category = await this.categories.findByIdForUserOrSystem(input.categoryId, userId);
      if (!category) {
        throw new HttpError({
          statusCode: 400,
          code: "RECURRING_INVALID_CATEGORY",
          message: "The specified category does not exist or does not belong to you.",
        });
      }
    }

    const patch: Parameters<RecurringTransactionRepository["updateForUser"]>[2] = {};
    if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.description !== undefined) patch.description = input.description;
    if (input.endDate !== undefined) patch.endDate = input.endDate ? new Date(input.endDate) : null;
    if (input.nextDate !== undefined) patch.nextDate = new Date(input.nextDate);
    if (input.active !== undefined) patch.active = input.active;

    const record = await this.recurringTransactions.updateForUser(id, userId, patch);
    if (!record) {
      throw new HttpError({ statusCode: 404, code: "NOT_FOUND", message: "The requested resource was not found." });
    }
    return toResponse(record);
  }

  async delete(id: string, userId: string): Promise<void> {
    const deleted = await this.recurringTransactions.deleteForUser(id, userId);
    if (!deleted) {
      throw new HttpError({ statusCode: 404, code: "NOT_FOUND", message: "The requested resource was not found." });
    }
  }
}
