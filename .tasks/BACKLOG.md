# Backlog

## TASK-039: Pluggable run persistence — storage adapter + selectable DB backend
**Priority:** P2 | **Tags:** server, core, infra
**Updated:** 2026-07-17 00:00

The file-backed store from TASK-005 (`state.json` + `events.jsonl` under `.adhd/runs/`) works but flat JSON files are not a great long-term home for run state. Introduce a `RunStore` interface and make the backend selectable, then implement a real DB adapter alongside the JSON one.

**Scope:**
- Extract a `RunStore` interface from `packages/server/src/services/run-store.ts` (`writeState`, `appendEvent`, `loadAllRuns`) so the orchestrator depends on the interface, not the file functions.
- Keep the current JSON files as the **default** adapter (`JsonRunStore`) — no behaviour change out of the box.
- Add at least one real DB adapter (candidate: **SQLite** via better-sqlite3/libsql — single-file, zero-server, fits the local-first story; evaluate vs. Postgres for the hosted story).
- Config/env selector (e.g. `ADHD_RUN_STORE=json|sqlite`) wired through `config.ts`; document in `.env.example`.
- Migration note: how existing `.adhd/runs/*` JSON is imported into the DB (one-shot importer or lazy).

**Deliverable:** `RunStore` interface + `JsonRunStore` (default) + one DB adapter, selectable by config, with the orchestrator unchanged behind the interface. Depends on TASK-005.

---

## TASK-036: Spike — sandcastle as the implement-stage harness/sandbox layer
**Priority:** P2 | **Tags:** adapters, engine, milestone-c
**Updated:** 2026-07-16 00:00

Evaluate [mattpocock/sandcastle](https://github.com/mattpocock/sandcastle) as the execution layer behind the implementation stage instead of building the subprocess harness (TASK-006) from scratch. It's a TS library (`sandcastle.run()`) that runs a coding agent in an isolated sandbox and merges commits back: Docker/Podman/Vercel-Firecracker providers, git-worktree isolation, branch strategies, session capture/resume, typed structured-output extraction, lifecycle hooks — provider-agnostic (Claude Code, Codex, Cursor).

**Questions to answer:**
- Does its `HarnessAdapter`-shaped surface map cleanly onto our EngineAdapter interface? What do we still own (stage handoff, artifacts, gates, dashboard)?
- Wrap `sandcastle.run()` vs. build generic subprocess harness (TASK-006) — cost, control, and lock-in tradeoff.
- Session resume + structured output: do they cover our restart-single-stage and artifact-capture needs?
- Sandbox providers: does Vercel/Firecracker help our deploy-anywhere story or is it out of scope?
- Maturity/API stability and dependency weight.

**Deliverable:** short recommendation (adopt / borrow patterns / pass) + impact on TASK-006/TASK-021. Not a competitor — a build-on candidate; see docs/competitor-matrix.md §6.

---

## TASK-035: Spike — beads (bd) vs. TS-native task-graph backlog
**Priority:** P2 | **Tags:** core, server
**Updated:** 2026-07-19 18:22

Take Task Plan UI and Evaluate [gastownhall/beads](https://github.com/gastownhall/beads) (`bd`) as the engine for our repo-native task backlog (`.adhd/tasks/`) that feeds pipeline runs. We need compersion and choose a best task tracker

**Questions to answer:**
- Adopt `bd` as-is (shell out via subprocess) vs. absorb its model (dependency graph + ready-detection + compaction) into our TS/git-native backlog.
- Go + Dolt dependency weight in a TS/Hono local-first product — acceptable, or does it break the "one install" story?
- How would tasks-spawn-runs work: does `bd ready` become the intake queue for the pipeline?
- Merge/sync model vs. our git-native artifact approach — conflicts or synergy?
- What do we lose by staying markdown (`.tasks/*.md`) — is the dependency graph worth the dep?

**Deliverable:** short recommendation (adopt / borrow model / stay markdown) + backlog data-model implications. Pure intake/memory layer, not a competitor; see docs/competitor-matrix.md §2.

---
