import { Router } from "express";
import type { AccessTokenService } from "../auth/access-token.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import { TransactionService } from "./transaction.service.js";
import { createTransactionController } from "./transaction.controller.js";
import {
  validateCreateTransaction,
  validateListTransactions,
  validateTransactionIdParam,
  validateUpdateTransaction,
} from "./transaction.validation.js";

export interface TransactionRouterOptions {
  service: TransactionService;
  accessTokenService: AccessTokenService;
}

export function createTransactionRouter(options: TransactionRouterOptions): Router {
  const router = Router();
  const controller = createTransactionController(options.service);
  const authenticate = requireAuthentication(options.accessTokenService);

  router.post("/", validateCreateTransaction, authenticate, controller.createTransaction);
  router.get("/", validateListTransactions, authenticate, controller.listTransactions);
  router.get("/:transactionId", validateTransactionIdParam, authenticate, controller.getTransaction);
  router.patch("/:transactionId", validateTransactionIdParam, validateUpdateTransaction, authenticate, controller.updateTransaction);
  router.delete("/:transactionId", validateTransactionIdParam, authenticate, controller.deleteTransaction);

  return router;
}
