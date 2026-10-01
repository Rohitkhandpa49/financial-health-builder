import type { ApiSuccessResponse } from "../common/api";

export const AUTH_REGISTER_METHOD = "POST" as const;
export const AUTH_REGISTER_ENDPOINT = "/api/v1/auth/register";

export interface AuthRegisterRequest {
  name: string;
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