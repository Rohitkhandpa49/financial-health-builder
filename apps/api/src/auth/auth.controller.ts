import type { RequestHandler } from "express";
import type {
  AuthLoginRequest,
  AuthRegisterRequest,
} from "../../../../packages/contracts/src/auth/auth.js";
import { HttpError } from "../http/errors.js";
import type { AccessTokenService } from "./access-token.js";
import {
  ACCESS_COOKIE_NAME,
  ACCESS_COOKIE_PATH,
} from "./auth.middleware.js";
import {
  DuplicateEmailError,
  InvalidCredentialsError,
} from "./auth.errors.js";
import type { AuthenticationServicePort } from "./auth.service.js";
import { getValidatedBody } from "./auth.validation-middleware.js";
import { ACCESS_TOKEN_LIFETIME_MS } from "./access-token.js";

interface AuthControllerOptions {
  authService: AuthenticationServicePort;
  accessTokenService: AccessTokenService;
  secureCookies: boolean;
}

function mapAuthError(error: unknown): unknown {
  if (error instanceof DuplicateEmailError) {
    return new HttpError({
      statusCode: 409,
      code: "AUTH_CONFLICT",
      message: "Unable to register this account.",
    });
  }

  if (error instanceof InvalidCredentialsError) {
    return new HttpError({
      statusCode: 401,
      code: "AUTH_INVALID_CREDENTIALS",
      message: "Email or password is invalid.",
    });
  }

  return error;
}

export function createAuthController(options: AuthControllerOptions) {
  const register: RequestHandler = async (request, response) => {
    try {
      const user = await options.authService.register(
        getValidatedBody<AuthRegisterRequest>(request),
      );
      response.status(201).json({ user });
    } catch (error) {
      throw mapAuthError(error);
    }
  };

  const login: RequestHandler = async (request, response) => {
    try {
      const user = await options.authService.login(
        getValidatedBody<AuthLoginRequest>(request),
      );
      const accessToken = await options.accessTokenService.issue(user.id);

      response.cookie(ACCESS_COOKIE_NAME, accessToken, {
        httpOnly: true,
        secure: options.secureCookies,
        sameSite: "strict",
        path: ACCESS_COOKIE_PATH,
        maxAge: ACCESS_TOKEN_LIFETIME_MS,
      });
      response.status(200).json({ user });
    } catch (error) {
      throw mapAuthError(error);
    }
  };

  const currentUser: RequestHandler = async (request, response) => {
    const userId = request.auth?.userId;
    if (!userId) {
      throw new HttpError({
        statusCode: 401,
        code: "AUTH_REQUIRED",
        message: "Authentication is required.",
      });
    }

    const user = await options.authService.getCurrentUser(userId);
    if (!user) {
      throw new HttpError({
        statusCode: 401,
        code: "AUTH_REQUIRED",
        message: "Authentication is required.",
      });
    }

    response.status(200).json({ user });
  };

  const logout: RequestHandler = (_request, response) => {
    response.clearCookie(ACCESS_COOKIE_NAME, {
      httpOnly: true,
      secure: options.secureCookies,
      sameSite: "strict",
      path: ACCESS_COOKIE_PATH,
    });
    response.status(204).end();
  };

  return { register, login, currentUser, logout };
}