# Backlog

## TASK-097: Post-MVP — compose delivery workflows from the persona catalog
**Priority:** P2 | **Tags:** core, server, ui, engine
**Updated:** 2026-07-29 08:56

Use an initialization/planning step to analyze an approved feature and select the required personas and developer specializations from the available catalog, for example adding a Product Designer for UI work or a mobile developer specialization for a mobile feature. Persist the generated workflow, explain its composition, preserve required quality and closeout policies, and require human approval before execution.

Cross-platform: workflow composition is pure logic/UI; any selected persona tools must declare Windows and macOS support or degrade with an accurate SKIP reason.

---

## TASK-095: Post-MVP — agent-native browser testing for QA
**Priority:** P3 | **Tags:** testing, adapters, engine, milestone-d
**Updated:** 2026-07-28 22:11

Add a vendor-neutral testing seam for browser-control capabilities exposed by Codex, Cursor, Claude, or another active harness. QA may use an available native browser first for exploratory and visual checks, then promote stable behaviour into repository-owned Playwright tests. When no compatible capability exists, Playwright remains the complete fallback and CI authority.

Cross-platform: support Windows and macOS capability detection and degrade to Playwright with an accurate recorded reason. This is explicitly outside the Milestone D MVP.

---

## TASK-094: Dogfood Full Delivery and close Milestone D at 0.8.0
**Priority:** P1 | **Tags:** testing, infra, milestone-d
**Updated:** 2026-07-28 13:23

Run deterministic suites, a disposable sample-app Full Delivery run, and one real ADHD feature through the TaskPlanner backend. Verify carry-forward, QA evidence, preview deployment, closeout tasks, cleanup, and milestone finalization; then update documentation and bump all workspace packages together to 0.8.0.

Cross-platform: test Windows directly, use macOS CI where available, and record remaining manual-only checks accurately.

---

## TASK-093: Milestone dashboard, autorun controls, and delivery artifacts
**Priority:** P1 | **Tags:** ui, core, testing, milestone-d
**Updated:** 2026-07-28 13:23

Add the main-screen milestone view with feature progress, run history, findings, and Auto-run next feature. Render the Full Delivery pipeline, skipped and needs-attention states, created-task links, closeout documents, QA screenshots/traces, and preview deployment results in Artifacts.

Cross-platform: browser UI; validate Chromium on Windows and macOS CI where available.

---

## TASK-087: Epic — Milestone D: Full Delivery Loop
**Priority:** P0 | **Tags:** core, server, ui, engine, infra, testing, milestone-d
**Updated:** 2026-07-28 13:23

Ship and dogfood the reusable Full Delivery milestone workflow, then close version 0.8.0. Child tasks are TASK-088 through TASK-094 plus the revised TASK-051 QA browser lifecycle; TASK-095 is explicitly post-MVP.

Cross-platform: all process, browser, path, command, and cleanup behaviour must support Windows and macOS.

---

## TASK-069: Spike — Aiki durable runtime on a comparison branch
**Priority:** P2 | **Tags:** server, engine, infra
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

## TASK-061: Limit is over — pause the run on a plan limit instead of failing it
**Priority:** P2 | **Tags:** engine, server, ui | **Assignee:** Fedor
**Updated:** 2026-07-26 00:00

When a harness reports a subscription/plan limit, the run should **wait for the reset by default** rather than die — and tell the user it is waiting, with a popup (and an OS notification, since the point of a limit wait is that nobody is watching) offering *all* the options: keep waiting, switch to a cheaper or free model, switch harness or connection mode, change plan, or cancel the run. Must work for every harness on both macOS and Windows. The trigger, verbatim from the log:

```
You've hit your session limit · resets 4:30pm (Europe/Tallinn)
14:52:00 ✗ Claude subscription session limit reached — wait for the reset time shown in the log, or switch to an API key in Setup → Connection.
```

**Today (re-checked 2026-07-26) a limit is a hard failure with a friendlier string.** All three adapters pattern-match it into a static hint — [claude-code.ts:110](../packages/server/src/engines/claude-code.ts#L110), [codex.ts:83](../packages/server/src/engines/codex.ts#L83), [cursor.ts:126](../packages/server/src/engines/cursor.ts#L126) — which flows through `interpretEngineResult` → `stageFailed` → run `failed`. Recovery is manual `restartRun(runId, stageId)`, which needs the user present and re-runs the whole stage. **The reset time is thrown away:** the adapter logs the raw line as `warn` and replaces the message with the hint, so nothing downstream knows *when* to retry. And the UI has no popup, toast or notification machinery at all — the only modal is `SetupModal`, and the only user-facing pause is the gate (`GateMarker`, `TeamController`) driven by `stage.status === "awaiting"`.

**What changed under this task since it was written (2026-07-21):**
- **TASK-068 landed the durable OpenWorkflow runtime on `main`.** [pipeline-workflow.ts:63](../packages/server/src/workflow/pipeline-workflow.ts#L63) already parks a run on `step.waitForSignal` for 3650d and survives a hard process kill. That is the mechanism for "wait for the reset" — a *durable* pause, not a `setTimeout`, which matters because a multi-hour wait will outlive the server process. `docs/workflow-runtime-options.md` names this exact "durable sleep (TASK-061)" shape as one of the reasons the runtime was chosen.
- **TASK-065 moved engine/model/permission mode server-side** (`PUT /settings/preferences`), so "switch to a cheaper model" is now a server-side edit. But a run snapshots `engine`/`model` onto `RunState` at start and `buildInput()` reads that snapshot — **mid-run switching needs the run's own engine/model to become mutable**, then the parked stage relaunched with the new value.

**Scope:**
1. **Detect, don't just label.** Promote the limit patterns in the three adapters to a typed outcome on `EngineRunResult` (e.g. `limit: { resetAt?, raw }`) — a limit is its own result, not a failure with nicer prose. Parse the reset time where the CLI prints one; when it can't be parsed, fall back to a fixed retry interval rather than guessing.
2. **A state of its own.** `RunStatus`/`StageStatus` need `blocked` distinct from `awaiting`: reusing the gate state would let "Approve Gate" mean two different things. Add the matching `RunEventType` so the SSE stream carries it, and handle it in `markCancelled`/`markInterrupted`.
3. **Durable wait in the workflow.** On a limit outcome, `runOneStage` parks on a `limit:<runId>:<stageId>` signal with `timeout` = time-to-reset, then re-runs the same stage. Timeout fired = the reset passed; signal fired = the user chose something. Decide the retry budget (two limits in a row → fail?) — `STAGE_RETRY` is `maximumAttempts: 1` today.
4. **The options are signals.** One endpoint (`POST /runs/:id/limit/:stageId/resolve`) carrying the choice: `retry-now`, `switch-model`, `switch-engine`/`switch-connection`, or `abort` (existing `abortRun`). Everything but abort resumes the *same* stage with the changed setting, persisted — no re-running finished stages.
5. **UI.** The popup is the app's first modal-over-a-run: which limit, reset time in local time, remaining countdown, and each option with its cost consequence ("Haiku is included in your plan"). Plus a browser `Notification` when the tab isn't focused; request permission at the moment of the first limit, never on load.
6. **Docs:** decision-log entry for pause-not-fail and for how the reset time is parsed.

**Cross-platform (Windows + macOS):**
- **Reset parsing is timezone-shaped** — the CLI prints local wall-clock plus a named zone (`4:30pm (Europe/Tallinn)`). Derive a *duration from now* rather than storing an absolute local time; never assume server and CLI agree on timezone, and don't hand-roll DST.
- **Notifications:** browser `Notification` API on both OSes — no native notifier binary, no Electron dependency. Confirm permission actually grants over `http://localhost` in Chrome *and* Safari.
- **A multi-hour wait meets laptop sleep** (Windows sleep, macOS App Nap both suspend timers). Lease-based recovery in the durable runtime is what should cover it — verify a limit-parked run resumes after a real sleep/wake on both OSes, not just after a clean restart.
- **Project admission:** `admitRun` allows one active run per project, so a limit-parked run holds the slot for hours. Decide whether pausing should release it — that decision is the same on both platforms but has to be made.

**Verify:** force a limit (adapter test hook is fine) → run parks with the popup showing the reset time; kill the server and restart → still parked, then resumes on its own; choosing "switch to Haiku" resumes that stage on the new model without re-running completed stages.

---

## TASK-051: QA Engineer application lifecycle and Playwright evidence
**Priority:** P1 | **Tags:** ui, server, engine, testing, milestone-d
**Updated:** 2026-07-28 22:11

Expand the existing QA Engineer instead of adding a Manual Tester persona. For interactive UI work, QA starts the configured application, decides whether durable E2E coverage is needed, authors and runs Playwright scenarios headlessly, performs limited exploratory checks where stable assertions are unsuitable, and preserves specs, screenshots, and traces as artifacts.

Always tear down browser and server processes started by the run. A QA failure continues to Product Manager closeout while blocking release and deploy work. Agent-native browser adapters are deferred to post-MVP TASK-095.

Cross-platform: use typed automation commands and `runSubprocess`; browser cache and temporary roots use Node OS/path helpers; verify process-tree teardown on Windows and macOS/POSIX.

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
