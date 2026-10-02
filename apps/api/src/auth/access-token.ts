import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { ExpiredAccessTokenError, InvalidAccessTokenError } from "./auth.errors.js";

export const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;
export const ACCESS_TOKEN_LIFETIME_MS = ACCESS_TOKEN_LIFETIME_SECONDS * 1000;

const tokenIssuer = "financial-health-builder";
const tokenAudience = "financial-health-builder-api";
const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AccessTokenService {
  issue(userId: string): Promise<string>;
  verify(token: string): Promise<string>;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === code;
}

export class JoseAccessTokenService implements AccessTokenService {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    if (Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error("JWT_SECRET must contain at least 32 bytes.");
    }

    this.key = new TextEncoder().encode(secret);
  }

  issue(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(tokenIssuer)
      .setAudience(tokenAudience)
      .setSubject(userId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_LIFETIME_SECONDS}s`)
      .sign(this.key);
  }

  async verify(token: string): Promise<string> {
    let payload;

    try {
      ({ payload } = await jwtVerify(token, this.key, {
        algorithms: ["HS256"],
        issuer: tokenIssuer,
        audience: tokenAudience,
        maxTokenAge: `${ACCESS_TOKEN_LIFETIME_SECONDS}s`,
      }));
    } catch (error) {
      if (hasErrorCode(error, "ERR_JWT_EXPIRED")) {
        throw new ExpiredAccessTokenError();
      }

      throw new InvalidAccessTokenError();
    }

    if (
      typeof payload.sub !== "string"
      || !userIdPattern.test(payload.sub)
      || typeof payload.jti !== "string"
      || typeof payload.iat !== "number"
      || typeof payload.exp !== "number"
    ) {
      throw new InvalidAccessTokenError();
    }

    return payload.sub;
  }
}