# Backlog

## TASK-076: Epic — the agent window and conversational runs
**Priority:** P1 | **Tags:** ui, server, core, engine
**Updated:** 2026-07-27 00:00

Umbrella for TASK-077…080. Today a run is a *canvas you watch*: one prompt into [`EmptyState`](../packages/ui/src/components/EmptyState.tsx), a horizontal walk through [`PipelineRow`](../packages/ui/src/components/PipelineRow.tsx), a flat log in [`StageFocusPanel`](../packages/ui/src/components/StageFocusPanel.tsx), history parked in a right-hand drawer that fetches once on mount. The only human-in-the-loop mechanism is the approval gate, and it is binary — `client.sendSignal` carries no payload, so there is no reject, no comment, no reply. [`SteerChat.tsx`](../packages/ui/src/components/SteerChat.tsx) is the shell for the missing feature and fabricates its agent reply after 700 ms.

This epic turns a run into a **conversation you take part in**, in the shape Codex and the Cursor agent window have.

**Target shape:**
- The header keeps the ADHD mark and [`ProjectSwitcher`](../packages/ui/src/components/ProjectSwitcher.tsx) exactly as they are now.
- A persistent **left rail** lists this project's runs with live status, and a "New run" action on top.
- The main pane is **one thread per run**: user turns, agent narration, tool activity, stage boundaries and questions, in order.
- An agent running on a **conversational** engine may stop and ask a question. The run parks durably until the user answers, then continues **in the same session** — not from scratch.
- Exactly two pipelines: **Project Manager → Developer → Tester**, and a **single all-purpose agent**.

**Children, in order — each ships and is verifiable alone:**
1. **TASK-077** — left run rail, routing, live run list.
2. **TASK-078** — the transcript and a message endpoint (lands against today's Developer + Tester; no new agent needed).
3. **TASK-079** — session capture, resume, and question mode. The load-bearing one.
4. **TASK-080** — the Project Manager persona and the two-preset set.

**Out of scope** — name it here so the children don't creep: voice ([`VoiceControls`](../packages/ui/src/components/VoiceControls.tsx), [`Waveform`](../packages/ui/src/components/Waveform.tsx) stay decorative), dark mode (the theme is light-only and a dark palette is a change to the `Dir` *shape*, not three more entries), the Reasoning tab's fixtures (TASK-075 owns those), and the six roster professions that have labels but no persona.

**Cross-platform:** carried by each child; TASK-079 is the only one with real platform surface.

---

## TASK-075: Remove the `mock-content.ts` fixtures from `StageFocusPanel`
**Priority:** P2 | **Tags:** ui
**Updated:** 2026-07-27 00:00

[`mock-content.ts`](../packages/ui/src/mock-content.ts) holds hardcoded `REASONING` and `ARTIFACTS` demo data from an OAuth example, and it is still imported by [`StageFocusPanel.tsx:9`](../packages/ui/src/components/StageFocusPanel.tsx#L9). The Reasoning tab renders that fixture regardless of what the run actually did, so a user inspecting a real stage is shown text about a feature they never asked for. This is prototype scaffolding that outlived the prototype.

**Scope:**
1. Decide per tab what the real source is — the Artifacts tab already has `/runs/:id/files`; Reasoning has no server-side equivalent today.
2. Where real data exists, use it. Where it does not, render an honest empty state ("no reasoning captured for this stage") rather than fiction — do not invent an endpoint under this task.
3. Delete `mock-content.ts` once nothing imports it.

**Cross-platform:** n/a — pure UI.

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
