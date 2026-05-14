# Pi Web UI — Structure Context

_Last updated: 2026-05-14_

## Architecture Summary

현재 저장소는 Astro static frontend 중심 구조다. 애플리케이션은 단일 page entry(`src/pages/index.astro`)에서 `BaseLayout`과 `AppShell`을 조합해 phone-first UI shell을 렌더링한다. 상호작용은 `src/scripts/app-shell.ts`의 client-side event delegation으로 처리한다.

Go backend는 계획 상태이며, 현재 repo에는 `go.mod`, `internal/`, `cmd/` 같은 backend module이 없다.

## Top-Level Directories

| Path | Purpose | Current State |
|---|---|---|
| `src/` | Astro frontend source | 구현됨 |
| `src/components/` | UI components | `AppShell.astro` 중심 |
| `src/layouts/` | HTML document/layout wrapper | `BaseLayout.astro` |
| `src/pages/` | Astro routes | `/` 단일 page |
| `src/scripts/` | Browser TypeScript behavior | app shell event handling |
| `src/styles/` | Global CSS, tokens, app shell CSS | 구현됨 |
| `public/` | Static assets | favicon, wordmark |
| `scripts/` | Local verification scripts | smoke check |
| `.moai/design/` | Design artifacts and tokens | 존재, 일부 placeholder 포함 |
| `.moai/project/brand/` | Brand docs | 기존 파일 유지 |
| `.moai/project/db/` | DB docs placeholder | backend 미구현 상태 |

## Frontend Module Map

### `src/pages/index.astro`

- App entry route.
- `BaseLayout` 안에 `AppShell`을 렌더링한다.
- `src/styles/app-shell.css`를 page-level로 import한다.

### `src/layouts/BaseLayout.astro`

- HTML document shell.
- `lang="en"`, `viewport-fit=cover`, favicon, theme color, meta description을 설정한다.
- skip link를 제공해 main content로 이동 가능하게 한다.

### `src/components/AppShell.astro`

- 핵심 UI component.
- phone-frame 안에 iOS status bar, app header, screen stack, tab bar, prompt bar, dialogs를 구성한다.
- 화면 상태:
  - `home`: workspace 선택과 new workspace 진입.
  - `sessions`: session 목록과 branch/state badge.
  - `terminal`: agent message, thinking row, tool card.
- overlay/dialog:
  - new workspace bottom sheet.
  - approval diff modal.
  - model/settings dialog.

### `src/scripts/app-shell.ts`

- 단일 event delegation으로 static demo interaction을 처리한다.
- 주요 책임:
  - screen 전환(`home`, `sessions`, `terminal`).
  - workspace/session active state 및 ARIA state 업데이트.
  - prompt submit 시 terminal message append.
  - approval/settings/workspace dialogs 열기/닫기.
  - modal focus trap, focus restore, background inert 처리.
- 현재 network/API 호출은 없다.

### `src/styles/tokens.css`

- black terminal surface, ANSI green accent, foreground, borders, spacing, typography token 정의.
- Google Fonts import 없이 local/system monospace stack을 사용한다.

### `src/styles/global.css`

- global reset, base typography, body background, focus visible, skip link, button/input font inheritance를 정의한다.

### `src/styles/app-shell.css`

- phone-first PiFrame layout과 app shell 세부 스타일.
- 375×812 frame, safe-area padding, touch target 44px, small landscape 대응, overlay/dialog 스타일을 포함한다.

### `scripts/smoke-check.mjs`

- `dist/index.html`과 source text를 검사하는 smoke verification.
- phone frame, screens, dialogs, prompt textarea, keypad, focus trap, external font absence 등을 확인한다.

## Data Flow Today

```text
Static Astro render
  -> AppShell HTML/CSS
  -> Browser loads app-shell.ts
  -> User click/input
  -> DOM state update + message append
```

현재 데이터는 component 내부 mock 배열(`workspaces`, `sessions`, `recentPaths`)과 DOM state에 한정된다.

## Planned Backend Integration Flow

```text
Browser AppShell
  -> WebSocket /api/term/{sessionId}
  -> Go backend
  -> PTY process
  -> pi command
```

실제 pi 터미널 화면을 그대로 렌더링하려면 frontend terminal 영역은 xterm.js 같은 terminal emulator로 교체/확장하고, backend는 `creack/pty` 기반 PTY byte stream을 WebSocket으로 전달해야 한다.

## Integration Boundaries

- `AppShell.astro`는 현재 UI structure owner다.
- `app-shell.ts`는 임시 prototype behavior owner다. backend 연결 시 API/client state layer로 분리될 가능성이 높다.
- `tokens.css`는 visual contract owner다. 디자인 변경은 token 중심으로 반영한다.
- Go backend 추가 시 frontend source와 분리된 `cmd/`, `internal/` 구조가 필요하다.

## Non-Functional Requirements

- Accessibility: dialogs use `role="dialog"`, `aria-modal`, focus trap, focus restore, background inert.
- Responsive: mobile-first 375px frame; desktop에서는 centered phone frame.
- Security: terminal output은 raw HTML로 주입하지 않는다. user content는 `textContent` 기반으로 추가한다.
- Maintainability: static prototype logic은 backend 연결 전까지 단순 event delegation으로 유지한다.

## Known Structural Gaps

- Backend package/module 없음.
- API contract 없음.
- Real terminal renderer 없음.
- Test framework 없음. 현재는 build check와 text-based smoke check만 존재한다.
- Workspace/session data persistence 없음.
