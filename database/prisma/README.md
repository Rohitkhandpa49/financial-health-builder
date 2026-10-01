# Database

PostgreSQL is the authoritative persistence layer. Prisma owns the relational schema, generated client, and versioned migrations for the modular monolith. The schema is in `schema.prisma`; development seed data is in `seed.ts`.

## Local workflow

Use Node.js 20.19+, 22.12+, or 24+, install this package's dependencies, and provide a reachable PostgreSQL database through `DATABASE_URL`. The Prisma configuration loads the repository-root `.env`; do not commit that file or put real credentials in source control. The existing `.env.example` shows the variable name but contains no connection credentials.

From this directory, run:

```text
npm install
npm run db:generate
npm run db:migrate:dev -- --name initial_financial_domain
npm run db:seed
npm run typecheck
```

Migrations are source-controlled. Review generated SQL before applying it. The seed is for development only and must never be run against production data. It uses stable IDs and insert-only upserts so repeated runs do not overwrite existing records. Its synthetic user has an intentionally unusable password-hash marker; it cannot authenticate. Replace that value only through a future approved authentication/password-hashing implementation.

## Data rules

- Authoritative monetary values use PostgreSQL `DECIMAL(19,4)` / Prisma `Decimal(19,4)`. Do not convert them to JavaScript floating-point numbers for calculations or round stored values for display. Any calculation rounding must be explicit; presentation formatting belongs at the UI boundary.
- Currency is stored as an uppercase three-character code, such as `INR`, `USD`, or `EUR`. The database checks the code's format; application validation must ensure it is a supported ISO currency. Currency conversion is not implemented. A transaction must use its account's currency, enforced by a composite foreign key; cross-currency comparisons require an explicit future conversion.
- `createdAt` and `updatedAt` are server-side timestamps stored as `TIMESTAMPTZ(3)`. `Transaction.effectiveAt` is the UTC instant of the financial event, not its record-creation time. Budget boundaries and savings-goal target dates use PostgreSQL `DATE` and are calendar dates, not instants. Budget start and end dates are inclusive; period calculations must not depend on the machine's local timezone.
- UUIDs are used consistently for IDs. User email is unique as stored; the future application must normalize email before persistence because PostgreSQL comparison is not implicitly case-insensitive.
- `Account.openingBalance` is the balance before tracked transactions begin. Current account balances are derived from the opening balance plus income, minus expenses, and transfer directions; no mutable authoritative balance is stored. Transaction amounts are positive, and type/direction determines their effect. A transfer consists of one outgoing and one incoming transaction with the same group ID, owner, amount, and currency; the application must create and validate the pair atomically.
- A category with `userId = NULL` and `systemDefined = true` is shared/system-defined. A user-defined category has an owning `userId` and `systemDefined = false`. Database foreign keys ensure referenced records exist; the application must additionally ensure category ownership and type are compatible with each transaction or budget.
- A savings goal target must be positive. `currentAmount` is explicitly maintained goal progress, not derived from account transactions; it may exceed the target. Goal status transitions are application-owned.
- Accounts and categories are archived instead of deleted. Archived accounts are read-only for financial mutations; archived categories remain available to interpret historical records but cannot be newly assigned. All foreign keys use restrictive deletion behavior so user deletion cannot cascade through financial history. The application should reject deletion of referenced records and apply these archive rules.

## Constraints and indexes

The schema uses foreign keys for ownership and relationships, a unique email constraint, controlled enums, and targeted indexes for user-owned accounts, transactions by owner/account/category and effective date, budgets by owner/date range, and savings goals by owner/status. Migration SQL adds database checks for category ownership representation, currency-code format, positive transaction/budget/goal amounts, non-negative goal progress, and valid budget date order. Cross-row category compatibility and complete transfer pairing remain application invariants; no database triggers are used.