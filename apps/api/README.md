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

Passwords use Argon2id (19 MiB memory, two iterations, one lane). Email normalization is consistently trim-plus-lowercase and login uses the indexed unique email field. Access credentials are HS256 JWTs with a 15-minute lifetime, issuer/audience checks, and only a user subject plus standard token claims. They are stored in an HttpOnly, SameSite=Strict cookie scoped to `/api/v1`; production cookies are Secure. The frontend and API should be deployed same-site. Unsafe auth requests reject a supplied Origin that differs from `FRONTEND_URL`; requests without an Origin are permitted for non-browser clients. Browser clients must use credentialed requests.

There are no refresh tokens or server-side sessions. Logout removes the browser cookie but cannot revoke a copied stateless access token before its 15-minute expiry. Authentication rate limits use Express's in-memory store per process; this is not distributed protection and trusted proxy settings must be configured deliberately if deployed behind a proxy. Registration duplicate responses still reveal a conflict status, though the message does not confirm the email value.

Authentication establishes identity; it does not grant access by itself. Account operations use the verified `request.auth.userId` for ownership, and clients must never select the owner with a supplied `userId`.

## Accounts

All account routes require the authenticated `fhb_access` cookie. Ownership comes only from the verified `request.auth.userId`; request bodies and query parameters cannot select an owner.

- `POST /api/v1/accounts` accepts `name`, `type`, `currency`, and `openingBalance`; it returns `201` with `{ account }` and derives ownership from authentication.
- `GET /api/v1/accounts` returns the authenticated user's accounts, ordered by creation time and ID descending. It accepts `page` (default `1`), `pageSize` (default `25`, maximum `100`), and `archived` (`false` by default). The response includes `accounts` and the shared `pagination` metadata.
- `GET /api/v1/accounts/:accountId` returns an owned account, including when archived. Foreign and nonexistent IDs both return the same `404 NOT_FOUND` response.
- `PATCH /api/v1/accounts/:accountId` currently permits changing only `name`; archived accounts are read-only.
- `PATCH /api/v1/accounts/:accountId/archive` sets `archived` without deleting the account. Repeating the operation remains safe. Archived accounts are excluded from the default list and available with `?archived=true`.

Names are trimmed, required, and limited to 120 characters. Account type must be a schema enum value. Currency must be an uppercase three-letter code recognized by the Node runtime's ISO-style currency list. `openingBalance` must be a decimal string with at most 15 integer digits and four fractional digits; it is stored as `DECIMAL(19,4)` and returned as a fixed-scale string. Positive, zero, and negative values are accepted because the database defines no sign constraint and V1 has not assigned type-specific sign semantics. No floating-point conversion or currency conversion occurs. Currency, account type, and opening balance are intentionally immutable through the current update endpoint; name-only updates avoid silently changing future financial history semantics.

## Categories

All category routes require the authenticated `fhb_access` cookie. Ownership comes only from the verified `request.auth.userId`; request bodies and query parameters cannot select an owner.

Categories are either user-owned or system-defined. User-owned categories are created by authenticated users and belong to that user alone. System categories (`systemDefined: true`, `userId: null`) are created by the platform, visible to all authenticated users, and are read-only — they cannot be modified or archived by any user.

- `POST /api/v1/categories` accepts `name` and `type`; it returns `201` with `{ category }` and derives ownership from authentication. The `type` field is immutable after creation.
- `GET /api/v1/categories` returns the authenticated user's own categories plus all system categories, ordered by creation time and ID descending. Accepts `page` (default `1`), `pageSize` (default `25`, maximum `100`), `archived` (`false` by default), and `type` (`INCOME` or `EXPENSE`, optional). The response includes `categories` and the shared `pagination` metadata. Unknown query parameters (including `userId`) are rejected with `400 VALIDATION_ERROR`.
- `GET /api/v1/categories/:categoryId` returns an owned or system category, including when archived. Foreign and nonexistent IDs both return the same `404 NOT_FOUND` response. The `userId` field is never included in any response.
- `PATCH /api/v1/categories/:categoryId` permits changing only `name`; `type` is immutable and rejected by validation. Archived categories are read-only (`404`). Attempting to update a system category returns `403 FORBIDDEN`.
- `PATCH /api/v1/categories/:categoryId/archive` sets `archived` without deleting the category. Repeating the operation is safe (idempotent). Archived categories are excluded from the default list and available with `?archived=true`. Attempting to archive a system category returns `403 FORBIDDEN`. Physical deletion is blocked at the database level by a foreign-key constraint (`Transaction.categoryId → Category.id onDelete: Restrict`).

`name` is trimmed, required, and limited to 100 characters. `type` must be `INCOME` or `EXPENSE`. System categories are visible to all authenticated users but can never be created, updated, or archived through the API.

## Transactions

All transaction routes require the authenticated `fhb_access` cookie. Ownership comes only from the verified `request.auth.userId`; request bodies and query parameters cannot select an owner.

- `POST /api/v1/transactions` accepts `accountId`, `type`, `amount`, `description`, and `effectiveAt` (with optional `categoryId`); returns `201` with `{ transaction }`. The currency is derived from the referenced account — it cannot be supplied by the client.
- `GET /api/v1/transactions` returns the authenticated user's transactions, ordered by `effectiveAt` descending, then `createdAt` descending, then `id` descending. Accepts `page` (default `1`), `pageSize` (default `25`), `accountId` (filter by account UUID), and `type` (`INCOME` or `EXPENSE`). The response includes `transactions` and `pagination` metadata. Unknown query parameters (including `userId`) are rejected with `400 VALIDATION_ERROR`.
- `GET /api/v1/transactions/:transactionId` returns an owned transaction. Foreign and nonexistent IDs return `404 TRANSACTION_NOT_FOUND`.
- `PATCH /api/v1/transactions/:transactionId` permits updating `categoryId`, `type`, `amount`, `description`, and `effectiveAt`. All fields are optional. Unknown fields are rejected. Foreign and nonexistent IDs return `404 TRANSACTION_NOT_FOUND`.
- `DELETE /api/v1/transactions/:transactionId` permanently deletes the transaction and returns `204`. Foreign and nonexistent IDs return `404 TRANSACTION_NOT_FOUND`.

**Ownership model:** All queries scope by the authenticated `userId`. A foreign or nonexistent transaction always returns `404 TRANSACTION_NOT_FOUND`, never a `403`. The `userId`, `transferGroupId`, and `transferDirection` fields are never included in any response.

**TRANSFER exclusion:** The `TRANSFER` transaction type is reserved for internal double-entry bookkeeping. It is excluded from all V1 endpoints — validation rejects `type: "TRANSFER"` in request bodies, and all repository queries filter out TRANSFER records with `NOT: { type: "TRANSFER" }`. TRANSFER transactions can exist in the database (seeded or migrated) but are never visible or createable through V1 endpoints.

**Amount rules:** `amount` must be a positive decimal string with no leading minus sign. Use at most 15 integer digits and up to 4 fractional digits. Zero (`"0"`, `"0.0"`, `"0.00"`, `"0.0000"`) is accepted. The direction of money flow is expressed via the `type` field (`INCOME` or `EXPENSE`), not via a negative sign. Amounts are stored as `DECIMAL(19,4)` and returned as a fixed-scale 4-decimal string (e.g., `"50.0000"`).

## Budgets

All budget routes require the authenticated `fhb_access` cookie. Ownership comes only from the verified `request.auth.userId`; request bodies and query parameters cannot select an owner.

Budgets represent planned spending limits over a date range. Each budget has a `period` (`WEEKLY`, `MONTHLY`, or `CUSTOM`), an `amount` and `currency` (supplied by the client — not derived from an account), and optional `categoryId` linking to a user-owned or system category.

- `POST /api/v1/budgets` accepts `name`, `amount`, `currency`, `period`, `startDate`, `endDate`, and optionally `categoryId`; returns `201` with `{ budget }`. Ownership is derived from authentication.
- `GET /api/v1/budgets` returns the authenticated user's budgets, ordered by `startDate` descending, then `createdAt` descending, then `id` descending. Accepts `page` (default `1`), `pageSize` (default `25`, maximum `100`), `categoryId` (filter by category UUID), and `period` (`WEEKLY`, `MONTHLY`, or `CUSTOM`). The response includes `budgets` and `pagination` metadata. Unknown query parameters (including `userId`) are rejected with `400 VALIDATION_ERROR`.
- `GET /api/v1/budgets/:budgetId` returns an owned budget. Foreign and nonexistent IDs return `404 NOT_FOUND`.
- `PATCH /api/v1/budgets/:budgetId` permits updating `name`, `categoryId`, `amount`, and `endDate`. All fields are optional. Pass `categoryId: null` to remove a category link. Unknown fields are rejected. Foreign and nonexistent IDs return `404 NOT_FOUND`.
- `DELETE /api/v1/budgets/:budgetId` permanently deletes the budget and returns `204`. Foreign and nonexistent IDs return `404 NOT_FOUND`.

**Ownership model:** All queries scope by the authenticated `userId`. A foreign or nonexistent budget always returns `404 NOT_FOUND`, never a `403`. The `userId` field is never included in any response.

**Amount rules:** `amount` must be a positive (non-negative) decimal string with no leading minus sign and no leading zeros on the integer part (except `"0"` itself). Use at most 15 integer digits and up to 4 fractional digits. Zero (`"0"`) is accepted. Amounts are stored as `DECIMAL(19,4)` and returned as a fixed-scale 4-decimal string (e.g., `"500.0000"`).

**Date rules:** `startDate` and `endDate` must be in `YYYY-MM-DD` format. `endDate` must be on or after `startDate`. Dates are stored as calendar dates without time components and returned in `YYYY-MM-DD` format. `startDate` is immutable after creation; use `endDate` in PATCH to extend or shorten a budget window.

**Category rules:** If `categoryId` is provided, it must resolve to a user-owned category or a system-defined category. An unrecognized or foreign category returns `400 BUDGET_INVALID_CATEGORY`. Physical deletion is safe — no other model has a foreign key pointing at `Budget`.

## Goals

All goal routes require the authenticated `fhb_access` cookie. Ownership comes only from the verified `request.auth.userId`; request bodies and query parameters cannot select an owner.

Goals represent financial savings targets. Each goal has a `targetAmount`, a `currentAmount` tracking progress, a `currency`, a `targetDate` deadline, and a `status` from the enum `ACTIVE | COMPLETED | OVERDUE | ARCHIVED`.

- `POST /api/v1/goals` accepts `name`, `targetAmount`, `currency`, `targetDate`, and optionally `currentAmount` and `status`; returns `201` with `{ goal }`. Ownership is derived from authentication.
- `GET /api/v1/goals` returns the authenticated user's goals, ordered by `targetDate` ascending, then `createdAt` descending, then `id` descending. Accepts `page` (default `1`), `pageSize` (default `25`, maximum `100`), and `status` (filter by goal status enum value). The response includes `goals` and `pagination` metadata. Unknown query parameters (including `userId`) are rejected with `400 VALIDATION_ERROR`.
- `GET /api/v1/goals/:goalId` returns an owned goal. Foreign and nonexistent IDs return `404 NOT_FOUND`.
- `PATCH /api/v1/goals/:goalId` permits updating `name`, `targetAmount`, `currentAmount`, `targetDate`, and `status`. All fields are optional. Unknown fields are rejected. Foreign and nonexistent IDs return `404 NOT_FOUND`.
- `DELETE /api/v1/goals/:goalId` permanently deletes the goal and returns `204`. Foreign and nonexistent IDs return `404 NOT_FOUND`.

**Ownership model:** All queries scope by the authenticated `userId`. A foreign or nonexistent goal always returns `404 NOT_FOUND`, never a `403`. The `userId` field is never included in any response.

**Amount rules:** `targetAmount` and `currentAmount` must be non-negative decimal strings with at most 15 integer digits and up to 4 fractional digits. Zero (`"0"`) is accepted. Amounts are stored as `DECIMAL(19,4)` and returned as a fixed-scale 4-decimal string (e.g., `"1000.0000"`). `currentAmount` defaults to `"0"` when not provided at creation.

**Date rules:** `targetDate` must be in `YYYY-MM-DD` format and represent a valid calendar date. It is stored as a calendar date without time components and returned in `YYYY-MM-DD` format.

**Status rules:** `status` must be one of `ACTIVE`, `COMPLETED`, `OVERDUE`, or `ARCHIVED`. It defaults to `ACTIVE` when not provided at creation. Physical deletion is safe — no other model has a foreign key pointing at `SavingsGoal`.

## Authorization and ownership

Authentication establishes the immutable `request.auth.userId`; authorization checks whether that identity may access a resource. `assertResourceOwnedByAuthenticatedUser` is the shared ownership policy for user-owned records and returns the existing generic `404 NOT_FOUND` behavior for a foreign owner. Use the verified auth context, never a body, path, query, or header user ID. Ownership checks do not replace scoped persistence queries: repositories include both resource ID and authenticated `userId` in account `where` clauses and must check each related resource independently before writes. Accounts are the only financial-resource routes implemented so far. System-defined category access/mutation policy remains deliberately undecided until category operations are designed.

## Recurring Transactions

All recurring transaction routes require the authenticated `fhb_access` cookie. Ownership comes only from the verified `request.auth.userId`; request bodies and query parameters cannot select an owner. Currency is derived from the referenced account and never accepted from the client.

- `POST /api/v1/recurring-transactions` accepts `accountId`, `type` (`INCOME` or `EXPENSE`), `amount`, `description`, `frequency` (`DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`), `startDate` (YYYY-MM-DD), `nextDate` (YYYY-MM-DD), and optional `categoryId` and `endDate`; returns `201` with `{ recurringTransaction }`.
- `GET /api/v1/recurring-transactions` returns the authenticated user's recurring transactions ordered by `nextDate` ascending. Supports `page`, `pageSize` (max 100), and optional `active` (`true`/`false`) and `accountId` filters.
- `GET /api/v1/recurring-transactions/:recurringTransactionId` returns a single owned recurring transaction.
- `PATCH /api/v1/recurring-transactions/:recurringTransactionId` permits updating `categoryId`, `amount`, `description`, `endDate`, `nextDate`, and `active`.
- `DELETE /api/v1/recurring-transactions/:recurringTransactionId` permanently deletes the recurring transaction and returns `204`.

`TRANSFER` type is rejected at the validation layer. All repository queries include `NOT: { type: "TRANSFER" }`. Account ownership and category ownership (own + system) are enforced at creation and update. Foreign or missing records return the generic `404 NOT_FOUND`.

## Transfers

All transfer routes require the authenticated `fhb_access` cookie. A transfer is a paired double-entry operation creating two `Transaction` records sharing a `transferGroupId` — one `OUTGOING` on the source account and one `INCOMING` on the destination account. Both sides are created atomically inside a single Prisma transaction; if either side fails, neither persists.

- `POST /api/v1/transfers` accepts `sourceAccountId`, `destinationAccountId`, `amount`, `description`, and `effectiveAt` (ISO 8601 with timezone offset); returns `201` with `{ transfer }` containing `transferGroupId`, `outgoing`, `incoming`, and `amount`.
- `GET /api/v1/transfers` returns all paired transfers belonging to the authenticated user, grouped by `transferGroupId`, with `page` and `pageSize` pagination.
- `GET /api/v1/transfers/:transferGroupId` returns a single transfer pair.
- `DELETE /api/v1/transfers/:transferGroupId` deletes both sides atomically and returns `204`.

Transfer invariants enforced by the service: both accounts must belong to the authenticated user (`400 TRANSFER_INVALID_SOURCE` / `TRANSFER_INVALID_DESTINATION`); source and destination must be different accounts (`400 TRANSFER_SAME_ACCOUNT`); both accounts must share the same currency (`400 TRANSFER_CURRENCY_MISMATCH`). The `userId`, `transferGroupId`, and `transferDirection` fields are never exposed in responses.

## Analytics

All analytics routes require the authenticated `fhb_access` cookie. All queries are scoped exclusively to the authenticated user's data. `userId` is never accepted from query parameters or request bodies. Transfer transactions (`type = TRANSFER`) are excluded from income and expense calculations.

Optional date filters `startDate` and `endDate` (YYYY-MM-DD) are accepted on summary, cash-flow, spending, and income endpoints. If omitted, the current calendar month is used. `endDate` must be on or after `startDate`.

- `GET /api/v1/analytics/summary` — total income, expenses, net cash flow, transaction count, savings amount and rate for the period.
- `GET /api/v1/analytics/cash-flow` — income, expenses, and net grouped by calendar month.
- `GET /api/v1/analytics/spending` — expense breakdown by category with amounts and percentages.
- `GET /api/v1/analytics/income` — income breakdown by category with amounts and percentages.
- `GET /api/v1/analytics/budgets` — each budget with spent amount, remaining, utilization percentage, and over-budget flag.
- `GET /api/v1/analytics/goals` — each savings goal with current/target amounts, remaining, progress percentage, and status counts.

All monetary values are returned as fixed 4-decimal strings. Percentages are returned as 2-decimal strings.

## Financial Health

`GET /api/v1/financial-health` — returns a deterministic, application-defined financial wellness score (0–100) based on the authenticated user's data. Accepts optional `startDate`/`endDate` query parameters.

**This is not a professional financial, credit, or regulatory assessment.** It is an informational indicator calculated from your recorded data.

Response shape:
- `overallScore` — weighted composite 0–100 integer
- `components` — five scored dimensions: `savingsRate` (25%), `budgetAdherence` (20%), `goalProgress` (20%), `cashFlowHealth` (20%), `spendingStability` (15%)
- `metrics` — underlying numeric values used in the calculation
- `insights` — rule-based observations (positive / warning / neutral)
- `disclaimer` — statement that this is not professional financial advice

A new user with no data receives a score of 50 (neutral) with `hasSufficientData: false`.

## Reports

All report routes require the authenticated `fhb_access` cookie. All queries are scoped to the authenticated user's data only. `userId` is never accepted from query parameters or request bodies. Transfer transactions are excluded from income and expense calculations in all reports.

### Date filter behavior

Most report endpoints accept optional `startDate` and `endDate` query parameters (YYYY-MM-DD). If omitted, the current calendar month is used as the default range. `endDate` must be on or after `startDate`. Unknown query parameters are rejected with `400 VALIDATION_ERROR`.

The `monthly` and `yearly` endpoints accept `year` (integer 2000–2100) and `month` (1–12) instead of a date range. Both default to the current period.

### Endpoints

- `GET /api/v1/reports/monthly` — full monthly report for a given year/month including income, expenses, net cash flow, savings rate, transaction counts, top spending categories, and active budgets. Query params: `year`, `month`.
- `GET /api/v1/reports/yearly` — full yearly report including totals, month-by-month cash-flow breakdown, top spending categories, and savings goal progress. Query param: `year`.
- `GET /api/v1/reports/category-spending` — expense breakdown by category with amounts and percentages for the date range. Accepts `startDate`/`endDate`.
- `GET /api/v1/reports/account-summary` — per-account activity summary including opening balance, income, expenses, and net activity for the date range. Accepts `startDate`/`endDate`.
- `GET /api/v1/reports/cash-flow` — monthly income/expense/net periods with an overall trend indicator (`improving`, `declining`, `stable`, or `insufficient_data`). Accepts `startDate`/`endDate`.
- `GET /api/v1/reports/insights` — deterministic rule-based financial insights generated from the current period's data compared with the previous equivalent period. Accepts `startDate`/`endDate`.

### Financial Insights behavior

Insights are generated without AI or LLM — they are deterministic rule evaluations over recorded data. Each insight has a `type` (`positive`, `warning`, `neutral`, or `info`), a `category`, a `title`, a `message`, and a `priority` (lower = more important). Insights are sorted by priority.

Examples of generated insights: expenses exceeding income, spending increased more than 20% vs the prior period, low savings rate, budgets over or near the limit, savings goals progressing slowly, positive cash flow, improving or declining trend. A new user with no transactions receives neutral informational insights rather than errors.

## Notifications

All notification routes require the authenticated `fhb_access` cookie. All queries are scoped to the authenticated user only. `userId` is never accepted from query parameters or request bodies, and is never included in any response.

### GET /api/v1/notifications
List notifications for the authenticated user.
Query params: `page` (default 1), `pageSize` (default 20, max 100), `read` (`true`/`false`, optional).
Returns: `{ data: NotificationResponse[], total, page, pageSize }`.

### GET /api/v1/notifications/preferences
Get notification preferences for the authenticated user. Returns default preferences (all categories enabled) if none have been configured.

### PATCH /api/v1/notifications/preferences
Update notification preferences.
Body: `{ budgetAlerts?, goalAlerts?, recurringReminders?, financialHealthAlerts?, billReminders?, generalAlerts? }` — all boolean, all optional. Unknown fields are rejected with `400 VALIDATION_ERROR`.

### GET /api/v1/notifications/:notificationId
Get a single notification. Returns `404 NOT_FOUND` (generic) for not-found or foreign IDs.

### PATCH /api/v1/notifications/read-all
Mark all unread notifications as read.
Returns: `{ count: N }` — number of notifications updated.

### PATCH /api/v1/notifications/:notificationId/read
Mark a single notification as read. Returns `404 NOT_FOUND` for not-found or foreign IDs.

### DELETE /api/v1/notifications/:notificationId
Delete a notification. Returns `204`. Returns `404 NOT_FOUND` for not-found or foreign IDs.

### POST /api/v1/notifications/generate
Trigger rule-based notification generation for the authenticated user.
Generates notifications for: budget exceeded, budget approaching threshold (≥80%), overdue goals, and negative monthly cash flow.
Deduplication: will not generate the same notification type more than once per 24 hours.
Returns: `{ generated: N }` — count of newly created notifications.

Notification types: `BUDGET_THRESHOLD`, `BUDGET_EXCEEDED`, `RECURRING_TRANSACTION`, `GOAL_PROGRESS`, `BILL_REMINDER`, `FINANCIAL_HEALTH`, `GENERAL`.

## CSV Export

### GET /api/v1/reports/export/csv
Export transactions as a CSV file. Requires authentication.
Query params: `type` (required, must be `transactions`), `startDate` (YYYY-MM-DD, optional), `endDate` (YYYY-MM-DD, optional).
Response: `Content-Type: text/csv; charset=utf-8` with `Content-Disposition: attachment; filename="transactions.csv"`.
CSV header: `id,type,amount,currency,description,effectiveAt,categoryId,accountId,createdAt`.
Notes:
- Excludes `TRANSFER` type transactions
- Monetary amounts are plain decimal strings (no currency symbols)
- Dates are ISO 8601 strings
- Null/empty fields output as empty string
- RFC 4180 compliant: CRLF line endings, values containing commas or quotes are double-quoted

## Audit Logging

Mutating API operations (`POST`, `PATCH`, `PUT`, `DELETE`) are automatically logged as structured JSON to the application console.
Log fields: `event` (`api.audit`), `name` (operation path), `method`, `path`, `userId` (first 8 characters only — never the full ID), `requestId`, `statusCode`, `timestamp`.
Never logs request or response bodies, passwords, tokens, financial data, or any sensitive secrets.
