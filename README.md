# pi-web-ui

Astro + Go app for controlling pi coding agent sessions in a browser.

## Frontend

```bash
npm install
npm run dev
npm run check
npm run build
npm run smoke
npm run preview
```

- Framework: Astro static output + TypeScript.
- Terminal renderer: `@xterm/xterm` + `@xterm/addon-fit`.
- Design source: `/Users/juunini/Downloads/pi web.zip` from Claude Design.
- Imported safe assets: `public/favicon.svg`, `public/wordmark.svg`.
- Main page: `src/pages/index.astro`.

## Backend

```bash
go test ./...
go run ./cmd/pi-web-ui
```

Default server address: `http://127.0.0.1:8787`.

The backend exposes the terminal WebSocket route:

```text
/api/terminals/{workspaceId}/sessions/{sessionId}?workspace=<path>
```

The browser terminal connects this route to xterm.js. The Go backend starts the configured `pi` command through a PTY and bridges terminal bytes over WebSocket.

Direct PTY mode preserves close-on-disconnect behavior. Managed tmux mode is additive and can be requested at session start:

```text
/api/terminals/{workspaceId}/sessions/{sessionId}?workspace=<path>&mode=tmux
```

Managed tmux sessions survive browser disconnects. Reconnect with `action=attach` to attach an existing session. Session management is intentionally narrow: start, attach, list, and kill only. No arbitrary tmux console is exposed.

Managed tmux REST helpers:

```text
GET  /api/tmux/sessions
POST /api/tmux/sessions/{managedName}/kill
```

## Local configuration

Environment variables:

| Variable                 | Default                   | Purpose                                 |
| ------------------------ | ------------------------- | --------------------------------------- |
| `PI_WEB_HOST`            | `127.0.0.1`               | Local bind host                         |
| `PI_WEB_PORT`            | `8787`                    | HTTP/WebSocket port                     |
| `PI_WEB_ORIGIN`          | `http://127.0.0.1:8787`   | Served UI origin                        |
| `PI_WEB_EXTRA_ORIGINS`   | empty                     | Comma-separated explicit dev origins    |
| `PI_WEB_WORKSPACE_ROOTS` | current working directory | Comma-separated allowed workspace roots |
| `PI_WEB_COMMAND`         | `pi`                      | Allowed command/path to run in terminal |
| `PI_WEB_TMUX_ENABLED`    | `true`                    | Enable managed tmux mode                |
| `PI_WEB_TMUX_BINARY`     | `tmux`                    | tmux binary path or lookup name         |
| `PI_WEB_TMUX_PREFIX`     | `piweb-`                  | Managed session name prefix             |

Security defaults:

- Binds to `127.0.0.1` by default.
- Accepts same-origin WebSocket connections only by default.
- Does not allow broad `http://localhost:*` origin wildcards.
- Canonicalizes workspace paths before allowlist comparison.
- Rejects command overrides; users cannot choose arbitrary commands.
- Does not log raw terminal input/output streams by default.
- Direct PTY lifecycle is close-on-disconnect. Reconnect starts a new process.
- Managed tmux lifecycle detaches on browser disconnect and preserves child process lifetime.
- Managed tmux operations reject sessions without the configured `PI_WEB_TMUX_PREFIX`.
- Tmux session identities are sanitized before execution.
- Backend constructs tmux commands as argument vectors; no shell string is built from user input.
- Tmux errors sent to clients use non-secret lifecycle events and reason codes only.

## Design mapping

The recovered pass translates the Claude Design zip into a phone-first Astro app shell:

- 375×812 PiFrame/iOS-style mobile shell, centered on desktop and full-screen on small devices
- black terminal surfaces and ANSI green accent from `design-system/colors_and_type.css`
- Pi Web wordmark/favicon from `design-system/*.svg`
- workspace home, session list, terminal screen, D-pad/keypad, and prompt grammar from `pi-screens.jsx` + `styles/pi-web.css`
- multiline `>` prompt textarea, new-workspace bottom sheet, approval diff modal, and settings overlay
- live xterm.js terminal mount in the terminal screen
- smoke verification in `scripts/smoke-check.mjs`

No raw HTML from the zip is injected at runtime. Terminal bytes are written to xterm.js through `term.write()`, never to `innerHTML`.

## Limitations

- No auth.
- No database persistence.
- No multi-user collaboration.
- Tmux-backed detached/reconnectable terminal sessions are supported locally when tmux is enabled.
- No SSH/remote terminal support.
