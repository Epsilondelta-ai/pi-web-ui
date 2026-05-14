# Design Direction: SPEC-TERM-002 Persistent tmux-backed Terminal Sessions

## Purpose

Define UI/session UX direction for persistent tmux-backed terminal sessions. This is planning only; no implementation code is included.

## Intent Statement

### Who is this human?

A local-first agent workflow power user who starts long-running `pi` coding sessions, refreshes the browser, changes workspaces, and expects the agent process to keep working unless they explicitly stop it.

### What must they accomplish?

They must understand whether a terminal is direct or persistent, whether a tmux-backed session is attached or detached, and how to reconnect or intentionally kill a persistent session without ambiguity.

### What should it feel like?

Like a compact mission-control surface for local agent sessions: terminal-first, explicit, calm, and hard to misuse. Persistent sessions should feel durable, not magical.

## UX Principles

1. **Persistence must be visible**
   - A persistent tmux session should never look identical to direct PTY mode.
   - State labels should include text, not color alone.

2. **Detach is not close**
   - Browser disconnect in tmux mode leaves `pi` running.
   - UI must communicate detached vs closed clearly.

3. **Kill must be explicit**
   - Killing a tmux session is destructive relative to persistence.
   - Use a confirmation surface with session identity and workspace path.

4. **Reconnect should be low friction**
   - Existing tmux sessions should appear in a session list/status surface.
   - Reconnect should attach to the selected session rather than start a duplicate.

5. **No fake replay**
   - Browser must not invent terminal history.
   - Any preserved state comes from tmux/terminal attach behavior, not browser-side replay storage.

## Session State Vocabulary

Recommended visible labels:

| State | Meaning | User action |
|---|---|---|
| `direct` | Current close-on-disconnect PTY mode | use normally |
| `persistent` | tmux backend is enabled for this session | know session may survive browser close |
| `attached` | browser is currently attached to tmux-backed `pi` session | interact normally |
| `detached` | tmux session exists, no browser attached | reconnect or kill |
| `stale` | tmux session record/name exists but cannot attach cleanly | inspect or cleanup |
| `unsupported` | tmux mode requested but tmux is unavailable | switch mode or install tmux |
| `rejected` | safety validation denied session | correct workspace/origin/config |
| `error` | non-secret runtime error | retry or inspect server logs |

## UI Components to Plan

### Terminal header badge

- Show backend mode: `pty` or `tmux`.
- Show session state: `attached`, `detached`, `stale`, etc.
- Keep current compact PiFrame header density.

### Session list/status rows

Persistent tmux rows should show:

- workspace name/path summary;
- session name;
- backend mode (`tmux`);
- state (`detached`, `attached`, `stale`);
- last observable lifecycle status if available;
- available actions: reconnect, kill.

### Reconnect control

- Primary action for `detached` sessions.
- Should attach to the existing tmux session rather than create a new one.
- Should retain the existing terminal mount and use xterm.js.

### Kill/cleanup control

- Destructive action.
- Should require confirmation with the session identity and workspace path.
- Should never be triggered by a browser close.

### Unsupported tmux state

When tmux is unavailable:

- show `unsupported` state;
- explain `tmux` was requested but not available;
- offer non-destructive fallback guidance to direct `pty` mode;
- do not silently run direct PTY if user explicitly requested tmux mode.

## Defaults to Avoid

- Generic green/red status dots without text.
- Treating browser tab close as session kill in tmux mode.
- Auto-killing detached sessions without a visible cleanup action.
- Browser-side terminal replay cache that pretends to be tmux persistence.
- Arbitrary tmux command input UI.
- Hidden fallback from tmux mode to direct PTY after tmux failure.

## Visual Direction

- Maintain black terminal surfaces and ANSI green accent.
- Use existing muted grays for secondary state metadata.
- Use warning/danger styling for kill/cleanup only.
- Keep controls touch-friendly and keyboard reachable.
- Preserve current PiFrame mobile-first layout.

## Accessibility Direction

- State changes must be announced through existing status/live regions.
- Reconnect and kill controls need visible labels, not icon-only actions.
- Kill confirmation must use accessible modal semantics consistent with current dialogs.
- Focus must return to the triggering session row after reconnect/kill dialog closes.

## Design Memory Alignment

This direction aligns with `.moai/design/system.md` and current terminal-first visual language:

- dark terminal surfaces;
- compact mobile shell;
- direct keyboard/control grammar;
- no raw HTML terminal rendering;
- local-first safety UX.

## Out of Scope for Design

- Multi-user collaboration indicators.
- Remote SSH host browsing.
- Database-backed session history screens.
- Browser replay timeline.
- Rich tmux pane/window management UI.
