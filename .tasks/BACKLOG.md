# Backlog

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
**Updated:** 2026-07-16 00:00

Evaluate [gastownhall/beads](https://github.com/gastownhall/beads) (`bd`) as the engine for our repo-native task backlog (`.adhd/tasks/`) that feeds pipeline runs. It's a distributed graph issue tracker for AI agents (Go + Dolt): dependency-aware task graph, hash-based IDs (multi-agent merge-safe), hierarchical epics/tasks/subtasks, `bd ready`/`bd prime` ready-work detection, semantic compaction of closed tasks, git-remote sync.

**Questions to answer:**
- Adopt `bd` as-is (shell out via subprocess) vs. absorb its model (dependency graph + ready-detection + compaction) into our TS/git-native backlog.
- Go + Dolt dependency weight in a TS/Hono local-first product — acceptable, or does it break the "one install" story?
- How would tasks-spawn-runs work: does `bd ready` become the intake queue for the pipeline?
- Merge/sync model vs. our git-native artifact approach — conflicts or synergy?
- What do we lose by staying markdown (`.tasks/*.md`) — is the dependency graph worth the dep?

**Deliverable:** short recommendation (adopt / borrow model / stay markdown) + backlog data-model implications. Pure intake/memory layer, not a competitor; see docs/competitor-matrix.md §2.

---

## TASK-021: Cursor & Codex engine adapters
**Priority:** P2 | **Tags:** adapters, milestone-c

Implement real adapters behind the EngineAdapter interface for the Cursor CLI and Codex CLI; flip `available` in ENGINES and remove the SOON badges. Supersedes the Cursor half of TASK-007.

---

## TASK-005: File-backed workflow engine (state.json + events.jsonl)
**Priority:** P1 | **Tags:** milestone-b

Replace in-memory mock with `.adhd/runs/` persistence and real subprocess stages.

---

## TASK-006: First harness adapter (generic subprocess)
**Priority:** P1 | **Tags:** milestone-c, adapters

Generic subprocess `HarnessAdapter` for any CLI command in a worktree.

---
