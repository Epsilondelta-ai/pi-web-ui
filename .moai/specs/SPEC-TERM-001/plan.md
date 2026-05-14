# Implementation Plan: SPEC-TERM-001 Real Terminal Rendering

## Plan Status

- SPEC ID: SPEC-TERM-001
- Status: draft
- Priority: High
- Scope: Astro xterm.js frontend + Go PTY/WebSocket backend for local `pi` terminal rendering
- Guard: Planning only. No implementation code in this document.

## Resolved Planning Decisions

| Decision | Resolution |
|---|---|
| Terminal endpoint identity | Workspace/session scoped route documented in spec.md Terminal Protocol section: `/api/terminals/{workspaceId}/sessions/{sessionId}` |
| V1 disconnect lifecycle | Close-on-disconnect: browser WebSocket disconnect closes PTY and terminates associated `pi` process |
| Reconnect behavior | Reconnect starts a new terminal session; no detach/resume in v1 |
| Browser renderer | xterm.js owns ANSI interpretation |
| Backend terminal execution | Go backend launches configured `pi` through PTY |
| Security validation timing | Origin, workspace, and command validation happen before terminal execution starts |
| Raw stream logging | Disabled by default |

## Technical Approach

### Architecture

```text
Browser PiFrame
  -> xterm.js terminal renderer
  -> WebSocket terminal bridge (workspace/session scoped route)
Go local backend
  -> HTTP/WebSocket server
  -> terminal session manager
  -> PTY-backed pi process
```

### Frontend Direction

- Preserve existing `AppShell.astro` phone-first screen structure.
- Replace static terminal transcript area with a terminal mount surface.
- Use xterm.js and FitAddon for terminal rendering and resize calculation.
- Keep design tokens aligned with `src/styles/tokens.css`.
- Ensure terminal bytes are written to xterm.js only, never to `innerHTML`.
- Convert mobile keypad actions into terminal input/control actions during live sessions.
- Display terminal connection states as visible text/status labels: `connecting`, `live`, `closed`, `rejected`, `error`.

### Backend Direction

- Add Go module and local HTTP server entrypoint.
- Add terminal package responsible for PTY lifecycle and lifecycle event emission.
- Launch only configured `pi` command through PTY.
- Set terminal environment compatible with 256-color output.
- Bridge PTY bytes and browser WebSocket messages.
- Apply resize events to PTY dimensions.
- Enforce localhost default, origin check, workspace allowlist, command allowlist, and no raw stream logging.

### Terminal Protocol Boundaries

- Connection identity: workspace ID and session ID come from the documented route `/api/terminals/{workspaceId}/sessions/{sessionId}`.
- Browser-to-backend input: raw terminal input for the active session.
- Browser-to-backend resize: terminal `cols` and `rows` for the active session.
- Backend-to-browser output: terminal execution output bytes/string for terminal emulator consumption.
- Backend-to-browser lifecycle events use documented stable names: `terminal.started`, `terminal.resized`, `terminal.closed`, `terminal.rejected`, `terminal.error`.
- Error events contain non-secret reason codes only; raw terminal stream fragments, stack traces, and environment variables are excluded.

## Milestones

### P1 — Terminal Contract and Frontend Mount

- Define terminal mount location in `AppShell.astro`.
- Add terminal-specific browser module boundary.
- Add xterm.js package dependencies.
- Preserve PiFrame visual language and responsive behavior.
- Update smoke checks to detect terminal mount, status labels, and no unsafe raw HTML path.

### P1 — Go Server and PTY Session Lifecycle

- Add Go module and server entrypoint.
- Add local server route documented as `/api/terminals/{workspaceId}/sessions/{sessionId}`.
- Add terminal session lifecycle ownership: start, resize, close, reject.
- Implement close-on-disconnect semantics for v1.
- Add lifecycle events for start, resize, close, reject, and error.
- Add safe defaults for host binding, origin, workspace, and command constraints.

### P1 — WebSocket Bridge and Resize Behavior

- Define observable terminal message/control behavior.
- Connect browser input to backend PTY input.
- Connect PTY output to browser xterm.js output.
- Connect xterm.js resize to PTY resize.
- Verify malformed messages emit `terminal.error` without crashing the session.

### P1 — Security Boundaries

- Bind `127.0.0.1` by default.
- Accept only the served Pi Web UI same-origin by default.
- Require explicit configuration for any additional development origin; do not allow broad `http://localhost:*` wildcard by default.
- Treat `localhost` and `127.0.0.1` origins as distinct unless both are explicitly configured or one is the same served origin.
- Load workspace allowlist roots from config and/or environment.
- Canonicalize workspace paths before allowlist comparison.
- Resolve the configured `pi` command path/name and reject other commands.
- Reject unsafe origin/workspace/command requests before terminal execution starts.
- Log lifecycle events and non-secret reason codes only.

### P2 — Verification and Documentation

- Add backend tests for allowed session start and rejected origin/workspace/command requests.
- Add backend tests for disconnect cleanup and process exit cleanup.
- Extend smoke checks for frontend terminal mount and live-session mock suppression.
- Document local run flow in README.
- Document security defaults and known limitations.

## Affected Files

### Existing files to modify

- `package.json`
- `package-lock.json`
- `src/components/AppShell.astro`
- `src/scripts/app-shell.ts`
- `src/styles/app-shell.css`
- `src/styles/tokens.css`
- `scripts/smoke-check.mjs`
- `README.md`

### Required new files/directories

- `go.mod`
- `go.sum`
- `cmd/pi-web-ui/`
- `internal/server/`
- `internal/terminal/`
- `internal/config/`
- `src/scripts/terminal-client.ts`
- Backend test files under `internal/**`

### Optional files/directories

- `internal/session/` — only if session lifecycle needs separation from `internal/terminal/`.
- `src/styles/terminal.css` — only if terminal-emulator-specific CSS separation improves maintainability.
- `src/scripts/terminal-protocol.ts` — only if protocol types need a dedicated module.

## Dependencies

### Frontend

- `@xterm/xterm`
- `@xterm/addon-fit`
- Optional: `@xterm/addon-web-links` only if clickable URLs are included in scope during implementation.

### Backend

- `github.com/creack/pty` or equivalent stable Go PTY package.
- Stable WebSocket package compatible with Go HTTP server. Package selection remains an implementation choice because the observable contract is defined by this SPEC.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Terminal fidelity breaks due to custom parsing | Require xterm.js; prohibit custom ANSI parser |
| Browser terminal and PTY dimensions drift | FitAddon resize event must update backend PTY size |
| Local command runner exposed too broadly | localhost default, origin check, workspace allowlist, command allowlist |
| Orphaned `pi` processes | close-on-disconnect lifecycle and cleanup tests |
| Secret leakage in logs | prohibit raw terminal stream logging by default |
| Existing static shell becomes confusing | replace mock transcript behavior for live sessions |
| Mobile keypad conflicts with xterm focus | define keypad as terminal input/control helper |

## MX Tag Plan

| Target | Tag | Reason |
|---|---|---|
| Terminal session lifecycle owner | `@MX:ANCHOR` | Start/resize/close behavior will be central and high fan-in |
| WebSocket validation path | `@MX:WARN` | Origin/workspace/command validation protects local command execution |
| PTY cleanup path | `@MX:WARN` | Orphan process risk |
| xterm.js frontend lifecycle | `@MX:NOTE` | Future agents must not replace emulator with ANSI parser |
| Mobile keypad mapping | `@MX:NOTE` | Prevent regression to mock transcript append behavior |

## Validation Plan

- Frontend: `npm run build`, `npm run smoke`.
- Backend: `go test ./...` once Go module exists.
- Backend security tests: invalid origin, invalid workspace, and invalid command reject before terminal execution starts and emit the documented rejected lifecycle event.
- Backend lifecycle tests: `pi` exit and WebSocket disconnect close PTY/session resources and emit `terminal.closed`.
- Frontend safety checks: terminal output path writes to xterm.js only and does not use raw HTML injection.
- Manual/local validation: start local server, open browser terminal, verify `pi` initial screen, input, resize, disconnect, and close behavior.

## No Longer Deferred

- Disconnect behavior is resolved as close-on-disconnect for v1.
- Terminal URL scope is resolved as `/api/terminals/{workspaceId}/sessions/{sessionId}`.
- Security policy boundaries are defined in `spec.md` and this plan.

## Remaining Implementation Choices

- Exact Go WebSocket package.
- Whether terminal client loads eagerly with app shell or lazily when terminal tab opens.
- Whether optional module split files are needed after implementation starts.
