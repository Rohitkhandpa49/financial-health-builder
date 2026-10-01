# Financial Health Builder — Architecture v1

**Status:** Draft
**Version:** 1.0
**Document Type:** System Architecture
**Last Updated:** 2026-10-01
**Repository:** `financial-health-builder`

---

# 1. Executive Summary

Financial Health Builder is a personal-finance management and financial-wellness platform designed to help users understand, organize, monitor, and improve their financial habits.

The system will provide a centralized platform for managing:

- Financial accounts
- Income
- Expenses
- Categories
- Budgets
- Savings goals
- Financial health metrics
- Spending analytics
- Financial reports
- Notifications
- Personalized financial insights

The first production architecture will use a **modular monolith** rather than microservices.

The modular monolith provides:

- Clear domain boundaries
- Simple local development
- Easier deployment
- Strong transactional consistency
- Lower infrastructure complexity
- Easier debugging
- Clear future migration paths

The architecture must remain capable of evolving into independently deployable services if future scale or organizational requirements justify that change.

---

# 2. Product Vision

The product aims to provide users with a clear and actionable understanding of their financial situation.

The platform should answer questions such as:

- How much money do I have?
- Where is my money going?
- What are my largest expense categories?
- Am I staying within my budget?
- How much am I saving?
- What are my active financial goals?
- How is my financial health changing?
- What financial habits should I improve?
- What recurring financial obligations do I have?
- How much can I reasonably allocate toward a goal?

The platform must present financial information in a way that is understandable without sacrificing data correctness.

---

# 3. Architecture Goals

The architecture has the following goals:

1. Security by default
2. Correct financial calculations
3. Strong data integrity
4. Maintainable domain boundaries
5. Testability
6. Accessibility
7. Observability
8. Reasonable performance
9. Deployment simplicity
10. Clear developer workflows
11. Controlled dependency growth
12. Future scalability
13. Privacy-conscious design
14. Reliable auditability
15. Clear separation of responsibilities

---

# 4. Architecture Principles

## 4.1 Security First

Financial information is sensitive.

Security must be considered during:

- API design
- Database design
- Authentication
- Authorization
- Logging
- Error handling
- AI integrations
- File handling
- Deployment
- Dependency management

Security must not be added only after implementation.

---

## 4.2 Server Is the Source of Truth

The frontend is responsible for presentation and user interaction.

The backend is responsible for authoritative:

- balances
- transaction calculations
- budget calculations
- savings calculations
- financial health calculations
- authorization decisions

The frontend must never be trusted to enforce business rules.

---

## 4.3 Domain Logic Must Be Centralized

Financial rules should not be duplicated across:

- React components
- API controllers
- database queries
- background jobs
- AI prompts

Authoritative calculations should exist in backend domain/application services.

---

## 4.4 Explicit Over Clever

The codebase should prefer:

- readable code
- explicit types
- explicit validation
- explicit error handling
- explicit authorization
- explicit transactions

over unnecessary abstractions.

---

## 4.5 Modular Monolith First

The first architecture will not use microservices.

Modules will have clear boundaries inside one deployable backend.

A future service extraction should be possible without redesigning the entire domain model.

---

## 4.6 Evidence-Based Optimization

Performance optimizations must be based on:

- measurements
- profiling
- query analysis
- production metrics
- reproducible bottlenecks

Do not introduce Redis, queues, complex caching, or distributed infrastructure without a demonstrated need.

---

# 5. Product Scope

## 5.1 Version 1 Scope

Version 1 includes:

- User registration
- User authentication
- User profile
- Financial accounts
- Account balances
- Income transactions
- Expense transactions
- Categories
- Budgets
- Savings goals
- Dashboard
- Basic analytics
- Financial health metrics
- Basic notifications
- Audit events for security-sensitive operations

---

## 5.2 Version 1.1 Candidates

Potential V1.1 functionality:

- Recurring transactions
- Advanced reports
- CSV import
- CSV export
- More advanced analytics
- Budget notifications
- Goal milestone notifications
- Enhanced dashboards
- Monthly financial summaries

---

## 5.3 Future Scope

Potential future capabilities:

- Investment tracking
- Portfolio tracking
- Net-worth tracking
- Financial forecasting
- External account integrations
- Bank data aggregation
- Advanced AI assistance
- Automated categorization
- Personalized financial recommendations
- Mobile applications

These features must not unnecessarily influence V1 architecture.

---

# 6. Explicit Non-Goals

The initial architecture will not require:

- Microservices
- Kubernetes
- Event sourcing
- CQRS
- Data warehouse
- Kafka
- Complex distributed systems
- Direct payment processing
- Direct bank transfers
- Brokerage execution
- Autonomous financial decisions
- Mandatory AI functionality
- Mandatory Redis
- Mandatory message queues

These technologies may be introduced later only when justified.

---

# 7. System Context

The system consists of the following conceptual actors and components:

```text
+-----------------------+
|       User            |
+-----------+-----------+
            |
            v
+-----------------------+
| Web Application       |
| React / Next.js       |
+-----------+-----------+
            |
            v
+-----------------------+
| REST API              |
| Node.js / TypeScript  |
+-----------+-----------+
            |
            v
+-----------------------+
| Application Layer     |
| Domain Modules        |
+-----------+-----------+
            |
            v
+-----------------------+
| Data Access Layer     |
| Prisma ORM            |
+-----------+-----------+
            |
            v
+-----------------------+
| PostgreSQL            |
+-----------------------+
