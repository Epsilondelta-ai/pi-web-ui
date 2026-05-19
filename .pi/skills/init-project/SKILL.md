---
name: init-project
description: Use when creating a new project.
---

## Common

- Check for an existing initialization script before manual setup.
- Prefer official generators and minimal setup.
- Avoid unnecessary tools and structure.

## TypeScript

- Use Bun (https://bun.com/) for TypeScript: `bun init`.

## Frontend

- Prefer Astro (https://astro.build/) for frontend projects: `bun create astro`
- Set up ESLint, Prettier, and Storybook together.

## Formatting

- When setting up Prettier, configure `printWidth: 120` unless the project template already defines a different width.

## Backend

- Prefer Go for backend services.
