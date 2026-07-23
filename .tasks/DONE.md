# Done

## TASK-066: Inestigation of Workflow options
**Priority:** P0 | **Tags:** worklow | **Assignee:** Fedor
**Updated:** 2026-07-23 09:38

Workflow Runtime Options Decision Document Summary Create branch codex/workflow-runtime-options from committed HEAD da46ce9 in an isolated worktree, excluding the uncommitted TASK-065 changes. Add exactly one file: docs/workflow-runtime-options.md. Do not modify TaskPlanner, changelog, versions, code, or existing docs. Research is dated 2026-07-23 and uses official sources. Document Content Define the agreed semantics:The manually started runner continues after the UI closes; OS login autostart is deferred. Restart/checkpoint granularity is a named workflow stage, not an instruction inside an agent process. “Copy workflow” duplicates a reusable definition only. Components are selected and the definition is frozen when a run starts. One active workflow is allowed per project; different projects may run concurrently. Declared parallel branches may share the project folder, with conflict avoidance owned by the workflow author.  Map every requested capability to current implementation and plans: start, recovery, retries, definition copying, artifacts, durable user/external waits, optional stages, project concurrency, cancellation, and parallel execution. Reference the relevant completed tasks (TASK-003/005/014/043–046/055/058–060), open work (TASK-039/051/061/065), and roadmap commitments. Correct the existing architectural claim that only executeStage() must change: durable execution must own starting/queuing, the orchestration loop, gates/waits, retries, fan-out/fan-in, recovery, cancellation, and execution history. Compare three primary options:Evolve the current TypeScript/file-backed state machine. Adopt Aiki. Adopt DBOS TypeScript.  Provide two matrices:Capability coverage: native, ADHD-owned, custom work, or unsupported/undocumented. Operational fit: maturity, license, PostgreSQL/runtime requirements, Windows/macOS packaging, integration cost, source-of-truth implications, versioning, and lock-in.  Add a compact competitor section covering Cline, OpenHands, Devin, Cursor Cloud Agents, and GitHub Copilot agents. Highlight that session persistence, checkpoints, approvals, and isolated parallel agents are becoming baseline, while semantic failed-stage restart and durable external waits remain differentiators. Recommendation Recorded in the Document Recommend DBOS as the leading implementation-spike and default candidate because bundled PostgreSQL is acceptable and DBOS has the strongest match for recovery, retries, signals, durable sleep, cancellation, step forking, parallel work, and project-keyed queue concurrency. Keep workflow definitions, definition copying, enabled-component snapshots, artifact manifests, code, and generated files ADHD-owned. If DBOS is adopted, make its database authoritative for execution state; retain project-local state.json/events only as an idempotent history projection/export, avoiding two independently advancing state machines. Require a feasibility spike before adoption to prove:Invisible PostgreSQL installation, startup, upgrade, backup, and removal on Windows and macOS. Recovery after killing the server during a stage and during a durable wait. User signals and limit polling with persisted timers. One active run per project with concurrent runs across projects. Immediate subprocess-tree termination despite DBOS cancellation occurring at step boundaries. Declared parallel branches and project-local history projection.  If the packaging or project-portability gates fail, recommend the custom engine as the fallback. Keep Aiki on the watch list because it is alpha, has the same PostgreSQL burden, and lacks documented semantic stage-reset advantages. Note Restate as screened out due to missing official Windows binaries. Validation and Assumptions Verify every changing framework/competitor fact against an official source and include inline links plus the research date. Review the Markdown rendering, tables, relative repository links, and terminology. Run a whitespace/error check on the new file and confirm the branch worktree contains exactly that one changed file. No public APIs, schemas, or runtime behavior change in this branch; all interface names in the document are conceptual recommendations only.

### Scope extension — 2026-07-23 (reopened)

The first pass shipped `docs/workflow-runtime-options.md` recommending **DBOS**, gated on bundling
PostgreSQL invisibly (gate **G1**). Two owner inputs reopened it:

1. **Postgres is disproportionate to the data.** Run state is a handful of rows per run; requiring a
   Postgres server on every Windows/macOS machine to hold it is rejected. Want a file-backed store —
   SQLite or equivalent — that a workflow engine actually supports.
2. **The owner is an Aiki contributor**, so Aiki's capability gaps — the entire basis for keeping it
   on the watch list — are changeable upstream.

**Added scope:**
- Split the storage comparison into its own file, `docs/workflow-storage-options.md` (embedded DB
  candidates + an engine × storage support matrix + the tie-in to TASK-039).
- Widen the engine survey beyond the original three — the field includes TanStack Workflow, Reflow
  and Resonate, none of which were considered.
- Revise `docs/workflow-runtime-options.md`: DBOS TypeScript is **Postgres-only** (`pg` is its sole
  DB driver; SQLite exists only in the Python port), so the DBOS recommendation and gate G1 are
  superseded. Re-rank the options against an embedded-database constraint.

### Done

Two documents on branch **`codex/workflow-runtime-options`** (commits `f773dee`, `b0e2c29`);
`git diff main HEAD --stat` shows exactly those two files, 793 insertions, no code or schema.

**`docs/workflow-storage-options.md` (new).** SQLite via Node's built-in **`node:sqlite`**, behind
the `RunStore` seam TASK-059 already built. Measured on Windows 11 / Node v24.12.0 rather than
cited: **`better-sqlite3` fails to install here** — no prebuild, `node-gyp` demands Visual Studio
C++ — while `node:sqlite` works (1000 inserts, transactions, WAL). PGlite rejected (*"single
user/connection"*, single-process, alpha); `embedded-postgres` rejected (zonky binaries their own
project calls *"intended for testing purposes"*). Includes the engine × storage matrix, which is the
document's point: **the storage choice decides the engine choice.** TASK-039's named candidate
should change from `better-sqlite3` to `node:sqlite`; its interface half is already done.

**`docs/workflow-runtime-options.md` (revised).** §1–§4 and §8 stand unchanged; §5, §7 and §9 are
revised with a dated revision note so the superseded DBOS reasoning stays legible.

- **DBOS TypeScript is Postgres-only** — `pg` is the sole DB driver in its `package.json`. The SQLite
  support widely attributed to DBOS is in the **Python** port, where it is the default. Gate G1
  (bundle Postgres invisibly) is obsolete, and DBOS is blocked pending TS parity.
- **Survey widened** past the three the task named: OpenWorkflow, Reflow, TanStack Workflow, Vercel
  Workflow SDK, Resonate. **Resonate screened out — no Windows binaries** (darwin/linux only), the
  same failure that eliminated Restate; that criterion is now called out as a first-class filter.
- **Recommendation: OpenWorkflow** (Apache-2.0, 1279★). Installs as **1 package, ~2 s, zero
  dependencies, no native module, no server**; its SQLite adapter calls `require("node:sqlite")`.
  Measured running ADHD's exact shape — Developer → durable gate → Tester — **surviving a hard
  process kill at the gate, resuming in a fresh process, and not re-running the completed stage.**
  Gives durable gates (`waitForSignal`/`sendSignal`), durable sleep (TASK-061), retries,
  cancellation, parallel steps and lease-based recovery.
- **Honest trade recorded:** OpenWorkflow has no fork-from-step (**S2**) and no per-key concurrency
  (**S5**) — the two things DBOS did natively. Both become ADHD-owned; note `restartRun()` already
  implements S2 semantics against our own state model.
- **Recovered by this change:** execution history stays a per-project file inside `.adhd/`, so it
  travels with the folder like `.git`. Postgres would have moved it to a machine-level database and
  broken the local-first differentiator §8 identifies as hardest for cloud competitors to copy.
- **Aiki is the standing second choice**, on contributor leverage rather than features — its gaps
  (SQLite provider, fork-from-step) are ours to close, but closing them only reaches where
  OpenWorkflow already is. Revisit immediately if its SQLite backend lands.

**Validated:** 19 relative links resolve across both docs, 10 tables well-formed, no trailing
whitespace or tabs, LF endings, trailing newlines, cross-links resolve both ways. Every changing
framework fact carries an inline official-source link dated 2026-07-23; gaps are labelled
unverified rather than asserted.

**Not done (deliberate):** `architect-standards.md`, `implementation-notes.md` and `code-quality.md`
still carry the `executeStage()`-is-the-whole-seam claim that §4 corrects. They should be amended
when a runtime decision is executed, not in a research branch.

---

## TASK-065: Move project preferences server-side, out of localStorage
**Priority:** P2 | **Tags:** ui, server, setup
**Updated:** 2026-07-23 12:40

Engine, model, permission mode, pipeline and disabled stages read as project settings but lived in one browser (`adhd.<projectId>.<name>` in `localStorage`), so a second browser — or cleared site data — silently reverted a project to defaults while its folder, skills and credentials stayed durable server-side.

**They now live in `~/.adhd/settings.json`,** in the same per-project section as the engine connection, behind `GET /settings` and a new `PUT /settings/preferences`. Secrets did not move: an API key is still write-only and never echoed back.

**Stored as a partial, resolved in three layers** — built-in defaults ← `defaults.preferences` ← `projects.<id>.preferences` — so a project that sets one field is not frozen against later changes to the defaults. Validation splits by direction: `normalizeProjectPreferences` is tolerant on read (hand-editable file, falls back field by field, migrates `LEGACY_MODEL_ALIASES` — that migration used to run in the browser), `parsePreferencesUpdate` 400s on an unknown engine, permission mode or pipeline on write.

**The UI reads and writes through one hook.** `useSettings` (a `SettingsController`, modelled on `useProjects`) is owned by `App` and passed to `EmptyState`, `SetupModal` and `ProjectDrawer` — replacing `src/settings.ts` and the two components' own `fetchSettings` calls. Updates are optimistic, then reconciled with the server's response. `legacy-prefs.ts` adopts whatever the old keys still hold, once per project, then deletes them.

**E2E had to be isolated:** preferences are now durable state that a fresh browser context no longer discards, so Playwright runs against its own `ADHD_USER_HOME`/`ADHD_HOME` and ports (`reuseExistingServer: false`), and every spec resets preferences in `beforeEach` — without that, the pipeline `dev-test-flow.spec.ts` picks changed the run `run-lifecycle.spec.ts` started. Verified with two real browsers against a running app: what one sets, the other sees.

Also fixed on the way: a UTF-8 BOM in the `package.json` files broke `vite build`'s PostCSS config search, so `pnpm build` had been failing before this change.

### Plan (done)

1. core — `ProjectPreferences`, `defaultProjectPreferences`, `mergeProjectPreferences`, `modelForEngine`, `DEFAULT_ENGINE_ID`, `DEFAULT_PIPELINE_ID`; `SettingsView.preferences`.
2. server — `domain/preferences.ts`, `SettingsStore.getPreferences`/`updatePreferences`, `PUT /settings/preferences`.
3. ui — `hooks/useSettings.ts`, `legacy-prefs.ts`, `api.updatePreferences`; `src/settings.ts` deleted.
4. tests — `settings.comp.ts` (10), `preferences.spec.ts` (14), `legacy-prefs.spec.ts` (9); e2e rewritten against `/settings` with `e2e/support/preferences.ts`.
5. docs — decision-log entry, e2e plan, implementation notes, architecture storage table.

---

## TASK-064: The project owns the folder — retire the per-run working directory
**Priority:** P1 | **Tags:** core, server, ui
**Updated:** 2026-07-23 11:10

After TASK-059 two folders competed: the project's root, and the composer's "Working directory" box (kept per project in localStorage, sent as `workspaceDir` on `POST /runs`). A run listed under `my-app` could execute the agent anywhere, and the browser could name any absolute path as an autonomous agent's cwd.

**One folder per project, derived not requested.** `resolveWorkspace(paths, runId)` now takes no directory: a registered project runs in its own root; the **home** project — which owns no code — gets `~/.adhd/home/runs/<id>/workspace` per run, keeping the zero-setup path and giving the live e2e canary a folder it cannot damage. `workspaceDir` is gone from `StartRunOptions`, the `POST /runs` body, `api.ts` and `settings.ts`; a client that still sends one is ignored (covered by a comp test). A project's root is fixed at registration — no route and no control changes it.

**Artifacts stay per-run and git-ignored.** `ensureProjectDataDir` also runs at run start, so `<root>/.adhd/.gitignore` (`*`) exists even for projects registered before it, or whose `.adhd/` was deleted.

**New `ProjectDrawer`** (left, mirroring `HistoryDrawer`; header **Project** button, X or Escape to close) is where the setup went: folder + lock note + the git-ignored data folder; the open run's pipeline·engine·model, working folder and artifacts folder; engine/permissions/connection and pipeline summaries for new runs, each deep-linking into Setup via a new `SetupSection` union on `SetupModal`. The composer replaced its input and Browse button with a read-only folder chip that opens the drawer.

**Small consolidations on the way:** `Project` gained `dataDir`, derived on read (`withDataDir`) so `projects.json` keeps only what the user chose; `projectPaths` takes a `ProjectLocation` instead of a whole `Project`; permission-mode labels moved into `@adhd/core` (`PERMISSION_MODES`, `permissionModeLabel`) so the drawer and Setup share one source; `isScratchWorkspace` was corrected — it matched `/.adhd/runs/`, which never matches the home project's real scratch path.

**Verified:** `lint`, `typecheck`, `test` (115, +7), `build`, `e2e` (23 + live skipped), `gen:skills --check` all green. Against the running app: a `POST /runs` carrying `"workspaceDir":"C:/Windows"` still ran in the project root, a real Claude Code run used the project folder as cwd and left `git status` clean, and a home run landed in `~/.adhd/home/runs/<id>/workspace`. Rationale in `docs/decisions.md`; layout in `docs/technical-architecture.md`. Version 0.6.1 → 0.6.2.

**Follow-up:** engine/model/permission/pipeline preferences are project-scoped but still live in `localStorage`; moving them server-side (so they survive a browser change) is a separate task.

---

## TASK-059: Projects — scope runs, settings and skills to a project
**Priority:** P1 | **Tags:** core, server, ui, infra
**Updated:** 2026-07-22 22:45

All five phases shipped. **A project is a directory that owns its own `.adhd/`**, like `.git`, so history sits beside the code it belongs to instead of inside the ADHD checkout.

**Storage relocated (the load-bearing change).** `paths.ts` now exports a `ProjectPaths` value (`id`, `root`, `dataDir`) that callers receive; `REPO_ROOT` survives only for loading the tool's own `.env`. `run-store.ts` became a `RunStore` interface + `JsonRunStore` class bound to a project (the TASK-039 seam, done once — TASK-039 now only adds an adapter). `RunState.projectId` is required; the orchestrator takes `{ registry, createRunStore, settings }`, keeps a store and a run-number counter per project, and filters `listRuns` by project.

**Registry + API.** `Project`/`ProjectsView` in `@adhd/core`; `ProjectRegistry` over `~/.adhd/projects.json`; `GET/POST /projects`, `POST /projects/:id/activate`, `DELETE /projects/:id` (unregisters only — never deletes files). Each request resolves its project from an `X-ADHD-Project` header, falling back to the registry's active one. Project ids are `<slug>-<sha1(normalized root)>`, case-folded on Windows only.

**No migration (owner decision).** Instead of adopting orphaned runs, the fallback is a **home project** at `~/.adhd/home` — deliberately *not* `REPO_ROOT`, which would reproduce the bug being fixed. The ~75 legacy runs in the repo are no longer listed; files left on disk.

**Credentials never enter a project folder.** `~/.adhd/settings.json` (mode `0600`) holds `defaults` + per-project overrides, so a new project inherits an existing key instead of demanding a new one. Created `<project>/.adhd/` ships a self-ignoring `.gitignore` (`*`).

**Skills layered, not replaced.** bundled default → user-level override → project addendum (`<id>.project.md`) appended; full replacement still supported. Seeding to disk was **removed** — it was the exact mechanism that shadowed improved defaults during the TASK-053 follow-up.

**UI.** Real header dropdown (`ProjectSwitcher` + `useProjects`), reusing `FolderPicker` to add a project; every localStorage preference is now keyed `adhd.<projectId>.<name>`.

**Follow-up in the same pass (owner request):** stripped every explanatory comment from the new source per rule **A1** — renaming where the comment described *what* (`registry.remove` → `unregister`, `detachedCopyOfResolvedEntry`, `foldCaseWhereFilesystemIsInsensitive`, `clearRunViewForProjectSwitch`) and relocating the *why* into `docs/implementation-notes.md` and `docs/decisions.md` per **A8**. Added the [`validate-code`](../.claude/skills/validate-code/SKILL.md) skill — the review counterpart to `architect`: the A1–A9 checklist plus the gate order. Unified the personas: text now lives in `domain/skills/personas/*.md` (Architect still composed from `architect-standards.md`), and `scripts/generate-skills.mjs` emits one `defaults.generated.ts`, replacing the split between a hand-written `defaults.ts` and a separate `architect.generated.ts`; `skill-generation.spec.ts` guards the drift.

**Verified:** `lint`/`typecheck`/`test` (109, +45)/`build`/`e2e` (19) all green, plus `pnpm gen:skills --check`. Against the running app: two projects each showed only their own history, runs wrote into their own `.adhd/runs/`, nothing new landed in the ADHD repo, an API key set on one project stayed out of both project folders and off the other project, and a `developer.project.md` addendum appeared in the persona while the bundled base still supplied the text. Rationale in `docs/decisions.md`; layout in `docs/technical-architecture.md`. Version 0.5.0 → 0.6.0.

---

## TASK-052: Architect skill — codify the code standards, then clean the codebase to them
**Priority:** P1 | **Tags:** core, ui, server, infra
**Updated:** 2026-07-22 12:40

Produced a staff-level **Architect standard** — nine rules (A1–A9), stated transferably with per-tier (BE/FE/Mobile) shapes — and cleaned the codebase to it.

**One source, two consumers.** [`docs/architect-standards.md`](../docs/architect-standards.md) is the canonical text; [`scripts/generate-architect-skill.mjs`](../scripts/generate-architect-skill.mjs) (`pnpm gen:skills`) emits both `.claude/skills/architect/SKILL.md` and `packages/server/src/domain/skills/architect.generated.ts` (`ARCHITECT_SKILL`, added to `DEFAULT_SKILLS`, seeds `.adhd/skills/architect.md` via the existing loader). Drift, rule-id coverage, and seeding are guarded by `architect-skill.spec.ts`. `code-quality.md` stays descriptive and links to the two new prescriptive docs; rationale lives in [`docs/decisions.md`](../docs/decisions.md) (rule A8).

**Cleanup traceable to the rules:** server pure logic moved to `packages/server/src/domain/` (A3); all 12 UI components got named `XProps` types and `StageFocusPanel.tsx` got named style constants/builders (A6); comments compensating for bad names removed (A1). **TypeScript 6.0.3** (7.x crashes the lint gate — see decisions log) with `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` on (A7). SetupModal's ~108 inline styles deferred to TASK-063.

**Verified:** `pnpm lint`, `typecheck`, `build`, `test` (64), and `pnpm --filter @adhd/ui e2e` (14) all green; `pnpm gen:skills` leaves a clean tree.

---

## TASK-062: Component tests (AAAAA) for the server + testing-layer policy
**Priority:** P1 | **Tags:** testing, server, infra
**Updated:** 2026-07-21 19:30

Made component tests the primary test level and introduced the repo's first test runner (Vitest). **60 tests in ~1.5s**, no browser, no CLI, no spend.

**Layer policy** (`docs/testing.md`): comp (`packages/server/test/*.comp.ts`) is the default; `*.spec.ts` is narrowed to complicated pure functions; Playwright keeps only what needs a browser; the live test is demoted to a "does the real CLI still integrate" canary. **AAAAA** structure throughout — Arrange → Anticipate → Act → Assert — with the two hard rules enforced: one action per test, no branching in a test body (all polling lives in `test/support/harness.ts`).

**Three seams added:** `ADHD_HOME` lazy accessors in `paths.ts` (a real feature, not just a test hook — also documented in `.env.example`); `setEngineAdapter`/`resetEngineAdapters` on the engine registry; `createApp({ orchestrator })` with `createRunRoutes`/`createPipelineRoutes` factories, deleting the module-level singleton. Plus `settleWrites()` + `RunOrchestrator.shutdown()` so a caller knows when the disk has caught up.

**26 comp tests** over three suites. `dev-test-pipeline.comp.ts` proves for free what the live test used to buy with money: the Tester's prompt quotes the Developer's report under a handoff heading, both boxes share one workspace, `VERDICT: FAIL` on exit 0 fails the run, a failing Developer stops the run before the Tester is called. **34 unit specs** for `parseStageVerdict` (backwards scan, markdown wrapping, CRLF), `run-utils`, `pipelines`.

**Two product bugs found by writing the tests:**
- Aborting during persona resolution left no `AbortController` registered, so the CLI was spawned anyway and ran to completion for an already-cancelled run. Fixed by registering the handle before the first await plus a cancelled check.
- `simulateStage` floored its per-line delay at 300ms, silently overriding any caller asking for faster timings. The floor was dead code for the 2–8s defaults and only ever bit when the option was used deliberately. Removing it took the suite from 14s to 1.4s.

**Verified:** mutation-tested — reintroducing the stale-`stageOutputs` bug and the ignored-`FAIL`-verdict bug each turns the suite red (the first exposed a gap, which added a test); real `.adhd/runs` untouched and zero leftover temp dirs after a run; 5 consecutive green runs; `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm e2e` (14 passed, live skipped) all green.

**Cross-platform:** temp roots via `os.tmpdir()` + `mkdtemp`; `dispose()` drains queued writes before `fs.rm`, which also retries and tolerates failure (Windows `EBUSY`); scripts are `vitest run` only. The comp suite never reaches `subprocess.ts`, so it has no platform branch to diverge on. Run on **Windows**; **untested on macOS**.

**Known gap:** the abort-during-persona-resolution window is a genuine race and is not deterministically reproducible in a test — the adjacent case (abort before the stage is entered) is covered. Engine *adapter* output parsing also remains untested, since the fake adapter substitutes for it; noted as the next gap in `docs/code-quality.md`.

---

## TASK-050: Test phase — extend Playwright e2e to the Developer+Tester flow
**Priority:** P1 | **Tags:** testing, ui
**Updated:** 2026-07-21 18:00

Extended the existing Playwright suite from 8 free-tier tests to 16 free/seeded tests plus one opt-in live smoke, covering the two-box Developer→Tester flow. 27s, zero engine spend.

**Done:**
- **Regression check** — the picker tests never asserted a two-entry list, so TASK-043 did not break them. Two *other* assertions were stale and failing: the `SOON` pill (all three harnesses now ship) and Cursor's model roster (`agent models` returns 170+ live entries; default is now Auto `""`). Both repaired and made resilient to roster churn. Picker test now asserts all three pipelines.
- **New free tier** — `e2e/run-lifecycle.spec.ts`: composer start → run view, Abort → CANCELLED, run → COMPLETED with per-stage statuses, gate AWAITING → Approve Gate, Resume from a cancelled run, history re-attach. All on the simulated `sequential` pipeline, driven through the API with `minDurationMs`/`maxDurationMs`/`failProbability: 0` so runs finish in seconds. This promotes what used to be the manual live tier.
- **New seeded tier** — `e2e/dev-test-flow.spec.ts`: picker/composer copy for `dev-test`, plus a fabricated `RunState` served by route interception to assert Developer/Tester nodes, `DEVELOPER`/`TESTER` persona badges, the Tester's `PASS` verdict, and each box's own `handoff.md`. The fixture sets `result` to the Tester's text so the TASK-047 bug fails the test — verified by reintroducing it.
- **Live smoke** — `e2e/live-dev-test.spec.ts`, skipped unless `ADHD_E2E_LIVE=1`. Proves only what the cheap tiers cannot: the boxes chain, and the Tester sees the Developer's file in the shared workspace. Not executed (needs an unsandboxed server + real spend).
- **Test affordances** — `data-testid` on the run status word (stage nodes render the same words), stage nodes, stage profession/persona, and the artifact preview.
- **Config** — `workers: 1` + `fullyParallel: false` (one shared server and run store); root `pnpm e2e`; `tsconfig.e2e.json` so the Node-side files typecheck without leaking `process` into `src/`.
- **Docs** — `docs/e2e-test-plan.md` rewritten around the three tiers (`handoff.md`, third pipeline); run-app skill's `/pipelines` line and e2e commands corrected in both `.claude/` and `.agents/` copies; CI note updated in `docs/code-quality.md`.

---

## TASK-060: Restart vs Resume — full-pipeline restart from History
**Priority:** P2 | **Tags:** ui
**Updated:** 2026-07-21 18:00

History has a single **Restart** button that resumes from the *failed* stage (`restartStageId`), so a two-box run that failed in the Tester restarts at the Tester and never re-runs the Developer. The label promises "start over"; the behaviour is "resume". Reported after restarting run #32 and seeing it begin at Test.

Split the two meanings into separate actions (owner decision):
- **Resume** — continue from the failed stage. Current behaviour, keeps expensive engine work from being redone.
- **Restart** — re-run every enabled stage from the first one.

**Work:**
- `run-utils.ts` — rename `restartStageId` to `resumeStageId` (it never meant "restart"), and add `firstEnabledStageId(run)` returning the first stage not in `disabledStages`.
- `HistoryDrawer.tsx` — render both buttons for failed/cancelled runs, alongside the existing `Rerun`.
- `TeamController.tsx` — the footer action targets the resume stage, so its label becomes **Resume from X**; leaving it as "Restart from X" would contradict the new vocabulary.
- Both actions stay limited to failed/cancelled runs: `RunOrchestrator.restartRun` rejects anything else, and re-running a *completed* run in place would destroy its artifacts. **Rerun** remains the path for completed runs.

**Not a bug, worth recording:** run #32 also had `disabledStages: ["implementation"]`, set through the API during TASK-057 verification, which is why its Developer was skipped. That is unreachable from the UI — `App.tsx` only sends `disabledStages` for simulated pipelines. Even after this change run #32 restarts at the Tester, because the Developer is disabled *in that run*; **Rerun** is the way to get a fresh run with both boxes.

**Done.** `resumeStageId` (renamed from `restartStageId` — it never meant restart) + new `firstEnabledStageId`. History renders **Resume** and **Restart** for failed/cancelled runs; Resume is hidden when both targets are the same stage, so the pair never shows two buttons that do the same thing. `TeamController`'s footer became **Resume from X** so the vocabulary is consistent.

**Verified** with simulated runs (zero engine spend): a run aborted mid-stage-2 offers both buttons; **Restart re-ran stage 1 even though it had already passed** (previously it began at stage 2); **Resume** left stage 1 `passed` and continued at stage 2. A run that failed on its first stage shows Restart only; completed runs show Rerun only.

Typecheck + lint + build green; e2e unchanged at 6 passed / 2 failed (pre-existing stale Cursor specs, TASK-050).

---

## TASK-057: Honour the Tester's VERDICT — a FAIL verdict must fail the stage
**Priority:** P1 | **Tags:** server, engine, ui
**Updated:** 2026-07-21 17:10

Done. A verification box's own verdict now decides its stage status; a failed verification can no longer present as a green run.

- `services/stage-context.ts` — `parseStageVerdict()`, pure. Scans **backwards** for a line that is *only* a verdict. Both halves matter: the persona text itself contains the literal strings `VERDICT: PASS` and `VERDICT: FAIL`, and a report may discuss one mid-prose, so a first-match-anywhere search reads the wrong outcome. Accepts the markdown wrapping real runs produce (bare, `` `backticked` ``, `**bold**`), is case-insensitive, and strips `\r` so CRLF output from a Windows CLI still matches.
- `core/runs.ts` — `StageVerdict` type and `StageState.verdict?`, so the verdict is persisted and reachable by the UI. Core stays pure (type only; the parser lives in the server).
- `run-orchestrator.ts` — after a successful engine outcome the verdict is read, recorded on the stage, and logged (`pass`/`fail` level). `FAIL` marks the stage failed and returns `"failed"`, so the existing loop fails the run and `restartRun` offers "Restart from Tester". The handoff artifact is still written first, so a failing run keeps its evidence.
- **No verdict → unchanged behaviour**, keeping this self-describing with no new `StageDefinition` field. `restartRun` also clears a stale `verdict` alongside the stage's recorded output.
- `StageFocusPanel.tsx` — PASS/FAIL badge beside the persona badge.

**Verified.** Parser: 13 synthetic cases including the two decisive ones (a mid-prose "I would return VERDICT: FAIL…" must not beat the real trailing `PASS`; an echoed persona block must not beat a real trailing `FAIL`). Then against **real data** — all 14 tester handoffs on disk parsed, and **0 of 12 developer handoffs** returned a verdict, confirming the Developer is untouched. (The one tester returning `undefined` is the TASK-048 marker-probe run, which deliberately had no verdict contract.)

End-to-end, reproducing the evidence case: `dev-test` with `disabledStages: ["implementation"]` on an empty workspace → run **failed**, `Tester=failed [FAIL]`, log line `✗ Tester reported VERDICT: FAIL`, FAIL badge in the header, "Restart from Tester" offered. Previously identical conditions produced a green `completed` run. A normal `dev-test` run still completes with `Developer=passed verdict=undefined` and `Tester=passed verdict=PASS`.

Typecheck + lint + build green. `pnpm --filter @adhd/ui e2e` unchanged at 6 passed / 2 failed (pre-existing stale Cursor-model specs, TASK-050).

---

## TASK-058: Rerun from History — prefill the composer from a past run
**Priority:** P2 | **Tags:** ui
**Updated:** 2026-07-21 16:25

Done. History could only *Restart* a failed run from its failed stage; a completed run offered no way to run the same task again.

- `HistoryDrawer.tsx` — **Rerun** button on every card that has a task, beside `Restart`. Tooltips now distinguish them: Restart *resumes this run from where it stopped*, Rerun *loads the task and settings into the composer to edit before starting*.
- `App.tsx` — `handleRerun()` restores the run configuration to settings (`savePipelineId`, `saveWorkspaceDir`, `saveEngine`, `saveEngineModel`), closes the drawer, clears the active run, and hands over the task text. Pipeline/workspace/engine come back through the settings EmptyState already reads, so only the task needed a new prop (`initialTask`).
- **Remount via `key`** — `EmptyState` seeds state with `useState(loadX)`, which only runs on mount, so a prefill arriving while it was mounted would have been silently ignored.
- `run-utils.ts` — `isScratchWorkspace()`, separator-agnostic (normalises Windows backslashes to `/`). **A scratch path must not be reused:** `.adhd/runs/<oldId>/workspace` belongs to the run that created it, so reusing it would write the new run into the previous run's folder. Those rerun with a blank directory and get their own scratch.
- **Removed the stale `Artifacts` button** — hardcoded `disabled` with the tooltip *"Artifacts are not stored yet"*, untrue since TASK-055. Clicking the card opens the run, where Artifacts live.
- Added `data-testid` hooks (`history-card` + `data-run-id`, `history-rerun`) — the cards were not addressable from a test; TASK-050 will want them.

**Verified** with two simulated runs (zero engine spend): a run with an explicit working directory restored task, pipeline, directory and `Engine: Codex · gpt-5-mini`; a scratch-workspace run restored task, pipeline and `Engine: Claude Code · haiku` with the **directory left blank**. Both closed the drawer and stopped at the composer without starting.

Typecheck + lint + build green. `pnpm --filter @adhd/ui e2e` unchanged at 6 passed / 2 failed (the pre-existing stale Cursor-model specs, TASK-050).

---

## TASK-056: Folder browser — choose where the project lives
**Priority:** P2 | **Tags:** server, ui
**Updated:** 2026-07-21 15:20

Done. The project location is now picked, not typed from memory.

- `services/directory-browser.ts` (new) — `listDirectories()` returns **directory names only**, never file names or contents, so the endpoint cannot be used to read anything off the machine. No path → roots (home dir, plus drive letters on Windows, `/` elsewhere). Hidden dirs filtered; `ENOENT`/`EACCES`/`ENOTDIR` mapped to readable messages (with `cause` preserved).
- `routes/fs.ts` (new, mounted in `app.ts`) — `GET /fs/dirs?path=&entry=`. **`entry` descends into a child and the join happens server-side** via `joinDirectory`, so the client never constructs a `\` vs `/` path. My first attempt concatenated client-side; this replaced it.
- `vite.config.ts` — added `/fs` to `API_PROXY_PATHS` (the file's own comment says to keep it in sync with `app.ts`).
- `components/FolderPicker.tsx` (new) — modal with Up navigation, breadcrumb, folder list, Select/Cancel, Esc to close; follows the `SetupModal` overlay idiom.
- `EmptyState.tsx` — **Browse…** button beside the workspace input. On first run (nothing saved) the control is accent-highlighted with the line *"Pick a project folder — otherwise the run works in a temporary scratch workspace"*, so the scratch fallback is a visible choice rather than a silent default.

**Verified.** API: roots list, `C:/Development` listing, server-side `entry` join into `C:\Development\smekai`, missing dir → 400 with a readable message. UI: first-run hint shown, picker opens, roots listed, navigation works, selection fills the input, hint disappears, value persists across reload.

**Pre-existing e2e failures — not caused by this work.** `pnpm --filter @adhd/ui e2e` reports 6 passed / 2 failed (Setup → AI Harness Cursor model options). Confirmed by stashing all changes and re-running on clean `HEAD`: the same 2 fail. The specs are stale against `CURSOR_MODEL_OPTIONS` (5 entries, test expects 4) and `DEFAULT_CURSOR_MODEL` (`""`, test expects `"auto"`). Belongs to **TASK-050**, which already lists repairing stale specs.

Typecheck + lint + build green.

---

## TASK-055: Show what the run produced — workspace files in Artifacts + auto-switch
**Priority:** P1 | **Tags:** server, ui
**Updated:** 2026-07-21 14:45

Done. A run's produced files are now visible in the app instead of only in a log line.

- `services/workspace-files.ts` (new) — `listWorkspaceFiles` walks the run workspace skipping `node_modules`/`.git`/`dist`/etc, capped at depth 8 and 500 entries; `readWorkspaceFile` previews up to 256 KB and reports `truncated` beyond that. Paths are returned POSIX-style so the UI has one shape on both platforms.
- **`resolveInsideWorkspace` is the single security gate.** It rejects absolute paths, checks the *lexical* path before touching disk (so a traversal to a non-existent file is rejected as traversal, not reported as "not found"), then re-checks after `realpath` so a symlink inside the workspace cannot point out.
- `routes/runs.ts` — `GET /runs/:id/files` and `GET /runs/:id/files/content?path=`; traversal returns 400, missing file 404. Thin HTTP mapping only.
- `api.ts` — `fetchRunFiles` / `fetchRunFileContent` (the sole HTTP module).
- `StageFocusPanel.tsx` — `Workflow | Files` switcher in Artifacts. *Workflow* keeps the per-stage `handoff.md`; *Files* lists the workspace with a preview pane, reusing the existing two-pane layout. Re-lists on run completion so newly written files appear.
- `App.tsx` — on terminal run status the panel switches to Artifacts, **unless the user picked a tab during that run** (`tabChosenByUser` ref, reset by `attachRun` so one manual click doesn't disable it forever).

**Verified.** Traversal: `../../../../Windows/win.ini`, an absolute path, and `sub/../../../../etc/passwd` all rejected 400; legitimate reads work. End-to-end with a real `dev-test` run of "write a backup script": auto-switched to Artifacts, switcher present, Workflow showed `handoff.md`, Files listed `backup.js` (2.2 KB) and previewed its full contents.

Typecheck + lint + build green.

---

## TASK-054: Live log auto-scroll (stick-to-bottom)
**Priority:** P2 | **Tags:** ui
**Updated:** 2026-07-21 14:10

Done. The Live Log now follows new entries without hijacking the user.

- `StageFocusPanel.tsx` — `scrollRef` on the tab-content scroll container plus an effect on `stage.logs.length` that pins to the bottom. `followRef` tracks whether the user is within `FOLLOW_THRESHOLD_PX` (40px) of the bottom; scrolling up parks the view and stops the follow, returning to the bottom resumes it. Opening a different stage or tab starts following again.
- Added `data-testid="stage-scroll"` to the container — the pane was otherwise unaddressable from a test, and TASK-050 will want it too.

**Verified against a real streaming run** (the simulated pipeline emits only 4 lines per stage, which never overflows a real pane):
- *following* — `scrollHeight` grew 91→249 while distance-from-bottom stayed 0.
- *parked* — scrolled to top, log grew 385→448, scroll position stayed at 0.
- *resume* — returning to the bottom re-pinned.

Note for future tests: an artificially tiny pane makes this untestable — with a 70px pane the whole scroll range (21px) is inside the 40px threshold, so "scrolled to top" *is* "at the bottom". Use a realistic pane height (260px+). An earlier FAIL was this test artefact, not a code defect.

Typecheck + lint green.

---

## TASK-053: Fix DEP0190 — unescaped args passed with shell:true
**Priority:** P1 | **Tags:** server, engine
**Updated:** 2026-07-21 13:40

Done. Warning gone — and it was hiding two real defects.

- `engines/subprocess.ts` — `shell:true` + args array replaced by `resolveSpawnTarget()`: normal executables get the argv array untouched; Windows `.cmd`/`.bat` shims run as one explicitly quoted command line through `cmd.exe /d /s /c` with `windowsVerbatimArguments`. `quoteWindowsArg()` applies the C-runtime backslash/quote rules; the outer quote pair is what `/s` strips, which is the documented way to keep our quoting intact.
- `engines/claude-code.ts` — bespoke `claudeVersion()` `execFile` replaced by the existing `probeCommand(binary, ["--version"])`, deleting duplicated shim/timeout/tree-kill logic.
- Exported `commandNeedsWindowsShell()` so adapters can ask which channel is safe.

**Defect #1 (the reason for the warning) — command injection.** Quoting now neutralises cmd metacharacters: `a & echo PWNED & b | c > d` arrives as a single intact argument instead of executing.

**Defect #2, found only by testing — silent truncation.** `cmd.exe` ends a command at a line break, so a multi-line persona passed as `--append-system-prompt` was **silently cut at the first newline** (`"# Role: Tester\n\nUse…"` → `"# Role: Tester"`). No amount of quoting fixes this. Two changes:
- `runSubprocess` now **rejects** a multi-line argument on the shim path with a clear message rather than truncating it.
- The Claude adapter picks the safe channel per binary: native `--append-system-prompt` for a real `.exe`, and the existing `withPersonaPrompt()` stdin folding (already used by Cursor/Codex) when resolved to a `.cmd` shim.

Known, documented limitation: `%VAR%` still expands inside quotes on the shim path — it can substitute an env value but cannot introduce a command. Not faked with `^`, which does not escape inside quotes.

**Verified:** purpose-built `.cmd` shim echoing its argv — spaces, embedded quotes, metacharacters, trailing backslashes all round-trip exactly; multi-line rejected loudly; persona intact via the stdin fallback. Zero `DEP0190` in a full server session. Real `dev-test` run (`75fff084`) passed both boxes with `VERDICT: PASS`. Typecheck + lint green.

---

## TASK-049: Code-quality assessment + refactor of the Dev+Test subsystem
**Priority:** P3 | **Tags:** core, server
**Updated:** 2026-07-20 14:20

Done. Behavior-preserving quality pass over the Developer→Tester subsystem; assessment recorded in `docs/code-quality.md` (new "Subsystem review" section).

Refactors applied:
- **`resolveStageInputs()` extracted** — `executeEngineStage` inlined persona resolution + prompt building; it is now stage lifecycle only, as the plan required.
- **`stage-prompt.ts` → `stage-context.ts`** — the module had grown to own cross-box context in *both* directions (prompt in, handoff out); the name now matches.
- **`engineLabel()` + `UNKNOWN_ENGINE_LABEL`** — removed duplicated agent/engine-label computation and a bare string literal.
- **Documented `run.result`** — it holds only the last stage's output (the reason the UI needed a fallback); per-box consumers must read `stageOutputs`.

Hygiene: no `console.*` in the new modules (the one added to `run-store.ts` matches three pre-existing ones there; structured logging stays TASK-022), no hardcoded paths or secrets, core stays pure.

Verified: typecheck + lint + build green, and a **fresh real run post-refactor** (`51d6ebd4`) reproduced TASK-048 exactly — both boxes passed, personas resolved, both handoffs written, `stageOutputs` populated, `VERDICT: PASS`.

---

## TASK-048: Verify the two-box Developer→Tester flow end-to-end
**Priority:** P2 | **Tags:** testing
**Updated:** 2026-07-20 14:05

Done — verified with **real Claude Code runs** (haiku, unsandboxed server per the run-app gotcha).

- `GET /pipelines` exposes `dev-test`; three runs completed with both boxes `passed`.
- Artifacts on disk: `.adhd/runs/<id>/implementation/handoff.md` + `test/handoff.md`; `state.json` has `stageOutputs` for both stages and the persisted `skill` per stage.
- Shared workspace confirmed — Developer wrote `sum.js`/`mul.js`/`div.js`, Tester verified the same directory.
- Persona contracts held: Developer emitted its "how to verify" handoff; Tester emitted `What I tested / Results / Findings` and `VERDICT: PASS`.
- **Decisive probe** (temporarily swapped `tester.md` for a minimal marker persona, then restored): the Tester replied `PERSONA_LOADED: yes` and `UPSTREAM_SEEN: Created div.js with a CommonJS` — proving (a) an edited skill is picked up by the **already-running** server with no rebuild/restart, and (b) the Developer's handoff text reaches the Tester's prompt verbatim.

Typecheck + lint + build green.

**Finding (persona tuning, not a defect):** with haiku the Tester verified via inline `node -e` checks instead of writing a test file, and ignored an instruction appended *after* "Do not restate this prompt". Put must-follow output rules **before** that closing line, or use a stronger model. Tracked for a future persona-tuning pass.

---

## TASK-047: UI — surface per-box persona + render handoff in run view
**Priority:** P2 | **Tags:** ui
**Updated:** 2026-07-20 13:52

Done. Persona + per-box handoff are visible in the run view.

- **Bug fix (found while implementing):** the Artifacts tab showed `run.result` — the *last* stage's output — for **every** stage on an engine run. With two boxes, opening the Developer showed the Tester's result. It now renders that stage's own `stageOutputs[stage.id]` as `handoff.md`; runs recorded before `stageOutputs` existed fall back to `run.result` (they only ever had one box).
- `core/runs.ts`: `StageState.skill?: string`, copied from the stage definition in `createInitialRunState` — persists which persona actually ran (provenance, and the UI needs it).
- `StageFocusPanel`: persona badge in the header, tooltipped with the source path `.adhd/skills/<skill>.md`.

The `dev-test` pipeline needed no picker work — it comes through `DEMO_PIPELINES`. Typecheck + lint green.

---

## TASK-046: Orchestrator — engine-per-skill-stage + shared workspace + StageExecutor seam
**Priority:** P1 | **Tags:** server, engine
**Updated:** 2026-07-20 13:45

Done. Both boxes now run a real harness on the plain-TS FSM.

- `core/pipelines.ts`: `pipelineUsesEngine()` — engine-backed is derived from the stage model (any stage with a `skill`) instead of a hardcoded pipeline id, so new engine pipelines work without touching the orchestrator. Replaces the `ONE_BOX_PIPELINE.id` check in `startRun` for both engine validation and workspace setup.
- **`executeStage()` — the StageExecutor seam.** One place decides how a stage runs (real harness when the stage has a persona and the run has an engine, else simulation). Swapping in an Aiki executor means reimplementing this method only — adapters and the surrounding stage lifecycle are untouched.
- `executeEngineStage`: resolves the stage persona → `appendSystemPrompt`; builds the prompt via `buildStagePrompt` with upstream reports; a missing skill file degrades to no persona + a warning rather than failing the run.
- `upstreamFor()` / `captureStageOutput()`: per-stage output → `run.stageOutputs` (durable in state.json) + `handoff.md` artifact.
- Shared workspace: one `run.workspacePath` for the whole run, so the Tester sees the Developer's code.
- **Fix:** `restartRun` now also drops the recorded output of every stage it resets — a re-run stage has produced nothing yet, and a downstream box must not read a stale handoff.

Probed: `sequential` simulated, `one-box`/`dev-test` engine-backed, dev-test stages resolve Developer:developer → Tester:tester. Typecheck + lint green. Real engine run is TASK-048.

---

## TASK-045: Prompt composition + context handoff + appendSystemPrompt
**Priority:** P1 | **Tags:** server, adapters
**Updated:** 2026-07-20 13:30

Done. The persona + upstream-context plumbing (wired into the run loop by TASK-046).

- `engines/types.ts`: `EngineRunContext.appendSystemPrompt?: string`.
- `engines/persona.ts`: `withPersonaPrompt(ctx)` — engine-agnostic fallback that folds the persona into the head of the prompt; no-op without a persona (returns the same object).
- Adapters: **Claude** passes `--append-system-prompt` natively (persona stays in the system role); **Cursor** and **Codex** have no such flag, so they use `withPersonaPrompt` for both the positional-arg and stdin prompt paths.
- `services/stage-prompt.ts` (renamed to `stage-context.ts` by TASK-049): `buildStagePrompt(task, upstream)` — pure; returns the task verbatim when there is no upstream output (single-box runs unchanged), otherwise adds a handoff block. Wording tells the model the reports are *intent* and the workspace is the source of truth.
- `services/run-store.ts`: `writeHandoff(runId, stageId, content)` → `.adhd/runs/<id>/<stageId>/handoff.md`, best-effort (the same text is already durable in `state.json`).

Probed: no/blank upstream → task unchanged, handoff block renders, persona folds, no-persona is a no-op. Typecheck + lint green.

---

## TASK-044: Skills layer — markdown persona loader + author developer/tester skills
**Priority:** P1 | **Tags:** server
**Updated:** 2026-07-20 13:20

Done. Editable markdown personas, read at run time.

- `services/skill-defaults.ts` — bundled persona text as pure constants (no I/O). Since `.adhd/` is **gitignored**, these constants are the shipped source of truth, not the on-disk files.
- `services/skills.ts` — `loadSkill(id)` prefers `.adhd/skills/<id>.md` with an **mtime-checked cache** (edits apply on the next run), falls back to the bundled default, and **seeds the file on first use** (`wx` flag, never clobbers) so the override is discoverable rather than invisible. Unknown skill → `undefined` (stage runs without a persona rather than failing the run).
- Personas authored: **developer** (multitool: inspect → smallest correct change → verify own work → structured handoff report) and **tester** (trust nothing → run it → write missing tests → `VERDICT: PASS/FAIL`).

Verified by probe: fallback+seed, disk read, unknown→undefined, **edit picked up on next load**, re-seed after delete, tester loads. Typecheck + lint green.

---

## TASK-043: Dev+Test flow — per-stage skill + context model + DEV_TEST_PIPELINE
**Priority:** P1 | **Tags:** core
**Updated:** 2026-07-20 13:10

Done. Foundational `@adhd/core` model for the two-box Developer→Tester flow.

- `pipelines.ts`: `StageDefinition.skill?: string` added (a stage with a skill is engine-backed). New `DEV_TEST_PIPELINE` (`dev-test`) with Developer→Tester stages, registered in `DEMO_PIPELINES` so the UI picker surfaces it. `ONE_BOX_PIPELINE` stage now carries `skill: "developer"`.
- `runs.ts`: `RunState.stageOutputs?: Record<string, string>` (per-box memory; `result` only held the last), initialized `{}` in `createInitialRunState`.
- `agents.ts`: `test` profession renamed "QA Engineer" → "Tester".

Typecheck + lint green.

---

## TASK-035: Spike — beads (bd) vs. TS-native task-graph backlog
**Priority:** P2 | **Tags:** core, server
**Updated:** 2026-07-20 12:20

Spike complete. **Recommendation: borrow the model, stay TS/git-native** — do not take a Go/Dolt runtime dependency.

Measured `@beads/bd@1.1.0` on Windows: 145 MB native binary (+140 MB `node_modules`), embedded Dolt as source of truth (gitignored), synced through a separate `refs/dolt/data` channel — breaks our "one install" promise and conflicts with the git-native-artifact model. `bd init` is also invasive (writes AGENTS.md, CLAUDE.md, .claude/, .codex/, git hooks). The dependency graph + `bd ready` intake queue is genuinely valuable and worth reimplementing in ~1 day in `TaskManager`.

Absorb three ideas into `.adhd/tasks/`: (1) `dependsOn` dependency edges, (2) `ready` detection as the pipeline intake queue (task is `ready` iff all deps `done`), (3) closed-task compaction (v0.2, optional). Keep sequential `TASK-xxx` IDs and markdown+index.json; skip hash IDs, Dolt, and the parallel sync channel.

Deliverable: [docs/spike-beads-vs-ts-backlog.md](../docs/spike-beads-vs-ts-backlog.md). Competitor matrix §2 updated with the decision. Follow-up worth filing: add `dependsOn` + `ready` queue to TaskManager and wire `ready` into the intake stage.

---

## TASK-042: Unified model discovery across harnesses
**Priority:** P1 | **Tags:** core, server, adapters, setup
**Updated:** 2026-07-20 11:55

Done: Fixed the "Model metadata for `gpt-5-codex` not found" / 400 *"not supported when using Codex with a ChatGPT account"* failure and replaced the static-snapshot model rail with a real discovery rail. Root cause was that nothing ever asked for a model list — `packages/core/src/engines.ts` hardcoded three arrays behind `modelOptionsFor()` which `SetupModal.tsx` imported straight from core in the browser, and `DEFAULT_CODEX_MODEL = "gpt-5-codex"` was passed as `--model`, overriding the CLI's own working default (`model = "gpt-5.6-sol"` in `~/.codex/config.toml`).

**Core:** added `AUTO_MODEL_ID = ""` / `AUTO_MODEL_OPTION` ("Auto — use the CLI's own configured default", i.e. no `--model` flag at all) as the first option on every engine and the new default for Codex and Cursor (Claude keeps `sonnet`); added the `EngineModelList { options, source: "cli" | "config" | "static", note? }` contract; dropped `gpt-5-codex`/`o4-mini` from the Codex snapshot; generalised `LEGACY_MODEL_ALIASES` to `Record<EngineId, Record<string,string>>` so a stored `gpt-5-codex` self-heals to Auto on read (`loadEngineModel` now distinguishes a missing key from a stored `""`).

**Server:** optional `listModels()` on `EngineAdapter`; `cursorAdapter.listModels()` shells `agent models` and parses the `<id> - <Label>` lines (190 real models, `source: "cli"`); `codexAdapter.listModels()` reads the top-level `model = "…"` key from `~/.codex/config.toml` (`source: "config"`) since the Codex CLI has no `models` subcommand; claude-code has none and falls back to static. New `GET /engines/:id/models` never 500s — a missing capability or a throwing probe degrades to the static list with a `note`. The duplicated per-adapter `probe()` helper moved into `subprocess.ts` as `probeCommand()`.

**UI:** `fetchEngineModels()` in `api.ts`; the Setup picker now renders the server-resolved roster (seeded with the static list so it never flashes empty, re-fetched on harness switch and after install/login), shows a provenance caption ("from the CLI" / "from the CLI's config" / "built-in list" + note), and has a "Custom ID…" text input so an unlisted model can never block a run.

**Cross-platform:** `agent models` goes through `runSubprocess` (Windows `.cmd` shim + tree-kill); binary lookup reuses each adapter's existing `resolve*Binary()` (`where`/`which`); the Codex config path is `path.join(os.homedir(), ".codex", "config.toml")`; all CLI output split on `/\r?\n/`. Developed and tested on Windows 11 — the POSIX branches are the same code paths but **untested on macOS**.

**Verified:** workspace typecheck + lint clean; `/engines/{codex,cursor,claude-code}/models` return `config` (surfacing `gpt-5.6-sol`), `cli` (190 models), and `static` respectively; headless Playwright pass over Setup → AI Harness confirms per-harness rosters, Auto preselected for Codex/Cursor, the provenance caption, and the custom-ID input; a real `one-box` Codex run with Auto completed (`passed`, no `--model` sent) — the original failure is gone.

---

## TASK-038: Codex CLI engine adapter
**Priority:** P2 | **Tags:** adapters, milestone-c
**Updated:** 2026-07-20 00:00

Done: Added `packages/server/src/engines/codex.ts` — a real `codexAdapter` on the `EngineAdapter` contract, built on `runSubprocess` (TASK-006). Runs OpenAI's Codex CLI non-interactively: `codex exec --json --skip-git-repo-check [--sandbox workspace-write | --dangerously-bypass-approvals-and-sandbox] [--model] -`, prompt fed via stdin (`-`, dodges the Windows arg-length limit). Parses the thread-item JSON stream (`thread.started`, `turn.started/completed/failed`, `item.started/completed` with item types `agent_message`/`command_execution`/`file_change`/`mcp_tool_call`/`web_search`/`error`) into `ctx.onLog`; captures the last `agent_message` text as `result` and `turn.completed.usage` tokens for the log (Codex reports tokens, not USD, so `costUsd` is unset; `durationMs` from the harness wall-clock). Permission mapping: `skip` → full bypass, `acceptEdits` → workspace-write sandbox (no exact accept-edits-only mode — logs a note). Binary resolution: `ADHD_CODEX_PATH` → PATH via `where`/`which`, preferring the `.cmd`/`.exe` shim on win32 over the extensionless npm shell shim. `detect()` probes `--version` then `codex login status` (exit 0 = logged in) for the Setup status card; not-installed surfaces the cross-platform `npm install -g @openai/codex` install command + docs URL. One-click `install()` runs `npm install -g @openai/codex` (`npm.cmd` on win32) through the harness and re-resolves the binary on success — Setup's install button + post-install hint are now data-driven (`INSTALLERS` map) so both Cursor and Codex render an "Install … CLI" button, not just Cursor. Subscription mode strips `OPENAI_API_KEY` from the child env; api-key mode injects the stored key (Codex `exec` prefers it over a cached login). Core: `codex.available = true` (SOON badge gone — it's `!available`-driven), subscription/api-key connections, `CODEX_MODEL_OPTIONS` (gpt-5-codex default) wired through the engine-aware `modelOptionsFor()`/`defaultModelFor()` (TASK-037), registered in `registry.ts`. Cross-platform: all spawning goes through `runSubprocess` (win32 `.cmd` shell rule + process-tree kill); `where`/`which` + `.cmd`/`.exe` binary branch; npm install hint works on both OSes. Developed/tested on Windows. Verified: full-workspace typecheck + lint clean; end-to-end smoke test (fake `codex` `.cmd` emitting a synthetic `exec --json` stream driven through the real adapter + subprocess harness) → `success`, captured result text, exit 0, streamed command/message/token logs; `detect()` with no CLI returns the install hint + command + docs URL. Verified against a real installed CLI (`@openai/codex` 0.144.6, Windows): `npm install -g` succeeds (14s), `detect()` picks `codex.cmd` over the extensionless npm shim, reads the version, and parses `Logged in using ChatGPT` / `loggedIn: true` from `codex login status`. Only a live `codex exec` run is still untested (skipped to avoid spend + repo edits without sign-off) — when run, true up `CODEX_MODEL_OPTIONS` against your account.

---

## TASK-041: Longer engine log messages + basic markdown rendering in log view
**Priority:** P2 | **Tags:** ui, server, adapters
**Updated:** 2026-07-19 21:25

Done: Raised the run-log message cap from 300 to 1000 chars and deduplicated the copy-pasted text helpers into a new shared module `packages/server/src/engines/log-text.ts` (`MAX_LOG_MESSAGE_LENGTH = 1000`, `truncate()`, `firstLine()`). Both adapters (`cursor.ts`, `claude-code.ts`) now import from it; their local copies and inline first-line `split(/\r?\n/)` patterns are gone, and the explicit `truncate(x, 500)` error paths use the shared 1000 cap. UI: new `packages/ui/src/inline-md.tsx` — a dependency-free regex tokenizer `renderInlineMarkdown()` that renders `**bold**`, `*italic*`/`_italic_`, `~~strikethrough~~`, and `` `code` `` as React elements (no `dangerouslySetInnerHTML`; React escaping keeps it XSS-safe; underscore italics require non-word neighbours so snake_case stays plain; code spans shield their contents; bold/strike render nested inline styles). Wired into StageFocusPanel's Live Log and Reasoning tabs. Verified: typecheck + lint clean; 14-case tokenizer test; 8/8 free-tier Playwright e2e; live one-box haiku run — a ~1300-char assistant reply reached the UI as a single 1000-char log entry (ellipsis at the cap) with bold/italic/strike/code rendered as styling (screenshot-checked via a throwaway Playwright spec, since removed).

---

## TASK-037: Cursor CLI engine adapter
**Priority:** P2 | **Tags:** adapters, milestone-c
**Updated:** 2026-07-18 20:00

Done: Added `packages/server/src/engines/cursor.ts` — a real `cursorAdapter` on the `EngineAdapter` contract, built on `runSubprocess` (TASK-006). Targets Cursor's native Windows CLI (binary `agent`, older installs `cursor-agent`) in headless mode: `-p --output-format stream-json --force [--trust] [--model]`, prompt as positional arg, stream-json events (system/init, assistant text, tool_call started, result) mapped to `ctx.onLog`; result event has no cost/turns fields so only `durationMs` is captured. Binary resolution: `ADHD_CURSOR_PATH` → PATH (`cursor-agent`, `agent`) → `~/.local/bin`; failure message lists everything tried + the PowerShell install one-liner. `detect()` probes `--version` and best-effort `status` (auth state shown in the Setup status card — message now renders even when installed). Subscription mode strips `CURSOR_API_KEY` from the child env; api-key mode injects the stored key. Experimentation knobs for the Windows/base-subscription environment: `ADHD_CURSOR_ARGS`, `ADHD_CURSOR_PROMPT_VIA=stdin`, `ADHD_CURSOR_TRUST=0` (documented in `.env.example`). Core: `cursor.available = true` (SOON badge gone), subscription/api-key connections, `CURSOR_MODEL_OPTIONS` (auto default), engine-aware `modelOptionsFor()`/`defaultModelFor()` helpers used by SetupModal (TASK-038 reuses); per-engine model persistence (`adhd.engineModel.<engineId>` with legacy-key migration). Verified: typecheck + lint clean; live server — `/engines/cursor/status` returns the tried-list hint, settings round-trip + invalid-mode rejection, pre-flight api-key guard, one-box cursor run fails fast with the install hint; 8/8 Playwright e2e incl. new Cursor model/connection-swap test. Live run against an installed CLI still pending (CLI not yet installed on this machine — install, `agent login`, Re-check, then true up `CURSOR_MODEL_OPTIONS` against `agent models`).

---

## TASK-006: First harness adapter (generic subprocess)
**Priority:** P1 | **Tags:** milestone-c, adapters
**Updated:** 2026-07-17 18:45

Done: Added `packages/server/src/engines/subprocess.ts` — a generic `runSubprocess(spec)` harness that runs any CLI command in a worktree (cwd), streaming stdout/stderr line-by-line via `onLine`, with a hard `timeoutMs`, `AbortSignal` support, and cross-platform process-tree kill (`taskkill /T` on Windows, SIGTERM→SIGKILL on POSIX). It never rejects — spawn errors, non-zero exit, timeout, and abort are all reported in the resolved `SubprocessResult` (success/exitCode/timedOut/aborted/stdout/stderrTail/durationMs/errorMessage). This is the reusable core the concrete engine adapters build on. Refactored `claude-code.ts` onto it: `killProcessTree` and the whole spawn/timeout/abort/stderr/line-buffering block moved into the primitive; the adapter now just resolves its binary, builds Claude args + env, and parses stream-json off each line (`handleClaudeEvent`). Cursor/Codex (TASK-037/038) reuse this. Verified: 15 direct `runSubprocess` checks (success, full-stdout capture, per-line streaming, non-zero exit + stderr tail, stdin delivery/EOF, timeout kill <5s, abort kill <5s, ENOENT bad command) all pass; a fake-CLI end-to-end one-box run through the server drove the refactored Claude adapter to `completed` with stream-json logs, `result`, and cost/turns captured — no real CLI or spend; `pnpm typecheck` + `pnpm lint` clean.

---

## TASK-005: File-backed workflow engine (state.json + events.jsonl)
**Priority:** P1 | **Tags:** milestone-b
**Updated:** 2026-07-17 18:25

Done: Run state was entirely in-memory (lost on restart). Added file-backed persistence under `.adhd/runs/<id>/` — new `packages/server/src/services/run-store.ts` writes an atomically-rewritten `state.json` snapshot (tmp+rename, serialized per run) and an append-only `events.jsonl` (serialized, ENOENT-healing). The orchestrator persists from `emit()` — immediate on transitions, debounced (150ms) for log spam — plus an initial snapshot in `startRun`. New `orchestrator.init()` (awaited in `index.ts` before `serve`) reloads runs on boot, restores `nextRunNumber`, and reconciles interrupted (non-terminal) runs to `failed`. Verified end-to-end: runs survive restart with full stages/logs; a run killed at a gate reloads as "failed — Interrupted by server restart" (running/awaiting stages → failed, pending left pending); run numbering restored (next run = #2); restart-from-stage re-runs and re-persists; happy path persists as `completed` (64 events, 8 stages, 3 gate approvals); typecheck + lint clean. The "real subprocess stages" half already shipped for the one-box pipeline (TASK-018/019/020); mock pipelines stay simulations by design. Follow-up TASK-039 makes the store pluggable (JSON default + a real DB adapter).

---

## TASK-034: Design the `smek.ai` brand icon (comic "SMEK" burst)
**Priority:** P2 | **Tags:** setup, ui
**Updated:** 2026-07-16 17:50

Done: Chose Concept A (yellow burst on blue) over B (blue burst / red accents — third primary). Hand-built master SVGs in `brand/smek/master/` — `smek-burst.svg` (hero + SMEK wordmark) and `smek-mark.svg` (bare burst for tiny sizes), plus B&W twins. Exports in `brand/smek/exports/` (512 avatar, 128 extension, 32/16 + favicon.ico). ADHD UI favicon wired via `packages/ui/public/favicon.*`. Docs in `brand/smek/README.md`. **Manual follow-up:** upload `brand/smek/exports/org-avatar.png` at github.com/organizations/smekai/settings/profile (no org-avatar REST API; browser session not logged in). No separate smek.ai site repo yet — favicon assets ready for when it lands.

---

## TASK-033: Migrate repos to the `smekai` GitHub org (fix all references)
**Priority:** P2 | **Tags:** setup, infra
**Updated:** 2026-07-16 16:38

Done (adhd repo only — `taskplanner` migrated in a parallel stream): repos already transferred `refined` → `smekai` org, so this covered references + local remote. Repointed the two generated `refined/taskplanner` links to `smekai/taskplanner` in `CLAUDE.md` and `.cursorrules`; added `repository`/`homepage`/`bugs` (→ `smekai/adhd`) to root `package.json`; set local `origin` to `https://github.com/smekai/adhd.git`. No `.github/`, `CNAME`/Pages, or VS Code `publisher` in this repo, so those ticket items were N/A here. Publisher/author/personal-profile identities left as `refined` per decision. Durability caveat: `CLAUDE.md`/`.cursorrules` are generated from TaskPlanner's `aiInstructions.ts` template (still hardcodes `refined/taskplanner`); a future init/sync would re-inject `refined` until the parallel taskplanner-template fix ships.

---

## TASK-032: Code quality
**Priority:** P1 | **Tags:** code, qualtiy, beauty | **Assignee:** Fedor
**Updated:** 2026-07-15 22:53

Done: ESLint 10 flat config at root (`eslint.config.mjs`: JS + typescript-eslint recommended, react-hooks for UI; `pnpm lint`/`lint:fix`) — clean. Code segregated by role: `@adhd/core` split into domain modules (`agents/engines/pipelines/runs/settings.ts`, barrel `index.ts`); server split into bootstrap-only `index.ts` → `app.ts` (composition) → `routes/` (controllers: health, pipelines, engines, settings, runs) → `services/run-orchestrator.ts` (ex mock-orchestrator) → pure helpers in `utils.ts`. All hosts/ports/timeouts moved to env-driven `config.ts` (reads root `.env`; `ADHD_HOST/ADHD_PORT/ADHD_CORS_ORIGINS/ADHD_ENGINE_TIMEOUT_MS/ADHD_UI_PORT/ADHD_SERVER_URL`) + `.env.example`; Vite proxy and Playwright baseURL env-driven too. Core relative imports use `.ts` extensions with `rewriteRelativeImportExtensions` (needed for Node type-stripping of source-served core). Conventions + next-steps recommendations in `docs/code-quality.md`. Verified: lint/typecheck/build green, UI bundle byte-identical, live smoke of all routes incl. SSE, gate approve, abort, and `ADHD_PORT` override.

---

## TASK-031: UI: EmptyState pipeline dropdown
**Priority:** P2 | **Tags:** ui
**Updated:** 2026-07-15 13:40

Done: new `PipelineDropdown.tsx` replaces the segmented pill tabs in EmptyState — visible trigger (selected label + rotating chevron, accent ring when open), menu with label + description rows ("Full team — 8 simulated stages…", "Single agent — Real engine — Claude Code"), check mark + accent on the selected row, hover via state, closes on outside-click and Escape, `role=listbox/option` for a11y. `adhd.pipelineId` persistence and one-box branching untouched. E2E updated + extended (dropdown open/close, selection, persistence) — 7/7 green.

---

## TASK-030: UI: SetupModal Connection flow + api.ts + Vite proxy
**Priority:** P1 | **Tags:** ui, setup
**Updated:** 2026-07-15 13:40

Done: mock "API Keys" section replaced by a functional "Connection" section — connection-mode radio cards from `ENGINE_CONNECTIONS` (PUT on select), API key save/remove (Enter submits; input cleared on success), "KEY CONFIGURED ✓" chip from `apiKeyConfigured`, inline error line; fake GitHub Client ID input dropped. AI Harness section gained an Engine-status card (green Installed · version + binary path, red Not-detected + install instructions, Re-check button re-fetching `GET /engines/:id/status`). `api.ts`: `fetchSettings`/`updateEngineConnection`/`fetchEngineStatus`; Vite proxy now forwards `/settings` + `/engines`. Verified live: mode roundtrip, key never echoed, invalid-key run surfaces the mapped message.

---

## TASK-029: UI: model alias migration + catalog-driven model select
**Priority:** P1 | **Tags:** ui
**Updated:** 2026-07-15 13:40

Done: `loadEngineModel()` migrates stored legacy full IDs (`claude-sonnet-4-6` etc.) to standard-context CLI aliases via `LEGACY_MODEL_ALIASES`, writes the alias back, and defaults to `sonnet` — this fixes the reported "API Error: Usage credits required for 1M context" on subscription plans (verified live: one-box run with `sonnet` completed on subscription; previously failed). SetupModal model select renders from `CLAUDE_MODEL_OPTIONS` (Opus/Sonnet/Haiku + advanced `sonnet[1m]` with a gold usage-credits warning; unknown stored values render as "(custom)"). E2E migration test added.

---

## TASK-028: Adapter: friendly error mapping (1M credits, invalid key, /login, low balance)
**Priority:** P2 | **Tags:** adapters, engine
**Updated:** 2026-07-15 12:50

Done: `ERROR_HINTS` in the claude-code adapter map known failure signatures (case-insensitive, matched against the final result event and stderr tail) to actionable guidance: 1M-context usage credits → switch model in Setup → AI Harness; invalid API key / authentication_error → Setup → Connection; not logged in → `claude /login` or API key; low credit balance → top up or subscription. Also handles error results that arrive as `is_error` on a "success" result event. The raw error line is logged at `warn` before the friendly message replaces `errorMessage`.

---

## TASK-026: Server: connection-aware spawn env + orchestrator wiring
**Priority:** P1 | **Tags:** server, adapters, engine
**Updated:** 2026-07-15 12:40

Done: `EngineRunContext` carries `connection` (from `engines/types.ts`, re-used by the settings store). claude-code spawn now uses `buildChildEnv()` — strips `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` from the inherited env (subscription mode = CLI login; stray server-env keys no longer silently switch billing to API) and injects the stored key only in api-key mode. Orchestrator: `startRun` fails fast (400) when the selected mode `requiresApiKey` but none is stored; `executeEngineStage` reads `getEngineConnection(run.engine)` fresh per stage.

---

## TASK-027: Server: engine detection — adapter.detect() + status route
**Priority:** P1 | **Tags:** server, adapters
**Updated:** 2026-07-15 12:30

Done: `EngineAdapter` gained optional `detect()`; claude-code implements it — resets the binary cache (so Re-check picks up fresh installs), resolves with `source` (`env`/`path`/`ide-extension`), validates `ADHD_CLAUDE_PATH` exists up front, and runs `claude --version` via async `execFile` (10s timeout, `.cmd/.bat` shell rule mirrored from spawn). Route `GET /engines/:engineId/status` returns `EngineStatus`; engines without `detect` report "not implemented yet" (new `findEngineAdapter` in registry). Install hint extracted to `INSTALL_HINT`.

---

## TASK-025: Server: settings store (.adhd/settings.json) + settings routes
**Priority:** P1 | **Tags:** server
**Updated:** 2026-07-15 12:20

Done: new `packages/server/src/settings.ts` — JSON store at `<repo>/.adhd/settings.json` (gitignored; mode 0600 best-effort) with per-engine `{ connectionMode, apiKey? }`, atomic tmp+rename writes, lazy reads. `getEngineConnection` (defaults to subscription), `getSettingsView` (booleans only — key never serialized to the UI), `updateEngineConnection` (string sets, `null` clears, absent keeps). Routes in `index.ts`: `GET /settings`, `PUT /settings/engines/:engineId` (400 on unknown engine or mode not in `ENGINE_CONNECTIONS`). `REPO_ROOT` exported from `paths.ts`.

---

## TASK-024: Core: model alias catalog, connection definitions, settings/status types
**Priority:** P1 | **Tags:** core
**Updated:** 2026-07-15 12:10

Done: added to `packages/core/src/index.ts` — `EngineModelOption` + `CLAUDE_MODEL_OPTIONS` (CLI aliases `opus`/`sonnet`/`haiku` plus `sonnet[1m]` flagged `requiresUsageCredits`), `DEFAULT_CLAUDE_MODEL = "sonnet"`, `LEGACY_MODEL_ALIASES` (old full model IDs → aliases), `EngineConnectionDefinition` + `ENGINE_CONNECTIONS` (claude-code: `subscription` default / `api-key`; cursor & codex empty for later), `DEFAULT_CONNECTION_MODE`, `EngineConnectionSettingsView`/`SettingsView` (booleans only — the key never leaves the server), and `EngineStatus` for CLI detection.

---

## TASK-023: Adopt TASK-020 verification assets — test plan, run skill, free-tier E2E
**Priority:** P1
**Tags:** testing, infra
**Updated:** 2026-07-14 16:20

Fold the throwaway TASK-020 verification work into the project: test plan doc, project run skill, free-tier Playwright suite (live tier stays manual/documented).

Done: (1) `docs/e2e-test-plan.md` — the TASK-020 checklist split into a free tier (automated) and a manual live tier (real one-box run, abort path, known non-bugs). (2) `.claude/skills/run-app/SKILL.md` — dev command, ports 9477/5173, `/health`-via-proxy readiness check, stop/port-cleanup, the sandboxed-spawn 0xC0000142 gotcha for engine runs, headless-Chromium driving notes (selector gotchas), and curl recipes for engine runs without the UI. (3) Free-tier E2E in `packages/ui`: `@playwright/test` devDependency, `playwright.config.ts` (webServer auto-starts `pnpm dev` from the repo root, waits on the proxied `/health`), `e2e/ui-smoke.spec.ts` with 5 tests — picker + disabled start, single-agent mode, Setup/AI Harness contents, persistence across reload (pipeline, model, permission mode), history drawer. `pnpm --filter @adhd/ui e2e`: 5/5 passed in ~8s, no engine spend; typecheck clean; playwright artifacts gitignored.

---

## TASK-008: Design the conversational pipeline workspace (Figma-agentic)
**Priority:** P1 | **Tags:** design, ux, ui, figma, design-system, voice
**Updated:** 2026-07-14 15:17

Design the ADHD desktop workspace as a UI + speaking interface for directing an AI development team; pipeline canvas as hero, conversational + voice steering at stage and pipeline scope. Brief in [docs/design-desktop-shell.md](../docs/design-desktop-shell.md); prompt in [docs/figma-agent-prompt.md](../docs/figma-agent-prompt.md).

Done: delivered end-to-end (commit bed7fac "first design"). Figma Agent prompt written (`docs/figma-agent-prompt.md`); generated design lives in Figma ("Design System for ADHD App") with its interactive code export committed under `design/Design System for ADHD App/` — a working prototype covering all primary screens (pipeline canvas, focused stage with artifacts/log/reasoning/steer tabs, pipeline-level steering, setup, gate approve/reject, run history, empty state) and voice states (idle/listening/transcribing/speaking). Deltas from the original deliverable list: the 3 options manifest as 3 accent directions (Indigo/Sakura/Forest) within one system rather than 3 separate designs; design tokens live as code (`Dir` palettes) rather than Figma styles/variables; engineer handoff happened as a direct port — `packages/ui/src/theme.ts` and the component set (PipelineRow, StageFocusPanel, VoiceControls, SteerChat, TeamController, HistoryDrawer, SetupModal, EmptyState) mirror the export and are wired to the live SSE backend.

---

## TASK-004: Pipeline chart UI (live agent statuses)
**Priority:** P0 | **Tags:** prototype, ui
**Updated:** 2026-07-14 15:17

Hand-rolled SVG pipeline chart, log panel, sequential vs parallel demo toggle.

Done: delivered by the prototype dashboard and the TASK-014..020 milestone-c work, verified live in the TASK-020 UI pass. The pipeline chart renders live stage statuses with gate markers (`PipelineRow`/`StageNode`/`GateMarker` — implemented as DOM/flexbox rather than SVG); the log panel streams live stage logs in `StageFocusPanel`. The "sequential vs parallel demo toggle" became the pipeline picker ("Full team · mock" / "Single agent") from TASK-017; no parallel demo group was built (`PipelineGroup.mode` supports `"parallel"` in core but no pipeline uses it yet — a future task if ever needed).

---

## TASK-020: End-to-end verification of the one-box Claude run
**Priority:** P0 | **Tags:** testing, milestone-c
**Updated:** 2026-07-14 15:15

Server-level verification complete: happy path (haiku created hello.txt in the scratch workspace, live SSE logs, result + cost captured on run.completed), custom workspaceDir run (file landed there; nonexistent dir → 400), abort mid-run (claude process tree killed, no orphans, stage skipped), `engine: cursor` → 400 not implemented, sequential mock pipeline regression (8 stages, gates, approve — untouched).

Done: visual UI pass completed with headless Chromium (Playwright) against `pnpm dev` — 18/18 checks passed, zero console errors, screenshots reviewed. Verified: pipeline picker (Full team · mock / Single agent) with persisted selection; Setup → AI Harness (Claude Code selected, Cursor/Codex marked SOON, model + permission mode persist across page reload via localStorage); live one-box run with `claude-haiku-4-5` in a custom workspaceDir — engine pill `⬡ Claude Code · claude-haiku-4-5` in the status bar, live log streamed into the focus panel, run COMPLETED, stage PASSED, `result.md` artifact listed with preview, and `hello-ui.txt` written to the workspace; History drawer lists the completed run and re-attaches on click. TaskPlanner sidebar reload confirmed by driving the extension's own activation path (ConfigManager + TaskStore) against `.tasks/`: config loads, 22 tasks visible across states, zero parse warnings. Note: spawning `claude.exe` from a sandboxed shell fails with 0xC0000142 — the dev server must run in a normal user shell.

---

## TASK-003: Mock orchestrator with SSE events
**Priority:** P0 | **Tags:** prototype, server
**Updated:** 2026-07-14 12:45

`POST /runs`, fake agents with sleep/log, `GET /runs/:id/events` SSE stream.

Done: implementation landed with the prototype dashboard (commit 5f63631, extended by TASK-014/015) in `packages/server` — `MockOrchestrator` simulates profession agents with randomized sleep + timed log lines per stage; Hono routes `POST /runs`, `GET /runs`, `GET /runs/:id`, gate approve/abort/restart, and `GET /runs/:id/events` SSE. Verified end-to-end this pass: started a `sequential` run, approved the requirements/design/release gates, captured 49 typed SSE events (stage.started/log/awaiting/approved/completed, run.completed); stream closes cleanly on terminal status.

---

## TASK-002: Scaffold pnpm monorepo (server, ui, core)
**Priority:** P0 | **Tags:** infra, prototype
**Updated:** 2026-07-14 09:33

Set up `packages/core`, `packages/server` (Node + Hono), `packages/ui` (React + Vite).

---

## TASK-001: Rebrand to ADHD (docs + repo)
**Priority:** P0 | **Tags:** docs, branding
**Updated:** 2026-07-14 12:23

Rename project to ADHD (Artificial Development, Human Directed). Update docs, CLI name, and `.adhd/` paths.

Done: bulk rebrand landed earlier (commits 5f63631, a51b87e — docs, `@adhd/*` packages, `adhd` CLI examples, `.adhd/` paths, GitHub repo/remote). This pass fixed the last leftovers: repo layout tree root in `docs/technical-architecture.md` (`artificial-developer/` → `adhd/`) and added the "formerly Artificial Developer" historical note to the README intro.

---

## TASK-019: Result display — result.md artifact, engine pill, result on run.completed
**Priority:** P0 | **Tags:** ui, milestone-c
**Updated:** 2026-07-13 21:40

`useRunEvents` copies `result` from the final `run.completed` event. StageFocusPanel: engine runs show `run.result` as a `result.md` artifact and no canned mock content (live log already streams adapter output). RunStatusBar: `⬡ Claude Code · <model>` pill when the run has an engine.

---

## TASK-018: SetupModal — wire engine radios, model, permission mode; SOON badges
**Priority:** P0 | **Tags:** ui, milestone-c
**Updated:** 2026-07-13 21:40

Drive the AI Harness radios from `ENGINES` (adds Codex); persist engine + model via settings; Cursor/Codex rendered disabled with a mono "SOON" pill. New Permission mode control: "Never block (recommended)" vs "Accept edits only (may stall on shell commands)".

---

## TASK-017: EmptyState — pipeline picker + working-directory field
**Priority:** P0 | **Tags:** ui, milestone-c
**Updated:** 2026-07-13 21:40

Segmented control "Full team · mock" / "Single agent" above the task input (persisted). Single-agent mode: ghost pipeline shows one Developer node, optional Working directory input (empty = scratch workspace per run), caption showing the configured engine · model.

---

## TASK-016: UI settings persistence — engine, model, permission mode, pipeline, workspace dir
**Priority:** P0 | **Tags:** ui, milestone-c
**Updated:** 2026-07-13 21:40

Extended `packages/ui/src/settings.ts` (same localStorage try/catch pattern as disabledStages): `adhd.engine`, `adhd.engineModel`, `adhd.permissionMode` (default `skip`), `adhd.pipelineId` (default `sequential`), `adhd.workspaceDir`. Extended api.ts `StartRunOptions`.

---

## TASK-015: POST /runs — engine/model/workspaceDir/permissionMode passthrough + validation
**Priority:** P0 | **Tags:** server, milestone-c
**Updated:** 2026-07-13 21:40

Extended the `POST /runs` body and passed the new fields to the orchestrator; validation errors surface through the existing 400 path (verified: unknown engine, unimplemented engine, nonexistent workspaceDir). No SSE changes (keepAlive ping already present).

---

## TASK-014: Orchestrator — executeEngineStage branch, abort wiring, result event
**Priority:** P0 | **Tags:** server, milestone-c
**Updated:** 2026-07-13 21:40

`startRun` branches for `one-box`: validates engine, resolves workspace, stores engine/model/workspacePath on the run. `runStages` dispatches `executeEngineStage` (real adapter) vs `simulateStage` (mock, untouched). AbortController per run wired into `abortRun`; final `run.completed` event carries `result`.

---

## TASK-013: Claude Code engine adapter (headless stream-json)
**Priority:** P0 | **Tags:** server, adapters, engine, milestone-c
**Updated:** 2026-07-13 21:40

Spawns `claude -p --output-format stream-json --verbose` (prompt via stdin; binary resolved ADHD_CLAUDE_PATH → where/which claude → IDE extension bundle fallback → actionable error). Parses NDJSON into live stage logs (init/assistant text/tool_use/result summary), captures final result + cost/turns, maps exit codes to failure, abort = process-tree kill (taskkill /T /F on win32, verified no orphans), timeout via ADHD_ENGINE_TIMEOUT_MS (default 10 min). Supersedes the Claude Code half of TASK-007.

---

## TASK-012: EngineAdapter contract + registry
**Priority:** P0 | **Tags:** server, adapters, milestone-c
**Updated:** 2026-07-13 21:40

`packages/server/src/engines/types.ts`: `EngineAdapter { id, run(ctx) }` with `EngineRunContext` (prompt, cwd, model, permissionMode, timeoutMs, AbortSignal, onLog callback → stage.log) and `EngineRunResult`. `registry.ts`: map seeded with claude-code; `cursor`/`codex` throw "not implemented yet"; unknown ids rejected. Streaming evolution of the HarnessAdapter contract in docs/mvp-scope.md.

---

## TASK-011: Run workspace resolution — scratch dir per run or validated user directory
**Priority:** P0 | **Tags:** server, milestone-c
**Updated:** 2026-07-13 21:40

`packages/server/src/paths.ts`: repo root anchored via `import.meta.url` (server dev cwd is `packages/server`); `resolveWorkspace(runId, workspaceDir?)` creates `.adhd/runs/<runId>/workspace` or validates a user-supplied directory (must exist and be a directory, else 400). `.adhd/` added to .gitignore.

---

## TASK-010: Core types — one-box pipeline, engines, permission mode
**Priority:** P0 | **Tags:** core, milestone-c
**Updated:** 2026-07-13 21:40

Added `ONE_BOX_PIPELINE` (id `one-box`, single `implementation`/Developer stage) to `DEMO_PIPELINES`; `EngineId`, `ENGINES` metadata (label/description/available), `EnginePermissionMode` (`skip` default — never blocks | `acceptEdits`); extended `RunState` with optional `engine/model/result/workspacePath` and `RunEvent` with `result`.

---

## TASK-009: Fix .tasks/config.json states shape (TaskPlanner extension unresponsive)
**Priority:** P0 | **Tags:** infra, setup
**Updated:** 2026-07-13 21:40

The `states` array in `.tasks/config.json` contained plain strings, but the TaskPlanner extension expects `{name, fileName, order}` objects — every `path.join(tasksDir, state.fileName)` threw on `undefined`, so no tasks loaded and the extension appeared dead for this repo. Rewrote the config to the canonical shape, deduped the stray migration-appended `Rejected` object, dropped the nonstandard `settings` key. Companion hardening task in the taskplanner repo: TASK-036 (validate/normalize config, log failures to the "TaskPlanner" output channel). Reload the VS Code window to confirm the sidebar lists tasks again.

---
