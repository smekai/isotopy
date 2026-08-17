# Backlog

## TASK-111: Reusable teams for later orchestrations
**Priority:** P3 | **Tags:** core, server, milestone-h
**Updated:** 2026-08-07 11:40

**Milestone H — Harmonic. Build only if feedback asks for it.** Written as post-MVP when
Milestone E deferred it; no user has yet said they recompose teams often enough to mind.

Persist approved team compositions to `.adhd/teams/<id>.json` with a strict schema and a single writer. The orchestrator lists and reuses saved teams across later conversations instead of recomposing from scratch.

Cross-platform: n/a — JSON + path-joined storage under the existing `.adhd` roots.

---

## TASK-113: Per-persona accumulated context (artifact distilled memory)
**Priority:** P3 | **Tags:** core, server, ui, milestone-h
**Updated:** 2026-08-07 11:40

**Milestone H — Harmonic. Build only if feedback asks for it.** The evidence to wait for
is a user saying an agent kept relearning the same thing about their project.

Distill closeout knowledge into per-persona accumulated notes under `.adhd` and inject those notes into `composeSkill` alongside existing user/project overrides.

Also add an orchestrator-facing constraint digest so the orchestrator can reason about “must-do differently for stage X in this project” without needing deep per-agent state.

Cross-platform: path-joined read/write to `.adhd` roots; no subprocess/shell assumptions.

---

## TASK-069: Spike — Aiki durable runtime on a comparison branch
**Priority:** P3 | **Tags:** server, engine, infra
**Updated:** 2026-08-07 11:40

**No milestone, deliberately.** Research cannot close a milestone, so this sits outside
F, G and H rather than diluting one of them. Pick it up when a runtime question forces it.

**Deprioritized to P3 on 2026-08-03:** OpenWorkflow landed under TASK-068 and then survived a real mid-flight process kill in the TASK-094 dogfood, resuming without re-running completed stages. The comparison this spike was written to force has largely been answered by that evidence, so it is no longer worth a branch's cost.

The standing second choice from [`docs/workflow-runtime-options.md`](../docs/workflow-runtime-options.md) §9 is **Aiki** — TypeScript, Apache-2.0, and the only candidate ADHD has a contributor on, so its gaps are ours to close. It is not the recommendation only because it requires **PostgreSQL 14+ today** (SQLite is "coming soon", i.e. we'd write it) and documents no fork-from-step (S2). This task builds the same durable runtime as TASK-068 but on Aiki, **on a separate branch**, to compare the two against ADHD's real shape before committing.

**Do it on a branch off TASK-068's work** so the two runtimes sit behind the same seam and can be measured head to head; the winner merges to `main`, the loser stays as a documented spike. (Note: the pre-1.0 "commit directly to main" norm is deliberately set aside here — a throwaway comparison branch is the point.)

**Scope:**
- Stand Aiki up against the same feature checklist (doc §3): durable start, crash recovery/resume, retries, durable approval gates, durable sleep (TASK-061 shape), cancellation, parallel branches, project concurrency (S5), semantic restart (S2).
- Confront its two hard gaps directly: **(a)** does its `database({ provider })` seam let us stand up SQLite via `node:sqlite` without a Postgres server (the storage constraint that ruled it out), and **(b)** can `restartRun(runId, stageId)` semantics be built without a native fork primitive? These are the two things that, if closed, make Aiki "directly competitive with OpenWorkflow, with the added advantage of influence over its direction" (§9).
- Run the doc's measured probe (a Developer → gate → Tester workflow, hard-killed at the gate, resumed in a fresh process, completed stage not re-run) on Aiki and record the result beside OpenWorkflow's.
- Write the comparison up as a dated decision-log entry (A8): integration cost, maturity/bus-factor (Aiki is alpha, 34★), and whether steering-the-dependency outweighs shipping-sooner.

**Deliverable:** a runnable Aiki branch behind the same runtime seam as TASK-068, a head-to-head write-up, and a go/no-go recommendation. If Aiki wins, its branch merges to `main`; otherwise TASK-068's OpenWorkflow branch is what merges.

**Cross-platform:** the deciding question **is** cross-platform — Aiki's Postgres-14+ requirement would mean bundling a database server invisibly on Windows *and* macOS, the packaging burden that eliminated it in the doc. The spike must confirm whether an embedded `node:sqlite` backend avoids that on both OSes, or Aiki fails the same platform bar as DBOS/Restate/Resonate. Tested on Windows; macOS packaging reasoned through.

---

## TASK-036: Spike — sandcastle as the implement-stage harness/sandbox layer
**Priority:** P3 | **Tags:** adapters, engine
**Updated:** 2026-08-07 11:40

**No milestone, deliberately.** Same reason as `TASK-069`. Its premise has also weakened:
the subprocess harness it proposed replacing now exists, is dogfooded, and was hardened
again in `TASK-117`.

Evaluate [mattpocock/sandcastle](https://github.com/mattpocock/sandcastle) as the execution layer behind the implementation stage instead of building the subprocess harness (TASK-006) from scratch. It's a TS library (`sandcastle.run()`) that runs a coding agent in an isolated sandbox and merges commits back: Docker/Podman/Vercel-Firecracker providers, git-worktree isolation, branch strategies, session capture/resume, typed structured-output extraction, lifecycle hooks — provider-agnostic (Claude Code, Codex, Cursor).

**Questions to answer:**
- Does its `HarnessAdapter`-shaped surface map cleanly onto our EngineAdapter interface? What do we still own (stage handoff, artifacts, gates, dashboard)?
- Wrap `sandcastle.run()` vs. build generic subprocess harness (TASK-006) — cost, control, and lock-in tradeoff.
- Session resume + structured output: do they cover our restart-single-stage and artifact-capture needs?
- Sandbox providers: does Vercel/Firecracker help our deploy-anywhere story or is it out of scope?
- Maturity/API stability and dependency weight.

**Deliverable:** short recommendation (adopt / borrow patterns / pass) + impact on TASK-006/TASK-021. Not a competitor — a build-on candidate; see docs/competitor-matrix.md §6.

---
