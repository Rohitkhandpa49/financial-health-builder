import { Router } from "express";
import type { AccessTokenService } from "../auth/access-token.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import { AccountService } from "./account.service.js";
import { createAccountController } from "./account.controller.js";
import {
  validateAccountId,
  validateAccountListQuery,
  validateCreateAccountBody,
  validateUpdateAccountBody,
} from "./account.validation.js";

export interface AccountRouterOptions {
  service: AccountService;
  accessTokenService: AccessTokenService;
}

export function createAccountRouter(options: AccountRouterOptions): Router {
  const router = Router();
  const controller = createAccountController(options.service);
  const authenticate = requireAuthentication(options.accessTokenService);

  router.post("/", authenticate, validateCreateAccountBody, controller.create);
  router.get("/", authenticate, validateAccountListQuery, controller.list);
  router.get("/:accountId", authenticate, validateAccountId, controller.get);
  router.patch("/:accountId/archive", authenticate, validateAccountId, controller.archive);
  router.patch("/:accountId", authenticate, validateAccountId, validateUpdateAccountBody, controller.update);

  return router;
}