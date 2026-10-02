import type { AuthenticatedRequestContext } from "../auth/auth.middleware.js";
import { HttpError } from "../http/errors.js";

export interface OwnedResource {
  userId: string;
}

export function assertResourceOwnedByAuthenticatedUser(
  authenticatedUser: AuthenticatedRequestContext,
  resource: OwnedResource,
): void {
  if (resource.userId !== authenticatedUser.userId) {
    throw new HttpError({
      statusCode: 404,
      code: "NOT_FOUND",
      message: "The requested resource was not found.",
    });
  }
}