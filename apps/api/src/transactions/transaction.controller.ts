import type { RequestHandler } from "express";
import type { CreateTransactionRequest, UpdateTransactionRequest } from "../../../../packages/contracts/src/transactions/transactions.js";
import { HttpError } from "../http/errors.js";
import { TransactionService } from "./transaction.service.js";
import {
  getValidatedTransactionBody,
  getValidatedTransactionId,
  getValidatedTransactionQuery,
} from "./transaction.validation.js";

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

export function createTransactionController(service: TransactionService) {
  const createTransaction: RequestHandler = async (request, response) => {
    const transaction = await service.create(
      authenticatedUserId(request),
      getValidatedTransactionBody<CreateTransactionRequest>(request),
    );
    response.status(201).json({ transaction });
  };

  const listTransactions: RequestHandler = async (request, response) => {
    const result = await service.list(
      authenticatedUserId(request),
      getValidatedTransactionQuery(request),
    );
    response.status(200).json(result);
  };

  const getTransaction: RequestHandler = async (request, response) => {
    const transaction = await service.get(
      authenticatedUserId(request),
      getValidatedTransactionId(request),
    );
    response.status(200).json({ transaction });
  };

  const updateTransaction: RequestHandler = async (request, response) => {
    const transaction = await service.update(
      authenticatedUserId(request),
      getValidatedTransactionId(request),
      getValidatedTransactionBody<UpdateTransactionRequest>(request),
    );
    response.status(200).json({ transaction });
  };

  const deleteTransaction: RequestHandler = async (request, response) => {
    await service.delete(
      authenticatedUserId(request),
      getValidatedTransactionId(request),
    );
    response.status(204).end();
  };

  return { createTransaction, listTransactions, getTransaction, updateTransaction, deleteTransaction };
}
