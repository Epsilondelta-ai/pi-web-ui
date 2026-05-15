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

# SPEC-TERM-002 (Compact)

## Scope

Add tmux-backed persistent terminal sessions to Pi Web UI. Preserve SPEC-TERM-001 direct PTY mode unchanged. Managed tmux only — no arbitrary tmux console.

## Key Decisions

| Decision | Choice |
|---|---|
| Session modes | Direct PTY (TERM-001) + managed tmux (TERM-002) |
| Lifecycle states | `live`, `detached`, `killed`, `stale`, `error` |
| Deprecated state | `closed` (replaced by `detached`/`killed` for tmux) |
| Same-session attach | Single-attachment replacement (detach previous, attach new) |
| Tmux unavailable | Reject with error; no fallback to direct PTY |
| Session naming | Managed prefix required; no arbitrary tmux access |
| Command construction | Argument-vector only; no shell-string from user input |

## Requirements (26)

**Mode Selection (001–005):** Two modes, PTY preserved, tmux-unavailable reject, managed prefix, no arbitrary tmux.

**Lifecycle States (006–011):** Canonical states live/detached/killed/stale/error. `closed` not used for tmux. Detached = process survives disconnect. Killed = process terminated.

**Operations (012–016):** Attach validates identity. Same-session = single-attachment replacement. List returns managed-prefix sessions only. Kill terminates session. Non-managed sessions rejected.

**Frontend (017–020):** Detached shows state + attach/kill actions. Reconnect offers attach. WebSocket close not error for tmux. No HTML injection.

**Security (021–026):** Localhost binding. Validate origin/workspace/command before tmux. Managed prefix + sanitized identity. Argument-vector execution. Non-secret errors. Reject before execution on validation failure.

## Acceptance (19)

EARS-format binary-testable criteria covering all 26 requirements. Five ACs added in iteration 3 for REQs 005, 006, 020, 021, 024. See `acceptance.md`.

## Exclusions

No auth, collaboration, DB persistence, SSH/remote, replay/audit, arbitrary tmux, auto-fallback PTY, production deployment.
