---
name: coding-style
description: Standards for readable, small code, naming, function extraction, file size, and existing style.
---

- Prioritize the existing project's structure, naming, and formatting style.
- Write tests first → then write code.
- Names should reveal their role without abbreviations.
- Keep case style consistent.
- For source code only, keep lines ≤120 characters; wrap at semantic boundaries like arguments, properties, or chains.
- Do not reflow prose, Markdown docs, prompts, or comments just to satisfy the code line-length rule.
- For source code only, keep files ≤300 lines. If a touched file exceeds 300 lines, split it by responsibility.
- Follow the Boy Scout Rule: if you notice cleanup opportunities in files you touch, handle them within the task scope.

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
