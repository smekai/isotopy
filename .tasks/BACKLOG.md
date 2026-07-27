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

## TASK-077: Agent-window shell — left run rail and a routed run view
**Priority:** P1 | **Tags:** ui, server
**Updated:** 2026-07-27 00:00

Replace the drawer-and-canvas layout with a two-column shell. [`HistoryDrawer`](../packages/ui/src/components/HistoryDrawer.tsx) is the closest thing to a run list today and it is wrong in three ways: it is an overlay rather than a place, it calls `fetchRuns()` once on mount and never again, and it has no selection state.

**Scope:**
1. **Left rail** — ~280px, persistent, below the existing header. "New run" button, then run cards: `#number`, status dot, task snippet, relative time, pipeline name. Selecting a card loads that run in the main pane and shows as active. Reuse the status vocabulary already in [`theme.ts`](../packages/ui/src/theme.ts) — `RUN_PILL`, `runDot`, `statusClr` — do not invent colours.
2. **Delete `HistoryDrawer.tsx`.** Resume / Restart / Rerun move onto the run card or the run header; `handleRestart` and `handleRerun` in [`App.tsx`](../packages/ui/src/App.tsx#L225) already exist and keep their semantics.
3. **Routing.** [`architecture-ui.md`](../docs/architecture-ui.md) §1 names the router as "likely the first absence to fall", triggered by deep-linking a run — which is exactly this. Adopt one and add the **dated [`decisions.md`](../docs/decisions.md) entry naming which absence-row it invalidates**; §1 requires that, it is not optional.
4. **Live run list.** `GET /runs` is one-shot; SSE is per-run only ([`routes/runs.ts`](../packages/server/src/routes/runs.ts)). Add a **project-scoped SSE channel** — `GET /runs/events`, scoped through the existing `X-ADHD-Project` header via [`routes/project-scope.ts`](../packages/server/src/routes/project-scope.ts) — emitting a compact run summary on every status transition. [`RunOrchestrator`](../packages/server/src/services/run-orchestrator.ts) already owns a per-run listener registry and is the single writer of the read model; add a project-level listener beside it. Consume it from a new `useRunList` hook. **`fetch`/`EventSource` stay inside [`api.ts`](../packages/ui/src/api.ts)** — that seam is a rule, not a habit. Remember to add the new proxy path to both [`vite.config.ts`](../packages/ui/vite.config.ts) and [`app.ts`](../packages/server/src/app.ts) if the prefix is new.
5. **Main pane unchanged for now** — `RunStatusBar` + `PipelineRow` + `StageFocusPanel` stay; TASK-078 replaces the body. `EmptyState`'s composer becomes the empty right-hand pane.
6. **Accessible from the start.** The rail is a list of real `<button>`s with `aria-current` on the selection — no `div` click handlers. The existing overlays fail §8 (no `role="dialog"`, no Escape, no focus management); do not add a fourth offender.
7. **Test fallout:** `data-testid="history-card" | "history-resume" | "history-restart" | "history-rerun"` disappear. Rename to `run-card` etc. and update the specs in [`packages/ui/e2e/`](../packages/ui/e2e/). A *new* testid beyond those renames needs justification per the roster rule.

**Cross-platform:** n/a — UI plus one JSON/SSE route; no subprocesses, paths, or shell.

**Verify:** two runs in one project with one running — the rail reflects the running one's status change without a reload; `/runs/:id` deep-links to that run; `pnpm --filter @adhd/ui e2e` green.

---

## TASK-078: Run chat — one transcript per run, and a message endpoint
**Priority:** P1 | **Tags:** core, server, ui
**Updated:** 2026-07-27 00:00

Make the main pane a conversation. **The design decision to record in [`decisions.md`](../docs/decisions.md): the transcript is a derived view, not a second store.** The server already streams everything the agent says — [`claude-code.ts`](../packages/server/src/engines/claude-code.ts), [`codex.ts`](../packages/server/src/engines/codex.ts) and [`cursor.ts`](../packages/server/src/engines/cursor.ts) all call `onLog(level, text)` where `info` is assistant text, `run` is a tool-use summary and `warn` is a tool error. The chat/tool distinction exists in the data already; it is flattened into `LogLevel`. The only genuinely new persisted data is **the user's turns**.

**Scope:**
1. **[`packages/core/src/runs.ts`](../packages/core/src/runs.ts)** — add `RunMessage { id, ts, role: "user" | "agent", stageId?, kind: "text" | "question" | "answer", text }` and `RunState.messages`. Add `"run.message"` to **both** the `RunEventType` union **and** the `RUN_EVENT_TYPES` array — the UI iterates that array to register `EventSource` listeners, so missing it means the event silently never arrives. `RunEvent` has no free-form payload field; add a **named** `chatMessage?: RunMessage`, not a `payload: unknown` (A7).
2. **[`run-events.ts`](../packages/ui/src/run-events.ts)** — handle `run.message` in `applyEvent`: append, dedupe by `id`, keep the clone-then-mutate discipline. Run state is never mutated outside this reducer.
3. **New pure module `packages/ui/src/transcript.ts`** — `buildTranscript(run): TranscriptItem[]`, merging stage logs and `run.messages` by timestamp into agent text, collapsed tool rows, user bubbles and stage-boundary separators. Pure, so it gets a unit spec at `packages/ui/test/transcript.spec.ts` — tests live in `test/`, never beside source.
4. **`ChatPanel`** becomes the default body. Reuse [`inline-md.tsx`](../packages/ui/src/inline-md.tsx) for rendering and lift the follow-scroll logic (`FOLLOW_THRESHOLD_PX = 40`) out of `StageFocusPanel` rather than duplicating it. The artifacts / files / log views **survive** as a collapsible right inspector opened from a stage chip — do not delete them.
5. **Delete [`SteerChat.tsx`](../packages/ui/src/components/SteerChat.tsx)** and the `steer` entry in `FocusTab`. Its bubble styling is the reference for `ChatPanel`; its fake reply goes.
6. **`POST /runs/:id/messages`** taking `{ text }` — records the message, emits `run.message`, persists through [`RunRepository`](../packages/server/src/repository/run-repository.ts). In this task it **409s when nothing is waiting for input**; TASK-079 makes it resume a parked run.
7. `StageFocusPanel.tsx` is 625 lines and already flagged as the next split candidate (gap #4, ~300-line signal). Extracting the chat is the moment to split it — do not grow it.

**Cross-platform:** n/a — pure core/UI plus one JSON route.

**Verify:** a two-stage run shows Developer narration, tool rows, the stage boundary and then Tester in one ordered thread; posting a message with nothing waiting returns 409 with a readable message; the transcript spec covers interleaved timestamps across two stages.

---

## TASK-079: Conversational engines — session capture, resume, and question mode
**Priority:** P1 | **Tags:** engine, adapters, server, core
**Updated:** 2026-07-27 00:00

The load-bearing task: let an agent stop, ask, and continue. **All three adapters are strictly one-shot today** — prompt in, `child.stdin.end()` immediately, process exits, `EngineRunResult.result` out. **No session id is captured anywhere**: [`codex.ts:139`](../packages/server/src/engines/codex.ts#L139) declares `thread_id` on `CodexEvent` and never reads it. So "resume" is genuinely new work in every adapter, and that is the cost this task is buying.

**Scope:**
1. **The capability flag.** `EngineDefinition` in [`engines.ts`](../packages/core/src/engines.ts) gains **`conversational: boolean`**. It belongs in `core` because the UI must read it — to explain *why* an engine cannot be asked questions — and the UI never imports adapters. A non-conversational engine simply never enters question mode.
2. **The seam.** `EngineRunContext` gains `resumeSessionId?`; `EngineRunResult` gains `sessionId?` ([`engines/types.ts`](../packages/server/src/engines/types.ts)). One `run()` method, not a second `resume()` — the flag declares the capability, the context drives the behaviour.
3. **Per adapter** — capture the id from the JSON-lines stream that is already being parsed, and resume through `runSubprocess`:
   - `claude-code.ts` — `session_id` off the stream-json init/result events; resume with `--resume`.
   - `codex.ts` — keep the `thread_id` that is already parsed; resume with `codex exec resume`.
   - `cursor.ts` — capture the chat/session id; resume with `--resume`.
   - **Confirm every flag against the installed CLI's `--help` before wiring it.** A CLI that cannot resume gets `conversational: false` and an accurate message, never a silent failure.
4. **Per-stage mode.** `StageDefinition` in [`pipelines.ts`](../packages/core/src/pipelines.ts) gains `interactive?: boolean` — the question / non-question switch. Only interactive stages may ask; Developer and Tester stay non-interactive.
5. **The question contract.** A trailing `QUESTION: <text>` line, parsed by a new `parseStageQuestion` in [`stage-context.ts`](../packages/server/src/domain/stage-context.ts) that **mirrors `parseStageVerdict` exactly** — last-line-first, tolerant of `*`/`` ` ``/`_` wrapping. `EngineStageOutcome` gains a third outcome beside passed/failed.
6. **A state of its own.** `StageStatus`/`RunStatus` gain **`"asking"`, distinct from `"awaiting"`** — for exactly the reason TASK-061 gives for `blocked`: reusing the gate state would make "Approve" mean two different things. Add `stage.asking` and `stage.answered` to **both** the `RunEventType` union and `RUN_EVENT_TYPES`, and handle the new status in `applyEvent`, `markCancelled`, `markInterrupted` and `reconcileOnLoad`.
7. **Durable park.** In `runOneStage` ([`pipeline-workflow.ts:34`](../packages/server/src/workflow/pipeline-workflow.ts#L34)), park on `answerSignal(runId, stageId)` = `answer:<runId>:<stageId>` via `step.waitForSignal<{ text: string }>`. **The signal channel is already typed to carry a payload** — `StepApiLike.waitForSignal` returns `{ data: Output } | null` and ADHD has simply never sent one. On the signal, re-invoke `runStageWork` with `resumeSessionId` and the answer as the prompt. Bound it with a `MAX_QUESTION_TURNS` so a misbehaving persona cannot loop forever, and decide the park timeout (the gate uses `3650d`).
8. **Wire the endpoint.** `POST /runs/:id/messages` sends the signal when the stage is `asking`, and keeps TASK-078's 409 otherwise.
9. **UI.** The question renders as an agent bubble, the composer takes focus, and a parked run reads "waiting for you" in the left rail.

**Cross-platform (Windows + macOS):**
- Every resume spawn goes through **[`runSubprocess`](../packages/server/src/engines/subprocess.ts)** — it already handles the Windows `.cmd`/`.bat` shell rule and `taskkill /T` vs `SIGTERM→SIGKILL`. Do not hand-roll `spawn`.
- Session ids come from **stdout JSON only**. Never read a CLI's own session directory (`~/.claude` vs `%USERPROFILE%\.claude`) — that is a per-OS path guess we do not need to make. Split stream output on `/\r?\n/`, not `"\n"`.
- The three CLIs take the id differently (argv for codex/cursor, `--resume <id>` for claude). Keep that per-adapter; no shared shell one-liner.
- A parked run can wait for hours and meet laptop sleep (Windows sleep, macOS App Nap both suspend timers). Lease-based recovery in the durable runtime is what should cover it — verify resume-after-restart at minimum on the tested OS, and reason the other through.
- **`admitRun` allows one active run per project**, so a parked run holds the slot indefinitely. Decide whether `asking` releases it — the decision is the same on both platforms but it has to be made.
- Note which OS was actually tested.

**Verify:** a persona forced to emit `QUESTION:` parks the run in `asking` with the question in the thread; **kill the server and restart — still parked**; answering resumes the *same session* (the agent references context from before the question, which is what distinguishes resume from a re-run) and the stage completes without re-running upstream stages.

---

## TASK-080: Project Manager agent and the two-preset pipeline set
**Priority:** P1 | **Tags:** core, server
**Updated:** 2026-07-27 00:00

Add the agent that talks to the user first, and collapse the pipeline picker to two options. The Project Manager is **already in the roster** — [`agents.ts:8`](../packages/core/src/agents.ts#L8) has `intake: { profession: "Project Manager", glyph: "◈" }` — it has simply never had a persona or a pipeline. Six of the eight roster professions are in that state; this task promotes one of them.

**Scope:**
1. **`packages/server/src/domain/skills/personas/project-manager.md`** — the persona for the `intake` stage. **No roster change needed.** Contract: interrogate the need with `QUESTION:` turns until the ask is unambiguous; investigate the actual repository; survey external and third-party options; recommend **one** solution, justified against this system's limits; emit an implementable spec as its handoff. `buildStagePrompt` passes that verbatim to the Developer under `## Handoff from previous steps`, so the handoff *is* the deliverable — write the persona knowing its output is a downstream prompt.
2. **`personas/solo.md`** — the all-purpose agent: clarify → design → implement → verify in one box. It needs a stage id, and `AGENTS` has no entry for "does everything"; `agentForStage` silently degrades an unknown id to `{ profession: stageId, glyph: "◈" }`, which would print raw ids in the log. Add one honest `AGENTS` entry rather than mislabelling it "Developer". **Settle the profession wording while writing the persona.**
3. **Run `pnpm gen:skills`** and commit [`defaults.generated.ts`](../packages/server/src/domain/skills/defaults.generated.ts) — the drift test runs `--check` and fails otherwise. Never hand-edit the generated file.
4. **[`pipelines.ts`](../packages/core/src/pipelines.ts) — `DEMO_PIPELINES` becomes exactly two:**
   - `pm-dev-test` — "Project Manager + Developer + Tester": `intake` (`skill: project-manager`, `interactive: true`, **`gateAfter: true`**) → `implementation` (`developer`) → `test` (`tester`).
   - `solo` — one stage, `interactive: true`.
   - `DEFAULT_PIPELINE_ID` → `pm-dev-test`. Delete `ONE_BOX_PIPELINE`, `DEV_TEST_PIPELINE` and `GATED_DEV_TEST_PIPELINE`.
   - **Why the gate sits on the PM stage:** dropping `gated-dev-test` would otherwise orphan the approval gate — it is the only preset that exercises it, and [`GatesSection.tsx`](../packages/ui/src/components/setup/GatesSection.tsx) derives its display from `DEMO_PIPELINES` + `gateAfter`. Approving the recommendation *before* any code is written is also the better product shape for a tool whose name ends in "Human Directed". Reversible if it proves to be friction.
5. **[`EmptyState.tsx`](../packages/ui/src/components/EmptyState.tsx) duplicates the preset list** — a hardcoded `pipelineOptions` array repeating the ids and labels, so adding a preset today means editing two places. Fix it by reading `DEMO_PIPELINES` from `@adhd/core`. (`GET /pipelines` exists server-side and the UI has never called it; leave that alone under this task.)
6. **Migration — retiring a preset breaks restart on old runs.** `RunOrchestrator.buildInput` throws `Unknown pipeline: ${run.pipelineId}` ([`run-orchestrator.ts:364`](../packages/server/src/services/run-orchestrator.ts#L364)), so Restart/Rerun on any `dev-test` run already in `runs.db` will fail. Preferences already degrade safely — `normalizeProjectPreferences` falls back to the default for an unknown stored id. **Pick one and implement it:** an id alias map, or an explicit "this run used a retired pipeline" state on the run card. Pre-1.0 with no external users, so refusing is acceptable — but it must refuse *accurately*, not throw.
7. **Test fallout:** [`dev-test-pipeline.comp.ts`](../packages/server/test/dev-test-pipeline.comp.ts), [`dev-test-flow.spec.ts`](../packages/ui/e2e/dev-test-flow.spec.ts), [`live-dev-test.spec.ts`](../packages/ui/e2e/live-dev-test.spec.ts) and `GatesSection.tsx` all reference the removed ids.

**Cross-platform:** n/a — persona markdown plus pure `@adhd/core` data. [`generate-skills.mjs`](../scripts/generate-skills.mjs) is already dependency-free Node ESM and runs identically on both OSes.

**Verify:** the picker shows exactly two options; a `pm-dev-test` run has the PM ask a clarifying question, take the answer, produce a recommendation, park at the gate, and — once approved — hand a spec the Developer implements and the Tester verifies; `solo` runs one box end to end.

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
