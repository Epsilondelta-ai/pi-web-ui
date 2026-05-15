---
id: SPEC-TERM-002
version: "0.1.0"
status: draft
created_at: "2026-05-15"
updated_at: "2026-05-15"
author: MoAI
priority: High
labels: [terminal, backend, frontend, websocket, tmux, persistence, session]
issue_number: null
depends_on: [SPEC-TERM-001]
---

# SPEC-TERM-002 — Implementation Plan

## Approach

Extend the existing terminal subsystem in `internal/terminal/` with a tmux runner alongside the existing PTY runner. Mode selection occurs at session start. Frontend receives mode-aware lifecycle events and adjusts reconnection behavior.

## Milestones

### M1 — Backend Tmux Runner (Priority: Critical)

- Add `internal/terminal/tmux_runner.go` implementing start/attach/detach/kill/list operations.
- Argument-vector tmux command construction — no shell-string concatenation.
- Managed prefix session naming (e.g., `piweb-` prefix).
- Session identity sanitization (alphanumeric + hyphen, length bound).
- Tmux binary path resolution from config with unavailability detection.

### M2 — Lifecycle Events and State Machine (Priority: Critical)

- Extend `internal/terminal/events.go` with `terminal.detached`, `terminal.stale`, `terminal.killed`.
- Handler maps tmux session state to canonical states: `live`, `detached`, `killed`, `stale`, `error`.
- `terminal.closed` remains for direct PTY sessions only.
- WebSocket disconnect for tmux sessions: detach (not kill).

### M3 — Handler and Route Extension (Priority: High)

- Extend `internal/terminal/handler.go` with mode-aware session creation.
- Add start/attach/kill/list operation dispatch.
- Add REST or WebSocket sub-protocol endpoints for list and kill.
- Same-session attach: single-attachment replacement (detach previous client, attach new).

### M4 — Security Validation (Priority: High)

- Origin, workspace, command validation before any tmux execution (reuse SPEC-TERM-001 patterns).
- Additional: managed prefix check, sanitized session identity check.
- Tmux binary path validation (not user-controlled).
- Non-secret error states and reason codes only.

### M5 — Frontend Reconnection and Session Management (Priority: High)

- Extend `src/scripts/terminal-client.ts` with mode-aware disconnect handling.
- Tmux session disconnect → reconnect (not new session) when detached session exists.
- Session list UI in `src/scripts/app-shell.ts` and `src/components/AppShell.astro`.
- Detached session state display with attach/kill actions.

### M6 — Configuration (Priority: Medium)

- Add tmux-related config to `internal/config/config.go`: enable/disable tmux mode, tmux binary path, managed prefix, fallback policy (reject, not auto-PTY).
- Environment variable support consistent with existing config pattern.

### M7 — Tests (Priority: High)

- `internal/terminal/tmux_runner_test.go` — start/attach/detach/kill/list, argument-vector safety, managed prefix enforcement, sanitization.
- `internal/terminal/handler_test.go` — extended lifecycle tests, same-session attach, validation rejection, mode selection.
- `internal/config/config_test.go` — tmux config validation.
- `internal/server/server_test.go` — route tests for list/kill.
- `scripts/smoke-check.mjs` — persistent session UI markers if frontend adds them.

### M8 — Documentation (Priority: Low)

- Update `README.md` with tmux persistence documentation, security defaults, and configuration options.

## Technical Risks

| Risk | Mitigation |
|---|---|
| Tmux binary unavailable on system | M1 detects unavailability; M3 rejects tmux mode cleanly with non-secret error |
| Shell injection via session name | M1 argument-vector only; M4 sanitization + managed prefix |
| Orphaned tmux sessions after backend crash | M2 stale state detection on list/attach; M3 kill operation |
| Existing handler kill-on-disconnect conflicts with tmux | M2 mode-aware disconnect: PTY = kill, tmux = detach |
| Same-session multi-client race | M3 single-attachment replacement is deterministic; no concurrent attach ambiguity |
| `terminal.closed` event used in tests for tmux path | M2 explicit event separation; tests use mode-specific event assertions |

## Dependencies

- SPEC-TERM-001 must be completed (direct PTY terminal is the base).
- System tmux binary must be available for tmux mode (detected at runtime, not build time).
- No new Go or npm dependencies required beyond what SPEC-TERM-001 introduced.

## Affected Files Summary

| File | Change Type | Milestone |
|---|---|---|
| `internal/terminal/tmux_runner.go` | New | M1 |
| `internal/terminal/runner.go` | Modify (mode switch) | M1 |
| `internal/terminal/events.go` | Modify (add events) | M2 |
| `internal/terminal/handler.go` | Modify (lifecycle, validation) | M3, M4 |
| `internal/config/config.go` | Modify (tmux config) | M6 |
| `internal/server/server.go` | Modify (routes) | M3 |
| `src/scripts/terminal-client.ts` | Modify (reconnect) | M5 |
| `src/scripts/app-shell.ts` | Modify (session management) | M5 |
| `src/components/AppShell.astro` | Modify (session UI) | M5 |
| `README.md` | Modify (docs) | M8 |
| `scripts/smoke-check.mjs` | Modify (checks) | M7 |
| Test files (5+) | New/Modify | M7 |
