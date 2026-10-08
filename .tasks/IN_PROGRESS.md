# In Progress

## TASK-194: After Aiki: shrink the docs and tests, reuse Aiki's types, and keep one logger
**Priority:** P2 | **Tags:** core, server, testing
**Updated:** 2026-10-08 19:02

`TASK-069` (PR #83, 0.13.0) moved the durable runtime from OpenWorkflow to Aiki. The repo still carries text and tests written across two runtimes and a migration, and a logger split in two. Clean that up in one pass.

### 1. Markdown: remove or shrink what is duplicated or no longer true

- The same runtime facts are written in several places: embedding, claim and outbox timings, replay by name and input, schedule identity, cancel, and the cost numbers. These live in `docs/decisions.md`, `docs/architecture.md`, `docs/implementation-notes.md`, `README.md`, `AGENTS.md`/`CLAUDE.md` and the skills (edit the `gen:` blocks, then `pnpm gen:skills`).
- Keep each fact once, where it belongs: what is, in `architecture.md`; how it works and its gotchas, in `implementation-notes.md`; why, as a dated entry in `decisions.md`. Link from the others.
- Delete text that is no longer true. History stays only in dated decision entries.
- Report the net lines removed.

### 2. Tests: revisit

- Remove tests that exercise Aiki rather than Isotopy, and merge near-duplicates.
- Keep the tests that pin Isotopy's own rules, and mutation-check every guard that stays.
- Look for harness scaffolding that existed for the runtime and Aiki now makes unnecessary.

### 3. Reuse what Aiki already defines

Where `workflow/` defines models, classes or enums that mirror Aiki's, use Aiki's exported types at the seam instead of a parallel copy. Candidates:
- `DurableRunState` against `WorkflowRunStatus`;
- the schedule spec;
- the event payload shapes.

Isotopy's domain types stay ours; this is only the seam.

### 4. One logger, not two

Today `AikiLoggerAdapter` wraps our `Logger` to fit Aiki's interface, which adds `trace`/`debug` and a `child(bindings)` that takes an object where ours takes a component name. The owner wants a single logger that implements both interfaces, so the adapter goes. Decide:
- how `child(component)` and `child(bindings)` coexist;
- what `trace` and `debug` do: pino levels below the operator log's `info`.

**Done when:**
- the docs and tests are smaller, and nothing in them is untrue;
- `AikiLoggerAdapter` is gone, with one logger serving Isotopy and Aiki;
- all gates are green.

---
