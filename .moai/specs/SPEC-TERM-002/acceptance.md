# Acceptance Criteria: SPEC-TERM-002 Persistent tmux-backed Terminal Sessions

## Quality Gate Criteria

- `npm run build` passes.
- `npm run smoke` passes with persistent session UI checks.
- `go test ./...` passes.
- Existing direct PTY behavior from SPEC-TERM-001 remains covered and non-regressed.
- tmux unavailable path is testable and does not silently fall back to direct PTY.
- tmux session-name sanitization and prevention of user-controlled shell command text or arbitrary tmux commands are covered by backend tests.
- Managed session list/status exposes only Pi Web managed sessions and no raw terminal buffers.
- Kill/cleanup behavior is explicit and test-covered.
- Raw terminal streams are not logged by default.

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

## Given/When/Then Scenarios

### Scenario 1 — Direct PTY remains available

Given the terminal backend mode is configured as direct PTY
When the user opens a valid terminal session
Then the backend shall use direct PTY behavior
And existing close-on-disconnect behavior shall remain available
And the browser shall display the backend mode as `pty` or `direct`.

Covers: AC-TERM2-001.

### Scenario 2 — tmux unavailable is explicit

Given terminal backend mode is configured as tmux
And tmux is not available on the host
When the user opens a persistent terminal session
Then the backend shall reject with a non-secret unsupported reason code
And the UI shall show state `unsupported`
And the backend shall not start direct PTY as a silent fallback.

Covers: AC-TERM2-002, AC-TERM2-003.

### Scenario 3 — Start new managed tmux session

Given tmux mode is configured
And no managed tmux session exists for the selected workspace/session identity
And the workspace path and command pass validation
When the user opens the terminal session
Then the backend shall derive a sanitized managed tmux session identity
And the backend shall start `pi` in a new managed tmux session at the validated workspace path
And the UI shall show persistent attached state.

Covers: AC-TERM2-004.

### Scenario 4 — Reconnect to existing managed tmux session

Given a managed tmux session already exists for the selected workspace/session identity
When the user reconnects from the browser
Then the backend shall attach to the existing managed tmux session
And the backend shall not create a duplicate `pi` process
And if another browser tab was attached to the same managed session, the backend shall close the previous browser WebSocket while keeping the tmux session running
And the UI shall show state `attached` for the new attachment and `detached` for the replaced attachment.

Covers: AC-TERM2-005.

### Scenario 5 — Browser disconnect detaches without killing

Given a tmux-backed terminal session is attached
When the browser terminal connection disconnects
Then the backend shall detach the browser transport
And the managed tmux session shall remain running
And the session status shall become observable as `detached`.

Covers: AC-TERM2-006.

### Scenario 6 — List managed persistent sessions

Given one or more Pi Web managed tmux sessions exist
When the browser requests persistent session status
Then the backend shall return only managed sessions matching the configured prefix and allowed workspace roots
And the response shall include non-secret workspace/session identity and lifecycle state
And the response shall not include raw terminal buffers.

Covers: AC-TERM2-008.

### Scenario 7 — Kill managed tmux session explicitly

Given a managed tmux session exists
When the user confirms a kill action showing the session identity
Then the backend shall terminate that managed tmux session
And the backend shall report state `killed`
And unrelated tmux sessions shall not be affected.

Covers: AC-TERM2-010, AC-TERM2-011.

### Scenario 8 — Reject unsafe session name input

Given a workspace/session identity contains shell metacharacters, traversal-like text, or tmux target syntax
When the backend derives the managed session identity
Then the backend shall sanitize or reject the unsafe identity according to policy
And tmux execution shall not receive arbitrary user-controlled command syntax.

Covers: AC-TERM2-004, AC-TERM2-011, AC-TERM2-013.

### Scenario 9 — No arbitrary tmux console

Given a browser client sends a request that attempts to execute an arbitrary tmux command
When the request reaches the backend
Then the backend shall reject the request
And no API or UI surface shall execute arbitrary tmux commands.

Covers: AC-TERM2-012.

### Scenario 10 — No raw stream logging

Given a tmux-backed terminal session contains sensitive terminal input or output
When lifecycle events are logged
Then logs shall contain only event names, managed session identity, and non-secret reason codes
And raw terminal input/output streams shall not be logged by default.

Covers: AC-TERM2-014.

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

## Edge Cases

- tmux is installed but returns an unexpected non-zero status.
- A managed tmux session exists but its workspace no longer passes allowlist validation.
- Two different workspaces produce similar user-facing names; sanitized identity must avoid collision.
- Browser reconnects while another browser tab is attached; the new attachment replaces the previous browser attachment and the previous WebSocket is closed with observable `detached` state.
- Managed tmux session exits between list and reconnect action.
- Malformed session IDs or workspace IDs contain characters that look like tmux target syntax.
- Kill action targets a session that already exited; UI should report `stale` rather than stack traces.
- Direct PTY mode should not inherit tmux detach semantics.

## Definition of Done

- EARS requirements in `spec.md` have matching EARS acceptance criteria.
- Given/When/Then scenarios cover direct mode, tmux unavailable, start, attach, detach, list, kill, sanitization, no arbitrary tmux console, and no raw stream logging.
- Traceability matrix covers REQ-TERM2-001 through REQ-TERM2-026.
- Direct PTY mode remains available.
- tmux mode is explicit, observable, and testable.
- Security constraints are explicit and testable.
- MX tag targets are listed in `plan.md` and `spec.md`.
- Exclusions are explicit: no collaboration, no SSH, no DB persistence, no browser replay, no arbitrary tmux command console, no xterm.js replacement.
