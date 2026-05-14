# Acceptance Criteria: SPEC-TERM-001 Real Terminal Rendering

## Quality Gate Criteria

- `npm run build` passes.
- `npm run smoke` passes with terminal mount, status, and no-raw-HTML checks updated.
- `go test ./...` passes after Go module exists.
- No terminal output path uses raw HTML injection.
- Security rejection tests prove invalid origin, workspace, or command does not launch terminal execution.
- Lifecycle tests prove browser terminal connection disconnect closes terminal resources and associated `pi` process in v1.
- Live terminal behavior uses xterm.js, not custom ANSI parsing.

## EARS Acceptance Criteria

AC-TERM-001: When a valid workspace/session opens a terminal connection, the Pi Web UI shall display a live terminal emulator inside the PiFrame and mark the connection state as `live`. Covers REQ-TERM-001, REQ-TERM-002, REQ-TERM-003, REQ-TERM-016.

AC-TERM-002: If terminal output contains ANSI escape sequences, then the Pi Web UI shall pass the output to the terminal emulator and shall not inject the bytes as HTML. Covers REQ-TERM-004, REQ-TERM-012.

AC-TERM-003: Where the mobile keypad exists while a session is `live`, the Pi Web UI shall send keypad actions as terminal input/control messages and shall not append mock transcript rows. Covers REQ-TERM-005, REQ-TERM-018.

AC-TERM-004: When a valid request reaches the documented workspace/session terminal route, the backend shall start exactly one terminal-backed `pi` process bound to that workspace/session identity and emit the documented started lifecycle event. Covers REQ-TERM-006, REQ-TERM-007, REQ-TERM-008, REQ-TERM-017, REQ-TERM-020.

AC-TERM-005: When the user types in the browser terminal, the Pi Web UI shall forward raw terminal input to the active terminal transport and the backend shall write it to the active terminal execution environment. Covers REQ-TERM-011.

AC-TERM-006: When the terminal viewport changes, the Pi Web UI shall send terminal columns/rows to the backend, and the backend shall apply them to the active terminal execution environment and emit the documented resized lifecycle event. Covers REQ-TERM-013, REQ-TERM-014, REQ-TERM-020.

AC-TERM-007: If malformed input or resize data is received, then the receiving side shall reject the malformed message, emit the documented error lifecycle event with a non-secret code, and keep the session process from crashing. Covers REQ-TERM-015, REQ-TERM-020.

AC-TERM-008: If the `pi` process exits or the browser terminal connection disconnects, then the backend shall close terminal session resources, emit the documented closed lifecycle event, and leave no unmanaged child process. Covers REQ-TERM-009, REQ-TERM-010, REQ-TERM-020.

AC-TERM-009: If a terminal session cannot start, then the UI shall show state `rejected` or `error` with a generic message and shall not display backend stack traces, environment variables, or raw terminal stream fragments. Covers REQ-TERM-019.

AC-TERM-010: The Pi Web backend shall bind to `127.0.0.1` by default. Covers REQ-TERM-021.

AC-TERM-011: If the terminal connection origin is not the served Pi Web UI origin or an explicitly configured development origin, then the backend shall reject before terminal execution starts, emit the documented rejected lifecycle event, and return only a generic client-visible error. Covers REQ-TERM-022, REQ-TERM-026.

AC-TERM-012: If the canonical workspace path is outside configured allowed roots, then the backend shall reject before terminal execution starts, emit the documented rejected lifecycle event, and return only a generic client-visible error. Covers REQ-TERM-023, REQ-TERM-026.

AC-TERM-013: If a request attempts to run a command other than the configured `pi` command path or command name, then the backend shall reject before terminal execution starts, emit the documented rejected lifecycle event, and return only a generic client-visible error. Covers REQ-TERM-024, REQ-TERM-026.

AC-TERM-014: While terminal sessions run, the backend shall not log raw terminal input or output streams by default. Covers REQ-TERM-025.

## Given/When/Then Scenarios

### Scenario 1 — Render live pi terminal screen

Given a valid local workspace and allowed `pi` command
When the user opens the terminal from the Pi Web terminal screen
Then the browser shall display the `pi` terminal screen through xterm.js
And ANSI colors and cursor behavior shall be interpreted by the terminal emulator
And the UI shall not render terminal bytes through HTML injection.

Covers: AC-TERM-001, AC-TERM-002, AC-TERM-004.

### Scenario 2 — Forward keyboard input

Given a live terminal session is connected
When the user types into the browser terminal
Then the Pi Web UI shall forward raw terminal input to the backend
And the backend shall write that input to the terminal-backed `pi` process
And the resulting terminal output shall appear in the browser terminal.

Covers: AC-TERM-005.

### Scenario 3 — Resize terminal viewport

Given a live terminal session is connected
When the terminal viewport changes size
Then the Pi Web UI shall send updated columns and rows to the backend
And the backend shall apply those dimensions to the terminal execution environment
And the backend shall emit the documented resized lifecycle event.

Covers: AC-TERM-006.

### Scenario 4 — Close session cleanly

Given a live terminal session is connected
When the browser terminal connection disconnects or the `pi` process exits
Then the backend shall close terminal session resources
And the backend shall emit the documented closed lifecycle event
And unmanaged child processes shall not remain
And reconnect shall start a new terminal session rather than resume the closed process.

Covers: AC-TERM-008.

### Scenario 5 — Reject unsafe terminal connection origin

Given a terminal connection request comes from a disallowed origin
When the request attempts to start a terminal session
Then the backend shall reject the request before terminal execution starts
And the backend shall emit the documented rejected lifecycle event with a non-secret reason code
And the browser shall show state `rejected` or `error` without backend stack traces.

Covers: AC-TERM-009, AC-TERM-011.

### Scenario 6 — Reject invalid workspace path

Given a terminal session request contains a workspace path outside configured allowed roots
When the request attempts to start `pi`
Then the backend shall reject the session before terminal execution starts
And no terminal stream shall be opened
And the backend shall emit the documented rejected lifecycle event with a non-secret reason code.

Covers: AC-TERM-012.

### Scenario 7 — Reject non-allowed command

Given the backend is configured to run only `pi`
When a request attempts to start another command
Then the backend shall reject the session before terminal execution starts
And the rejection shall be observable through the documented rejected lifecycle event in backend tests.

Covers: AC-TERM-013.

### Scenario 8 — Reject malformed terminal protocol message

Given a live terminal session is connected
When the browser or backend receives malformed input or resize data
Then the receiving side shall emit the documented error lifecycle event with a non-secret code
And the active terminal session shall not crash because of the malformed message.

Covers: AC-TERM-007.

### Scenario 9 — Prevent raw stream logging

Given a live terminal session is connected
When terminal input or output contains sensitive text
Then the backend shall not write raw terminal input or output streams to application logs by default
And lifecycle logs shall contain only event names and non-secret reason codes.

Covers: AC-TERM-014.

## Traceability Matrix

| Requirement | Acceptance Coverage |
|---|---|
| REQ-TERM-001 | AC-TERM-001 |
| REQ-TERM-002 | AC-TERM-001 |
| REQ-TERM-003 | AC-TERM-001 |
| REQ-TERM-004 | AC-TERM-002 |
| REQ-TERM-005 | AC-TERM-003 |
| REQ-TERM-006 | AC-TERM-004 |
| REQ-TERM-007 | AC-TERM-004 |
| REQ-TERM-008 | AC-TERM-004 |
| REQ-TERM-009 | AC-TERM-008 |
| REQ-TERM-010 | AC-TERM-008 |
| REQ-TERM-011 | AC-TERM-005 |
| REQ-TERM-012 | AC-TERM-002 |
| REQ-TERM-013 | AC-TERM-006 |
| REQ-TERM-014 | AC-TERM-006 |
| REQ-TERM-015 | AC-TERM-007 |
| REQ-TERM-016 | AC-TERM-001 |
| REQ-TERM-017 | AC-TERM-004 |
| REQ-TERM-018 | AC-TERM-003 |
| REQ-TERM-019 | AC-TERM-009 |
| REQ-TERM-020 | AC-TERM-004, AC-TERM-006, AC-TERM-007, AC-TERM-008, AC-TERM-011, AC-TERM-012, AC-TERM-013 |
| REQ-TERM-021 | AC-TERM-010 |
| REQ-TERM-022 | AC-TERM-011 |
| REQ-TERM-023 | AC-TERM-012 |
| REQ-TERM-024 | AC-TERM-013 |
| REQ-TERM-025 | AC-TERM-014 |
| REQ-TERM-026 | AC-TERM-011, AC-TERM-012, AC-TERM-013 |

## Edge Cases

- Malformed resize dimensions are rejected with the documented error lifecycle event and do not crash the session.
- Terminal connection disconnect during session startup closes any partially created terminal/process resources.
- Browser reconnect after closed session starts a new session rather than showing stale terminal output.
- Terminal output containing secrets is not written to application logs by default.
- Mobile keypad enter/escape/arrow actions do not append fake transcript rows during live sessions.
- Workspace paths with symlinks or traversal segments must be canonicalized before allowlist comparison.

## Definition of Done

- EARS requirements in `spec.md` have matching EARS acceptance criteria.
- Traceability matrix covers REQ-TERM-001 through REQ-TERM-026.
- Frontend terminal renderer is planned as xterm.js.
- Backend terminal execution is planned as Go PTY + WebSocket.
- Lifecycle policy is explicit: close-on-disconnect in v1.
- Terminal endpoint identity is documented in `spec.md` Terminal Protocol section.
- Security constraints are explicit and testable.
- MX tag targets are listed in `plan.md` and `spec.md`.
- Exclusions are explicit: no auth, no multi-user collaboration, no DB persistence, no custom ANSI parser, no detached terminal persistence.
