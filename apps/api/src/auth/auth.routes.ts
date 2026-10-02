import { rateLimit } from "express-rate-limit";
import { Router } from "express";
import { HttpError } from "../http/errors.js";
import type { AccessTokenService } from "./access-token.js";
import { createAuthController } from "./auth.controller.js";
import { requireAuthentication, requireTrustedOrigin } from "./auth.middleware.js";
import type { AuthenticationServicePort } from "./auth.service.js";
import { loginRequestSchema, registerRequestSchema } from "./auth.validation.js";
import { validateBody } from "./auth.validation-middleware.js";

export interface AuthRouterOptions {
  authService: AuthenticationServicePort;
  accessTokenService: AccessTokenService;
  frontendUrl?: string;
  secureCookies: boolean;
}

function createAuthRateLimit(limit: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_request, _response, next) => {
      next(new HttpError({
        statusCode: 429,
        code: "AUTH_RATE_LIMITED",
        message: "Too many authentication requests. Try again later.",
      }));
    },
  });
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router();
  const controller = createAuthController(options);
  const trustedOrigin = requireTrustedOrigin(options.frontendUrl);
  const registrationRateLimit = createAuthRateLimit(5);
  const loginRateLimit = createAuthRateLimit(10);

  router.post("/register", trustedOrigin, registrationRateLimit, validateBody(registerRequestSchema), controller.register);
  router.post("/login", trustedOrigin, loginRateLimit, validateBody(loginRequestSchema), controller.login);
  router.get("/me", requireAuthentication(options.accessTokenService), controller.currentUser);
  router.post("/logout", trustedOrigin, controller.logout);

  return router;
}