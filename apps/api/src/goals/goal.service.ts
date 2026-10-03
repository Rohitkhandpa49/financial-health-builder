import type {
  CreateGoalRequest,
  GoalListQuery,
  GoalListResponse,
  GoalResponse,
  GoalStatus,
  UpdateGoalRequest,
} from "../../../../packages/contracts/src/goals/goals.js";
import { HttpError } from "../http/errors.js";
import type { GoalRecord, GoalRepository, GoalUpdatePatch } from "./goal.repository.js";

function toGoalResponse(record: GoalRecord): GoalResponse {
  return {
    id: record.id,
    name: record.name,
    targetAmount: record.targetAmount,
    currentAmount: record.currentAmount,
    currency: record.currency,
    targetDate: record.targetDate.toISOString().split("T")[0],
    status: record.status as GoalStatus,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    // NO userId
  };
}

function notFound(): HttpError {
  return new HttpError({
    statusCode: 404,
    code: "NOT_FOUND",
    message: "The requested resource was not found.",
  });
}

export class GoalService {
  constructor(private readonly goals: GoalRepository) {}

  async create(userId: string, input: CreateGoalRequest): Promise<GoalResponse> {
    const record = await this.goals.createForUser(userId, input);
    return toGoalResponse(record);
  }

  async list(userId: string, query: GoalListQuery): Promise<GoalListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const result = await this.goals.listForUser(userId, {
      page,
      pageSize,
      status: query.status,
    });

    return {
      goals: result.goals.map(toGoalResponse),
      pagination: {
        page,
        pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / pageSize),
      },
    };
  }

  async get(goalId: string, userId: string): Promise<GoalResponse> {
    const record = await this.goals.findByIdForUser(goalId, userId);
    if (!record) throw notFound();
    return toGoalResponse(record);
  }

  async update(goalId: string, userId: string, input: UpdateGoalRequest): Promise<GoalResponse> {
    const patch: GoalUpdatePatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.targetAmount !== undefined) patch.targetAmount = input.targetAmount;
    if (input.currentAmount !== undefined) patch.currentAmount = input.currentAmount;
    if (input.targetDate !== undefined) patch.targetDate = new Date(input.targetDate);
    if (input.status !== undefined) patch.status = input.status;

    const record = await this.goals.updateForUser(goalId, userId, patch);
    if (!record) throw notFound();
    return toGoalResponse(record);
  }

  async delete(goalId: string, userId: string): Promise<void> {
    const deleted = await this.goals.deleteForUser(goalId, userId);
    if (!deleted) throw notFound();
  }
}
