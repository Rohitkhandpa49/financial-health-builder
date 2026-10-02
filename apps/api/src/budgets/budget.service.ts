import type {
  BudgetListQuery,
  BudgetListResponse,
  BudgetPeriod,
  BudgetResponse,
  CreateBudgetRequest,
  UpdateBudgetRequest,
} from "../../../../packages/contracts/src/budgets/budgets.js";
import { HttpError } from "../http/errors.js";
import type { CategoryRepository } from "../categories/category.repository.js";
import type { BudgetRecord, BudgetRepository, BudgetUpdatePatch } from "./budget.repository.js";

function toBudgetResponse(record: BudgetRecord): BudgetResponse {
  return {
    id: record.id,
    name: record.name,
    categoryId: record.categoryId,
    amount: record.amount,
    currency: record.currency,
    period: record.period as BudgetPeriod,
    startDate: record.startDate.toISOString().split("T")[0],
    endDate: record.endDate.toISOString().split("T")[0],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function invalidCategory(): HttpError {
  return new HttpError({
    statusCode: 400,
    code: "BUDGET_INVALID_CATEGORY",
    message: "The specified category does not exist or does not belong to you.",
  });
}

function notFound(): HttpError {
  return new HttpError({
    statusCode: 404,
    code: "NOT_FOUND",
    message: "The requested resource was not found.",
  });
}

export class BudgetService {
  constructor(
    private readonly budgets: BudgetRepository,
    private readonly categories: CategoryRepository,
  ) {}

  async create(userId: string, input: CreateBudgetRequest): Promise<BudgetResponse> {
    if (input.categoryId !== undefined) {
      const category = await this.categories.findByIdForUserOrSystem(input.categoryId, userId);
      if (!category) {
        throw invalidCategory();
      }
    }

    const record = await this.budgets.createForUser(userId, input);
    return toBudgetResponse(record);
  }

  async list(userId: string, query: BudgetListQuery): Promise<BudgetListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const result = await this.budgets.listForUser(userId, {
      page,
      pageSize,
      categoryId: query.categoryId,
      period: query.period,
    });

    return {
      budgets: result.budgets.map(toBudgetResponse),
      pagination: {
        page,
        pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / pageSize),
      },
    };
  }

  async get(budgetId: string, userId: string): Promise<BudgetResponse> {
    const record = await this.budgets.findByIdForUser(budgetId, userId);
    if (!record) {
      throw notFound();
    }

    return toBudgetResponse(record);
  }

  async update(budgetId: string, userId: string, input: UpdateBudgetRequest): Promise<BudgetResponse> {
    if (input.categoryId !== undefined && input.categoryId !== null) {
      const category = await this.categories.findByIdForUserOrSystem(input.categoryId, userId);
      if (!category) {
        throw invalidCategory();
      }
    }

    const patch: BudgetUpdatePatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.endDate !== undefined) patch.endDate = new Date(input.endDate);

    const record = await this.budgets.updateForUser(budgetId, userId, patch);
    if (!record) {
      throw notFound();
    }

    return toBudgetResponse(record);
  }

  async delete(budgetId: string, userId: string): Promise<void> {
    const deleted = await this.budgets.deleteForUser(budgetId, userId);
    if (!deleted) {
      throw notFound();
    }
  }
}
