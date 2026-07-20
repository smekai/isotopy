# Backlog

## TASK-043: Dev+Test flow — per-stage skill + context model + DEV_TEST_PIPELINE
**Priority:** P1 | **Tags:** core
**Updated:** 2026-07-20 12:40

First real two-box workflow (Developer → Tester). Foundational data-model changes in `@adhd/core`. See plan: `for-a-next-step-pure-floyd.md`.

- `pipelines.ts`: extend `StageDefinition` with optional `skill?: string`. Add `DEV_TEST_PIPELINE` (`id: "dev-test"`, name "Developer + Tester") with one sequential group: `implementation`/label "Developer"/skill "developer", then `test`/label "Tester"/skill "tester". Register in `DEMO_PIPELINES`. Give `ONE_BOX_PIPELINE`'s stage `skill: "developer"`.
- `runs.ts`: add `stageOutputs?: Record<string, string>` to `RunState` (cross-box memory); initialize `{}` in `createInitialRunState`.
- `agents.ts`: rename the `test` profession to "Tester".

Blocks TASK-044/045/046.

---

## TASK-044: Skills layer — markdown persona loader + author developer/tester skills
**Priority:** P1 | **Tags:** server
**Updated:** 2026-07-20 12:40

Editable markdown personas under `.adhd/skills/`, read at run time so they can be tweaked without a rebuild.

- New `packages/server/src/services/skills.ts`: `loadSkill(id)` reads `.adhd/skills/<id>.md` (via `path.join(REPO_ROOT, ...)`), falls back to a bundled default string when the file is missing; small mtime-checked cache so edits apply on next run.
- Author `.adhd/skills/developer.md` (multitool: read context → implement → self-check) and `.adhd/skills/tester.md` (inspect diff → write/run tests → report PASS/FAIL + findings) — strong, real persona prompts.
- Bundled defaults must match the seeded files so the flow works out of the box.

Depends on TASK-043.

---

## TASK-045: Prompt composition + context handoff + appendSystemPrompt
**Priority:** P1 | **Tags:** server, adapters
**Updated:** 2026-07-20 12:40

Give each box its persona and the previous box's work.

- `EngineRunContext` (`engines/types.ts`): add optional `appendSystemPrompt?: string`. Claude adapter passes `--append-system-prompt <persona>`; Cursor/Codex adapters prepend the persona to the prompt (engine-agnostic fallback).
- Helper `buildStagePrompt({ task, upstream })`: user prompt = task + a "Previous step handoff" block built from prior `stageOutputs`.
- After each engine stage: capture `result` into `run.stageOutputs[stageId]`, persist, and write `.adhd/runs/<id>/<stageId>/handoff.md`. Shared workspace stays the source of truth; the handoff summary is the injected memory.

Depends on TASK-043, TASK-044.

---

## TASK-046: Orchestrator — engine-per-skill-stage + shared workspace + StageExecutor seam
**Priority:** P1 | **Tags:** server, engine
**Updated:** 2026-07-20 12:40

Make the two boxes actually run on the plain-TS FSM.

- `run-orchestrator.ts`: run the real engine for any stage that has a `skill` (not only whole-run engine mode), so both boxes execute. Both share one `run.workspacePath` (Tester sees Developer's code). v1 uses one `run.engine`/`run.model` for both boxes; per-box engine selection deferred.
- `executeEngineStage`: load the stage's skill → `appendSystemPrompt`; build prompt via `buildStagePrompt` with upstream context; capture output → `stageOutputs` + `handoff.md`.
- Factor the engine-vs-sim decision behind a small `StageExecutor`-shaped boundary so an Aiki executor can replace it later without touching adapters (v0.2 door).
- `startRun`: accept `"dev-test"` like `one-box` for engine validation + single shared workspace resolution. Keep gate/restart/persistence unchanged.

Depends on TASK-043, TASK-044, TASK-045.

---

## TASK-047: UI — surface per-box persona + render handoff in run view
**Priority:** P2 | **Tags:** ui
**Updated:** 2026-07-20 12:40

Polish once the flow runs. The `dev-test` pipeline appears in the picker automatically; add persona/handoff visibility.

- Show each box's persona name (Developer / Tester) in the run view.
- Render `handoff.md` (or `stageOutputs[stageId]`) in the box's log/detail so the hand-off between boxes is visible.

Depends on TASK-046.

---

## TASK-048: Verify the two-box Developer→Tester flow end-to-end
**Priority:** P2 | **Tags:** testing
**Updated:** 2026-07-20 12:40

Manual/e2e verification via the run-app skill.

- `pnpm typecheck && pnpm lint`; `pnpm dev`.
- Start a "Developer + Tester" run on a small task (e.g. "add a `sum(a,b)` util with a test") against a scratch workspace.
- Confirm Developer writes code → Tester (separate persona) inspects the shared workspace, writes/runs a test, reports PASS/FAIL. Inspect `.adhd/runs/<id>/implementation/handoff.md`, `.adhd/runs/<id>/test/handoff.md`, and `state.json.stageOutputs`.
- Edit `.adhd/skills/tester.md`, re-run, confirm the change applies without a rebuild.

Depends on TASK-046.

---

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

