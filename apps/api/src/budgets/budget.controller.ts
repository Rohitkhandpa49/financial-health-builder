import type { RequestHandler } from "express";
import type { CreateBudgetRequest, UpdateBudgetRequest } from "../../../../packages/contracts/src/budgets/budgets.js";
import { HttpError } from "../http/errors.js";
import { BudgetService } from "./budget.service.js";
import {
  getValidatedBudgetBody,
  getValidatedBudgetId,
  getValidatedBudgetQuery,
} from "./budget.validation.js";

function authenticatedUserId(request: Express.Request): string {
  const userId = request.auth?.userId;
  if (!userId) {
    throw new HttpError({
      statusCode: 401,
      code: "AUTH_REQUIRED",
      message: "Authentication is required.",
    });
  }

  return userId;
}

export function createBudgetController(service: BudgetService) {
  const create: RequestHandler = async (request, response) => {
    const budget = await service.create(
      authenticatedUserId(request),
      getValidatedBudgetBody<CreateBudgetRequest>(request),
    );
    response.status(201).json({ budget });
  };

  const list: RequestHandler = async (request, response) => {
    const result = await service.list(
      authenticatedUserId(request),
      getValidatedBudgetQuery(request),
    );
    response.status(200).json(result);
  };

  const get: RequestHandler = async (request, response) => {
    const budget = await service.get(
      getValidatedBudgetId(request),
      authenticatedUserId(request),
    );
    response.status(200).json({ budget });
  };

  const update: RequestHandler = async (request, response) => {
    const budget = await service.update(
      getValidatedBudgetId(request),
      authenticatedUserId(request),
      getValidatedBudgetBody<UpdateBudgetRequest>(request),
    );
    response.status(200).json({ budget });
  };

  const deleteBudget: RequestHandler = async (request, response) => {
    await service.delete(
      getValidatedBudgetId(request),
      authenticatedUserId(request),
    );
    response.status(204).end();
  };

  return { create, list, get, update, deleteBudget };
}
