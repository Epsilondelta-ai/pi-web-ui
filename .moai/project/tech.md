# Pi Web UI — Technology Context

_Last updated: 2026-05-14_

## Current Stack

| Area | Technology | Version / State |
|---|---|---|
| Frontend framework | Astro | `6.3.2` from lockfile |
| Language | TypeScript | `6.0.3` from lockfile |
| Type checking | `@astrojs/check` | `0.9.9` from lockfile |
| Formatting | Prettier | `3.8.3` |
| Astro formatting | `prettier-plugin-astro` | `0.14.1` |
| Styling | Plain CSS + custom tokens | `src/styles/*.css` |
| Runtime output | Static site | `astro.config.mjs` `output: "static"` |
| Backend | Go | planned, not implemented |
| Database | none | DB docs placeholders exist only |

## Package Scripts

```bash
npm run dev      # Astro dev server
npm run check    # astro check
npm run build    # astro check && astro build
npm run smoke    # text-based build artifact smoke checks
npm run format   # Prettier for Astro/CSS/TS/scripts/root config files
npm run preview  # Astro preview
```

## Frontend Implementation Notes

- Astro renders static HTML from `.astro` components.
- Browser behavior lives in `src/scripts/app-shell.ts` and uses direct DOM APIs.
- No React/Vue/Svelte island framework is installed.
- CSS is project-local and token-driven; Tailwind is not installed.
- External font import is intentionally avoided. The font stack starts with `JetBrains Mono` but falls back to system monospace fonts.
- Current UI is a static prototype: no backend calls, no persistence, no real pi process.

## Design Tokens

Primary tokens live in `src/styles/tokens.css`:

- Background: `#000000`, `#0a0a0a`, `#111111`, `#1a1a1a`.
- Foreground: `#f5f5f5`, `#d4d4d4`, muted grays.
- Accent: ANSI green `#00ff88`.
- Semantic UI colors: tool call amber, user message blue, thinking pink, danger red, info cyan.
- Spacing scale: 4px-based CSS custom properties.
- Modal shadow token: `--shadow-modal`.

Imported design token artifact also exists at `.moai/design/tokens.json`.

## Verification

Current quality gate:

1. `npm run check` for Astro/TypeScript diagnostics.
2. `npm run build` for static build.
3. `npm run smoke` for structural smoke checks against `dist/index.html` and source files.
4. `npm run format` for formatting.

Current smoke checks cover:

- document language and viewport fit.
- phone frame and iOS status bar presence.
- home/session/terminal screens.
- prompt textarea and keypad.
- workspace bottom sheet.
- approval modal with diff preview.
- settings modal.
- ARIA modal semantics.
- focus trap and inert background logic.
- external Google Fonts absence.

## Security Considerations

Current frontend:

- Does not inject raw Claude Design HTML.
- Dynamic terminal/demo messages are inserted via DOM `textContent`, not `innerHTML`.
- Approval UI is demo-only and does not execute commands.

Future backend must enforce:

- localhost-first default binding.
- authenticated WebSocket/API access before exposing beyond localhost.
- WebSocket origin checks.
- workspace allowlist/path validation.
- command allowlist; initial target should run only `pi` or controlled subcommands.
- no secret logging from terminal streams.
- explicit approval protocol for file writes and destructive shell operations.

## Planned Go Backend

No Go module exists yet. Recommended future structure:

```text
cmd/pi-web-ui/          # HTTP server entrypoint
internal/server/        # routing, middleware, static asset serving
internal/session/       # workspace/session lifecycle
internal/terminal/      # PTY + WebSocket bridge
internal/approval/      # tool approval events and policy
internal/config/        # local config and safe defaults
```

Likely backend dependencies when implemented:

- `github.com/creack/pty` for pseudo-terminal execution.
- `github.com/gorilla/websocket` or Go standard-compatible WebSocket library for terminal streaming.
- Go standard `net/http` for local server.

## Terminal Rendering Direction

To render pi exactly as terminal output appears, avoid custom ANSI parsing in the app UI. Use:

```text
xterm.js frontend
  <-> WebSocket
Go backend
  <-> PTY
pi process
```

Frontend likely dependencies when this SPEC is planned:

- `@xterm/xterm`
- `@xterm/addon-fit`
- optionally `@xterm/addon-web-links`

Important terminal requirements:

- `TERM=xterm-256color`.
- PTY cols/rows synchronized with xterm fit addon.
- raw keyboard input forwarded to PTY.
- stdout/stderr handled through one PTY stream.
- binary-safe WebSocket protocol or explicit text/control message split.

## CI/CD Status

- No GitHub Actions workflow is present in the current repo.
- Recommended first CI gate: install dependencies, run `npm run build`, run `npm run smoke`.
- Backend CI should be added only after Go module exists.

## Operational Status

- Current artifact is a static Astro app shell.
- `dist/`, `.astro/`, `node_modules/` are ignored build/local artifacts.
- Production deployment target has not been selected.

## Known Dependency Risk

`npm audit --audit-level=high` previously reported no high/critical vulnerabilities, but moderate vulnerabilities exist through `@astrojs/check` → `yaml-language-server` → `yaml`. Force-fixing would downgrade/break `@astrojs/check`, so it should be revisited when upstream releases a compatible fix.
