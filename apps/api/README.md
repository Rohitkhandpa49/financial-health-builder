# API Backend Foundation

The API is the backend boundary for the modular monolith. It provides startup configuration, request middleware, authentication, a versioned liveness endpoint, error responses, and one Prisma client boundary. Financial feature endpoints are not implemented.

## Requirements

- Node.js 20.19+, 22.12+, or 24+
- PostgreSQL configured through the repository-root `.env`
- Prisma client generated from `database/prisma/schema.prisma`

The repository `.env.example` names `DATABASE_URL`, `JWT_SECRET`, and `FRONTEND_URL`. Copy it to `.env` at the repository root, set a local PostgreSQL connection string, and set `JWT_SECRET` to at least 32 characters of cryptographically random data. For example, generate a value with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Never commit `.env` or include secrets/connection strings in logs.

## Install and run

From the repository root:

```text
npm --prefix database/prisma install
npm --prefix database/prisma run db:generate
npm --prefix apps/api install
npm --prefix apps/api run dev
```

For a production build, run `npm run build` from `apps/api`, then `npm start` from the same directory. `npm run typecheck` and `npm test` run the static and HTTP boundary checks.

The liveness endpoint is `GET /api/v1/health`. It confirms that the HTTP process is responding; it does not claim that PostgreSQL is reachable. CORS permits only the configured `FRONTEND_URL` origin and supports credentials for the authentication cookie. If unset, cross-origin access is disabled.

## Request handling

Request IDs are validated or generated at the HTTP boundary and returned as `X-Request-Id`. Errors use the shared API error shape and include the request ID in `error.details`. Unexpected failures return a generic 500 response; logs contain only the event, request ID, and error class, not request bodies or error messages.

The Prisma client is created once at process startup and disconnected during graceful shutdown. Routes do not instantiate Prisma clients. Future protected routes must add authorization and input validation before service/persistence calls.

## Authentication

- `POST /api/v1/auth/register` accepts `name`, `email`, and `password`, and returns `201` with `{ "user": { "id", "name", "email" } }`. Names are trimmed; email is trimmed and lowercased. Password length is 12–128 characters. Unknown request properties are rejected. Duplicate email returns a generic `409 AUTH_CONFLICT`.
- `POST /api/v1/auth/login` accepts `email` and `password`. Success returns the same safe user shape and sets an HttpOnly `fhb_access` cookie; credentials are not returned in JSON. Invalid credentials return the same `401 AUTH_INVALID_CREDENTIALS` response.
- `GET /api/v1/auth/me` requires that cookie and returns the safe user shape.
- `POST /api/v1/auth/logout` clears the cookie and returns `204`. Logout is idempotent.

Passwords use Argon2id (19 MiB memory, two iterations, one lane). Email normalization is consistently trim-plus-lowercase and login uses the indexed unique email field. Access credentials are HS256 JWTs with a 15-minute lifetime, issuer/audience checks, and only a user subject plus standard token claims. They are stored in an HttpOnly, SameSite=Strict cookie; production cookies are Secure. The frontend and API should be deployed same-site. Unsafe auth requests reject a supplied Origin that differs from `FRONTEND_URL`; requests without an Origin are permitted for non-browser clients. Browser clients must use credentialed requests.

There are no refresh tokens or server-side sessions. Logout removes the browser cookie but cannot revoke a copied stateless access token before its 15-minute expiry. Authentication rate limits use Express's in-memory store per process; this is not distributed protection and trusted proxy settings must be configured deliberately if deployed behind a proxy. Registration duplicate responses still reveal a conflict status, though the message does not confirm the email value.

Authentication does not implement authorization or resource ownership. Do not use client-supplied `userId` values as identity; future protected services must use the verified request context.

## Authorization and ownership

Authentication establishes the immutable `request.auth.userId`; authorization checks whether that identity may access a resource. `assertResourceOwnedByAuthenticatedUser` is the shared ownership policy for user-owned records and returns the existing generic `404 NOT_FOUND` behavior for a foreign owner. Use the verified auth context, never a body, path, query, or header user ID. Ownership checks do not replace scoped persistence queries: future repositories must include both resource ID and authenticated `userId` in the database `where` clause and must check each related resource independently before writes. No financial-resource routes or CRUD are exposed in this phase. System-defined category access/mutation policy remains deliberately undecided until category operations are designed.