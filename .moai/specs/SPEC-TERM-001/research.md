# Research: SPEC-TERM-001 Real Terminal Rendering

## Summary

Pi Web UI currently renders a static Astro phone-first shell. The next product-critical gap is real terminal rendering: when a user starts a `pi` session, the browser must display the same terminal behavior that a local terminal would show. Research conclusion: use xterm.js in the browser and a Go PTY/WebSocket bridge on the backend. Do not hand-write ANSI parsing.

## Project Context Read

- Product mission: browser control surface for local pi coding agent sessions (`.moai/project/product.md:5`).
- Current state: Astro static phone shell exists; Go backend and real PTY/WebSocket terminal are missing (`.moai/project/product.md:15-19`).
- Roadmap explicitly lists xterm.js integration and Go PTY/WebSocket endpoint as near-term items (`.moai/project/product.md:69-70`).
- Structure docs identify the planned data flow: browser app shell -> WebSocket -> Go backend -> PTY process -> pi command (`.moai/project/structure.md:98-103`).
- Tech docs already reject custom ANSI parsing and name xterm.js + PTY + WebSocket as the direction (`.moai/project/tech.md:113-135`).

## Existing Frontend Findings

### Current UI Shell

- Main shell component: `src/components/AppShell.astro`.
- Terminal screen exists as static markup at `src/components/AppShell.astro:159-170`.
- Current terminal messages are static/demo DOM content, not terminal emulator output (`src/components/AppShell.astro:170-199`).
- Current prompt bar is separate from terminal renderer and uses `textarea` plus keypad controls (`src/components/AppShell.astro:217-239`).
- Workspace, session, approval, and settings dialogs already exist in the phone frame (`src/components/AppShell.astro:79-348`).

### Current Browser Behavior

- `src/scripts/app-shell.ts:12` selects `[data-terminal]` as a generic HTMLElement.
- `src/scripts/app-shell.ts:77-84` appends synthetic messages using `textContent`, which is safe but cannot render ANSI/TUI accurately.
- `src/scripts/app-shell.ts:275-300` already handles modal keyboard focus trap; this must be preserved when xterm.js is embedded.
- `src/scripts/app-shell.ts:204`, `312`, `319` switch view to terminal in the current demo flow.

### Current Styling

- `src/styles/app-shell.css:300` defines current static `.terminal` surface.
- `src/styles/app-shell.css:448` defines current prompt bar. Real terminal input may move into xterm.js, but the prompt bar/keypad visual grammar should remain available for mobile controls.
- `src/styles/tokens.css` defines black surfaces and ANSI green accent tokens suitable for xterm.js theme: `--bg-0`, `--bg-1`, `--fg-*`, `--accent`, `--tool-call`, `--danger`.

### Verification Baseline

- `scripts/smoke-check.mjs:28-40` verifies static home/session/terminal/prompt/dialog structures.
- `scripts/smoke-check.mjs` currently does not verify xterm.js mounting, WebSocket state, resize propagation, or backend lifecycle.
- Package scripts support `npm run build` and `npm run smoke` (`package.json`).

## Backend Findings

- No `go.mod`, `cmd/`, or `internal/` backend directories exist (`.moai/project/structure.md:126`).
- Planned backend structure is documented in `.moai/project/tech.md:96-103`:
  - `cmd/pi-web-ui/`
  - `internal/server/`
  - `internal/session/`
  - `internal/terminal/`
  - `internal/approval/`
  - `internal/config/`
- Required backend capability is a local HTTP/WebSocket server that starts and manages a PTY-backed `pi` process.

## External Technical Direction

### Browser Terminal

Use xterm.js because it is a terminal emulator, not a text renderer. It handles ANSI escape sequences, cursor movement, alternate screen, color, keyboard input, resize events, and common TUI behavior. Required likely frontend packages:

- `@xterm/xterm`
- `@xterm/addon-fit`
- optionally `@xterm/addon-web-links`

### Go PTY Backend

Use `github.com/creack/pty` for pseudo-terminal execution. `exec.Command(...).StdoutPipe()` is insufficient because `pi` must believe it is attached to a terminal. PTY behavior must include:

- `TERM=xterm-256color`
- raw keyboard input forwarded to PTY
- browser resize mapped to PTY cols/rows
- stdout/stderr behavior represented through one PTY stream
- process termination and WebSocket disconnect cleanup

### WebSocket Bridge

The WebSocket bridge must carry terminal bytes and control messages. The plan should prefer either binary-safe frames or clearly separated text/control messages. Resize must be explicit and bounded. The browser must never inject terminal bytes as HTML.

## Risks and Constraints

| Risk | Impact | Mitigation |
|---|---|---|
| Custom ANSI parsing | Broken TUI, cursor, color, alternate screen | Require xterm.js renderer |
| PTY not used | `pi` output differs from local terminal | Require `creack/pty` backed process |
| Resize drift | Wrapped/misaligned terminal screen | FitAddon + backend `SetWinSize` behavior |
| WebSocket exposed beyond localhost | Local command execution risk | Default localhost, origin checks, command allowlist |
| Workspace path traversal | Unintended file system access | Workspace allowlist and path validation |
| Terminal stream logging secrets | Credential leakage | No raw stream logging by default |
| Prompt bar duplicates terminal input | Confusing UX | Define mobile controls as terminal input helpers or hide when xterm focused |

## Reference Implementation Strategy

- Internal reference: preserve current phone shell and token system (`src/components/AppShell.astro`, `src/styles/tokens.css`).
- Internal replacement point: replace or wrap static terminal body at `src/components/AppShell.astro:159-199` with a terminal mount area.
- Internal behavior split: move real terminal behavior out of generic `app-shell.ts` into terminal-specific browser module to avoid mixing static demo interactions with live stream lifecycle.
- Backend baseline: introduce Go module and backend directories from `.moai/project/tech.md:96-103`.

## Recommendation

Plan SPEC-TERM-001 as a brownfield + greenfield integration:

- Brownfield frontend: modify terminal screen in existing Astro app shell.
- Greenfield frontend module: add xterm.js client lifecycle.
- Greenfield backend: add Go server, PTY session manager, and WebSocket endpoint.
- Quality gate: add frontend smoke coverage for terminal mount and backend tests for security/session lifecycle.
