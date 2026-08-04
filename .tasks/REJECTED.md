# Rejected

## TASK-097: Post-MVP — compose delivery workflows from the persona catalog
**Priority:** P2 | **Tags:** core, server, ui, engine
**Updated:** 2026-07-29 08:56

**Superseded by:** TASK-110

Use an initialization/planning step to analyze an approved feature and select the required personas and developer specializations from the available catalog, for example adding a Product Designer for UI work or a mobile developer specialization for a mobile feature. Persist the generated workflow, explain its composition, preserve required quality and closeout policies, and require human approval before execution.

Cross-platform: workflow composition is pure logic/UI; any selected persona tools must declare Windows and macOS support or degrade with an accurate SKIP reason.

---

## TASK-039: Pluggable run persistence — storage adapter + selectable DB backend
**Priority:** P2 | **Tags:** server, core, infra
**Updated:** 2026-07-26 19:27

The file-backed store from TASK-005 (`state.json` + `events.jsonl` under `.adhd/runs/`) works but flat JSON files are not a great long-term home for run state. Introduce a `RunStore` interface and make the backend selectable, then implement a real DB adapter alongside the JSON one.

**Scope:**
- Extract a `RunStore` interface from `packages/server/src/services/run-store.ts` (`writeState`, `appendEvent`, `loadAllRuns`) so the orchestrator depends on the interface, not the file functions.
- Keep the current JSON files as the **default** adapter (`JsonRunStore`) — no behaviour change out of the box.
- Add at least one real DB adapter (candidate: **SQLite** via better-sqlite3/libsql — single-file, zero-server, fits the local-first story; evaluate vs. Postgres for the hosted story).
- Config/env selector (e.g. `ADHD_RUN_STORE=json|sqlite`) wired through `config.ts`; document in `.env.example`.
- Migration note: how existing `.adhd/runs/*` JSON is imported into the DB (one-shot importer or lazy).

**Deliverable:** `RunStore` interface + `JsonRunStore` (default) + one DB adapter, selectable by config, with the orchestrator unchanged behind the interface. Depends on TASK-005.

---

## TASK-007: Claude Code / Cursor adapters
**Priority:** P2 | **Tags:** milestone-c, adapters
**Updated:** 2026-07-14 09:57

Wire Claude Code and Cursor CLI as implementation harness adapters. Superseded by TASK-013 (Claude Code) / TASK-021 (Cursor, Codex).

---
