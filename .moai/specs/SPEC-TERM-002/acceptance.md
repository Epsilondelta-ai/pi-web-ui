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

# SPEC-TERM-002 — Acceptance Criteria

## Acceptance Criteria (EARS)

AC-TERM2-001: The Pi Web backend shall support two terminal session modes — direct PTY and managed tmux — selectable at session start time. Covers REQ-TERM2-001.

AC-TERM2-002: When a session is started in direct PTY mode, the Pi Web backend shall apply the SPEC-TERM-001 close-on-disconnect lifecycle without modification. Covers REQ-TERM2-002.

AC-TERM2-003: If the system tmux binary is unavailable when tmux mode is requested, then the Pi Web backend shall reject the session start and emit a non-secret error observable to the client. Covers REQ-TERM2-003.

AC-TERM2-004: When a session is started in managed tmux mode, the Pi Web backend shall create a tmux session with a managed prefix, launch the configured command inside it, and attach the requesting client. Covers REQ-TERM2-004.

AC-TERM2-005: When a client WebSocket disconnects from a managed tmux session, the Pi Web backend shall report state `detached` and shall not terminate the tmux session or its child process. Covers REQ-TERM2-007, REQ-TERM2-011.

AC-TERM2-006: If a managed tmux session's child process exits, then the Pi Web backend shall report state `killed` and release associated resources. Covers REQ-TERM2-008, REQ-TERM2-011.

AC-TERM2-007: If a managed tmux session is explicitly killed by user action, then the Pi Web backend shall terminate the tmux session, report state `killed`, and release resources. Covers REQ-TERM2-009, REQ-TERM2-011, REQ-TERM2-015.

AC-TERM2-008: When a managed tmux session cannot be found during attach or status check, the Pi Web backend shall report state `stale`. Covers REQ-TERM2-010, REQ-TERM2-011.

AC-TERM2-009: Where the Pi Web UI displays a managed tmux session in `detached` state, the Pi Web UI shall show the session state and offer attach and kill actions. Covers REQ-TERM2-017.

AC-TERM2-010: When a client requests attach to an existing managed tmux session that already has an attached client, the Pi Web backend shall detach the previous client and attach the requesting client. Covers REQ-TERM2-012, REQ-TERM2-013.

AC-TERM2-011: When any managed tmux start, attach, list, or kill operation is requested, the Pi Web backend shall validate origin, workspace, command, managed prefix, and sanitized session identity constraints before tmux execution. Covers REQ-TERM2-022, REQ-TERM2-023, REQ-TERM2-026.

AC-TERM2-012: The Pi Web backend shall emit only non-secret error states and reason codes to the client for tmux operation failures and shall not expose backend stack traces, environment variables, or raw tmux output. Covers REQ-TERM2-025.

AC-TERM2-013: When a client requests a list of managed tmux sessions, the Pi Web backend shall return only sessions that carry the managed prefix with each session's lifecycle state and identity. Covers REQ-TERM2-014, REQ-TERM2-016.

AC-TERM2-014: While a managed tmux session is in `live` state and the browser WebSocket disconnects, the Pi Web UI shall allow reconnection to the same session without displaying an error state. Covers REQ-TERM2-018, REQ-TERM2-019.

AC-TERM2-015: When a managed tmux session is started, the Pi Web backend shall report the session lifecycle state as `live`. Covers REQ-TERM2-006, REQ-TERM2-011.

AC-TERM2-016: The Pi Web UI shall render all managed tmux session output through the approved browser terminal emulator (`@xterm/xterm`) and shall not inject terminal output as HTML. Covers REQ-TERM2-020.

AC-TERM2-017: The Pi Web backend shall bind to `127.0.0.1` by default for managed tmux session endpoints, consistent with SPEC-TERM-001 security defaults. Covers REQ-TERM2-021.

AC-TERM2-018: When a tmux operation outside the managed set (start, attach, list, kill) is requested, the Pi Web backend shall reject the request. Covers REQ-TERM2-005.

AC-TERM2-019: When the Pi Web backend constructs tmux commands, the backend shall not concatenate user-controlled input into shell strings. Covers REQ-TERM2-024.

## Edge Cases

| Edge Case | Expected Behavior |
|---|---|
| Tmux binary missing on system | Reject tmux mode start with non-secret error; direct PTY mode unaffected |
| Session name contains shell metacharacters | Sanitization rejects the name; no tmux command executed |
| Attach to non-existent session | Report `stale` state; no tmux command executed |
| Attach to session without managed prefix | Reject; no tmux command executed |
| List when no managed sessions exist | Return empty list |
| Kill already-dead session | Report `stale` or `killed`; no error |
| Backend crash leaves orphaned tmux sessions | Stale detection on next list/attach; kill operation cleans up |
| Concurrent attach to same session | Single-attachment replacement: previous client detached, new client attached (deterministic) |
| Direct PTY session receives tmux lifecycle events | No; direct PTY continues using SPEC-TERM-001 event vocabulary |

## Quality Gate Criteria

- All 26 requirements have at least one acceptance criterion covering them.
- Every matrix entry has a corresponding AC "Covers" annotation (zero padded entries).
- Every acceptance criterion is binary-testable with observable outcomes.
- No acceptance criterion uses weasel words (`appropriate`, `adequate`, `reasonable`, `good`, `proper`).
- Lifecycle vocabulary is consistent: `live`, `detached`, `killed`, `stale`, `error` for tmux sessions; `closed` not used for tmux.
- Same-session multi-client policy is deterministic and observable.
- All validation occurs before tmux execution.
- Error states are non-secret; no stack traces, environment variables, or raw output exposed.

## Definition of Done

- [ ] All 19 acceptance criteria pass automated or manual verification.
- [ ] Backend tests cover: start/attach/detach/kill/list, validation rejection, same-session attach, mode selection, argument-vector safety.
- [ ] Frontend tests cover: detached state display, attach/kill actions, reconnection without error, no HTML injection.
- [ ] `npm run build` and `npm run smoke` pass.
- [ ] `go test ./...` passes.
- [ ] `README.md` documents tmux persistence, security defaults, and configuration.
- [ ] No `terminal.closed` event emitted for managed tmux sessions.
- [ ] Managed prefix enforcement verified: non-managed sessions rejected on list/attach/kill.

## Traceability Matrix

| Requirement | Acceptance Coverage |
|---|---|
| REQ-TERM2-001 | AC-TERM2-001 |
| REQ-TERM2-002 | AC-TERM2-002 |
| REQ-TERM2-003 | AC-TERM2-003 |
| REQ-TERM2-004 | AC-TERM2-004 |
| REQ-TERM2-005 | AC-TERM2-018 |
| REQ-TERM2-006 | AC-TERM2-015 |
| REQ-TERM2-007 | AC-TERM2-005 |
| REQ-TERM2-008 | AC-TERM2-006 |
| REQ-TERM2-009 | AC-TERM2-007 |
| REQ-TERM2-010 | AC-TERM2-008 |
| REQ-TERM2-011 | AC-TERM2-005, AC-TERM2-006, AC-TERM2-007, AC-TERM2-008, AC-TERM2-015 |
| REQ-TERM2-012 | AC-TERM2-010 |
| REQ-TERM2-013 | AC-TERM2-010 |
| REQ-TERM2-014 | AC-TERM2-013 |
| REQ-TERM2-015 | AC-TERM2-007 |
| REQ-TERM2-016 | AC-TERM2-013 |
| REQ-TERM2-017 | AC-TERM2-009 |
| REQ-TERM2-018 | AC-TERM2-014 |
| REQ-TERM2-019 | AC-TERM2-014 |
| REQ-TERM2-020 | AC-TERM2-016 |
| REQ-TERM2-021 | AC-TERM2-017 |
| REQ-TERM2-022 | AC-TERM2-011 |
| REQ-TERM2-023 | AC-TERM2-011 |
| REQ-TERM2-024 | AC-TERM2-019 |
| REQ-TERM2-025 | AC-TERM2-012 |
| REQ-TERM2-026 | AC-TERM2-011 |
