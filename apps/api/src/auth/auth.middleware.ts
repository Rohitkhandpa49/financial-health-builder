import { parse as parseCookie } from "cookie";
import type { RequestHandler } from "express";
import { HttpError } from "../http/errors.js";
import type { AccessTokenService } from "./access-token.js";
import { ExpiredAccessTokenError, InvalidAccessTokenError } from "./auth.errors.js";

export const ACCESS_COOKIE_NAME = "fhb_access";
export const ACCESS_COOKIE_PATH = "/api/v1/auth";

export interface AuthenticatedRequestContext {
  readonly userId: string;
}

declare global {
  namespace Express {
    interface Request {
      readonly auth?: AuthenticatedRequestContext;
    }
  }
}

export function requireTrustedOrigin(frontendUrl?: string): RequestHandler {
  return (request, _response, next) => {
    const origin = request.get("Origin");

    if (origin && origin !== frontendUrl) {
      next(new HttpError({
        statusCode: 403,
        code: "AUTH_ORIGIN_INVALID",
        message: "The request origin is not allowed.",
      }));
      return;
    }

    next();
  };
}

export function requireAuthentication(tokens: AccessTokenService): RequestHandler {
  return async (request, _response, next) => {
    const accessToken = parseCookie(request.headers.cookie ?? "")[ACCESS_COOKIE_NAME];

    if (!accessToken) {
      next(new HttpError({
        statusCode: 401,
        code: "AUTH_REQUIRED",
        message: "Authentication is required.",
      }));
      return;
    }

    try {
      const userId = await tokens.verify(accessToken);
      Object.defineProperty(request, "auth", {
        value: Object.freeze({ userId }),
        enumerable: true,
        configurable: false,
        writable: false,
      });
      next();
    } catch (error) {
      if (error instanceof ExpiredAccessTokenError) {
        next(new HttpError({
          statusCode: 401,
          code: "AUTH_TOKEN_EXPIRED",
          message: "Authentication is required.",
        }));
        return;
      }

      if (error instanceof InvalidAccessTokenError) {
        next(new HttpError({
          statusCode: 401,
          code: "AUTH_INVALID_TOKEN",
          message: "Authentication is required.",
        }));
        return;
      }

      next(error);
    }
  };
}