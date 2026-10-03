import type { RequestHandler } from "express";
import type { CreateTransferRequest } from "../../../../packages/contracts/src/transfers/transfers.js";
import { HttpError } from "../http/errors.js";
import { TransferService } from "./transfer.service.js";
import {
  getValidatedTransferBody,
  getValidatedTransferGroupId,
  getValidatedTransferQuery,
} from "./transfer.validation.js";

function authenticatedUserId(request: Express.Request): string {
  const userId = request.auth?.userId;
  if (!userId) {
    throw new HttpError({ statusCode: 401, code: "AUTH_REQUIRED", message: "Authentication is required." });
  }
  return userId;
}

export function createTransferController(service: TransferService) {
  const create: RequestHandler = async (request, response) => {
    const transfer = await service.create(
      authenticatedUserId(request),
      getValidatedTransferBody<CreateTransferRequest>(request),
    );
    response.status(201).json({ transfer });
  };

  const list: RequestHandler = async (request, response) => {
    const result = await service.list(
      authenticatedUserId(request),
      getValidatedTransferQuery(request),
    );
    response.status(200).json(result);
  };

  const get: RequestHandler = async (request, response) => {
    const transfer = await service.get(
      getValidatedTransferGroupId(request),
      authenticatedUserId(request),
    );
    response.status(200).json({ transfer });
  };

  const deleteTransfer: RequestHandler = async (request, response) => {
    await service.delete(
      getValidatedTransferGroupId(request),
      authenticatedUserId(request),
    );
    response.status(204).end();
  };

  return { create, list, get, deleteTransfer };
}
