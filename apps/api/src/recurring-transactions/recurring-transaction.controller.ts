import type { RequestHandler } from "express";
import type {
  CreateRecurringTransactionRequest,
  UpdateRecurringTransactionRequest,
} from "../../../../packages/contracts/src/recurring-transactions/recurring-transactions.js";
import { HttpError } from "../http/errors.js";
import { RecurringTransactionService } from "./recurring-transaction.service.js";
import {
  getValidatedRecurringTransactionBody,
  getValidatedRecurringTransactionId,
  getValidatedRecurringTransactionQuery,
} from "./recurring-transaction.validation.js";

function authenticatedUserId(request: Express.Request): string {
  const userId = request.auth?.userId;
  if (!userId) {
    throw new HttpError({ statusCode: 401, code: "AUTH_REQUIRED", message: "Authentication is required." });
  }
  return userId;
}

export function createRecurringTransactionController(service: RecurringTransactionService) {
  const create: RequestHandler = async (request, response) => {
    const recurringTransaction = await service.create(
      authenticatedUserId(request),
      getValidatedRecurringTransactionBody<CreateRecurringTransactionRequest>(request),
    );
    response.status(201).json({ recurringTransaction });
  };

  const list: RequestHandler = async (request, response) => {
    const result = await service.list(
      authenticatedUserId(request),
      getValidatedRecurringTransactionQuery(request),
    );
    response.status(200).json(result);
  };

  const get: RequestHandler = async (request, response) => {
    const recurringTransaction = await service.get(
      getValidatedRecurringTransactionId(request),
      authenticatedUserId(request),
    );
    response.status(200).json({ recurringTransaction });
  };

  const update: RequestHandler = async (request, response) => {
    const recurringTransaction = await service.update(
      getValidatedRecurringTransactionId(request),
      authenticatedUserId(request),
      getValidatedRecurringTransactionBody<UpdateRecurringTransactionRequest>(request),
    );
    response.status(200).json({ recurringTransaction });
  };

  const deleteRecurringTransaction: RequestHandler = async (request, response) => {
    await service.delete(
      getValidatedRecurringTransactionId(request),
      authenticatedUserId(request),
    );
    response.status(204).end();
  };

  return { create, list, get, update, deleteRecurringTransaction };
}
