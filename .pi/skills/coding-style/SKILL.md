---
name: coding-style
description: Standards for keeping code readable and small when writing or refactoring. Use for naming, function extraction, file size, and following the existing style.
---

- Prioritize the existing project's structure, naming, and formatting style.
- Write tests first → then write code.
- Names should reveal their role without abbreviations.
- Keep case style consistent.
- Prefer files under 200 lines; do not exceed 300 lines. If exceeded, split by responsibility.
- Follow the Boy Scout Rule: if you notice cleanup opportunities in files you touch, handle them immediately within the task scope.

## Development Philosophy

- Functions should be small and do one thing.
- Prefer readable code over forcing lambdas just to make code shorter.
- When composing multiple functions, make the call flow read like documentation.
- Every line of code and every line break should carry intent.
- Explain intent through readable code rather than comments.

## Frontend / TypeScript

- Use ESLint for code-quality linting.
- Use Prettier for formatting.
- Run lint, format, and typecheck as separate commands.
- Let Prettier handle formatting and ESLint handle code-quality rules.
