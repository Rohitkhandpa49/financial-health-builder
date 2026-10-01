# Financial Health Builder — GitHub Copilot Engineering Instructions

## 1. Project Mission

Financial Health Builder is a production-oriented financial management application designed to help users:

- Understand their income and spending.
- Track financial habits.
- Manage budgets.
- Set and monitor financial goals.
- Analyze financial trends.
- Track savings and wealth-building progress.
- Receive useful financial insights.

Build features that solve real user problems.

Do not add features merely to make the project appear complex.

---

## 2. Engineering Principles

Follow these principles in every implementation:

1. Prefer simple, maintainable solutions.
2. Follow separation of concerns.
3. Keep modules focused and cohesive.
4. Avoid unnecessary abstraction.
5. Avoid premature optimization.
6. Avoid duplicated business logic.
7. Prefer explicit and readable code.
8. Design for testability.
9. Treat security and privacy as first-class requirements.
10. Do not introduce technologies without a concrete engineering reason.

---

## 3. Architecture

Use a modular architecture with clear boundaries between:

- Frontend/UI
- Application/business logic
- API layer
- Database/data access
- Authentication/authorization
- Shared utilities
- Validation
- Testing

Do not tightly couple UI components to database implementation details.

Business rules should not be duplicated across controllers, components, and database queries.

Keep external integrations behind well-defined interfaces or service boundaries.

---

## 4. Technology Rules

Use the technologies defined by the repository's actual architecture and package configuration.

Preferred stack:

- TypeScript
- React / Next.js where appropriate
- Tailwind CSS
- Node.js
- Express or the selected backend framework
- PostgreSQL
- Prisma
- Docker where useful
- GitHub Actions
- Vitest/Jest for automated testing
- Playwright for end-to-end testing when appropriate

Do not add a dependency when the functionality can reasonably be implemented with existing project dependencies or the standard library.

Before adding a major dependency, explain:

- Why it is needed.
- What problem it solves.
- Why existing dependencies are insufficient.
- Its maintenance/security implications.

---

## 5. TypeScript Rules

Prefer strict TypeScript.

Avoid:

```typescript
any