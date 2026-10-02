import type { ApiSuccessResponse } from "../common/api";

export const AUTH_REGISTER_METHOD = "POST" as const;
export const AUTH_REGISTER_ENDPOINT = "/api/v1/auth/register";
export const AUTH_LOGIN_METHOD = "POST" as const;
export const AUTH_LOGIN_ENDPOINT = "/api/v1/auth/login";
export const AUTH_CURRENT_USER_METHOD = "GET" as const;
export const AUTH_CURRENT_USER_ENDPOINT = "/api/v1/auth/me";
export const AUTH_LOGOUT_METHOD = "POST" as const;
export const AUTH_LOGOUT_ENDPOINT = "/api/v1/auth/logout";

export interface AuthRegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export interface RegisteredUser {
  id: string;
  name: string;
  email: string;
}

export type AuthRegisterResponse = ApiSuccessResponse<{
  user: RegisteredUser;
}>;

export type AuthLoginResponse = ApiSuccessResponse<{
  user: RegisteredUser;
}>;

export type AuthCurrentUserResponse = ApiSuccessResponse<{
  user: RegisteredUser;
}>;