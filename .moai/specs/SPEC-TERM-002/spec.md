---
id: SPEC-TERM-002
version: "0.1.0"
status: draft
created_at: "2026-05-14"
updated_at: "2026-05-14"
author: MoAI
priority: High
labels: [terminal, tmux, backend, session, persistence]
issue_number: 4
---

# SPEC-TERM-002: Persistent tmux-backed Terminal Sessions for Pi Web UI

## HISTORY

| Date | Version | Change | Author |
|---|---:|---|---|
| 2026-05-14 | 0.1.0 | Initial SPEC for tmux-backed persistent terminal session management after SPEC-TERM-001 | MoAI |
| 2026-05-14 | 0.1.0 | Addressed audit defects: EARS AC, Context section, lifecycle vocabulary, same-session attach policy, and outcome-focused tmux safety requirements | MoAI |

## Overview

Pi Web UI currently supports real terminal rendering through xterm.js and a Go direct PTY backend from SPEC-TERM-001. That direct PTY mode intentionally closes the `pi` process when the browser terminal connection disconnects. This SPEC defines the next feature: add a configurable tmux-backed terminal mode that can keep `pi` running after browser disconnect, allow reconnect/reattach, list managed persistent sessions, and explicitly kill sessions when the user chooses.

## Context / WHY

Long-running `pi` agent work should not be tied to a browser tab lifetime. Developers need to refresh the UI, move between workspace/session screens, or recover from transient WebSocket drops without killing the underlying agent process. tmux-backed persistence provides a local-first way to keep terminal sessions alive while preserving the existing xterm.js rendering path and security posture. The user value is predictable session continuity: browser attachment can come and go, while the managed `pi` process keeps running until the user explicitly kills it.

## Goals

- Preserve the current direct PTY mode as supported behavior.
- Add persistent terminal sessions for long-running `pi` workflows through tmux-backed management.
- Make tmux availability, attached/detached state, reconnect, and cleanup visible in the UI.
- Keep terminal rendering through xterm.js; do not introduce custom ANSI parsing.
- Maintain local-first security boundaries from SPEC-TERM-001.

## Architectural Constraints

These constraints describe the chosen implementation direction for this project. They are not user-facing product requirements.

- Frontend remains Astro + TypeScript with xterm.js as the only browser terminal renderer.
- Backend remains Go and continues serving local HTTP/WebSocket routes.
- Existing direct PTY mode remains available as `pty` mode.
- New persistent mode uses tmux and is selected through explicit configuration such as a terminal backend mode.
- tmux mode may attach browser transport through a PTY-backed `tmux attach` or equivalent safe bridge, as long as xterm.js receives terminal bytes and input remains raw terminal input.
- tmux session names are derived from workspace/session identity through a stable sanitization and prefixing policy.
- tmux orchestration must use argument-vector process execution, not shell-string command construction.
- V1 same-session attach policy is single attached browser per managed tmux session: a new browser attachment replaces the previous browser attachment by closing the previous WebSocket while the tmux session keeps running.
- Browser-side terminal replay storage is not allowed; persistence comes from tmux-managed terminal state.

## Affected Files

### Existing files likely to change

- `README.md` — document tmux mode, persistence semantics, unsupported state, and cleanup commands.
- `cmd/pi-web-ui/main.go` — wire terminal backend mode and tmux-aware dependencies into server construction.
- `internal/config/config.go` — add terminal backend mode, tmux command/path config, tmux session prefix, and validation.
- `internal/config/config_test.go` — cover mode parsing, tmux config defaults, and invalid config rejection.
- `internal/server/server.go` — register session list/status/cleanup routes if they live outside the WebSocket handler.
- `internal/server/server_test.go` — verify new routes and safe static/API behavior.
- `internal/terminal/handler.go` — route terminal start/connect behavior through selected backend and expose persistent lifecycle states.
- `internal/terminal/runner.go` — preserve direct PTY runner and integrate with backend selection if the runner abstraction remains the right boundary.
- `internal/terminal/events.go` — add lifecycle/status events for tmux persistence.
- `internal/terminal/*_test.go` — extend rejection, lifecycle, reconnect, detach, and protocol tests.
- `src/components/AppShell.astro` — expose persistent session state, reconnect, and kill controls.
- `src/scripts/app-shell.ts` — wire session controls to persistent session actions without mock transcript behavior.
- `src/scripts/terminal-client.ts` — handle tmux lifecycle/status events and reconnect semantics.
- `src/styles/app-shell.css` — style persistent/detached/attached/stale/unsupported session states.
- `src/styles/tokens.css` — add or reuse status tokens if needed.
- `scripts/smoke-check.mjs` — verify persistent-state UI, reconnect/kill controls, and no raw HTML terminal path.
- `package.json` and `package-lock.json` — change only if frontend verification or runtime dependencies require it.

### Planned new files/directories

- `internal/tmux/` — tmux availability detection, session naming, lifecycle orchestration, list/status, attach/detach/kill behavior.
- `internal/tmux/*_test.go` — fake tmux command runner tests for naming, argument construction, availability, list/status, attach/detach, and kill.
- `internal/session/` — optional shared session metadata boundary if terminal and tmux concerns need separation.
- `src/scripts/session-client.ts` — optional browser client for session list/status/reconnect/kill actions if separation improves maintainability.

## Requirement Modules

### Module 1 — Backend Mode and tmux Availability

REQ-TERM2-001: The Pi Web backend shall keep direct PTY terminal mode available as a supported terminal backend mode.

REQ-TERM2-002: When persistent terminal mode is configured, the Pi Web backend shall use tmux-backed session management for terminal sessions.

REQ-TERM2-003: When tmux-backed mode is requested, the Pi Web backend shall detect tmux availability before starting or attaching a persistent session.

REQ-TERM2-004: If tmux-backed mode is requested and tmux is unavailable, then the Pi Web backend shall reject the persistent session request with a non-secret unsupported reason code and shall not silently fall back to direct PTY mode.

REQ-TERM2-005: The Pi Web backend shall expose the active terminal backend mode to the browser through documented status or lifecycle data.

### Module 2 — Persistent Session Identity and Lifecycle

REQ-TERM2-006: When a valid tmux-backed terminal request includes a workspace/session identity, the Pi Web backend shall derive a stable managed tmux session identity from that workspace/session identity.

REQ-TERM2-007: The Pi Web backend shall sanitize managed tmux session names so user-controlled workspace/session values cannot become arbitrary tmux command arguments.

REQ-TERM2-008: When a valid persistent session starts and no matching managed tmux session exists, the Pi Web backend shall start `pi` inside a new managed tmux session at the validated workspace path.

REQ-TERM2-009: When a valid persistent session starts and a matching managed tmux session already exists, the Pi Web backend shall attach one browser terminal transport to the existing session, close any previous browser attachment for that managed session with observable detached state, and shall not start a duplicate `pi` process.

REQ-TERM2-010: If the browser terminal connection disconnects while using tmux-backed mode, then the Pi Web backend shall detach the browser transport, make state `detached` observable, and shall keep the managed tmux session running.

REQ-TERM2-011: If the `pi` process inside a managed tmux session exits, then the Pi Web backend shall make state `stale` observable to the browser.

### Module 3 — Persistent Session Discovery and Controls

REQ-TERM2-012: The Pi Web backend shall provide a way for the browser to list managed tmux sessions scoped to Pi Web managed session naming and configured workspace allowlists.

REQ-TERM2-013: The Pi Web backend shall expose non-secret status data for managed tmux sessions, including workspace/session identity, backend mode, and lifecycle state.

REQ-TERM2-014: When the user chooses reconnect for a detached managed session, the Pi Web UI shall attach the terminal view to the existing tmux-backed session.

REQ-TERM2-015: When the user chooses kill for a managed tmux session, the Pi Web backend shall terminate that managed tmux session and make state `killed` observable.

REQ-TERM2-016: If a requested managed tmux session is stale or cannot be attached because the managed target no longer exists, then the Pi Web UI shall display state `stale` with a generic message and shall not show backend stack traces or raw terminal stream fragments.

### Module 4 — Frontend Persistent Session UX

REQ-TERM2-017: The Pi Web UI shall distinguish terminal backend mode and lifecycle state with visible text, not color alone.

REQ-TERM2-018: The Pi Web UI shall support visible lifecycle states for `live`, `attached`, `detached`, `stale`, `killed`, `error`, and `unsupported` where those states apply.

REQ-TERM2-019: While a tmux-backed session is attached, the Pi Web UI shall continue to send terminal input and resize events through the existing terminal emulator path without browser-side terminal replay storage.

REQ-TERM2-020: Where a detached managed session exists, the Pi Web UI shall show a reconnect action that does not create a duplicate terminal session.

REQ-TERM2-021: Where a managed tmux session can be killed, the Pi Web UI shall require an explicit user action with session identity visible before requesting cleanup.

### Module 5 — Safety, Logging, and Compatibility

REQ-TERM2-022: When any managed tmux start, attach, list, status, or kill operation is requested, the Pi Web backend shall validate origin, workspace, command policy, managed prefix, and sanitized session identity constraints before tmux execution.

REQ-TERM2-023: The Pi Web backend shall not expose an arbitrary tmux command console through the browser or API.

REQ-TERM2-024: The Pi Web backend shall ensure user-controlled data cannot become shell command text or arbitrary tmux commands.

REQ-TERM2-025: The Pi Web backend shall not log raw terminal input or output streams from tmux-backed sessions by default.

REQ-TERM2-026: If a tmux operation violates origin, workspace, command, session-name, or managed-prefix constraints, then the Pi Web backend shall reject the operation before tmux execution and return only non-secret client-visible error information.

## tmux Session Protocol and Observable Events

These protocol details are implementation-planning constraints, not normative requirement wording.

- Backend mode values: `pty` and `tmux`.
- Managed tmux session prefix: project-configured prefix with safe default such as `piweb_`.
- Managed session identity: derived from `workspaceId`, `sessionId`, and a canonical workspace hash to reduce collisions.
- Persistent lifecycle event names match UI states: `terminal.live`, `terminal.attached`, `terminal.detached`, `terminal.stale`, `terminal.killed`, `terminal.error`, and `terminal.unsupported`.
- Same-session multi-client policy: one browser attachment is active per managed tmux session; a new attachment closes the previous attachment WebSocket and emits `terminal.detached` for that previous attachment while the tmux session remains running.
- Session list/status data should include only non-secret identity/status fields and must not include raw terminal buffers.
- Kill/cleanup action targets only Pi Web managed tmux sessions matching the configured prefix and workspace allowlist.

## Security Policy Boundaries

- Default direct PTY behavior remains protected by existing origin/workspace/command validation.
- tmux mode must apply the same origin and workspace validation before start, attach, list, or kill operations.
- tmux session names must be sanitized and prefix-constrained.
- User-controlled strings must never be concatenated into shell command strings.
- No arbitrary tmux command execution API is allowed.
- tmux listing must include only Pi Web managed sessions and must not expose unrelated user tmux sessions.
- Logging may include lifecycle event names, managed session identity, and non-secret reason codes; raw terminal streams are excluded.

## Acceptance Criteria (EARS)

AC-TERM2-001: The Pi Web backend shall expose `pty` and `tmux` as distinct terminal backend modes and shall keep direct PTY mode available. Covers REQ-TERM2-001, REQ-TERM2-002, REQ-TERM2-005.

AC-TERM2-002: When tmux mode is requested, the Pi Web backend shall detect tmux availability before persistent session start or attach. Covers REQ-TERM2-003.

AC-TERM2-003: If tmux mode is requested and tmux is unavailable, then the Pi Web backend shall emit an unsupported state with a non-secret reason code and shall not start a direct PTY fallback. Covers REQ-TERM2-004, REQ-TERM2-018.

AC-TERM2-004: When a valid persistent terminal request has no matching managed tmux session, the Pi Web backend shall derive a sanitized managed session identity and start `pi` in a new managed tmux session at the validated workspace path. Covers REQ-TERM2-006, REQ-TERM2-007, REQ-TERM2-008.

AC-TERM2-005: When a valid persistent terminal request matches an existing managed tmux session, the Pi Web backend shall attach one browser terminal transport to the existing session, close any previous browser attachment with observable detached state, and shall not start a duplicate `pi` process. Covers REQ-TERM2-009, REQ-TERM2-014, REQ-TERM2-020.

AC-TERM2-006: If the browser terminal connection disconnects while in tmux-backed mode, then the Pi Web backend shall detach browser transport, keep the managed tmux session running, and make state `detached` observable. Covers REQ-TERM2-010, REQ-TERM2-017, REQ-TERM2-018.

AC-TERM2-007: If the `pi` process inside a managed tmux session exits or the managed tmux session target no longer exists, then the Pi Web backend and UI shall make state `stale` observable without stack traces or raw terminal fragments. Covers REQ-TERM2-011, REQ-TERM2-016.

AC-TERM2-008: When the browser requests managed tmux session status, the Pi Web backend shall return only Pi Web managed sessions scoped to configured workspace allowlists with non-secret status fields. Covers REQ-TERM2-012, REQ-TERM2-013.

AC-TERM2-009: Where a tmux-backed session is attached, the Pi Web UI shall use xterm.js terminal input/output and resize behavior without browser-side replay storage. Covers REQ-TERM2-019.

AC-TERM2-010: When the user requests managed session cleanup, the Pi Web UI shall require explicit session identity visibility before the backend kills the managed tmux session and reports state `killed`. Covers REQ-TERM2-015, REQ-TERM2-021.

AC-TERM2-011: When any managed tmux start, attach, list, status, or kill operation is requested, the Pi Web backend shall validate origin, workspace, command, managed prefix, and sanitized session identity constraints before tmux execution. Covers REQ-TERM2-022, REQ-TERM2-026.

AC-TERM2-012: The Pi Web backend shall not expose arbitrary tmux command execution through browser or API surfaces. Covers REQ-TERM2-023.

AC-TERM2-013: The Pi Web backend shall prevent user-controlled data from becoming shell command text or arbitrary tmux commands. Covers REQ-TERM2-024.

AC-TERM2-014: While tmux-backed sessions run, the Pi Web backend shall not log raw terminal input or output streams by default. Covers REQ-TERM2-025.

## Traceability Matrix

| Requirement | Acceptance Coverage |
|---|---|
| REQ-TERM2-001 | AC-TERM2-001 |
| REQ-TERM2-002 | AC-TERM2-001 |
| REQ-TERM2-003 | AC-TERM2-002 |
| REQ-TERM2-004 | AC-TERM2-003 |
| REQ-TERM2-005 | AC-TERM2-001 |
| REQ-TERM2-006 | AC-TERM2-004 |
| REQ-TERM2-007 | AC-TERM2-004 |
| REQ-TERM2-008 | AC-TERM2-004 |
| REQ-TERM2-009 | AC-TERM2-005 |
| REQ-TERM2-010 | AC-TERM2-006 |
| REQ-TERM2-011 | AC-TERM2-007 |
| REQ-TERM2-012 | AC-TERM2-008 |
| REQ-TERM2-013 | AC-TERM2-008 |
| REQ-TERM2-014 | AC-TERM2-005 |
| REQ-TERM2-015 | AC-TERM2-010 |
| REQ-TERM2-016 | AC-TERM2-007 |
| REQ-TERM2-017 | AC-TERM2-006 |
| REQ-TERM2-018 | AC-TERM2-003, AC-TERM2-005, AC-TERM2-006, AC-TERM2-007, AC-TERM2-010 |
| REQ-TERM2-019 | AC-TERM2-009 |
| REQ-TERM2-020 | AC-TERM2-005 |
| REQ-TERM2-021 | AC-TERM2-010 |
| REQ-TERM2-022 | AC-TERM2-011 |
| REQ-TERM2-023 | AC-TERM2-012 |
| REQ-TERM2-024 | AC-TERM2-013 |
| REQ-TERM2-025 | AC-TERM2-014 |
| REQ-TERM2-026 | AC-TERM2-011 |

## Constraints

- Direct PTY mode must remain available and must not regress SPEC-TERM-001 behavior.
- tmux mode requires local tmux availability; unsupported environments must fail visibly and safely.
- xterm.js remains the browser terminal renderer.
- Persistence is tmux-backed only; no database or browser replay storage is introduced.
- All tmux operations are scoped to Pi Web managed sessions.

## Exclusions (What NOT to Build)

- No multi-user collaboration in this SPEC.
- No remote SSH terminal support.
- No database-backed persistence.
- No browser-side terminal replay storage.
- No arbitrary tmux command console.
- No replacement for xterm.js.
- No rich tmux pane/window management UI beyond managed session attach/list/status/kill.
- No authentication system.
- No production deployment workflow.

## MX Tag Plan

- Add `@MX:ANCHOR` to tmux session lifecycle owner because start/attach/detach/list/kill behavior will have high fan-in.
- Add `@MX:WARN` near tmux session-name sanitization because bypass enables command/target injection risk.
- Add `@MX:WARN` near tmux operation execution because shell-string construction with user input is forbidden.
- Add `@MX:WARN` near persistent detach/kill policy because accidental kill or orphaned sessions are high-risk.
- Add `@MX:NOTE` near frontend persistent state mapping to document direct vs persistent state vocabulary.
- Add `@MX:NOTE` near session list/status API to clarify that only Pi Web managed sessions are exposed.
