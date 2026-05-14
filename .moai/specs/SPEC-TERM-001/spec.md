---
id: SPEC-TERM-001
version: "0.1.0"
status: draft
created_at: "2026-05-14"
updated_at: "2026-05-14"
author: MoAI
priority: High
labels: [terminal, backend, frontend, websocket, pty]
issue_number: 2
---

# SPEC-TERM-001: Real Terminal Rendering for Pi Web UI

## HISTORY

| Date | Version | Change | Author |
|---|---:|---|---|
| 2026-05-14 | 0.1.0 | Initial SPEC for browser terminal emulator + Go PTY/WebSocket terminal rendering | MoAI |
| 2026-05-14 | 0.1.0 | Addressed plan-audit defects: quoted frontmatter dates, EARS requirements, explicit lifecycle/session/security policies, acceptance traceability | MoAI |
| 2026-05-14 | 0.1.0 | Moved protocol/event specifics out of requirement text, narrowed origin policy, and added go.sum impact | MoAI |

## Overview

Pi Web UI shall render the actual terminal screen produced by running `pi` in a browser. The current Astro app shell shows a static terminal-like mock. This SPEC defines the next feature: replace mock terminal output with a real browser terminal emulator connected to a Go backend that runs `pi` through a pseudo-terminal.

## Goals

- Preserve terminal fidelity for `pi` output, including ANSI color, cursor movement, alternate screen behavior, raw keyboard input, and resize behavior.
- Keep the existing phone-first PiFrame UX and terminal visual language.
- Introduce a safe local Go backend bridge for PTY-backed sessions.
- Establish a minimal terminal protocol, session identity, and close-on-disconnect lifecycle without adding unrelated auth, collaboration, or persistence systems.

## Architectural Constraints

These constraints describe the chosen implementation architecture for this project. They are not user-facing product requirements.

- Frontend remains Astro + TypeScript with project-local CSS.
- Browser terminal rendering uses `@xterm/xterm` with `@xterm/addon-fit` for viewport sizing.
- Backend is Go and serves local HTTP/WebSocket routes.
- Terminal execution uses a pseudo-terminal through a stable Go PTY library such as `github.com/creack/pty`.
- Browser/backend terminal transport uses WebSocket.
- Terminal connection identity is workspace/session scoped; the exact route is defined in the Terminal Protocol section.
- V1 lifecycle is close-on-disconnect: when the browser WebSocket disconnects, the backend closes the PTY and terminates the associated `pi` process; reconnect starts a new terminal session.
- Backend launches the configured `pi` command with terminal environment compatible with 256-color output and a single terminal stream for fidelity.
- Terminal bytes must never be converted to application HTML; the browser terminal emulator owns ANSI interpretation.

## Affected Files

### Existing files to modify

- `package.json` — add terminal rendering dependencies and any required scripts.
- `package-lock.json` — update dependency lockfile.
- `src/components/AppShell.astro` — replace static terminal transcript area with live terminal mount surface and status affordance.
- `src/scripts/app-shell.ts` — disable mock terminal transcript behavior during live terminal sessions and route keypad/prompt actions to terminal controls.
- `src/styles/app-shell.css` — style the terminal mount inside the existing PiFrame layout.
- `src/styles/tokens.css` — expose terminal theme tokens that are missing from current token set.
- `scripts/smoke-check.mjs` — add structural checks for terminal mount and no unsafe raw HTML path.
- `README.md` — document local terminal rendering setup, security defaults, and limitations.

### Required new files/directories

- `go.mod` — Go module definition.
- `go.sum` — Go dependency checksum file for PTY/WebSocket dependencies.
- `cmd/pi-web-ui/` — local HTTP server entrypoint.
- `internal/server/` — HTTP route registration, static serving, WebSocket upgrade integration.
- `internal/terminal/` — PTY session lifecycle, WebSocket bridge, resize handling, lifecycle events.
- `internal/config/` — localhost binding, allowed origins, workspace allowlist, command allowlist settings.
- `src/scripts/terminal-client.ts` — browser terminal emulator lifecycle and WebSocket bridge.
- Backend test files under `internal/**` — session lifecycle and security rejection coverage.

### Optional files/directories

- `internal/session/` — only if session lifecycle needs separation from `internal/terminal/`.
- `src/styles/terminal.css` — only if terminal-emulator-specific CSS separation improves maintainability.
- `src/scripts/terminal-protocol.ts` — only if protocol types need a dedicated module.

## Requirement Modules

### Module 1 — Frontend Terminal Renderer

REQ-TERM-001: The Pi Web UI shall render live terminal output through the approved browser terminal emulator rather than a custom ANSI parser.

REQ-TERM-002: When a user opens the terminal screen, the Pi Web UI shall mount the browser terminal emulator within the existing PiFrame terminal area.

REQ-TERM-003: The Pi Web UI shall apply the existing black surface, monospace typography, and ANSI green accent design tokens to the terminal emulator.

REQ-TERM-004: If terminal output contains ANSI escape sequences, then the Pi Web UI shall delegate interpretation to the terminal emulator and shall not transform the output into HTML.

REQ-TERM-005: Where the mobile keypad exists, the Pi Web UI shall forward keypad actions as terminal input or terminal control actions rather than appending mock transcript messages.

### Module 2 — Backend Terminal Session Bridge

REQ-TERM-006: When a valid terminal connection request includes a workspace/session identity, the Pi Web backend shall create one terminal session bound to that workspace/session identity.

REQ-TERM-007: When a terminal session starts, the Pi Web backend shall launch the configured `pi` command in the selected terminal execution environment with 256-color-compatible terminal settings.

REQ-TERM-008: The Pi Web backend shall expose terminal output through a single terminal stream so stdout, stderr, cursor movement, and terminal redraw behavior match local terminal behavior.

REQ-TERM-009: If the `pi` process exits, then the Pi Web backend shall make the closed lifecycle state observable to the browser and release terminal session resources.

REQ-TERM-010: If the browser terminal connection disconnects, then the Pi Web backend shall close terminal resources, terminate the associated `pi` process, make the closed lifecycle state observable, and shall not leave unmanaged child processes.

### Module 3 — Input, Output, and Resize Protocol

REQ-TERM-011: When the user types in the browser terminal, the Pi Web UI shall forward raw terminal input to the backend terminal transport for the active workspace/session identity.

REQ-TERM-012: When the backend receives terminal output from the terminal execution environment, the Pi Web UI shall write that output to the terminal emulator without HTML injection.

REQ-TERM-013: When the terminal viewport size changes, the Pi Web UI shall send the current terminal columns and rows to the backend for the active workspace/session identity.

REQ-TERM-014: When the backend receives valid terminal resize dimensions, the Pi Web backend shall apply them to the active terminal execution environment before subsequent terminal redraws are expected.

REQ-TERM-015: If malformed input or resize messages are received, then the receiving side shall reject the message, make a non-secret error state observable, and keep the active session from crashing.

### Module 4 — Session Lifecycle and User Feedback

REQ-TERM-016: The Pi Web UI shall display non-color-only connection states named `connecting`, `live`, `closed`, `rejected`, and `error`.

REQ-TERM-017: When a workspace/session is selected, the Pi Web UI shall connect terminal transport using the documented workspace/session route and shall display the same workspace/session identity in the terminal header.

REQ-TERM-018: While a terminal session is `live`, the Pi Web UI shall prevent mock terminal transcript behavior from appending rows into the live terminal output area.

REQ-TERM-019: If a session cannot start, then the Pi Web UI shall show state `rejected` or `error` with a generic user-facing message, and shall not display backend stack traces, raw environment variables, or raw terminal stream fragments.

REQ-TERM-020: The Pi Web backend shall expose stable documented lifecycle event names so tests can verify start, resize, close, rejection, and error behavior without reading raw terminal streams.

### Module 5 — Security and Safety Constraints

REQ-TERM-021: The Pi Web backend shall bind to `127.0.0.1` by default.

REQ-TERM-022: Before accepting a terminal connection, the Pi Web backend shall validate the request origin against the served Pi Web UI origin by default and any explicitly configured additional development origins.

REQ-TERM-023: Before starting `pi`, the Pi Web backend shall canonicalize the requested workspace path and validate that it stays within configured allowed workspace roots from config or environment.

REQ-TERM-024: Before starting `pi`, the Pi Web backend shall resolve the configured command path or command name and reject any request attempting to run a different command.

REQ-TERM-025: The Pi Web backend shall not log raw terminal input or output streams by default.

REQ-TERM-026: If a request violates origin, workspace, or command constraints, then the Pi Web backend shall reject the session before launching terminal execution, make the rejection observable with a non-secret reason code, and return only a generic client-visible error message.

## Terminal Protocol and Observable Events

These protocol details are implementation-planning constraints, not normative requirement wording.

- Terminal route: `/api/terminals/{workspaceId}/sessions/{sessionId}`.
- Connection identity: `workspaceId` and `sessionId` are the stable terminal session identity.
- Browser-to-backend input: raw terminal input for the active workspace/session identity.
- Browser-to-backend resize: terminal `cols` and `rows` for the active workspace/session identity.
- Backend-to-browser output: terminal execution output for terminal emulator consumption.
- Documented lifecycle event names: `terminal.started`, `terminal.resized`, `terminal.closed`, `terminal.rejected`, and `terminal.error`.
- Lifecycle/error events contain non-secret status or reason codes only.

## Security Policy Boundaries

- Default bind address: `127.0.0.1` only.
- Default WebSocket origin policy: same-origin only from the served Pi Web UI origin.
- Additional development origins: must be explicitly configured; no broad `http://localhost:*` wildcard is allowed by default.
- Origin distinction: `localhost` and `127.0.0.1` are distinct origin host strings unless both are explicitly configured or one is the same served origin.
- Workspace allowlist source: project config and/or environment variable; all requested paths must be canonicalized before comparison.
- Workspace path rule: a canonical workspace path must remain within one configured allowed root after symlink/path traversal resolution.
- Command allowlist source: configured `pi` command path or command name; user requests cannot override it.
- Rejection rule: origin, workspace, and command validation happen before terminal execution starts.
- Logging rule: lifecycle event names and non-secret reason codes may be logged; raw terminal streams are not logged by default.

## Acceptance Criteria (EARS)

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

## Constraints

- Architecture choices are limited to Astro + TypeScript frontend and Go backend.
- Browser terminal rendering uses xterm.js; no custom ANSI parser is allowed.
- V1 terminal sessions close on WebSocket disconnect; detach/persistent terminal sessions are excluded.
- Terminal endpoint identity is workspace/session scoped and documented in the Terminal Protocol section.
- Security validation occurs before terminal execution starts.

## Exclusions (What NOT to Build)

- No authentication system in this SPEC.
- No multi-user collaboration in this SPEC.
- No database persistence unless explicitly required by a later SPEC.
- No custom ANSI parser.
- No SSH/remote-host terminal support.
- No detached/reconnectable terminal persistence in v1.
- No approval/tool-call policy redesign beyond preserving existing UI boundaries.
- No production deployment workflow.

## MX Tag Plan

- Add `@MX:ANCHOR` to terminal session lifecycle owner in `internal/terminal/` because PTY start/resize/close behavior will have high fan-in.
- Add `@MX:WARN` near WebSocket origin/workspace/command validation because bypasses create local command execution risk.
- Add `@MX:WARN` near PTY process cleanup logic because orphaned child processes are dangerous.
- Add `@MX:NOTE` near frontend terminal mount lifecycle to document why xterm.js owns ANSI interpretation.
- Add `@MX:NOTE` near any mobile keypad-to-terminal-input mapping to prevent future mock transcript regression.
