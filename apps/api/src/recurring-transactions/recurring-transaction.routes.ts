import { Router } from "express";
import type { AccessTokenService } from "../auth/access-token.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import { RecurringTransactionService } from "./recurring-transaction.service.js";
import { createRecurringTransactionController } from "./recurring-transaction.controller.js";
import {
  validateRecurringTransactionId,
  validateRecurringTransactionListQuery,
  validateCreateRecurringTransactionBody,
  validateUpdateRecurringTransactionBody,
} from "./recurring-transaction.validation.js";

export interface RecurringTransactionRouterOptions {
  service: RecurringTransactionService;
  accessTokenService: AccessTokenService;
}

export function createRecurringTransactionRouter(options: RecurringTransactionRouterOptions): Router {
  const router = Router();
  const controller = createRecurringTransactionController(options.service);
  const authenticate = requireAuthentication(options.accessTokenService);

  router.post("/", authenticate, validateCreateRecurringTransactionBody, controller.create);
  router.get("/", authenticate, validateRecurringTransactionListQuery, controller.list);
  router.get("/:recurringTransactionId", authenticate, validateRecurringTransactionId, controller.get);
  router.patch("/:recurringTransactionId", authenticate, validateRecurringTransactionId, validateUpdateRecurringTransactionBody, controller.update);
  router.delete("/:recurringTransactionId", authenticate, validateRecurringTransactionId, controller.deleteRecurringTransaction);

  return router;
}
