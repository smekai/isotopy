# Backlog

## TASK-066: Inestigation of Workflow options
**Priority:** P0 | **Tags:** worklow | **Assignee:** Fedor
**Updated:** 2026-07-23 09:38

Workflow Runtime Options Decision Document Summary Create branch codex/workflow-runtime-options from committed HEAD da46ce9 in an isolated worktree, excluding the uncommitted TASK-065 changes. Add exactly one file: docs/workflow-runtime-options.md. Do not modify TaskPlanner, changelog, versions, code, or existing docs. Research is dated 2026-07-23 and uses official sources. Document Content Define the agreed semantics:The manually started runner continues after the UI closes; OS login autostart is deferred. Restart/checkpoint granularity is a named workflow stage, not an instruction inside an agent process. “Copy workflow” duplicates a reusable definition only. Components are selected and the definition is frozen when a run starts. One active workflow is allowed per project; different projects may run concurrently. Declared parallel branches may share the project folder, with conflict avoidance owned by the workflow author.  Map every requested capability to current implementation and plans: start, recovery, retries, definition copying, artifacts, durable user/external waits, optional stages, project concurrency, cancellation, and parallel execution. Reference the relevant completed tasks (TASK-003/005/014/043–046/055/058–060), open work (TASK-039/051/061/065), and roadmap commitments. Correct the existing architectural claim that only executeStage() must change: durable execution must own starting/queuing, the orchestration loop, gates/waits, retries, fan-out/fan-in, recovery, cancellation, and execution history. Compare three primary options:Evolve the current TypeScript/file-backed state machine. Adopt Aiki. Adopt DBOS TypeScript.  Provide two matrices:Capability coverage: native, ADHD-owned, custom work, or unsupported/undocumented. Operational fit: maturity, license, PostgreSQL/runtime requirements, Windows/macOS packaging, integration cost, source-of-truth implications, versioning, and lock-in.  Add a compact competitor section covering Cline, OpenHands, Devin, Cursor Cloud Agents, and GitHub Copilot agents. Highlight that session persistence, checkpoints, approvals, and isolated parallel agents are becoming baseline, while semantic failed-stage restart and durable external waits remain differentiators. Recommendation Recorded in the Document Recommend DBOS as the leading implementation-spike and default candidate because bundled PostgreSQL is acceptable and DBOS has the strongest match for recovery, retries, signals, durable sleep, cancellation, step forking, parallel work, and project-keyed queue concurrency. Keep workflow definitions, definition copying, enabled-component snapshots, artifact manifests, code, and generated files ADHD-owned. If DBOS is adopted, make its database authoritative for execution state; retain project-local state.json/events only as an idempotent history projection/export, avoiding two independently advancing state machines. Require a feasibility spike before adoption to prove:Invisible PostgreSQL installation, startup, upgrade, backup, and removal on Windows and macOS. Recovery after killing the server during a stage and during a durable wait. User signals and limit polling with persisted timers. One active run per project with concurrent runs across projects. Immediate subprocess-tree termination despite DBOS cancellation occurring at step boundaries. Declared parallel branches and project-local history projection.  If the packaging or project-portability gates fail, recommend the custom engine as the fallback. Keep Aiki on the watch list because it is alpha, has the same PostgreSQL burden, and lacks documented semantic stage-reset advantages. Note Restate as screened out due to missing official Windows binaries. Validation and Assumptions Verify every changing framework/competitor fact against an official source and include inline links plus the research date. Review the Markdown rendering, tables, relative repository links, and terminology. Run a whitespace/error check on the new file and confirm the branch worktree contains exactly that one changed file. No public APIs, schemas, or runtime behavior change in this branch; all interface names in the document are conceptual recommendations only.

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
