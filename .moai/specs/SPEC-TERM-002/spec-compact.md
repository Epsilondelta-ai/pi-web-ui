# SPEC-TERM-002 Compact: Persistent tmux-backed Terminal Sessions

## Requirements

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

## EARS Acceptance Criteria

AC-TERM2-001: The Pi Web backend shall expose `pty` and `tmux` as distinct terminal backend modes and shall keep direct PTY mode available. Covers REQ-TERM2-001, REQ-TERM2-002, REQ-TERM2-005.

AC-TERM2-002: When tmux mode is requested, the Pi Web backend shall detect tmux availability before persistent session start or attach. Covers REQ-TERM2-003.

AC-TERM2-003: If tmux mode is requested and tmux is unavailable, then the Pi Web backend shall emit an unsupported state with a non-secret reason code and shall not start a direct PTY fallback. Covers REQ-TERM2-004, REQ-TERM2-018.

AC-TERM2-004: When a valid persistent terminal request has no matching managed tmux session, the Pi Web backend shall derive a sanitized managed session identity and start `pi` in a new managed tmux session at the validated workspace path. Covers REQ-TERM2-006, REQ-TERM2-007, REQ-TERM2-008.

AC-TERM2-005: When a valid persistent terminal request matches an existing managed tmux session, the Pi Web backend shall attach one browser terminal transport to the existing session, close any previous browser attachment with observable detached state, and shall not start a duplicate `pi` process. Covers REQ-TERM2-009, REQ-TERM2-014, REQ-TERM2-018, REQ-TERM2-020.

AC-TERM2-006: If the browser terminal connection disconnects while in tmux-backed mode, then the Pi Web backend shall detach browser transport, keep the managed tmux session running, and make state `detached` observable. Covers REQ-TERM2-010, REQ-TERM2-017, REQ-TERM2-018.

AC-TERM2-007: If the `pi` process inside a managed tmux session exits or the managed tmux session target no longer exists, then the Pi Web backend and UI shall make state `stale` observable without stack traces or raw terminal fragments. Covers REQ-TERM2-011, REQ-TERM2-016, REQ-TERM2-018.

AC-TERM2-008: When the browser requests managed tmux session status, the Pi Web backend shall return only Pi Web managed sessions scoped to configured workspace allowlists with non-secret status fields. Covers REQ-TERM2-012, REQ-TERM2-013.

AC-TERM2-009: Where a tmux-backed session is attached, the Pi Web UI shall use xterm.js terminal input/output and resize behavior without browser-side replay storage. Covers REQ-TERM2-019.

AC-TERM2-010: When the user requests managed session cleanup, the Pi Web UI shall require explicit session identity visibility before the backend kills the managed tmux session and reports state `killed`. Covers REQ-TERM2-015, REQ-TERM2-018, REQ-TERM2-021.

AC-TERM2-011: When any managed tmux start, attach, list, status, or kill operation is requested, the Pi Web backend shall validate origin, workspace, command, managed prefix, and sanitized session identity constraints before tmux execution. Covers REQ-TERM2-022, REQ-TERM2-026.

AC-TERM2-012: The Pi Web backend shall not expose arbitrary tmux command execution through browser or API surfaces. Covers REQ-TERM2-023.

AC-TERM2-013: The Pi Web backend shall prevent user-controlled data from becoming shell command text or arbitrary tmux commands. Covers REQ-TERM2-024.

AC-TERM2-014: While tmux-backed sessions run, the Pi Web backend shall not log raw terminal input or output streams by default. Covers REQ-TERM2-025.

## Files to Modify

- `README.md`
- `cmd/pi-web-ui/main.go`
- `internal/config/config.go`
- `internal/config/config_test.go`
- `internal/server/server.go`
- `internal/server/server_test.go`
- `internal/terminal/handler.go`
- `internal/terminal/runner.go`
- `internal/terminal/events.go`
- `internal/terminal/*_test.go`
- `src/components/AppShell.astro`
- `src/scripts/app-shell.ts`
- `src/scripts/terminal-client.ts`
- `src/styles/app-shell.css`
- `src/styles/tokens.css`
- `scripts/smoke-check.mjs`
- Optional changes to `package.json` and `package-lock.json` only if needed.

## Planned New Files

- `internal/tmux/`
- `internal/tmux/*_test.go`
- Optional: `internal/session/`
- Optional: `src/scripts/session-client.ts`

## Lifecycle Vocabulary

- Backend modes: `pty`, `tmux`.
- Canonical visible lifecycle states: `live`, `attached`, `detached`, `stale`, `killed`, `error`, `unsupported`.
- Same-session policy: one attached browser per managed tmux session; a new attachment closes the previous WebSocket with observable `detached` state while the tmux session keeps running.
- No ambiguous `closed` state is used in v1 acceptance criteria.

## Exclusions

- No multi-user collaboration.
- No remote SSH terminal support.
- No database-backed persistence.
- No browser-side terminal replay storage.
- No arbitrary tmux command console.
- No replacement for xterm.js.
- No rich tmux pane/window management UI beyond managed session attach/list/status/kill.
- No authentication system.
- No production deployment workflow.
