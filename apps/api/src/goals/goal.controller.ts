import type { RequestHandler } from "express";
import type {
  CreateGoalRequest,
  UpdateGoalRequest,
} from "../../../../packages/contracts/src/goals/goals.js";
import { HttpError } from "../http/errors.js";
import { GoalService } from "./goal.service.js";
import {
  getValidatedGoalBody,
  getValidatedGoalId,
  getValidatedGoalQuery,
} from "./goal.validation.js";

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

export function createGoalController(service: GoalService) {
  const create: RequestHandler = async (request, response) => {
    const goal = await service.create(
      authenticatedUserId(request),
      getValidatedGoalBody<CreateGoalRequest>(request),
    );
    response.status(201).json({ goal });
  };

  const list: RequestHandler = async (request, response) => {
    const result = await service.list(
      authenticatedUserId(request),
      getValidatedGoalQuery(request),
    );
    response.status(200).json(result);
  };

  const get: RequestHandler = async (request, response) => {
    const goal = await service.get(
      getValidatedGoalId(request),
      authenticatedUserId(request),
    );
    response.status(200).json({ goal });
  };

  const update: RequestHandler = async (request, response) => {
    const goal = await service.update(
      getValidatedGoalId(request),
      authenticatedUserId(request),
      getValidatedGoalBody<UpdateGoalRequest>(request),
    );
    response.status(200).json({ goal });
  };

  const deleteGoal: RequestHandler = async (request, response) => {
    await service.delete(
      getValidatedGoalId(request),
      authenticatedUserId(request),
    );
    response.status(204).end();
  };

  return { create, list, get, update, deleteGoal };
}
