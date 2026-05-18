---
name: task-breakdown
description: Break down complex requests into actionable task lists like Antigravity. Use before implementation to decompose work, decide execution order, identify parallelizable tasks, and define completion criteria.
---

## Principles

- Handle simple requests directly without splitting them into tasks.
- For complex requests, save the task list to `.pi/tasks/{task-name}.md` before execution.
- Ask the user about ambiguous requirements before turning them into tasks.
- Split tasks into small units that are primarily research, implementation, or verification.
- Each task must have observable completion criteria.
- Update the task file with newly discovered work and completion status as work progresses.

## Task Writing Rules

- Write tasks as checkboxes.
- Place dependent tasks in order.
- Mark independent research/review/verification tasks as `[Parallelizable]`.
- Run parallelizable tasks concurrently with subagents when possible.
- Implementation tasks that modify files should generally be handled by a single writer.
- If multiple implementation tasks must run concurrently, use worktree-isolated subagents.
- Use a short kebab-case filename that describes the work.

## File Format

```md
## Goal

- Summarize the user's desired final outcome in one sentence.

## Task List

### Research

- [ ] Inspect related files and the existing structure. Completion criteria: identify the modification targets and impact scope.

### Implementation

- [ ] Apply the core change. Completion criteria: requirements are reflected in code/docs.

### Verification

- [ ] Run relevant tests or verification commands. Completion criteria: confirm the changes behave as intended.

## Progress Log

- YYYY-MM-DD HH:mm: created task list
```

## Execution Method

- If the work can be executed immediately, proceed without user confirmation.
- For work that is hard to roll back or requires a direction decision, get user confirmation first.
- For parallel work, consolidate subagent results before moving to the next task.
- Update the task file while working and report completion status.
