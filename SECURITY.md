# Security Policy

Security is a core requirement of Financial Health Builder.

Because this application handles financial information, security must be considered during design, development, testing, and deployment.

## Reporting a Vulnerability

Please do not publicly disclose security vulnerabilities through GitHub Issues.

Security vulnerabilities should be reported privately to the project maintainers with enough information to reproduce and understand the issue.

## What to Report

Examples include:

- Authentication bypasses
- Authorization vulnerabilities
- Account takeover vulnerabilities
- SQL injection
- Cross-site scripting
- Sensitive data exposure
- Insecure API endpoints
- Broken access control
- Credential exposure
- Dependency vulnerabilities
- Server-side security vulnerabilities

## Secrets

Never commit sensitive credentials to Git.

Do not commit:

```text
.env
API keys
Access tokens
Passwords
Database credentials
JWT secrets
Private keys
Cloud credentials
Production secrets