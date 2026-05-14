# Research: SPEC-TERM-002 Persistent tmux-backed Terminal Sessions

## Research Scope

This research supports planning only. No implementation code was written. The goal is to define the next step after SPEC-TERM-001: add persistent terminal session management using tmux while preserving the current direct PTY backend.

## Current Product Context

Pi Web UI is a local-first browser control surface for the `pi` coding agent. The product direction is terminal-first and safety-first. Current user needs include:

- viewing terminal output in browser without losing terminal fidelity;
- switching between workspaces and sessions;
- approving risky operations safely;
- supporting longer-running agent sessions without losing context.

SPEC-TERM-001 implemented the first real terminal path: browser xterm.js connected over WebSocket to a Go backend running `pi` through a direct PTY. That path intentionally uses close-on-disconnect semantics and excludes detached/reconnectable persistence.

## Current Code Architecture

### Frontend

- `src/components/AppShell.astro`
  - Owns the phone-first PiFrame layout.
  - Provides workspace/session mock rows and terminal mount data attributes.
  - Existing terminal surface includes `data-terminal-shell`, `data-terminal-mount`, `data-workspace-id`, `data-session-id`, and `data-workspace-path`.

- `src/scripts/app-shell.ts`
  - Owns screen switching and shell controls around the terminal.
  - Updates terminal shell dataset when workspace/session selection changes.
  - Dispatches `pi-terminal:send` and `pi-terminal:reconnect` custom events.
  - Already avoids appending mock transcript rows during live terminal use.

- `src/scripts/terminal-client.ts`
  - Owns xterm.js lifecycle.
  - Builds the terminal WebSocket URL from `workspaceId`, `sessionId`, and `workspace` query.
  - Handles lifecycle events: `terminal.started`, `terminal.resized`, `terminal.closed`, `terminal.rejected`, `terminal.error`.
  - Writes server output to `term.write(message.data)` and does not use `innerHTML`.

- `scripts/smoke-check.mjs`
  - Text-based verification for terminal mount, xterm dependencies, no raw HTML path, focus handling, and shell structure.

### Backend

- `cmd/pi-web-ui/main.go`
  - Loads config and starts the local HTTP server.
  - Logs lifecycle event names and non-secret reason codes only.

- `internal/config/config.go`
  - Defines local bind defaults, origin validation, workspace root validation, command allowlist, and canonical path handling.
  - Current environment config includes `PI_WEB_HOST`, `PI_WEB_PORT`, `PI_WEB_ORIGIN`, `PI_WEB_EXTRA_ORIGINS`, `PI_WEB_WORKSPACE_ROOTS`, and `PI_WEB_COMMAND`.

- `internal/server/server.go`
  - Registers `/api/terminals/` for terminal WebSocket routing.
  - Serves `dist/` and `/api/health`.

- `internal/terminal/handler.go`
  - Owns WebSocket validation, terminal session startup, browser protocol handling, resize, input forwarding, and close-on-disconnect cleanup.
  - Validates origin, workspace, and command before launching terminal execution.
  - Uses one `Runner` abstraction for starting a terminal session.

- `internal/terminal/runner.go`
  - Defines `Runner`, `Session`, and `StartRequest`.
  - Current `PTYRunner` starts the configured command in a direct PTY.
  - Direct PTY mode kills the process group on disconnect.

- `internal/terminal/events.go`
  - Defines lifecycle event names and event sink abstraction.

### Current Test Coverage Patterns

Current backend tests cover:

- invalid origin rejection before runner starts;
- invalid workspace rejection before runner starts;
- invalid command rejection before runner starts;
- malformed protocol handling;
- input forwarding;
- resize forwarding;
- disconnect cleanup;
- process group handling;
- server route/static/health behavior;
- config validation.

These tests establish useful patterns for the tmux feature: use fake runner/manager abstractions to test policy and lifecycle without requiring real tmux in every test.

## Findings

### F1 — Direct PTY is intentionally non-persistent

SPEC-TERM-001 V1 lifecycle is close-on-disconnect. This is correct for simple and safe local terminal sessions but conflicts with long-running agent workflows where browser refresh or network interruption should not kill the `pi` run.

Implication: tmux persistence should be additive, not a mutation of direct PTY semantics. The current `pty` mode should remain supported and preferably default.

### F2 — Existing `Runner` abstraction is the natural extension point

The backend already abstracts terminal execution behind `Runner.Start(ctx, StartRequest) (Session, error)`. tmux can be introduced through a new runner/manager layer while preserving the existing WebSocket handler shape.

However, tmux introduces operations that direct PTY does not need:

- detect tmux availability;
- create or reuse a named session;
- attach browser transport to an existing session;
- detach on browser disconnect without killing the session;
- list/status sessions;
- explicit kill/cleanup.

Implication: the implementation may need an `internal/tmux/` or `internal/session/` package rather than forcing all tmux concerns into `internal/terminal/handler.go`.

### F3 — Session identity already exists but needs stable tmux naming rules

The current route uses `workspaceId` and `sessionId`. These values can become logical tmux identity inputs, but raw user-provided strings must not become tmux commands or session names without sanitization.

Implication: tmux session names must be derived through a stable sanitization function and constrained prefix. Example planning contract: `piweb_<workspaceId>_<sessionId>_<hash>`, where unsafe characters are replaced and workspace hash prevents collisions.

### F4 — tmux availability must be observable

tmux is an external dependency. It may not be installed, may not be in PATH, or may fail due to platform constraints.

Implication: tmux mode needs a clear unsupported state that is visible in both backend tests and UI. It must fail before attempting arbitrary fallbacks that could surprise users.

### F5 — Attach/detach lifecycle changes browser semantics

In direct PTY mode, disconnect closes the session. In tmux mode, disconnect should detach the browser while the tmux session remains running. Reconnect should attach to the existing session and preserve terminal continuity where tmux supports it.

Implication: UI status needs more than `live/closed/rejected/error`. It should distinguish direct vs persistent and states such as `attached`, `detached`, `persistent`, and `stale`.

### F6 — Session list/status is required for usable persistence

Persistent sessions are not useful if the browser cannot find them. A session list/status API is needed for tmux sessions scoped to configured workspace roots and the Pi Web tmux prefix.

Implication: plan should include a read-only session status surface and a user-visible reconnect/kill affordance. This is not database persistence; it is discovery of existing tmux state.

### F7 — Security risks expand with tmux command orchestration

Direct PTY runs one configured command. tmux mode may require shelling out to `tmux` with session names and target panes. This introduces command injection risk if arguments are concatenated into shell strings.

Implication: implementation must use argument-vector execution, never shell string interpolation, and must reject unsafe session names before invoking tmux. There should be no arbitrary tmux command console.

### F8 — xterm.js remains the right renderer

tmux mode still emits terminal bytes. The browser should continue to use xterm.js. No browser replay buffer or custom ANSI parsing is needed.

Implication: frontend work is mostly state/control UX and connection target behavior, not terminal rendering replacement.

## Open Design Decisions Resolved for SPEC

| Topic | Planning Resolution |
|---|---|
| Default backend mode | Keep current direct `pty` mode supported; tmux mode is explicitly configurable. |
| Persistence policy | tmux mode detaches on browser disconnect and keeps tmux session running. |
| Reconnect policy | reconnect attaches to existing tmux session when a matching safe session exists. |
| Session discovery | add status/list behavior for Pi Web managed tmux sessions only. |
| Cleanup policy | explicit kill/cleanup action is required for tmux sessions. |
| Security posture | no arbitrary tmux commands; use sanitized names and argument-vector execution. |
| UI posture | add persistent/detached/attached/stale states and reconnect/kill controls. |

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| tmux command injection | Local arbitrary command execution | sanitized session names, argument-vector process calls, tests with malicious input |
| orphaned tmux sessions | runaway background agents | explicit kill/cleanup action and stale status visibility |
| confusing lifecycle differences | users think browser close killed process | clear persistent/detached/attached state labels |
| platform without tmux | feature appears broken | availability detection and unsupported state |
| session name collision | wrong session attach | stable naming with workspace/session identity and workspace hash |
| raw stream logging | secret leakage | continue no raw terminal stream logging policy |

## Recommended Implementation Boundaries

- Keep existing direct PTY behavior stable.
- Add tmux mode behind configuration such as terminal backend mode.
- Keep existing xterm.js renderer.
- Add backend abstraction for tmux lifecycle and session discovery.
- Add UI state and controls for persistent session operations.
- Test tmux orchestration with fake command runner plus a small integration path gated by tmux availability if needed.

## Reference Files

- `.moai/specs/SPEC-TERM-001/spec.md` — direct PTY terminal rendering contract and exclusions.
- `internal/terminal/handler.go` — current WebSocket validation, protocol, and direct PTY lifecycle boundary.
- `internal/terminal/runner.go` — current `Runner` abstraction and direct PTY implementation.
- `internal/config/config.go` — safe local config, origin, workspace, and command validation.
- `src/scripts/terminal-client.ts` — xterm.js client and lifecycle state handling.
- `src/scripts/app-shell.ts` — workspace/session selection and terminal custom events.
- `src/components/AppShell.astro` — PiFrame UI and terminal mount surface.
- `README.md` — current run flow and limitations.
