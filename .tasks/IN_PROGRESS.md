# In Progress

## TASK-098: Standardize strict runtime schemas at every untrusted boundary
**Priority:** P0 | **Tags:** core, server, testing
**Updated:** 2026-07-29 13:41

Replace recurrent hand-written Record<string, unknown>, stringOf/findingsOf-style mappings with a shared runtime-schema approach at HTTP, engine, database, settings, and persisted-file boundaries. Domain and service layers must receive validated, strongly typed values only. Reject malformed nested data with precise errors instead of silently dropping fields, and document where validation ownership lives.

Cross-platform: n/a — pure TypeScript validation and architecture.

### Plan

1. Add strict schemas and precise errors for HTTP/configuration boundaries.
2. Validate persisted runs/events as complete records with the documented legacy messages migration.
3. Normalize engine JSONL through typed adapter events, add enforcement and architecture documentation.
4. Run lint, typecheck, tests, build, skill drift, E2E, and CI; verify Windows directly and macOS in GitHub Actions.

---
