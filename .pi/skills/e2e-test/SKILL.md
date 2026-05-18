---
name: e2e-test
description: How to write e2e tests
---

## Backend

If unit test coverage reaches 100%, consider the system to work correctly without e2e tests. (This means you should achieve 100% unit test coverage.)

## Frontend

- Use Playwright.
- Test based on what users see: screens, copy, roles, and states, rather than implementation details.
- Prefer `getByRole`, `getByLabel`, and `getByText` locators; use test IDs only when necessary.
- Each test must run independently without relying on sessions, storage, or test data from other tests.
- When a backend is needed, use Playwright network mocks or fixtures by default.
- Verify integration with a real backend only when the user explicitly requests it.
