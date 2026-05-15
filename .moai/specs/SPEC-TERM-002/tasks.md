---
id: SPEC-TERM-002
version: "0.1.0"
phase: "1.5"
created_at: "2026-05-15"
status: approved
---

# SPEC-TERM-002 — Task Decomposition

Phase 1.5 atomic TDD tasks. Each task completable in one RED-GREEN-REFACTOR cycle.

## Task Registry

| ID | Description | Requirements | Dependencies | Planned Files | Status |
|----|-------------|-------------|-------------|---------------|--------|
| T01 | Config: add tmux fields and validation | REQ-TERM2-001, REQ-TERM2-003, REQ-TERM2-021 | none | internal/config/config.go, internal/config/config_test.go | completed |
| T02 | Tmux Runner: session name sanitization and managed prefix | REQ-TERM2-005, REQ-TERM2-023, REQ-TERM2-024 | T01 | internal/terminal/tmux_runner.go, internal/terminal/tmux_runner_test.go | completed |
| T03 | Tmux Runner: Start - create tmux session with managed prefix | REQ-TERM2-004, REQ-TERM2-006 | T02 | internal/terminal/tmux_runner.go, internal/terminal/tmux_runner_test.go | completed |
| T04 | Tmux Runner: Attach - reattach to existing managed session | REQ-TERM2-012, REQ-TERM2-013 | T03 | internal/terminal/tmux_runner.go, internal/terminal/tmux_runner_test.go | completed |
| T05 | Tmux Runner: Kill - terminate managed tmux session | REQ-TERM2-009, REQ-TERM2-015 | T03 | internal/terminal/tmux_runner.go, internal/terminal/tmux_runner_test.go | completed |
| T06 | Tmux Runner: List - enumerate managed sessions with state | REQ-TERM2-014, REQ-TERM2-016 | T03 | internal/terminal/tmux_runner.go, internal/terminal/tmux_runner_test.go | completed |
| T07 | Lifecycle Events: add tmux event vocabulary | REQ-TERM2-007, REQ-TERM2-008, REQ-TERM2-010, REQ-TERM2-011 | none | internal/terminal/events.go, internal/terminal/events_test.go | completed |
| T08 | Handler: mode-aware session start (PTY vs tmux) | REQ-TERM2-001, REQ-TERM2-002, REQ-TERM2-003, REQ-TERM2-004, REQ-TERM2-026 | T01, T03, T07 | internal/terminal/handler.go, internal/terminal/handler_test.go | completed |
| T09 | Handler: WebSocket disconnect - detach tmux, kill PTY | REQ-TERM2-007, REQ-TERM2-011 | T08 | internal/terminal/handler.go, internal/terminal/handler_test.go | completed |
| T10 | Handler: same-session attach with single-attachment replacement | REQ-TERM2-013, REQ-TERM2-010 | T04, T08 | internal/terminal/handler.go, internal/terminal/handler_test.go | completed |
| T11 | Routes: REST endpoints for list and kill operations | REQ-TERM2-014, REQ-TERM2-015, REQ-TERM2-016, REQ-TERM2-022 | T05, T06, T08 | internal/server/server.go, internal/server/server_test.go | completed |
| T12 | Security: pre-execution validation (origin, workspace, prefix, sanitization) | REQ-TERM2-022, REQ-TERM2-023, REQ-TERM2-024, REQ-TERM2-025, REQ-TERM2-026 | T08, T11 | internal/terminal/handler.go, internal/terminal/handler_test.go | completed |
| T13 | Frontend: reconnect UI, detached state display, attach/kill actions | REQ-TERM2-017, REQ-TERM2-018, REQ-TERM2-019, REQ-TERM2-020 | T08, T11 | src/scripts/terminal-client.ts, src/scripts/app-shell.ts, src/components/AppShell.astro | completed |
| T14 | Docs + smoke: README tmux section, smoke-check persistent session markers | REQ-TERM2-020, AC-TERM2-016, AC-TERM2-017 | T13 | README.md, scripts/smoke-check.mjs | completed |

## Task Detail

### T01 - Config: tmux fields and validation

**RED**: Test Config contains TmuxEnabled, TmuxBinaryPath, TmuxManagedPrefix fields. Test env vars PI_WEB_TMUX_ENABLED, PI_WEB_TMUX_BINARY, PI_WEB_TMUX_PREFIX. Test ValidateTmuxBinary() returns error when binary missing. Test default prefix is piweb-. Test host binding constraint preserved (127.0.0.1).

**GREEN**: Add fields to Config, extend LoadFromEnv(), add ValidateTmuxBinary() method.

**REFACTOR**: Consolidate env-var helpers if duplication emerges.

**AC Coverage**: AC-TERM2-003, AC-TERM2-017.

**Planned Files**: internal/config/config.go, internal/config/config_test.go

---

### T02 - Tmux Runner: session name sanitization and managed prefix

**RED**: Test SanitizeSessionName() rejects shell metacharacters, enforces length bound, enforces alphanumeric+hyphen. Test HasManagedPrefix() returns true for piweb-* sessions, false otherwise. Test raw user input with malicious shell chars rejected before tmux execution. Test argument-vector construction (no shell-string concatenation).

**GREEN**: Implement SanitizeSessionName(), HasManagedPrefix(), tmux command builder using exec.Command with arg vector.

**REFACTOR**: Extract sanitization regex as package constant.

**AC Coverage**: AC-TERM2-011, AC-TERM2-018, AC-TERM2-019.

**Planned Files**: internal/terminal/tmux_runner.go, internal/terminal/tmux_runner_test.go

---

### T03 - Tmux Runner: Start - create tmux session

**RED**: Test TmuxRunner.Start() creates tmux session with managed prefix name. Test session reports live state after start. Test tmux binary unavailability returns error (not panic). Test start uses argument-vector, no shell-string. Test session output readable via Session.Read().

**GREEN**: Implement Start() using tmux new-session -d -s name -x cols -y rows command. Pipe capture for I/O. Return tmuxSession implementing Session interface.

**REFACTOR**: Share command-builder pattern with attach/kill.

**AC Coverage**: AC-TERM2-004, AC-TERM2-015.

**Planned Files**: internal/terminal/tmux_runner.go, internal/terminal/tmux_runner_test.go

---

### T04 - Tmux Runner: Attach - reattach to existing session

**RED**: Test TmuxRunner.Attach() attaches to existing managed session. Test attach to non-existent session returns stale error. Test attach to session without managed prefix returns rejection. Test attach to session with existing client detaches previous first (single-attachment replacement).

**GREEN**: Implement Attach() using tmux attach -t name. Detect existing client via tmux list-clients -t name. Detach previous, then attach new.

**REFACTOR**: Extract client-list parsing helper.

**AC Coverage**: AC-TERM2-010, AC-TERM2-008.

**Planned Files**: internal/terminal/tmux_runner.go, internal/terminal/tmux_runner_test.go

---

### T05 - Tmux Runner: Kill - terminate managed session

**RED**: Test TmuxRunner.Kill() terminates tmux session. Test kill on already-dead session reports killed or stale without error. Test kill rejects non-managed prefix sessions.

**GREEN**: Implement Kill() using tmux kill-session -t name. Handle already-dead case gracefully.

**REFACTOR**: Unify error mapping for tmux exit codes.

**AC Coverage**: AC-TERM2-007.

**Planned Files**: internal/terminal/tmux_runner.go, internal/terminal/tmux_runner_test.go

---

### T06 - Tmux Runner: List - enumerate managed sessions with state

**RED**: Test TmuxRunner.List() returns only managed-prefix sessions with lifecycle state. Test empty list when no managed sessions. Test non-managed sessions excluded. Test state mapping: active to live, no-client to detached, dead to killed/stale.

**GREEN**: Implement List() using tmux list-sessions -F with format string. Filter by managed prefix. Map tmux session flags to lifecycle states.

**REFACTOR**: Extract session-state parser.

**AC Coverage**: AC-TERM2-013, AC-TERM2-018.

**Planned Files**: internal/terminal/tmux_runner.go, internal/terminal/tmux_runner_test.go

---

### T07 - Lifecycle Events: add tmux event vocabulary

**RED**: Test EventDetached, EventKilled, EventStale constants exist and have correct values. Test terminal.closed not used for tmux sessions in tests. Test event construction with correct fields.

**GREEN**: Add constants EventDetached = terminal.detached, EventKilled = terminal.killed, EventStale = terminal.stale to events.go. Add LifecycleState type with live, detached, killed, stale, error values.

**REFACTOR**: Group tmux-specific and PTY-specific event constants with comments.

**AC Coverage**: AC-TERM2-005, AC-TERM2-006, AC-TERM2-008, AC-TERM2-015.

**Planned Files**: internal/terminal/events.go, internal/terminal/events_test.go

---

### T08 - Handler: mode-aware session start

**RED**: Test handler accepts mode=tmux query param and uses TmuxRunner. Test handler preserves PTY mode when mode=pty or no mode specified. Test handler rejects tmux mode when tmux binary unavailable with non-secret error. Test mode selection does not affect direct PTY lifecycle.

**GREEN**: Extend Handler.ServeHTTP() to parse mode query param. When tmux, validate tmux availability (T01), use TmuxRunner.Start(). When pty or absent, use existing PTYRunner. Emit mode-appropriate events.

**REFACTOR**: Extract mode-selection logic into helper method on Handler.

**AC Coverage**: AC-TERM2-001, AC-TERM2-002, AC-TERM2-003.

**Planned Files**: internal/terminal/handler.go, internal/terminal/handler_test.go

---

### T09 - Handler: WebSocket disconnect - detach tmux, kill PTY

**RED**: Test WebSocket close on tmux session emits terminal.detached (not terminal.closed). Test WebSocket close on PTY session emits terminal.closed (unchanged). Test tmux session survives disconnect (not killed). Test PTY session killed on disconnect (unchanged).

**GREEN**: Add mode-aware disconnect logic in ServeHTTP(). After readClientMessages returns, check session mode. If tmux: emit EventDetached, do NOT call session.Kill(). If PTY: existing behavior (kill + EventClosed).

**REFACTOR**: Encapsulate disconnect policy in a disconnectPolicy struct or method.

**AC Coverage**: AC-TERM2-005, AC-TERM2-014.

**Planned Files**: internal/terminal/handler.go, internal/terminal/handler_test.go

---

### T10 - Handler: same-session attach with single-attachment replacement

**RED**: Test new attach to tmux session with existing client detaches previous client first. Test concurrent attach resolves to single client (deterministic). Test attach to non-managed session rejected. Test attach emits terminal.started event.

**GREEN**: Implement attach flow in handler. Parse attach message or route. Call TmuxRunner.Attach(). Ensure single-attachment replacement (T04). Wire into WebSocket lifecycle.

**REFACTOR**: Unify start and attach WebSocket handling paths.

**AC Coverage**: AC-TERM2-010.

**Planned Files**: internal/terminal/handler.go, internal/terminal/handler_test.go

---

### T11 - Routes: REST endpoints for list and kill

**RED**: Test GET /api/tmux/sessions returns managed sessions with lifecycle state. Test POST /api/tmux/sessions/{id}/kill terminates session. Test both reject non-managed prefix targets. Test JSON response format.

**GREEN**: Add routes to server.go: GET /api/tmux/sessions calls TmuxRunner.List(), POST /api/tmux/sessions/{id}/kill calls TmuxRunner.Kill(). Apply origin/workspace validation.

**REFACTOR**: Share validation middleware with terminal handler.

**AC Coverage**: AC-TERM2-013, AC-TERM2-007, AC-TERM2-018.

**Planned Files**: internal/server/server.go, internal/server/server_test.go

---

### T12 - Security: pre-execution validation

**RED**: Test origin validation runs before tmux execution. Test workspace validation runs before tmux execution. Test managed prefix check runs before tmux execution. Test sanitized session identity check runs before tmux execution. Test non-secret error codes only (no stack traces, no raw tmux output).

**GREEN**: Consolidate validation pipeline in handler. All checks (origin, workspace, command, prefix, sanitization) run before any TmuxRunner method call. Error responses use RejectionCode and non-secret reason strings.

**REFACTOR**: Extract validateTmuxRequest() helper combining all pre-execution checks.

**AC Coverage**: AC-TERM2-011, AC-TERM2-012.

**Planned Files**: internal/terminal/handler.go, internal/terminal/handler_test.go

---

### T13 - Frontend: reconnect UI, detached state, attach/kill actions

**RED**: Test terminal client handles terminal.detached event without showing error. Test terminal client shows detached state with attach/kill buttons. Test reconnect to existing tmux session works. Test no HTML injection in terminal output. Test terminal.closed not shown for tmux sessions.

**GREEN**: Extend terminal-client.ts with terminal.detached, terminal.stale, terminal.killed event handlers. Add reconnect-on-detach logic. Add session list polling. Extend app-shell.ts with attach/kill action handlers. Update AppShell.astro with detached state UI indicators.

**REFACTOR**: Extract session management into separate tmux-session-manager.ts if complexity warrants.

**AC Coverage**: AC-TERM2-009, AC-TERM2-014, AC-TERM2-016.

**Planned Files**: src/scripts/terminal-client.ts, src/scripts/app-shell.ts, src/components/AppShell.astro

---

### T14 - Docs and smoke: README, smoke-check markers

**RED**: Test scripts/smoke-check.mjs verifies persistent session UI markers in built HTML. Test README contains tmux configuration section.

**GREEN**: Add smoke checks for data-tmux-session-list, data-tmux-detached-state, data-tmux-attach-action, data-tmux-kill-action. Add README section: tmux persistence overview, configuration env vars, security defaults, managed prefix explanation.

**REFACTOR**: Group tmux smoke checks in smoke-check.mjs.

**AC Coverage**: AC-TERM2-016, AC-TERM2-017.

**Planned Files**: scripts/smoke-check.mjs, README.md

---

## Dependency Graph

T01 (config) ─────────────────────┬────────────────── T08 (handler: start)
T02 (sanitize) ───── T03 (start) ─┤                        |
                       ├── T04 (attach) ───── T10 (handler: attach)
                       ├── T05 (kill) ─────── T11 (routes)
                       └── T06 (list) ──────── T11 (routes)
T07 (events) ─────────────────────┴────────────────── T08 (handler: start)
                                                        |
                                              T09 (handler: disconnect)
                                              T10 (handler: attach)
                                              T12 (security validation)
                                                        |
                                                   T13 (frontend)
                                                        |
                                                   T14 (docs/smoke)

## Execution Order (topological)

1. T01 + T07 (parallel, no dependencies)
2. T02 (depends T01)
3. T03 (depends T02)
4. T04 + T05 + T06 (parallel, all depend T03)
5. T08 (depends T01, T03, T07)
6. T09 + T10 + T12 (parallel, all depend T08)
7. T11 (depends T05, T06, T08)
8. T13 (depends T08, T11)
9. T14 (depends T13)

## Requirement Traceability

| Requirement | Tasks |
|---|---|
| REQ-TERM2-001 | T08 |
| REQ-TERM2-002 | T08 |
| REQ-TERM2-003 | T01, T08 |
| REQ-TERM2-004 | T03, T08 |
| REQ-TERM2-005 | T02 |
| REQ-TERM2-006 | T03 |
| REQ-TERM2-007 | T07, T09 |
| REQ-TERM2-008 | T07 |
| REQ-TERM2-009 | T05 |
| REQ-TERM2-010 | T07 |
| REQ-TERM2-011 | T07, T09 |
| REQ-TERM2-012 | T04 |
| REQ-TERM2-013 | T04, T10 |
| REQ-TERM2-014 | T06, T11 |
| REQ-TERM2-015 | T05, T11 |
| REQ-TERM2-016 | T02, T06 |
| REQ-TERM2-017 | T13 |
| REQ-TERM2-018 | T13 |
| REQ-TERM2-019 | T13 |
| REQ-TERM2-020 | T13, T14 |
| REQ-TERM2-021 | T01 |
| REQ-TERM2-022 | T11, T12 |
| REQ-TERM2-023 | T02, T12 |
| REQ-TERM2-024 | T02, T12 |
| REQ-TERM2-025 | T12 |
| REQ-TERM2-026 | T08, T12 |

## Coverage Verification

- Total requirements: 26
- Requirements covered by tasks: 26
- Coverage: 100%
- All 19 AC entries have at least one task mapping.
- No task is orphaned (all have requirement trace).
- Dependency graph has no cycles.
- Max parallelism: 3 tasks (T04/T05/T06, T09/T10/T12).
- Critical path: T01 -> T02 -> T03 -> T08 -> T13 -> T14 (6 sequential steps).
