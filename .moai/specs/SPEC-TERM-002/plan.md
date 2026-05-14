# Implementation Plan: SPEC-TERM-002 Persistent tmux-backed Terminal Sessions

## Plan Status

- SPEC ID: SPEC-TERM-002
- Status: draft
- Priority: High
- Scope: Add explicit tmux-backed persistent terminal mode while preserving direct PTY mode from SPEC-TERM-001.
- Guard: Planning only. No implementation code in this document.

## Relationship to SPEC-TERM-001

SPEC-TERM-001 delivered the browser terminal renderer and direct Go PTY/WebSocket bridge. It intentionally excluded detached/reconnectable terminal persistence. SPEC-TERM-002 builds on that foundation by adding tmux-backed persistence as an explicit mode.

## Resolved Planning Decisions

| Decision | Resolution |
|---|---|
| Default behavior | Keep existing `pty` mode supported; tmux mode is explicit/configurable. |
| Persistence mechanism | tmux-managed local sessions. |
| Disconnect behavior in tmux mode | Browser disconnect detaches transport; tmux session remains running. |
| Reconnect behavior | Attach to existing managed tmux session for matching workspace/session identity. |
| Same-session multi-client policy | Single attached browser per managed tmux session; a new browser attachment closes the previous browser WebSocket while tmux keeps running and previous attachment observes `detached`. |
| Session discovery | Provide managed session list/status scoped to Pi Web prefix and allowed workspaces. |
| Cleanup behavior | Explicit kill/cleanup action only; no browser-close kill in tmux mode. |
| Renderer | Continue using xterm.js; no custom ANSI parser or browser replay storage. |
| Security posture | Same origin/workspace/command validation plus tmux name sanitization; user-controlled data must not become shell command text or arbitrary tmux commands. Argument-vector process execution is the implementation constraint. |

## Technical Approach

### Architecture

```text
Browser PiFrame
  -> xterm.js terminal renderer
  -> WebSocket terminal bridge
  -> session list/status controls
Go local backend
  -> terminal backend mode selector: pty | tmux
  -> direct PTY runner (existing)
  -> tmux manager/runner (new)
  -> managed tmux session list/status/kill
  -> existing config/security validation
```

### Backend Direction

- Add terminal backend mode configuration: direct `pty` and persistent `tmux`.
- Preserve existing direct PTY runner behavior and close-on-disconnect semantics.
- Add a tmux-specific package or manager boundary for:
  - availability detection;
  - managed session naming;
  - start-or-attach behavior;
  - detach-on-disconnect behavior;
  - list/status behavior;
  - explicit kill/cleanup behavior.
- Use fake command runner tests for tmux orchestration and optional real-tmux integration tests only when safe and available.
- Keep origin/workspace/command validation before tmux operation execution.
- Use argument-vector command execution for tmux operations so user-controlled data never becomes shell command text or arbitrary tmux commands.

### Frontend Direction

- Preserve existing xterm.js terminal client and PiFrame layout.
- Add visible backend mode and lifecycle states.
- Add reconnect action for detached managed sessions.
- Add explicit kill action for managed tmux sessions with session identity visible.
- Add unsupported state for tmux unavailable.
- Do not add browser-side replay storage.

## Milestones

### P1 — Backend Mode Configuration

- Add terminal backend mode configuration with valid values `pty` and `tmux`.
- Add tmux command/path and managed prefix configuration.
- Validate invalid backend mode and invalid tmux prefix.
- Ensure direct PTY mode remains supported.

### P1 — tmux Manager Boundary

- Add tmux availability detection.
- Add stable managed session name derivation from workspace/session identity.
- Add session-name sanitization and collision-resistant workspace identity component.
- Add safe tmux operation abstraction that never constructs shell command strings from user input.
- Add tests for malicious workspace/session names and invalid tmux prefixes.

### P1 — Persistent Lifecycle

- Add start-or-attach behavior for tmux mode.
- If no matching managed session exists, start `pi` in a managed tmux session at validated workspace path.
- If matching managed session exists, attach to it without creating duplicate `pi` process.
- Enforce v1 single-attached-browser policy: a new browser attachment closes the previous WebSocket, emits/observes `detached` for that attachment, and keeps the tmux session running.
- On browser disconnect, detach browser transport and keep tmux session running.
- If tmux session exits or the managed target no longer exists, expose `stale` state; use `error` only for non-lifecycle operation failures.

### P1 — Session List/Status/Kill

- Add managed session list/status behavior scoped to configured workspace roots and Pi Web managed prefix.
- Add explicit kill/cleanup behavior for managed tmux sessions only.
- Ensure kill cannot target arbitrary user tmux sessions.
- Add tests for list filtering and kill target validation.

### P2 — Frontend UX

- Add visible backend mode badge.
- Add canonical visible lifecycle states: `live`, `attached`, `detached`, `stale`, `killed`, `error`, and `unsupported`.
- Add reconnect control for detached sessions.
- Add kill confirmation with session identity.
- Ensure state changes are keyboard/touch accessible and announced through current status surfaces.

### P2 — Verification and Documentation

- Extend smoke checks for persistent state UI and reconnect/kill controls.
- Add README section for tmux mode setup, requirements, persistence semantics, and cleanup.
- Run `go test ./...`, `go vet ./...`, `npm run build`, `npm run smoke`, and relevant audit checks.

## Affected Files

### Existing files likely to change

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
- `package.json` and `package-lock.json` only if required by frontend changes

### Planned new files/directories

- `internal/tmux/`
- `internal/tmux/*_test.go`
- Optional: `internal/session/`
- Optional: `src/scripts/session-client.ts`

## Dependencies

### External Runtime Dependency

- `tmux` installed on the local host when tmux mode is enabled.

### Go Dependencies

- Prefer Go standard `os/exec` for tmux process invocation using argument vectors.
- Existing terminal dependencies remain in use.
- Avoid adding a third-party tmux wrapper unless it significantly improves safety and testability.

### Frontend Dependencies

- Continue using existing `@xterm/xterm` and `@xterm/addon-fit`.
- Avoid new frontend dependencies unless required for accessible state/control behavior.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| tmux not installed | availability detection and `unsupported` state; no silent fallback |
| command injection through tmux names | sanitized session names, managed prefix, argument-vector execution, tests |
| accidental duplicate `pi` process | start-or-attach semantics and duplicate prevention tests |
| ambiguous multi-client attachment | v1 single-attached-browser policy with previous WebSocket close and observable `detached` state |
| orphaned persistent sessions | session list/status and explicit kill action |
| accidental session kill | confirmation with session identity and prefix/allowlist validation |
| unrelated tmux sessions exposed | list only Pi Web managed prefix and allowed workspaces |
| user confusion between direct and persistent | visible backend mode and lifecycle state text |
| terminal fidelity regression | keep xterm.js path and avoid browser replay/custom parser |

## Security Plan

- Reuse origin validation from direct PTY mode for all tmux APIs.
- Reuse workspace canonicalization and allowlist validation before start/attach/list/kill.
- Reuse command allowlist for the `pi` process started inside tmux.
- Add tmux session name sanitization and managed prefix validation.
- Use `exec.Command` style argument lists rather than shell strings as the implementation mechanism for preventing user-controlled shell command text.
- Forbid arbitrary tmux command console or user-provided tmux subcommands.
- Log lifecycle status and non-secret reason codes only.

## MX Tag Plan

| Target | Tag | Reason |
|---|---|---|
| tmux session lifecycle owner | `@MX:ANCHOR` | Start/attach/detach/list/kill will become a central high fan-in boundary |
| tmux session name derivation | `@MX:WARN` | User-controlled identity must not become tmux command/target injection |
| tmux operation executor | `@MX:WARN` | Shell string construction is forbidden for tmux operations |
| detach/kill policy | `@MX:WARN` | Mistakes cause orphan sessions or accidental process termination |
| frontend persistent state mapper | `@MX:NOTE` | Documents direct vs persistent UX vocabulary |
| session list/status API | `@MX:NOTE` | Clarifies managed-session-only exposure |

## Validation Plan

### Backend

- `go test ./...`
- `go vet ./...`
- Unit tests for backend mode config.
- Unit tests for tmux availability detection.
- Unit tests for sanitized managed session names.
- Unit tests proving malicious names do not become shell command strings.
- Unit tests for start new vs attach existing behavior using fake tmux runner.
- Unit tests for same-session multi-client replacement: new attach closes previous browser WebSocket, preserves tmux session, and emits/observes `detached` for the previous attachment.
- Unit tests for detach-on-disconnect semantics.
- Unit tests for list/status filtering by managed prefix and workspace allowlist.
- Unit tests for explicit kill and unrelated tmux session protection.
- Tests proving invalid origin/workspace/command/session-name rejects before tmux operation.

### Frontend

- `npm run build`
- `npm run smoke`
- Smoke checks for backend mode labels, persistent states, reconnect control, kill confirmation, unsupported state, and no raw HTML terminal path.
- Manual verification: tmux mode attach, browser refresh/detach, reconnect, kill, and direct PTY mode regression.

### Security

- Confirm no raw terminal stream logging by default.
- Confirm no arbitrary tmux command API exists.
- Confirm tmux operations are argument-vector based.
- Confirm managed session list does not expose unrelated tmux sessions.

## Implementation Notes for Run Phase

- Start by preserving direct PTY tests to avoid regression.
- Introduce tmux abstractions behind interfaces to keep tests deterministic.
- Keep API/status payloads minimal and non-secret.
- Prefer explicit errors over silent fallback when tmux mode is unavailable.
- Avoid database or file persistence for this SPEC; tmux itself is the persistence layer.

## Out of Scope for This Plan

- GitHub Issue creation.
- Implementation code in plan phase.
- Multi-user collaboration.
- Remote terminal/SSH.
- Browser terminal replay storage.
- Arbitrary tmux console or pane/window management UI.
