---
name: git-style
description: Git workflow
---

1. Create a branch — branch from `main` with a name that clearly describes the work.
2. Add CI for GitHub repositories — if the remote is GitHub and no test workflow exists, add a GitHub Actions workflow under `.github/workflows/` that runs the project test command on `pull_request` and `push` to `main`.
   - Use the repository's package manager and existing scripts.
   - Prefer fast checks first: install, lint, typecheck, unit tests, then e2e tests when present.
   - Keep workflow names explicit, e.g. `test.yml` or `ci.yml`.
3. Commit — keep units of work small and write meaningful commit messages.
4. Create a PR — clearly explain the changes and intent, including CI/test coverage.
5. Review & feedback — apply reviewer feedback and revise.
6. Merge to main — merge into `main` after review and required CI checks pass.
