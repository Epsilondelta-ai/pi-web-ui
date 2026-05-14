# Progress: SPEC-TERM-001

- plan_complete_at: 2026-05-14T00:00:00Z
- plan_status: audit-ready
- revision_after_audit_at: 2026-05-14T00:00:00Z
- audit_report_addressed: .moai/reports/plan-audit/SPEC-TERM-001-review-1.md

## Created Artifacts

- research.md
- design-direction.md
- spec.md
- plan.md
- acceptance.md
- spec-compact.md
- progress.md

## Revision Notes

- Quoted frontmatter date strings in `spec.md`.
- Preserved canonical MoAI priority value `High`.
- Converted requirements to EARS-style wording where possible.
- Separated architectural constraints from normative requirements.
- Added explicit EARS acceptance criteria with AC IDs and REQ references.
- Added traceability matrix covering REQ-TERM-001 through REQ-TERM-026.
- Resolved v1 lifecycle policy: browser WebSocket disconnect closes PTY and associated `pi` process; reconnect starts a new session.
- Resolved endpoint/session identity: `/api/terminals/{workspaceId}/sessions/{sessionId}`.
- Specified security policy boundaries for localhost, origins, workspace allowlist, path canonicalization, command allowlist, rejection timing, and logging.
- Replaced vague states with observable states/events: `connecting`, `live`, `closed`, `rejected`, `error`, `terminal.started`, `terminal.resized`, `terminal.closed`, `terminal.rejected`, `terminal.error`.
- Split affected files into existing, required new, and optional sections.

## Notes

Planning only. No implementation code, GitHub issue, or branch created.

## Plan Audit Review 2 Revision

- Moved exact route and lifecycle event names out of normative REQ text into Terminal Protocol / Observable Events sections.
- Changed default bind/origin policy to `127.0.0.1` bind and same-origin-only WebSocket default.
- Added `go.sum` to affected files for Go dependencies.
- Updated acceptance and compact SPEC wording to match revised REQs.
