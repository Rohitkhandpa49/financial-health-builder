import type { RequestHandler } from "express";
import type { CreateAccountRequest, UpdateAccountRequest } from "../../../../packages/contracts/src/accounts/accounts.js";
import { HttpError } from "../http/errors.js";
import { AccountService } from "./account.service.js";
import {
  getValidatedAccountBody,
  getValidatedAccountId,
  getValidatedAccountQuery,
} from "./account.validation.js";

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

export function createAccountController(service: AccountService) {
  const create: RequestHandler = async (request, response) => {
    const account = await service.create(
      authenticatedUserId(request),
      getValidatedAccountBody<CreateAccountRequest>(request),
    );
    response.status(201).json({ account });
  };

  const list: RequestHandler = async (request, response) => {
    const result = await service.list(
      authenticatedUserId(request),
      getValidatedAccountQuery(request),
    );
    response.status(200).json(result);
  };

  const get: RequestHandler = async (request, response) => {
    const account = await service.get(
      getValidatedAccountId(request),
      authenticatedUserId(request),
    );
    response.status(200).json({ account });
  };

  const update: RequestHandler = async (request, response) => {
    const account = await service.updateName(
      getValidatedAccountId(request),
      authenticatedUserId(request),
      getValidatedAccountBody<UpdateAccountRequest>(request),
    );
    response.status(200).json({ account });
  };

  const archive: RequestHandler = async (request, response) => {
    const account = await service.archive(
      getValidatedAccountId(request),
      authenticatedUserId(request),
    );
    response.status(200).json({ account });
  };

  return { create, list, get, update, archive };
}