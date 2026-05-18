# Pi Web Backend Tasks

## Direction

Build a local-only Go backend for `pi-web-ui`. The backend is a bridge between the Astro UI and local `pi` workspaces/sessions. Realtime updates use SSE. Client commands use REST POST endpoints.

## Architecture

- Language: Go
- Server: `net/http`
- Default bind: `127.0.0.1:8732`
- API prefix: `/api`
- Realtime: Server-Sent Events via `EventSource`
- Client-to-server commands: REST JSON POST
- First milestone uses in-memory mock data before wiring real `pi` internals

## API Contract

### Health

- `GET /api/health`

### Workspaces

- `GET /api/workspaces`
- `POST /api/workspaces/open`
- `GET /api/workspaces/{workspaceId}/files`
- `GET /api/workspaces/{workspaceId}/git/status`

### Sessions

- `GET /api/workspaces/{workspaceId}/sessions`
- `GET /api/sessions/{sessionId}`
- `POST /api/sessions/{sessionId}/prompt`
- `GET /api/sessions/{sessionId}/events`

## SSE Event Types

- `session.message`
- `session.status`
- `tool.started`
- `tool.output`
- `tool.finished`
- `workspace.files.changed`
- `error`
- `heartbeat`

SSE wire format:

```txt
event: tool.output
id: 123
data: {"sessionId":"...","payload":{}}

```

## Completed

### 1. Server skeleton

- Created Go backend entrypoint at `backend/cmd/pi-web-server`.
- Added local config: host, port, allowed origins.
- Added graceful shutdown.
- Added request logging middleware.
- Added JSON response/error helpers.

### 2. SSE broker

- Implemented session-scoped subscriptions.
- Uses `r.Context().Done()` to unregister disconnected clients.
- Sends SSE headers.
- Flushes after headers and every event.
- Adds heartbeat every 15 seconds.
- Adds monotonically increasing event ids.
- Uses bounded channel buffers.

### 3. Mock domain store

- Ported current frontend fixture shape into Go structs.
- Provides workspaces, sessions, file tree, conversation messages.
- Keeps IDs stable so frontend stories and API-backed UI match.

### 4. Mock API endpoints

- Implemented health/workspace/session/file endpoints.
- Implemented prompt POST endpoint.
- Prompt POST appends user message and emits fake pi/tool events over SSE.

## Next Tasks

### 5. Frontend API adapter

- Added frontend API module at `src/api.js`.
- Added `EventSource` session stream adapter.
- Runtime now tries backend API first and falls back to static SSR fixtures when unavailable.
- Session prompt submit posts to backend and consumes streamed SSE events.
- Workspace/session/file metadata refresh from backend when connected.
- Reconnect and `Last-Event-ID` remain later work.

### 6. Real pi bridge

- Discover local workspaces.
- Read session metadata/logs.
- Execute prompt through `pi` process or internal session runner.
- Normalize stdout/tool activity into SSE events.
- Add cancellation support.

### 7. Local safety

- Bind to localhost by default.
- Add CORS allowlist for Astro dev, Storybook, and built UI origins.
- Validate workspace paths.
- Prevent path traversal outside workspace root.
- Add secret redaction before emitting tool output.

### 8. Tests

- Unit-test SSE event encoding.
- Unit-test broker subscribe/unsubscribe/fanout.
- Unit-test path validation.
- Integration-test `POST /prompt` to ordered SSE events.
- Frontend-test EventSource adapter with mocked stream.

## First implementation milestone status

Completed:

1. Go server skeleton
2. SSE broker
3. Mock domain store
4. Mock API endpoints with fake prompt streaming

Do not wire real `pi` execution until the REST/SSE contract is stable.
