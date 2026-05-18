---
name: unit-test
description: Standards for writing unit tests or improving code that is hard to test
---

## Common

- Do not hardcode communication endpoint URLs in code. Load them from env.
- Create a `.env.test` file and store them there.
- Generate mock data from real data. If real data cannot be collected, ask the user for data.
- Aim for 100% coverage.
- If 100% coverage is difficult to achieve, first suspect that the code structure is hard to test rather than the test design.
- Isolate external dependencies with mocks/fakes/stubs and verify deterministically.
- If real-data-based samples are needed, generate fixtures through a separate script/manual procedure, and use only fixed fixtures in tests.

## Frontend

- Do not write rendering tests. Mark components without behavior as coverage ignored.
- Use Storybook stories for simple component rendering checks.
- Use `bun:test`.

## Backend

- For Golang, use the built-in `testing` package.
- For TypeScript, Use `bun:test`.
