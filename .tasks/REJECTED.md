# Rejected

## TASK-095: Agent-native browser testing for QA
**Priority:** P3 | **Tags:** testing, adapters, engine, milestone-h
**Updated:** 2026-08-11 17:30

**Rejected as answered by:** TASK-138, 2026-08-11.

`TASK-138` built this from the other side. The embedded browser it added to show a user the
running product needed the product's process and URL to be owned by ADHD — and once they are,
an agent driving that same URL needs nothing further from ADHD. The research behind that task
([`docs/embedded-preview.md`](../docs/embedded-preview.md)) is the reason: Cursor, Codex and
Claude Code all already drive a page over CDP, so the "vendor-neutral seam for browser-control
capabilities exposed by Codex, Cursor, Claude" this task asked for is a seam each vendor
already owns. Building an abstraction over it would have been ADHD's third copy of something
that turns over faster than we could track it, which is the same objection `TASK-129` raised
about model ids.

**Its policy half survived, as policy rather than as a task.** "When no compatible capability
exists, Playwright remains the complete fallback and CI authority" is now written into
`packages/server/src/domain/skills/personas/tester.md` (via the `gen:` blocks in
`docs/testing.md`), `step-tasks/verify-feature.md`, and `.agents/skills/qa-testing/SKILL.md`.
The persona's old boundary — *"Do not use or depend on an agent-native browser in the MVP;
that work is deferred to TASK-095"* — is gone, replaced by the rule that a browser capability
may be used but must never become a precondition, because CI has none.

Original scope follows, for the record:

Add a vendor-neutral testing seam for browser-control capabilities exposed by Codex, Cursor, Claude, or another active harness. QA may use an available native browser first for exploratory and visual checks, then promote stable behaviour into repository-owned Playwright tests. When no compatible capability exists, Playwright remains the complete fallback and CI authority.

Cross-platform: support Windows and macOS capability detection and degrade to Playwright with an accurate recorded reason.

---

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
