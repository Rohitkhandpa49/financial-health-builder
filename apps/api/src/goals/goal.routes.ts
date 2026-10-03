import { Router } from "express";
import type { AccessTokenService } from "../auth/access-token.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import { GoalService } from "./goal.service.js";
import { createGoalController } from "./goal.controller.js";
import {
  validateGoalId,
  validateGoalListQuery,
  validateCreateGoalBody,
  validateUpdateGoalBody,
} from "./goal.validation.js";

export interface GoalRouterOptions {
  service: GoalService;
  accessTokenService: AccessTokenService;
}

export function createGoalRouter(options: GoalRouterOptions): Router {
  const router = Router();
  const controller = createGoalController(options.service);
  const authenticate = requireAuthentication(options.accessTokenService);

  router.post("/", authenticate, validateCreateGoalBody, controller.create);
  router.get("/", authenticate, validateGoalListQuery, controller.list);
  router.get("/:goalId", authenticate, validateGoalId, controller.get);
  router.patch("/:goalId", authenticate, validateGoalId, validateUpdateGoalBody, controller.update);
  router.delete("/:goalId", authenticate, validateGoalId, controller.deleteGoal);

  return router;
}
