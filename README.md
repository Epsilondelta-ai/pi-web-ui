# pi-web-ui

Astro 기반으로 pi를 브라우저에서 보고 조작하기 위한 프론트엔드 프로토타입입니다.
`/Users/juunini/Downloads/pi web`의 프로토타입을 React 없이 Astro + vanilla custom element로 재작성했습니다.

## Run

```bash
bun install
bun run dev
```

## Build

```bash
bun run build
```

Single executable with the Astro UI embedded in the Go backend:

```bash
bun run build:binary
./dist/pi-web
# open http://127.0.0.1:8732
```

`pi` CLI execution still requires the local `pi` command to be installed.

## Backend

```bash
bun run backend
```

Default backend address: `127.0.0.1:8732`.

`bun run backend` executes prompts through the local `pi` CLI.
Use mock streaming for UI/API/SSE checks without invoking `pi`:

```bash
bun run backend:mock
```

## Test / Check

```bash
bun run test
bun run backend:test
bun run check
```

## Storybook

```bash
bun run storybook
bun run build-storybook
```

## Source

- `src/pages/index.astro` — Astro page shell
- `src/App.astro` — pi workspace/session UI
- `.storybook/pi-fixtures.js` — Storybook-only fixture data
- `src/renderers.js` — safe inline markup render helpers
- `src/styles.css`, `src/extras.css`, `src/design-system/colors_and_type.css` — prototype styles
- `src/App.stories.js` — full app story
