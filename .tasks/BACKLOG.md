# Backlog

## TASK-067: SQLite run store — a `node:sqlite` RunStore adapter, per project
**Priority:** P1
**Tags:** server, infra, core
**Updated:** 2026-07-23 13:00

The storage half of the workflow-runtime decision ([`docs/workflow-runtime-options.md`](../docs/workflow-runtime-options.md), TASK-066) and a concrete slice of TASK-039. Run state today is flat JSON — `state.json` + `events.jsonl` under `<project>/.adhd/runs/` via [`JsonRunStore`](../packages/server/src/services/run-store.ts). Both candidate runtimes (OpenWorkflow, Aiki) want a SQL substrate, and the decision is **SQLite**: a handful of rows per run, no server, and — placed inside `.adhd/` — history that travels with the folder like `.git`. **Only run information moves to SQLite; project settings stay in `~/.adhd/settings.json`** (TASK-065) — this task does not touch settings.

The `RunStore` interface already exists (`writeState`, `appendEvent`, `writeHandoff`, `loadAll`, `settle`) and is bound per-project through `RunStoreFactory` (TASK-059). This task adds a second implementation behind it; the orchestrator does not change.

**Scope:**
- New `SqliteRunStore implements RunStore` using **`node:sqlite`** — Node's built-in, no native module. `better-sqlite3` is explicitly rejected: it failed to install on the target platform (see the storage doc). Pin `engines.node` to `>=22.5` and decide how the `ExperimentalWarning` is suppressed/accepted in a shipped product (gate **G6**).
- One database file per project at `<project>/.adhd/runs.db` (home project: `~/.adhd/home/runs.db`), created lazily like the JSON dirs are today. Schema: a `runs` table holding the `PersistedRun` snapshot, an `events` append log, handoffs either a table or left on disk — decide in the plan. WAL mode; prove behaviour under the writer plus concurrent readers (G6).
- Config selector `ADHD_RUN_STORE=json|sqlite` through [`config.ts`](../packages/server/src/config.ts), documented in `.env.example`; `json` stays the default so nothing changes out of the box.
- One-shot importer: existing `.adhd/runs/*/state.json` + `events.jsonl` load into the DB on first use (idempotent — re-running does not duplicate). Keep `loadAll()` semantics identical so persistence/restart component tests pass against either backend.
- Tests: the existing `run-store`/persistence coverage runs against **both** adapters (parametrised), plus a spec for the importer and for a corrupt/locked DB degrading like the JSON store's corrupt-file path.

**Cross-platform:** `node:sqlite` is a built-in Node API, identical on Windows and macOS; the DB path is built with `path.join` + the existing `ProjectPaths`, never a hardcoded separator. WAL creates `-wal`/`-shm` sidecar files — ensure the self-ignoring `.adhd/.gitignore` (`*`) still covers them, and that Windows file-locking (the EBUSY-on-delete hazard the test harness already works around) is handled on `settle()`/close. Tested on Windows; macOS path reasoned through, mark "untested on macOS".

---

## TASK-068: Durable workflow runtime on OpenWorkflow (SQLite)
**Priority:** P1
**Tags:** server, engine, infra, milestone-c
**Updated:** 2026-07-23 13:00

Execute the recommendation of [`docs/workflow-runtime-options.md`](../docs/workflow-runtime-options.md) (TASK-066): adopt **OpenWorkflow** (Apache-2.0, `node:sqlite`, no server) as the durable execution layer. Depends on **TASK-067** for the storage substrate. Today [`RunOrchestrator`](../packages/server/src/services/run-orchestrator.ts) is an in-memory `Map` with a floating `void simulateRun(...)`; gates are heap promises (`gateWaiters`), recovery is `reconcileInterrupted()` marking everything `failed`, retries and durable timers do not exist. §3 of the doc lists six of eleven capabilities as absent or non-durable.

**The seam is the class, not one method** (doc §4): `RunOrchestrator` *is* the durable workflow, `executeStage()` is the durable step. Durability must own start/queuing, the `runStages()` loop, gates/waits, retries, recovery, cancellation state and execution history. Kept ADHD-owned without exception: workflow definitions and their schema, "copy workflow" (S3), the enabled-component snapshot frozen at start (S4), artifact manifests, engine adapters, personas, and prompt/handoff composition in `domain/stage-context.ts`.

**Non-negotiable integration rule:** OpenWorkflow's SQLite DB becomes the single source of truth for execution state, living inside the project's `.adhd/`. `state.json`/`events.jsonl` (and the SSE projection) become a rebuildable, idempotent **read model** — never a second writer. Two independently advancing state machines is the failure mode to design out.

**Feasibility gates from doc §9 (each is a checkpoint in the plan):**
- **G1 — semantic restart from a chosen stage (S2):** OpenWorkflow has no `fork`/`restartFrom`; rebuild ADHD's existing `restartRun(runId, stageId)` on durable steps (likely a fresh run seeded with retained prior-stage outputs). Decide whether to contribute a fork primitive upstream.
- **G2 — one active run per project, concurrent across projects (S5):** worker concurrency is a pool size, not a per-key cap; build a restart-surviving, project-keyed admission check that the API cannot bypass (it currently can).
- **G3 — per-project DB placement & portability** (shared with TASK-067): copying the folder carries history; the projection rebuilds idempotently.
- **G4 — immediate subprocess-tree kill on cancel:** stays ADHD-owned via `runSubprocess`; `cancelWorkflowRun()` only marks durable state.
- **G5 — declared parallel branches over one shared workspace (S6):** `Promise.all` over durable steps; prove fan-in and per-branch failure policy. `runStages()` is a sequential `for` loop today — a `parallel` group runs sequentially and silently.
- **G6 — `node:sqlite` under sustained use:** covered by TASK-067.

**Determinism refactor:** OpenWorkflow (like any durable runtime) requires non-deterministic work — filesystem I/O (`loadSkill`), `nowIso()`, `randomUUID()` — to live inside steps, not the workflow body. This is the mechanical cost §4 says the old "one method" seam claim hid.

**Deliverable:** the `sequential`/`one-box`/`dev-test` pipelines run on OpenWorkflow; a gate survives a hard process kill and resumes in a fresh process without re-running the completed stage (the doc's measured M6/M7); `reconcileInterrupted()`'s mark-everything-failed is replaced by real resumption. **Fallback** if G1 or G2 proves too costly: Option A, the custom engine on the same `node:sqlite` substrate behind the `RunStore` seam — so TASK-067's storage work is not wasted either way. Amend the stale "durable runtime replaces `executeStage()` alone" claim in `architect-standards.md`, `implementation-notes.md` and `code-quality.md` (doc §4).

**Cross-platform:** durable execution and `node:sqlite` are OS-independent; the platform-sensitive surface is subprocess-tree termination on cancel (G4), already owned by `runSubprocess` (`taskkill /T` on win32, SIGTERM→SIGKILL on POSIX). No new spawn/path/env code. Tested on Windows; macOS reasoned through, mark "untested on macOS".

---

## TASK-069: Spike — Aiki durable runtime on a comparison branch
**Priority:** P2
**Tags:** server, engine, infra
**Updated:** 2026-07-23 13:00

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

## TASK-063: Extract SetupModal inline styles to named constants (Architect rule A6)
**Priority:** P3 | **Tags:** ui
**Updated:** 2026-07-22 12:40

Follow-up from TASK-052. The Architect standard (rule **A6**, `docs/architect-standards.md`) bans large inline `style={{…}}` blocks; `StageFocusPanel.tsx` was cleaned as the reference case, but [`SetupModal.tsx`](../packages/ui/src/components/SetupModal.tsx) still carries ~108 inline style objects. Lift them into named module-level constants (static) and small named builder functions (theme-/state-dependent), matching the `StageFocusPanel.tsx` pattern.

Deliberately deferred from TASK-052 (see `docs/decisions.md`, 2026-07-22): the extraction is a large, visually risky diff with no unit coverage, and folding it into the standards task would have buried the standard under churn.

**Verify:** `pnpm lint && pnpm typecheck && pnpm build` green; `pnpm --filter @adhd/ui e2e` still passes (the Setup → AI Harness smoke tests exercise this modal); no visual regression when opening Setup.

**Cross-platform:** n/a — pure UI.

---

## TASK-061: Limit is over
**Priority:** P2 | **Tags:** limits, model | **Assignee:** Fedor
**Updated:** 2026-07-21 11:55

We need to wait when subsription reached a limit, in this case we are going to wait by default. But we need to notify user with popup and may be notification that thereis this problem - and recoomend to change a plan or change a harness fro this worklow run, or just cancel the run, or change a model to cheaper or free one. Basically give all the options. This should work for any harness and mac or windows systmes, Error in logs now: You've hit your session limit · resets 4:30pm (Europe/Tallinn) 14:52:00 ✗ Claude subscription session limit reached — wait for the reset time shown in the log, or switch to an API key in Setup → Connection.

---

## TASK-051: Manual-Tester box — Playwright-driven verification stage in the workflow
**Priority:** P2 | **Tags:** core, server, engine
**Updated:** 2026-07-20 22:30

Add a **third box** to the workflow, after the Tester: a *Manual Tester* persona that verifies the app the pipeline just built **through a real browser** with Playwright — the check a unit test cannot make ("does it actually work when a human clicks it?"). Builds on the persona/handoff machinery from TASK-043…046.

**Guiding principle — automate first, drive manually only where it cannot.** The box must not narrate clicks turn-by-turn; that burns tokens and is slow and non-reproducible. Instead:
1. **Write a Playwright spec, then run it.** One LLM turn authors the spec; the *run* costs zero tokens per assertion and is repeatable. This is the default path.
2. **Only fall back to interactive driving** for genuinely exploratory checks (unexpected layout, a flow the spec cannot express).
3. **Report failures + a short summary, not a transcript.** The persona's output is the handoff, so it must stay compact.

**Work:**
- `.adhd/skills/manual-tester.md` persona (+ a bundled default in `services/skill-defaults.ts`, since `.adhd/` is gitignored) encoding the automate-first rule and a `VERDICT: PASS/FAIL` contract matching the Tester's.
- New pipeline in `core/pipelines.ts` — either a third stage on `dev-test` or a separate `dev-test-manual`; reuse `agentForStage` for the label/glyph. **Decide which**; a separate pipeline keeps the cheap two-box flow intact.
- **Resolve the environment questions** (the real design work here):
  - How does the box get a *running* app? It must start the built app in the shared workspace (port selection, teardown, no orphaned processes — see the stray-process gotcha in the run-app skill).
  - Browser availability — Playwright needs a browser binary; decide install/caching strategy so a run does not download Chromium every time.
  - Headless by default.
- **Artifacts** — save the generated spec, screenshots, and any trace into `.adhd/runs/<id>/<stageId>/` alongside `handoff.md` so a failure is inspectable after the fact.
- Keep the `executeStage()` seam untouched — this is a new stage with a persona, so it should need **no orchestrator changes** (a good test that the TASK-046 design generalizes).

**Verify:** a real run on a small web app — Manual Tester writes a spec, runs it headless, reports PASS/FAIL, and leaves screenshots + the spec as artifacts. Confirm no orphaned browser/server processes remain.

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
