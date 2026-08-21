# Backlog

## TASK-155: Reduce backend abstraction ceremony and validate/reduce docs
**Priority:** P2
**Tags:** server, core, infra
**Updated:** 2026-08-21 12:00

An audit of `packages/server/src` (~14,500 lines) and `docs/` (~6,900 lines, ~27% stale or
duplicated) found the layering has outgrown what it protects. This task carries the verified
findings; carve slices off it as they get scheduled.

**Already done (this task's opening commit):**
- [x] Delete the legacy `artifacts`→`closeout` read in `schemas/run-persistence.ts`
      (`legacyArtifactsSchema` + the lift transform). Runs persisted before PR #62 lose their
      closeout panel; the markdown evidence on disk is untouched.

**Backend — abstraction ceremony:**
- [ ] Collapse single-implementation seams in `workflow/types.ts`: `RunProjection` (34 methods,
      only `RunService`), `OrchestrationHooks` (12, only `OrchestrationService`), `ProductHooks`
      (2, only `ProductProcessService`). `WorkflowDeps` wraps two of them in getter functions on
      top — late binding that exists only because `index.ts` registers them after construction
      (twice: `registerOrchestration` + `registerStageOutputConsumer` for one object).
      `StageOutputConsumer` (4 impls) and `EngineAdapter` (3 impls) are genuine seams — keep.
- [ ] Merge twins: `repository/milestone-repository.ts` ≡ `repository/orchestration-repository.ts`
      (byte-identical modulo names); `schemas/milestone.ts` ≡ `schemas/orchestration.ts`; three
      near-identical `db/*-table.ts` classes over the same `(id, data, created_at, updated_at)`
      shape. Four layers (`Database → Table → Repository → Store`) over a two-column upsert.
      Each repository opens its own connection to the same `runs.db` — consolidate.
- [ ] One fenced-block-extractor helper for the five copies in `schemas/` (orchestrator-decision,
      milestone-plan, run-artifacts, release-manifest, persona-notes).
- [ ] One lazy per-project registry helper for the five hand-written `map.get ?? new X` blocks
      (`RunStore.repositoryFor`, `MilestoneService`, `OrchestrationService`,
      `WorkflowRuntimeRegistry`, `taskBoardFor`).
- [ ] Shared `messageOf(error)` (the `instanceof Error` ternary is written 32× in 15 files) and
      one `engineLabel` (defined identically in `run-service.ts` and `stage-execution.ts`).
- [ ] Fix the duplicate-instance hazard: `run-service.ts` privately constructs
      `new AutomationConfigStore()` / `new DeploymentRunner()` while `index.ts` passes separate
      instances to routes — two live instances of each (same pattern risk for `SettingsStore`
      defaults).
- [ ] Shrink the god services per A3: `run-service.ts` (997 lines; `startRunWith` alone 118) and
      `orchestration-service.ts` (914) — push the branching on domain state into `domain/rules/`.
- [ ] Dissolve pass-through files: `run-options.ts` (types only, then re-exported),
      `domain/rules/model-roster.ts` (9 lines), `orchestrator-required-error.ts` (1 line, caught
      nowhere), `routes/pipelines.ts` → one-line service → array filter.

**Docs — validation and reduction (~1,860 removable lines):**
- [ ] `docs/architecture.md` lines ~426–1269: the pre-implementation "0.1 draft" naming classes
      (`WorkflowEngine`, `RunController`, `StageExecutor`…), paths (`.isotopy/tasks/`,
      `state.json`) and a YAML pipeline that never existed or were deleted. Trim to the
      still-accurate subsections (milestones, orchestration, workflow runtime, agent model,
      dashboard, data locations). Lines 34–303 are `gen:` blocks — build inputs, keep.
- [ ] `docs/workflow-runtime-options.md` §§2–4 describe the deleted pre-OpenWorkflow world
      (`RunOrchestrator`, `JsonRunStore`, `state.json`) in present tense — mark historical or trim.
- [ ] `docs/e2e-test-plan.md`: every spec path stale (`.spec.ts` vs actual `.e2e.ts`), retired
      pipelines (`sequential`, `dev-test`) presented as live, deleted `OrchestratorPanel` cited,
      five existing e2e specs unmentioned — rewrite against `testing.md` or delete into it.
- [ ] `docs/implementation-notes.md`: two sections (~463–501) describe deleted `RunOrchestrator`;
      several headings use pre-`rules/` / wrong-folder paths (`domain/engine-limit.ts`,
      `services/workspace-files.ts`); `StageFocusPanel` reference.
- [ ] `docs/architecture.md:215` cites deleted `StageFocusPanel.tsx` **inside the `gen:skill`
      block** — it has propagated into `.claude/skills/architect/SKILL.md`; fix and re-run
      `pnpm gen:skills` (drift guarded by `skill-generation.spec.ts`).
- [ ] `README.md` milestone status is three milestones behind (says F/G in progress; Milestone I
      is open); Documents index omits four docs.
- [ ] `docs/product-brief.md` claims an OpenHands adapter that never existed.
- [ ] `docs/architecture-ui.md`: stale `OrchestratorPanel` rows, unresolvable `conversational`
      gap, stale `WorkspaceFile`/version meta-notes, gaps table misordered.
- [ ] `docs/decisions.md`: restore newest-first ordering (last three 2026-08-07 entries sit
      after 2026-07-22).
- [ ] Archive `docs/dogfood/TASK-141-claude-code-2026-08-17.md` (356 lines, nothing references it).
- [ ] `CLAUDE.md` ⇄ `AGENTS.md`: 131 of ~150 lines byte-identical, yet each has a unique half the
      other lacks (Versioning/validation boundaries vs Server file placement) — reconcile.

Constraints: `gen:` blocks in `architecture.md`/`testing.md` are compiled into skills and drift-
tested; `docs/running-the-app.md` and `docs/planning-a-task.md` are live skill bodies — edit,
don't delete.

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
