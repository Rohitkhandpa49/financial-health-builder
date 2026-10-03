import { Router } from "express";
import type { AccessTokenService } from "../auth/access-token.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import { TransferService } from "./transfer.service.js";
import { createTransferController } from "./transfer.controller.js";
import {
  validateTransferGroupId,
  validateTransferListQuery,
  validateCreateTransferBody,
} from "./transfer.validation.js";

export interface TransferRouterOptions {
  service: TransferService;
  accessTokenService: AccessTokenService;
}

export function createTransferRouter(options: TransferRouterOptions): Router {
  const router = Router();
  const controller = createTransferController(options.service);
  const authenticate = requireAuthentication(options.accessTokenService);

  router.post("/", authenticate, validateCreateTransferBody, controller.create);
  router.get("/", authenticate, validateTransferListQuery, controller.list);
  router.get("/:transferGroupId", authenticate, validateTransferGroupId, controller.get);
  router.delete("/:transferGroupId", authenticate, validateTransferGroupId, controller.deleteTransfer);

  return router;
}
