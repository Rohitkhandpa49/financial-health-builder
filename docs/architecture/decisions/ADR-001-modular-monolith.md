# ADR-001: Adopt a Modular Monolith Architecture

- **Status:** Accepted
- **Date:** 2026-10-01
- **Decision Type:** Architecture
- **Scope:** Application architecture

---

## 1. Context

Financial Health Builder is initially being developed as a small-to-medium scale
financial management application.

The system is expected to provide features such as:

- User authentication
- User profiles
- Financial accounts
- Income and expense transactions
- Categories
- Budgets
- Savings goals
- Financial dashboards
- Financial health calculations
- Reports and analytics
- Future AI-assisted insights

The project requires strong separation between business domains while keeping
development, testing, deployment, and local setup manageable.

Introducing distributed microservices at the beginning would add operational
complexity before there is a demonstrated need for independent services.

---

## 2. Decision

We will implement Financial Health Builder as a **Modular Monolith** for the
initial production architecture.

The application will be deployed as a single primary backend application while
maintaining clear internal domain boundaries.

The backend will be organized around business modules rather than one large
unstructured codebase.

Initial conceptual modules include:

- Authentication
- Users
- Accounts
- Transactions
- Categories
- Budgets
- Savings Goals
- Dashboard
- Financial Health
- Reports
- Notifications
- AI integration

Not every module needs to be implemented immediately. Modules will be introduced
as their corresponding product capabilities are implemented.

---

## 3. Architectural Boundary

The modular monolith will follow this conceptual structure:

```text
                    Financial Health Builder
                              |
                       Backend Application
                              |
        +---------------------+---------------------+
        |                     |                     |
   Auth Module          Finance Modules       Supporting Modules
        |                     |                     |
      Users          +--------+--------+       Reports
                     |        |        |       Notifications
                  Accounts  Transactions       AI Adapter
                     |        |
                Categories  Budgets
                              |
                         Savings Goals