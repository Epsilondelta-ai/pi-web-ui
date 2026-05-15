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

# SPEC-TERM-002: Tmux-Backed Persistent Terminal Sessions

## HISTORY

| Date | Version | Change | Author |
|---|---:|---|---|
| 2026-05-15 | 0.1.0 | Reconstructed from PASS audit report (iteration 2 review). REQ-TERM2-001..026, AC-TERM2-001..014, lifecycle vocabulary, same-session policy, exclusions. | MoAI |

## Overview

The Pi Web UI shall support tmux-backed persistent terminal sessions that survive browser disconnect and reconnect, while preserving the existing direct PTY close-on-disconnect mode from SPEC-TERM-001. Users may start managed tmux sessions, list active sessions, attach to existing sessions from any browser tab, and kill sessions. All tmux operations are managed through the Pi Web backend — no arbitrary tmux console access is exposed.

## Context / WHY

SPEC-TERM-001 implemented close-on-disconnect terminal sessions: when the browser WebSocket disconnects, the backend kills the PTY process. This is safe but prevents long-running tasks from surviving brief network interruptions, browser tab switches, or intentional reconnection from a different device. Users running multi-hour agent workflows lose context on every disconnect. Tmux-backed persistence solves this by decoupling the terminal process lifetime from the browser connection lifetime, while keeping the managed, validated, local-only security model.

## Architectural Constraints

These constraints describe the chosen implementation architecture. They are not normative product requirements.

- Direct PTY mode (SPEC-TERM-001) remains available and unchanged; tmux mode is additive.
- Backend uses the system `tmux` binary for session management. No embedded tmux library.
- Frontend terminal rendering continues through `@xterm/xterm` + `@xterm/addon-fit`; no new rendering path.
- Browser/backend transport remains WebSocket over the existing terminal route pattern.
- Session identity is workspace/session scoped, consistent with SPEC-TERM-001.
- Tmux session names use a managed prefix to distinguish Pi Web managed sessions from user-created tmux sessions.
- Backend constructs tmux commands via argument-vector execution — no shell-string construction from user-controlled input.
- Same-session attach uses single-attachment replacement: when a new client attaches to a managed tmux session that already has a client, the backend detaches the previous client before attaching the new one. The policy is deterministic and observable.
- Tmux mode is requested per-session at start time. Direct PTY sessions are not implicitly converted to tmux sessions.

## Affected Files

### Existing files to modify

- `internal/terminal/runner.go` — add tmux runner or mode switch alongside existing PTY runner.
- `internal/terminal/handler.go` — start/attach/detach/kill/list lifecycle operations, event mapping for tmux sessions.
- `internal/terminal/events.go` — add tmux lifecycle events (`terminal.detached`, `terminal.stale`, `terminal.killed`); remove `terminal.closed` usage for tmux sessions.
- `internal/config/config.go` — tmux mode enablement, tmux binary path, managed session name prefix, environment validation.
- `internal/server/server.go` — HTTP routes for list/kill if REST endpoints are chosen, or WebSocket sub-protocol extension.
- `src/scripts/terminal-client.ts` — reconnect/attach semantics for tmux sessions, no auto-kill on WebSocket close for persistent sessions.
- `src/scripts/app-shell.ts` — session list/attach/kill UI flow hooks.
- `src/components/AppShell.astro` — persisted session state indicators and action affordances.
- `README.md` — tmux persistence documentation and security defaults.
- `scripts/smoke-check.mjs` — persistent session UI markers if added to frontend.

### Required new files/directories

- `internal/terminal/tmux_runner.go` — tmux-backed session runner (or extension of existing runner).
- `internal/terminal/tmux_runner_test.go` — tmux runner unit/integration tests.
- `internal/terminal/handler_test.go` — extended tests for tmux lifecycle, validation, and same-session attach.
- `internal/config/config_test.go` — tmux configuration validation tests.
- `internal/server/server_test.go` — route tests for list/kill endpoints if added.

## Requirements

### Module 1 — Mode Selection and Preservation

REQ-TERM2-001: The Pi Web backend shall support two terminal session modes: direct PTY (SPEC-TERM-001 behavior) and managed tmux, where the mode is determined at session start time.

REQ-TERM2-002: When a session is started in direct PTY mode, the Pi Web backend shall preserve the SPEC-TERM-001 close-on-disconnect lifecycle without modification.

REQ-TERM2-003: The Pi Web backend shall reject session start requests that specify tmux mode when the system tmux binary is unavailable, and shall emit a non-secret error observable to the client.

REQ-TERM2-004: When a session is started in managed tmux mode, the Pi Web backend shall create a tmux session with a managed prefix in the session name, launch the configured command inside that tmux session, and attach the requesting client to it.

REQ-TERM2-005: The Pi Web backend shall not expose arbitrary tmux console access; all tmux operations shall be limited to managed start, attach, list, and kill operations on sessions that carry the managed prefix.

### Module 2 — Session Lifecycle States

REQ-TERM2-006: When a managed tmux session is started, the Pi Web backend shall report its lifecycle state as `live`.

REQ-TERM2-007: When a client WebSocket disconnects from a managed tmux session, the Pi Web backend shall report the session lifecycle state as `detached` and shall not terminate the tmux session or its child process.

REQ-TERM2-008: When a managed tmux session's child process exits, the Pi Web backend shall report the session lifecycle state as `killed` and release associated resources.

REQ-TERM2-009: When a managed tmux session is explicitly killed by user action, the Pi Web backend shall terminate the tmux session, report the lifecycle state as `killed`, and release associated resources.

REQ-TERM2-010: When a managed tmux session cannot be found during an attach or status check, the Pi Web backend shall report the session lifecycle state as `stale`.

REQ-TERM2-011: The Pi Web backend shall use the canonical lifecycle states `live`, `detached`, `killed`, `stale`, and `error` for managed tmux sessions. The state `closed` shall not be used for managed tmux sessions.

### Module 3 — Attach, List, and Kill Operations

REQ-TERM2-012: When a client requests attach to an existing managed tmux session, the Pi Web backend shall validate the session identity and attach the client to the running tmux session.

REQ-TERM2-013: When a client requests attach to a managed tmux session that already has an attached client, the Pi Web backend shall detach the previous client and attach the requesting client, ensuring deterministic single-attachment replacement.

REQ-TERM2-014: When a client requests a list of managed tmux sessions, the Pi Web backend shall return only sessions that carry the managed prefix, along with each session's lifecycle state and identity.

REQ-TERM2-015: When a client requests kill on a managed tmux session, the Pi Web backend shall terminate the tmux session, report the `killed` state, and release resources.

REQ-TERM2-016: The Pi Web backend shall reject list, attach, or kill requests targeting tmux sessions that do not carry the managed prefix.

### Module 4 — Frontend Integration

REQ-TERM2-017: When a managed tmux session is in `detached` state, the Pi Web UI shall display the detached session state and offer attach and kill actions.

REQ-TERM2-018: When the user reconnects to a workspace with a `detached` managed tmux session, the Pi Web UI shall offer to attach to the existing session rather than automatically starting a new session.

REQ-TERM2-019: When a managed tmux session is in `live` state and the browser WebSocket disconnects, the Pi Web UI shall not display an error and shall allow reconnection to the same session.

REQ-TERM2-020: The Pi Web UI shall not inject terminal output as HTML; all terminal rendering for tmux sessions shall use the approved browser terminal emulator.

### Module 5 — Security and Validation

REQ-TERM2-021: The Pi Web backend shall bind to `127.0.0.1` by default, consistent with SPEC-TERM-001 security defaults.

REQ-TERM2-022: When any managed tmux start, attach, list, or kill operation is requested, the Pi Web backend shall validate origin, workspace, and command policy before tmux execution.

REQ-TERM2-023: When any managed tmux operation is requested, the Pi Web backend shall validate that the target session carries the managed prefix and that the session identity is sanitized.

REQ-TERM2-024: The Pi Web backend shall not construct tmux commands using shell-string concatenation from user-controlled input.

REQ-TERM2-025: The Pi Web backend shall emit only non-secret error states and reason codes to the client for tmux operation failures.

REQ-TERM2-026: If a tmux operation fails due to validation rejection, the Pi Web backend shall reject the operation before tmux execution, emit the documented rejected lifecycle event, and return only a generic client-visible error.

## Observable Events

These event names are implementation-planning constraints, not normative requirements.

- Managed tmux sessions use: `terminal.started`, `terminal.resized`, `terminal.detached`, `terminal.killed`, `terminal.stale`, `terminal.rejected`, `terminal.error`.
- Direct PTY sessions continue using SPEC-TERM-001 events: `terminal.started`, `terminal.resized`, `terminal.closed`, `terminal.rejected`, `terminal.error`.
- `terminal.closed` is not emitted for managed tmux sessions. `terminal.detached` and `terminal.killed` replace it.

## Security Policy (Extension of SPEC-TERM-001)

- All SPEC-TERM-001 security defaults apply: localhost binding, origin validation, workspace path canonicalization, command allowlist, no raw stream logging.
- Additional tmux constraints:
  - Only sessions with the managed prefix are operable through the API.
  - Session identity is sanitized before use in any tmux command argument.
  - Tmux binary path is resolved from configuration, not from user input.
  - Tmux mode is rejected cleanly when tmux is unavailable; no unsafe fallback to direct PTY.

## Constraints

- Architecture remains Astro + TypeScript frontend, Go backend.
- Browser terminal rendering uses `@xterm/xterm`; no custom ANSI parser.
- Tmux session management is local only; no remote tmux server support.
- Direct PTY mode (SPEC-TERM-001) is preserved unchanged.
- Security validation occurs before tmux execution starts.
- Same-session attach policy is single-attachment replacement (deterministic).

## Exclusions (What NOT to Build)

- No authentication system in this SPEC.
- No multi-user collaboration or shared terminal sessions in this SPEC.
- No database persistence for session state in this SPEC.
- No SSH/remote-host terminal support.
- No terminal replay or audit history recording.
- No arbitrary tmux console access — only managed start/attach/list/kill.
- No automatic fallback from tmux mode to direct PTY mode when tmux is unavailable.
- No production deployment workflow.

## MX Tag Plan

- Add `@MX:ANCHOR` to tmux runner lifecycle owner because start/attach/detach/kill have high fan-in.
- Add `@MX:WARN` near tmux command construction because shell injection is a local command execution risk.
- Add `@MX:WARN` near session name sanitization because unsanitized names can escape tmux argument boundaries.
- Add `@MX:NOTE` near single-attachment replacement logic to document the deterministic multi-client policy.
- Add `@MX:NOTE` near frontend reconnection logic to document why WebSocket close does not kill tmux sessions.
