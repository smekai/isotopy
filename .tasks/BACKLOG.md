# Backlog

## TASK-121: Rename the run service, split it, and write the placement rule down
**Priority:** P1 | **Tags:** server, core, infra
**Updated:** 2026-08-05 09:40

Structural cleanup that `TASK-109` exposed, plus the one storage fix that makes the structure honest.

**Sequencing: inside Milestone E, after the feature tasks and immediately before `TASK-117`**, so the Playwright gate runs against the structure we intend to keep.

Parts 1–3 and 5 are **behaviour-preserving** — existing tests pass with only import paths and a class name touched. Part 4 is the one deliberate behaviour change, and it is scoped and tested.

### 1. Rename

`RunOrchestrator` → **`RunService`**, matching its sibling `OrchestrationService`. The old name predates the Orchestrator product concept and now collides with a class that sits *above* it. 9 source files, 34 mentions, mechanical.

### 2. Split the 1613-line class three ways

| New file | ~Lines | Owns |
| --- | --- | --- |
| `services/run/run-service.ts` | ~650 | Run lifecycle — `startRun`, `restartRun`, `abortRun`, `approveGate`, `postMessage`; the `RunProjection` the workflow drives; SSE listeners; `engineAborts`; `cancelled` |
| `services/run/run-store.ts` | ~350 | The cross-project read model — `runs`, `nextRunNumbers`, `enginePermissionModes`, `openWorkflowRunIds`, the per-project `RunRepository` map, `loadProject`, `buildPersisted`, `flushPersist`. Design it against its **post-part-4** shape: no `persistTimers`, no debounce |
| `services/milestone/milestone-service.ts` | ~480 | `milestones`, milestone repositories, milestone CRUD, `startPlanningTurn`, `approveMilestonePlan`, `completeMilestoneRun`, autorun |

`RunService` keeps implementing `RunProjection` — the workflow seam (A4) does not move. `MilestoneService` receives `RunService` to start runs and registers `MilestonePlanConsumer` through the existing `StageOutputConsumer` seam, which is what makes the split possible without a circular import. `MilestoneProposalStore` becomes satisfied by `MilestoneService`, where it always belonged.

**Why not fold the run data into `RunRepository`** (the first instinct): `RunRepository` is constructed **per project**, but the `runs` map is keyed by a globally-unique run id and read with no project scope — `routes/runs.ts` does `getRun(c.req.param("id"))`, which is why SSE needs no `X-ADHD-Project` header. Folding it in would shard the map and break that. `RunRepository` also already validates on read (`parsePersistedRun` rejects malformed rows); what was missing is a cross-project owner above it, which is `RunStore`.

### 3. The placement rule, and a new `utils/` folder

One mechanical question decides the folder:

> **Does this file name an ADHD concept?** A run, a milestone, a stage, a persona, a task board. If it would make just as much sense in a different product, it is a `util`. If it names an ADHD concept: pure → `domain/`, I/O or lifecycle → `services/`.

| Folder | Knows ADHD concepts | Does I/O | Holds state |
| --- | --- | --- | --- |
| `domain/` | yes | **no** | no |
| `services/` | yes | yes | yes |
| `utils/` | **no** | either | no |
| `repository/` over `db/` | yes | yes | connection only |

`utils/` is not a junk drawer — the ADHD-concept test excludes anything domain-shaped.

```text
services/
  run/          run-service.ts  run-store.ts
  milestone/    milestone-service.ts
  consumers/    stage-output-consumer.ts (interface) + the three consumers
  orchestration.ts  settings-store.ts  project-registry.ts  skills.ts
  bundled-prompts.ts  task-board-adapter.ts  product-manager-closeout.ts

utils/
  listener-registry.ts  directory-browser.ts  workspace-files.ts
  time.ts               (was src/utils.ts)

domain/
  codecs/    request-schemas  run-persistence  settings-file  project-registry-file
             task-board-config  milestone  orchestration  milestone-plan
             orchestrator-decision  milestone-summary  preferences
  rules/     stage-context  engine-limit  limit-copy  projects  closeout
  markdown/  skills/     (unchanged)
  validation.ts          (root — the shared zod plumbing every codec builds on)
```

`skills.ts` and `bundled-prompts.ts` stay in `services/` deliberately: `loadBundledPersona` names a domain concept, so it fails the utils test even though the mechanism is a file read. `src/paths.ts` does not move — it is cross-cutting layout imported by `db/`, `repository/` and `services/` alike.

### 4. Stop persisting every log line twice

The one deliberate behaviour change, and the reason `RunStore` can be designed honestly rather than as a wrapper around machinery we would immediately delete.

Today `log()` pushes onto `stage.logs` — which `buildPersisted` clones into the run snapshot — **and** `emit()` appends the same line to the `events` table. Every log line is stored twice, which is what makes the snapshot fat and forces the 150 ms debounce.

Measured on a run blob the size a real full-delivery run reaches (9 stages × 400 log lines):

| Operation | Cost |
| --- | --- |
| Run blob with logs inside | **467 KB** |
| 2001 runs on disk | **93.8 MB** |
| `SELECT` by primary key | 261 µs |
| `SELECT` + `JSON.parse` | 702 µs |
| Serialize whole run + `UPDATE`, per log line | **896 µs** |
| Append one event row (already happening) | 485 µs |

At 896 µs per rewrite, a 400-line stage would spend ~360 ms in synchronous SQLite writes blocking the event loop. That is what the debounce exists to hide.

**The change:** exclude `stage.logs` from the persisted snapshot; keep it on the live in-memory object so SSE and an active run are untouched; **rehydrate it from the `events` table in `loadAll`** so `GET /runs/:id` returns the same wire shape as today. The API contract and every UI component (`LogsPanel.tsx`, `run-events.ts`, `transcript.ts`) stay unchanged.

Then the snapshot drops to a few KB, `schedulePersist`'s debounce can go, and the data map becomes a read-through cache over SQLite — leaving only a small `runId → projectId` routing index, which is what `repositoryForRun` actually needs to pick the right database file.

**A trap:** `persistence.comp.ts:117` asserts `logs.at(-1)` after a restart, but that entry is written *after* load by `markInterrupted` — so the test passes even if all prior history is silently dropped. It will not catch a broken rehydration. Add a test that asserts a log written *before* the restart is still there after it.

### 5. Write the rule down so it does not recur

- Add the placement question and folder table to the **`gen:skill`** block in `docs/architecture.md`; extend **A2** and **A3** in `gen:shared` by one sentence each (the "Nine rules" framing stays). Run `pnpm gen:skills` and commit the regenerated `.claude/skills/architect/SKILL.md` and `personas/architect.md` — `skill-generation.spec.ts` fails the build on drift.
- Update the `packages/server` layout table in `architecture.md`, which goes stale the moment this lands.
- One paragraph in `CLAUDE.md` "Project standards" pointing at the placement question.
- One dated `docs/decisions.md` entry: why the rename, why `RunStore` is cross-project rather than folded into `RunRepository`, why `utils/` is defined by the ADHD-concept test rather than by "small file", and the measured numbers behind moving logs out of the snapshot.

### 6. Guard it

Add `packages/server/test/structure.spec.ts` asserting **no file under `src/domain/` imports `node:fs`** — the one placement rule a machine can check, and the one most likely to be broken by accident.

### Verification

```text
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

- All 452 tests pass. Outside part 4, only import paths and the `RunService` name may change — nothing inside a `test()` body. If a test body needs editing for parts 1–3, the refactor changed behaviour: stop and reconsider.
- New: a log written before a restart is still readable after it (the gap `persistence.comp.ts:117` leaves open).
- New: the run snapshot no longer contains log entries — assert on the persisted row, not the API response.
- `pnpm gen:skills` produces no diff once the `gen:` blocks are committed.
- After `pnpm build`, confirm `dist/domain/skills/{personas,step-tasks}/` still populate — `scripts/copy-skill-assets.mjs` hardcodes those source paths, so the `domain/` regroup must not move them.
- Re-run the TASK-109 smoke against the built server: `GET /orchestrations` → `[]`, `POST` with an empty goal → a path-aware issue on `goal`.

Cross-platform: pure moves and renames. Use `git mv` so history survives; no `\` in any import path.

---

## TASK-120: Orchestrator question broker
**Priority:** P1 | **Tags:** core, server, engine
**Updated:** 2026-08-04 12:20

Put the Orchestrator between a persona and the user. Today an `interactive` stage's `QUESTION:` parks the run and goes straight to the user. Instead, route it to the Orchestrator first: it answers from the goal, the approved team, and prior run artifacts when the answer is derivable, and escalates to the user when it is not — or when the question would change agreed scope.

Wires the `answer_agent`, `escalate_to_user`, and `route_to_agent` actions that `TASK-109` defines in the decision contract. The Orchestrator turn runs as its own durable step while the asking stage stays parked, and an answer it gives is recorded in the run transcript as an agent message rather than a user one.

Reach is every interactive stage in a project that has an Orchestrator, not only orchestrated runs — so `run-questions.comp.ts` and `milestone-planning.comp.ts` change behaviour and must be updated here. Sequenced with or before `TASK-112`.

Cross-platform: n/a — reuses the existing engine adapter, workflow signal, and run persistence plumbing.

---

## TASK-110: Dynamic workflow composition from persona catalog
**Priority:** P1 | **Tags:** core, server, ui, engine
**Updated:** 2026-08-04 11:33

Implement runtime composition of a `PipelineDefinition` (stages) from the persona/step-task catalog. Each composed stage must declare `executionPolicy`, preserve quality/closeout requirements, and require human approval before execution.

This task subsumes the intent of `TASK-097` and becomes the orchestrator's mechanism for building the team workflow.

Cross-platform: n/a — compose/validate/persist uses existing path and JSON helpers; no shell-only commands.

---

## TASK-111: Reusable teams for later orchestrations
**Priority:** P2 | **Tags:** core, server
**Updated:** 2026-08-04 11:33

Persist approved team compositions to `.adhd/teams/<id>.json` with a strict schema and a single writer. The orchestrator lists and reuses saved teams across later conversations instead of recomposing from scratch.

Cross-platform: n/a — JSON + path-joined storage under the existing `.adhd` roots.

---

## TASK-112: Post-run decision loop (next phase routing)
**Priority:** P1 | **Tags:** core, server
**Updated:** 2026-08-04 11:33

After a composed run settles, feed its closeout artifacts (knowledge, decisions, findings, and `nextRecommendation`) back into the orchestrator conversation. The orchestrator then decides whether to start a next composed run, ask the user for an answer, or stop.

Generalizes the current `autoRunNext` behavior: each orchestration phase is a separate run, and earlier runs remain finished records.

Cross-platform: n/a — reuses existing closeout extraction and milestone/run projection.

---

## TASK-113: Per-persona accumulated context (artifact distilled memory)
**Priority:** P2 | **Tags:** core, server, ui
**Updated:** 2026-08-04 11:33

Distill closeout knowledge into per-persona accumulated notes under `.adhd` and inject those notes into `composeSkill` alongside existing user/project overrides.

Also add an orchestrator-facing constraint digest so the orchestrator can reason about “must-do differently for stage X in this project” without needing deep per-agent state.

Cross-platform: path-joined read/write to `.adhd` roots; no subprocess/shell assumptions.

---

## TASK-114: Orchestrator UI (chat + proposal + run timeline)
**Priority:** P2 | **Tags:** ui, core, server
**Updated:** 2026-08-04 11:33

Implement a chat-first UI entry point that supports orchestrator conversations, shows a team proposal/approval panel, and renders a timeline of orchestrated runs within a single initiative.

Cross-platform: n/a — browser UI; relies on the existing cross-platform server API and run projections.

---

## TASK-115: Per-role engine/model configuration (post-MVP)
**Priority:** P2 | **Tags:** core, server, engine
**Updated:** 2026-08-04 11:33

Post-MVP: extend workflow input / run state so each stage can select its own engine+model (allowing the orchestrator to run on a stronger model than team agents). Include settings surface and correct limit-park handling per stage.

Cross-platform: n/a — engine/model selection integrates with existing engine adapter registry.

---

## TASK-116: README — top-level product schema (“How it works”)
**Priority:** P2 | **Tags:** ui, server
**Updated:** 2026-08-04 11:33

Add a “How it works” section to `README.md` with a mermaid diagram of the whole product flow: user → orchestrator conversation → team composition/approval → composed runs (personas + step-tasks + engines) → closeout artifacts → orchestrator decision loop → milestones/task board.

Update this section as part of the milestone so it reflects the orchestrator rather than only today’s static pipelines.

Cross-platform: n/a — docs only.

---

## TASK-117: E2E verification for the orchestrator milestone
**Priority:** P1 | **Tags:** testing, adapters, engine, ui, milestone-c
**Updated:** 2026-08-04 11:33

Following the `qa-testing` skill, run repository gates (lint, typecheck, test, build, e2e), then drive the app (Hono `:9477` + Vite `:5173`) through the full orchestrator flow using the internal browser and/or Playwright.

Verify: user chat with orchestrator, approval of the proposed team, execution of the composed run, and correctness of the post-run decision loop + run timeline. Record a release verdict for the milestone.

Cross-platform: verify on Windows (primary), and ensure test/run commands are valid on macOS (both shells).

---

## TASK-095: Post-MVP — agent-native browser testing for QA
**Priority:** P3 | **Tags:** testing, adapters, engine, milestone-d
**Updated:** 2026-08-03 15:11

**Stays parked (re-confirmed 2026-08-03):** TASK-051 closed by deliberately keeping QA on Playwright only for the MVP and deferring agent-native browser support here. This is a new capability seam, not cleanup, so it does not ride along with the Milestone D close-out.

Add a vendor-neutral testing seam for browser-control capabilities exposed by Codex, Cursor, Claude, or another active harness. QA may use an available native browser first for exploratory and visual checks, then promote stable behaviour into repository-owned Playwright tests. When no compatible capability exists, Playwright remains the complete fallback and CI authority.

Cross-platform: support Windows and macOS capability detection and degrade to Playwright with an accurate recorded reason. This is explicitly outside the Milestone D MVP.

---

## TASK-092: Post-MVP — release management and preview deployment automation
**Priority:** P2 | **Tags:** server, adapters, setup, infra, milestone-d
**Updated:** 2026-07-30 00:00

Add typed project automation configuration for validation, UI startup, health checks, preview deployment, and production deployment. Make Setup deploy cards functional. Release Manager produces a manifest and checklist; SRE deploys preview only after quality passes and keeps production explicitly human-gated.

**Deliberately outside the Milestone D MVP.** The Full Delivery pipeline already carries the `release` and `deploy` stages, and their step-tasks end with `VERDICT: SKIP` when no target is configured — so the seam exists and degrades honestly without this task. Deferring it is also why TASK-093 presents neither deploy URLs nor QA screenshot/trace evidence.

Cross-platform: use executable-plus-argument arrays, `runSubprocess`, and Windows/POSIX overrides without shell-only commands.

---

## TASK-069: Spike — Aiki durable runtime on a comparison branch
**Priority:** P3 | **Tags:** server, engine, infra
**Updated:** 2026-08-03 15:11

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
