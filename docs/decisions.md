# Decision Log

**High-level direction only.** An entry earns its place here if getting it wrong
later would be expensive — where data lives, what owns a boundary, what the
runtime is, what the product refuses to do. Newest first.

This is not a changelog and not a notebook. Three things belong elsewhere:

- *How* something works, and platform or CLI quirks → [`implementation-notes.md`](./implementation-notes.md)
- Structure and conventions of a tier → [`architecture.md`](./architecture.md), [`architecture-ui.md`](./architecture-ui.md)
- What a task did → its entry in `.tasks/DONE.md`

When a later decision supersedes an earlier one, they are **merged into the
survivor** rather than left as a pair to reconcile.

---

## 2026-08-07 — Asking is a stage property; resuming is an engine one

**Context:** `canAsk` required `isConversational(engine)`, and only Claude Code and Codex
were declared conversational because only they can resume a CLI session. The consequence
was silent and bad: on Cursor an `ask_user` decision was *dropped* by
`interpretDecision` — the orchestrate stage passed, `orchestrationStatusFor` still moved
the initiative to `awaiting_user`, and the run that should have held the question was
already finished. The UI then offered "Answer in the Chat tab" against a terminal run.
An initiative could reach a state with no exit but Stop. TASK-117 found this before the
first Cursor run, not after.

**Decision:** whether an agent may stop and ask is a property of the **stage**
(`interactive`, bounded by `maxTurns`) — never of the engine. Session resume is an engine
capability and now affects only *how* the next turn is delivered: with a session id the
answer is sent bare, as before; without one the stage is re-prompted with
`buildContinuationPrompt`, which replays the assignment plus every question and answer so
far. The `conversational` flag and `isConversational` are deleted rather than left as a
field nothing branches on.

**Rejected:** refusing to start an orchestration on a non-conversational engine. It would
have made the dead end loud instead of silent, but it also concedes a third of the engine
roster for a limitation that costs one prompt-builder to work around — and it would have
kept "can resume" and "may ask" fused, which is the actual modelling error.

---

## 2026-08-06 — Stopping is two levels, and both live in the bottom bar

**Context:** the server has had both kill switches since the Orchestrator landed —
`POST /runs/:id/abort` and `POST /orchestrations/:id/stop`, the latter aborting the
orchestration's non-terminal runs. The UI exposed neither reliably. Abort rendered only
for `running | awaiting | blocked`, so the two states a user is most likely to walk away
from — `pending` and `asking` — offered no way out, and the initiative-level stop was
buried in the Orchestrator tab.

**Decision:** the bottom bar is the surface that answers "how do I stop this?", because it
is the only always-visible chrome. Abort is offered for **every** non-terminal run status,
derived from `isTerminalRunStatus` rather than a hand-listed set that a new status can
silently fall out of. Beside it, **Stop initiative** appears whenever the attached run
belongs to an orchestration that is not stopped — including after that run settles, since
a live Orchestrator will otherwise start the next one. Two controls, because aborting a
run inside an initiative is a legitimate act that leaves the supervisor running.

**Rejected:** a single stop button that guesses the level from context — it makes the
broader, irreversible action the accidental one.

---

## 2026-08-06 — RunService split, and stage logs live only in events

**Context:** `RunOrchestrator` had grown past 1700 lines and its name collided with
the Orchestrator product concept that now sits *above* it. Stage logs were also
written twice — into the persisted run snapshot and into the `events` table.
Measured on a full-delivery-sized blob (9 stages × 400 log lines): 467 KB per run
with logs inline, ~94 MB for 2001 runs, and **896 µs** to serialize+UPDATE the
whole run per log line versus 485 µs to append one event row. That cost is why a
150 ms debounce existed around every log.

**Decision:** rename to `RunService`, split into `RunStore` (cross-project read
model + persistence), `MilestoneService` (milestone CRUD and proposal store), and
`RunService` (run lifecycle + `RunProjection`). Persist snapshots without
`stage.logs`; rehydrate logs from `stage.log` events on load; flush immediately.
`utils/` is defined by the ADHD-concept test — if the file would make sense in
another product it is a util; if it names a run/milestone/stage/persona/task board
it is `schemas/` (boundary parse), `domain/` (other pure), or `services/` (I/O).
Boundary parsers live at top-level `src/schemas/` (not `domain/codecs/`) — they
sit next to `routes/` as the ingress validation layer. Guard placement with
`packages/server/test/structure.spec.ts`.

**Rejected:** folding the global `runs` map into `RunRepository` — repositories are
per-project, while run ids are looked up without a project header for SSE. Also
rejected: defining `utils/` as "small files" — that invites domain-shaped helpers
to drift out of `domain/`.

---

## 2026-08-05 — OpenWorkflow gets its own SQLite file, separate from ADHD's read model

**Context:** `WorkflowRuntime` opened `BackendSqlite` on `runs.db` — the same file
`db/database.ts` uses for `runs`, `events`, `milestones`, `orchestrations` and
`active_runs`. Two independent `DatabaseSync` connections, one file. During any real run
the worker logged `SQLITE_BUSY: database is locked` on every tick.

**Why it fails:** ADHD's connection sets `busy_timeout=5000`, but that pragma is
**per-connection**. OpenWorkflow's connection sets only `journal_mode=WAL` and
`foreign_keys=ON`, and `claimWorkflowRun` opens with `BEGIN IMMEDIATE` — which wants the
write lock at once and, with no busy timeout, fails instantly the moment ADHD is mid-write.
`BackendSqliteOptions` exposes `namespaceId` and `runMigrations` and nothing else, and the
connection is private, so there is no supported way to set the pragma from our side.

**Decision:** the durable runtime owns `workflow.db` in the same project data dir. `runs.db`
stays ADHD's. One writer per file, so the two can never contend.

**Rejected:** reaching into `BackendSqlite`'s private `db` to set `busy_timeout` — a cast that
defeats the type system (**A7**) and breaks on any upstream change. Also rejected: migrating
the four existing OpenWorkflow tables across. There are no deployed installs, so a workflow
in flight at upgrade time is simply restarted from the UI; the old tables are left in
`runs.db` rather than dropped, so the split stays reversible.

**Consequence:** `WorkflowRuntime.ensure()` is now async — it calls `ensureProjectDataDir`
before connecting, because `workflow.db` may be the first file a project ever writes.

---

## 2026-08-05 — Home leads with the Orchestrator, and the Orchestrator surface is a tab on its own run

**Context:** Milestone E gives the product a top-level Orchestrator, but the UI had no
reference to it at all — the home screen offered only a fixed pipeline and a milestone
planning shortcut, and the `/orchestrations` endpoints were unreachable from the browser.
Two placements were open: a dedicated `#/orchestrations/:id` route beside `#/runs/:id` and
`#/milestones/:id`, or a surface on the orchestration run that already exists.

**Decision:** the home composer opens in Orchestrator mode; the fixed pipeline composer is
one click behind `choose-pipeline` and otherwise unchanged. The Orchestrator's own surface —
status, the team awaiting approval, and the timeline of runs in the initiative — is an
**extra tab on the orchestration run**, not a route of its own.

**Why:** an orchestration *is* a run — the `orchestrate` stage is `interactive: true` with 24
turns, so the conversation is already the run's chat and `POST /runs/:id/messages` already
answers an `ask_user`. A separate route would have had to rebuild the transcript, the
composer, the status bar and the SSE subscription to show the same thing the run view shows,
and would have left the user with two places to look for one conversation. The rejected
alternative is worth revisiting only if the Orchestrator gains state that outlives every run
it owns.

**Consequence:** `useOrchestration` refetches on `orchestrationRefreshKey(runs)` — the same
derivation `useMilestones` uses, widened to stage statuses, because a decision is recorded
when the `orchestrate` **stage** settles, which for a multi-stage team run is not a run status
change. No third SSE channel; see the milestone rule in
[`architecture-ui.md`](./architecture-ui.md) §5.

---

## 2026-08-05 — Every settled run is reviewed by its Orchestrator, and the review is what routes the next phase

**Context:** a composed team run produced nothing durable. `CloseoutConsumer` is bound to the
`full-delivery` pipeline's `closeout` stage, so a `team-*` run ended with its outputs in memory
and no record a later run could read. Meanwhile the Orchestrator's `start_run` and
`delegate_milestone_planning` decisions were recorded and never acted on, and milestone chaining
picked the first `ready` feature without consulting anything the finished run had learned.

**Decision:** the Orchestrator reviews **every** run it owns, as a named durable step inside that
run's own `PipelineWorkflow`, immediately before the run is marked complete. The review turn
returns two independent fenced blocks — `adhd-run-artifacts` and `adhd-orchestrator-decision` —
each read on its own, so a malformed report never costs a sound decision. A review that fails
outright is never fatal: the run's work is already done, and only the review is lost.

Artifacts are a new `RunArtifacts` type, and `ProductManagerCloseout` is redefined as its
task-board-coupled superset through a shared `RUN_ARTIFACTS_SHAPE`. That relation is now
structural rather than coincidental. Where a run already carries a Product Manager closeout, the
Orchestrator is handed it to condense instead of re-deriving a second account of the same run
from raw stage outputs.

**Launching happens after the admission claim is released, never inside the review.** The
per-project claim is held for the whole of a run, and the durable runtime gives each project one
worker, so acting on a decision from inside the run that produced it would deadlock against
both. `recordReview` therefore only persists; `settleCompletedRun` dispatches the decision after
`releaseRun`, in the ordering the previous `autoRunNext` chaining already depended on. This is
the same reason `consume()` records rather than launches: an Orchestrator conversation turn is
captured while its own run still holds the claim.

This is the run-completion seam that TASK-120 rejected. It was right to reject it then —
superseding already solved the problem it would have addressed — and it earns its place here,
because there is no other point at which the claim is free and the decision is known.

Milestone chaining now routes through the Orchestrator. `completeMilestoneRun` keeps the feature
bookkeeping and no longer starts anything; a new `continue_milestone` decision does, and
`milestone.autoRunNext` survives as the gate that decision must respect. A named `featureId`
lets the closeout's `nextRecommendation` influence *which* feature runs next — the first thing
in the system to read that field, which until now was parsed, persisted, rendered, and ignored.

**Rejected:** making the Orchestrator the sole closeout author by dropping the `full-delivery`
closeout stage — it is a behaviour change to a shipped pipeline for no gain, since a closeout
that already exists is cheaper to condense than to reproduce. Also rejected: reusing
`RunCloseoutRecord` for composed runs, which would have forced every team run to emit empty
`completedTaskIds`, `unresolvedTaskIds`, and `cleanup` arrays it has no source tasks for.

---

## 2026-08-05 — The Orchestrator is a persisted project supervisor, not a resident workflow

**Context:** specialists must route questions through the Orchestrator, but the Orchestrator
also supervises several runs and outlives each one. Keeping its original conversation workflow
resident would occupy the project's single durable worker, while a separate broker workflow or
admission lane would create another lifecycle without solving concurrency.

**Decision:** each project has at most one non-stopped Orchestrator aggregate. Every ordinary
run is attached to it, and a run that finds none creates it from its own task. The aggregate
persists goal, approved team, owned runs, lifecycle decisions, mediation turns, and stop
history, but no process stays resident between decisions. On legacy startup, the newest active
aggregate survives and older duplicates are retired before their owned work can resume.

Question mediation runs as named durable steps inside the asking specialist's existing
`PipelineWorkflow`. Each step uses the specialist run's engine configuration, limits,
cancellation, logging, and usage accounting while loading the Orchestrator persona and its
aggregate context. An escalation uses the existing `asking` state and signal wait; the answer is
then routed in a second durable mediation step before the same specialist session resumes.
Broker decisions are a separate append-only part of the aggregate and never change its
lifecycle status or latest lifecycle decision.

Stopping retains the aggregate and artifacts but releases it as the active supervisor. An
explicit stop aborts its non-terminal owned runs; a typed `stop` lets the conversation turn that
issued it finish naturally.

**Rejected:** a message queue, a second OpenWorkflow worker, a long-lived supervisory
`PipelineWorkflow`, admission lanes, and direct-to-user fallback. They either duplicate durable
state, imply concurrency the per-project worker does not provide, or bypass the mandatory
mediation invariant.

---

## 2026-08-05 — Mandatory mediation bootstraps and supersedes; it never refuses

**Context:** the first cut of the invariant above enforced it as an admission gate — a run that
found no active Orchestrator was refused with `409`, and a second `POST /orchestrations` was
refused the same way. Both refusals were unreachable states in practice. The UI has no
orchestration surface at all, so the first gate meant every "Start run" in a fresh project
failed with an instruction the user had no way to follow. And because no orchestration status is
terminal — `activeFor` treats anything that is not `stopped` as active — the second refusal made
a project permanently single-goal once its first Orchestrator finished.

**Decision:** an invariant the user cannot satisfy is a deadlock, not an invariant. Ownership is
therefore established rather than demanded. `startRun` and `restartRun` call
`QuestionMediator.ensureActive`, which returns the active aggregate or creates one from the run's
own task; neither path can fail on ownership. `POST /orchestrations` terminates the active record
and starts the new one, so superseding is how a project moves to its next goal. A restart adopts
its run into the currently active Orchestrator instead of refusing a run whose supervisor
stopped.

Mediation itself is unchanged and still mandatory: every specialist question goes through the
Orchestrator. What changed is that nothing has to be set up first.

**Rejected:** building the orchestration UI as part of this change (larger, and the deadlock
needed closing regardless), and a terminal `completed` status with a run-completion consumer
seam (correct, but it adds a lifecycle hook to `RunOrchestrator` to solve what superseding
already solves).

---

## 2026-08-05 — A composed run carries its own pipeline definition

**Context:** `TASK-110` turns an approved team proposal into a runnable pipeline. Until now
every pipeline was a frozen constant: `getPipeline` resolved an id against `DEMO_PIPELINES`,
and `RunState` persisted only `pipelineId` and `pipelineName`. A composed team belongs to
one orchestration and exists nowhere in that constant, so a composed run had no way to
resume after a restart, and `restartRun` would have told the user its pipeline no longer
exists.

**Decision:** a run freezes its own definition when the catalog cannot resolve it —
`RunState.pipeline?: PipelineDefinition`, written by `createInitialRunState` only when
`findPipeline(pipeline.id)` returns nothing, and read back through `pipelineForRun()`. Built-in
runs are unchanged on disk. The definition types in `core/pipelines.ts` are now inferred from
a zod schema rather than hand-written, because the field is persisted and had to be validated
on load anyway.

**Rejected:** a registry on `OrchestrationService` that `RunOrchestrator` consults through a
resolver seam. It keeps `RunState` smaller, but it puts a cross-service lookup on the reload
path — where the orchestration may not have loaded yet — and it lets a later edit to a stored
team retroactively change what a finished run says it did. A run is a historical record; the
definition it executed belongs to it.

**Also rejected, and worth recording because it was planned and then removed:** giving
`active_runs` a `(project_id, lane)` key so an Orchestrator conversation could hold a claim
alongside a working run. The premise was that a parked conversation blocks the composed run,
and it is false — `propose_team` completes the conversation run, since only `ask_user` and
`escalate_to_user` park. Lanes would also not have produced concurrency on their own: the
durable runtime runs one worker per project, so a second admitted run queues rather than
executes. TASK-120 consequently keeps no resident Orchestrator workflow: only its on-demand
mediation turns execute inside the asking specialist's `PipelineWorkflow`.

---

## 2026-08-04 — The Orchestrator is a persona that brokers other personas' questions

**Context:** Milestone E adds a top-level entry point that talks to the user, composes a
team, and decides what runs next. Two things about it were open: whether it is a new kind
of thing, and what happens when one of its specialists needs to ask something. Today an
`interactive` stage's `QUESTION:` parks the run and goes **straight to the user** — nothing
sits in between — which means every clarification a Developer needs interrupts a human,
including ones already answered by the approved scope.

**Decision:** the Orchestrator is an ordinary persona — same markdown, same skill layering,
same engine adapter — with two extra abilities. Its turn ends in a typed decision the system
executes rather than a `VERDICT:` line, and it sits between the other personas and the user:
it answers a specialist's question itself when the answer follows from the goal, the approved
team, or an earlier run's artifacts, and escalates when it does not, when answering would
change agreed scope, or when only the user holds the preference. The reach is every
interactive stage in a project that has an Orchestrator, not only orchestrated runs.

A stage now declares its own output protocol (`verdict` | `decision`) instead of the
interpretation being keyed to a stage name, so the second ability needed no new machinery:
`ask_user` drives the same durable park `QUESTION:` already drove. TASK-109 ships the
contract for all eight actions; TASK-120 wires the three brokering ones.

**Rejected:** making the Orchestrator a new kind of actor above the persona catalog — it
would have needed its own loading, overriding, and engine path, all duplicating what
personas already have, to express a difference that is really about output. Also rejected:
keeping `QUESTION:` as the Orchestrator's way of asking and letting `ask_user` be an alias.
Two ways to ask means two things to keep in step, and the transcript could no longer
distinguish the Orchestrator's own question from one it passed on.

---

## 2026-08-04 — An orchestration is its own aggregate, and stage output reaches it through a seam

**Context:** the orchestration conversation needed somewhere to live. Parking the decision on
`RunState` was cheapest, and reusing `Milestone` was cheaper still, but `TASK-112` makes each
phase of an initiative a separate run with earlier runs kept as finished records — which is an
aggregate that owns runs, exactly as a milestone owns features. `Milestone` is the wrong home
because the Orchestrator can *delegate* milestone planning; it sits above it.

Separately, `RunOrchestrator.captureStageOutput` already branched on `pipelineId` twice — once
for the milestone plan, once for the closeout. A third branch would have made the pattern the
design.

**Decision:** `Orchestration` is its own aggregate with its own table, repository, and single
writer (`OrchestrationService`). Stage output reaches every aggregate through a
`StageOutputConsumer` seam: the orchestrator writes the run read model and the handoff, then
hands the output to registered consumers. `RunOrchestrator` stays the single writer of the
*run* read model and stops knowing which pipelines mean something to which aggregate.

**Rejected:** deferring the aggregate to `TASK-112` — the decision contract would have been
reshaped once it landed, and the reshape is the expensive part. Also rejected: growing
`RunOrchestrator` with orchestration state; at 1600 lines it already owns runs and milestones,
and a third responsibility keyed off pipeline ids is how a god class is built.

---

## 2026-08-04 — Generators and framework are shared; everything else is duplicated

**Context:** the first pass at the AAAAA sweep read "don't repeat yourself" as the
governing rule and invented a layer of small helpers — `textOf()`, `closeoutOutput()`,
`dashboardWithTwoFeatureRuns()` — to remove duplication between tests. That is the exact
instinct the article opens by warning against, and it produced tests a reader could not
understand without opening three other places in the file.

**Decision:** two things earn a shared home — **generators** (partial in, whole object
out) and the **framework for external interactions** (the fake engine, fake streams, route
seeding, app bootstrap, HTTP verbs, pollers, and drivers that walk a pipeline through the
real system). Everything else is written inline, duplication and all.

A one-line function lifted out of a test is worse than the duplication it removed. What
makes inlining affordable is the generator: `run({ status: "blocked" })` says what it
produces *at the call site*, so a test can be explicit without being long. That is why
deduplicating a generator is right — four had drifted into two copies and were collapsed —
while extracting a one-liner is not.

The same rule settles render wrappers. `renderThing(x)` hides the Act behind a name; a
props generator keeps `render()` in the test and puts the spies on the generated props.

**Rejected:** a `support/domain/<Type>.ts` layer holding accessors like
`findFirstFeatureId`. Once one-line accessors are inlined, what remained was generators —
and `run-fixtures.ts` / `milestone-fixtures.ts` already say that. A new folder would have
been one more layer to explain for no content.

**Consequence:** twelve helpers were deleted, ten of them added by the sweep this reverses.
`fixture()` in the closeout tests was split, because a setup that builds six unrelated
things is a symptom of tests that are not granular about what they need, not a thing to
tidy.

---

## 2026-08-04 — The testing standard is generated, and enforced by lint

**Context:** AAAAA was described in `docs/testing.md` but practised in 10 of ~60 test
files. A standard that lives only in a doc no agent reliably opens is a suggestion, and
the doc had drifted to carry two of the article's rules rather than its actual thesis —
that logic belongs in the application, not the test.

**Decision:** the transferable half of the standard is a `gen:` block in
[`testing.md`](./testing.md), emitted into both the `write-tests` Claude Code skill and
the shipped QA Engineer persona — the same generator, and the same drift check in CI,
that Architect already uses. The split is strict: `testing-shared` ships into arbitrary
repositories, so `FakeEngine`, `harness.ts` and `ADHD_HOME` stay in `testing-skill`.

**"No logic in a test body" is an ESLint rule**, not a review note: `if`/`for`/`while`/
`try` inside a `test()` or `it()` callback is an error under `packages/*/test/**` and
`packages/ui/e2e/**`, with `**/support/**` exempt because that is where the loops belong.
Writing it as a lint rule found two violations in `e2e/` that a manual sweep had missed.

**Rejected:** hand-writing the skill beside the doc — two copies of a standard drift, and
the shipped persona (which said nothing about *how* to write a test) is exactly the second
consumer that makes generation worth its machinery.

---

## 2026-08-04 — `main` merges only on green CI, with admin bypass

**Context:** nothing stopped a red branch reaching `main`; CI reported, but did not gate.

**Decision:** a GitHub ruleset requires a pull request and four passing checks (`checks`,
`e2e`, `windows-latest core checks`, `macos-latest core checks`) before merge. The
settings are recorded in [`testing.md`](./testing.md#merge-protection) because they live
on GitHub, not in this repo, and an unrecorded server-side setting is one nobody can
review or restore.

**Repository admin keeps bypass.** A hard gate with no escape hatch puts a CI fix behind
its own broken CI. "Require branches to be up to date" stays off: with four jobs and a
single maintainer it forces a rebase-and-rerun on every merge for no real safety gain.

**Rejected:** requiring status checks without requiring a PR — it gates nothing that a
direct push does not simply skip.

---

## 2026-08-03 — Machinery is declared, not inferred from a log level

**Context:** the transcript decided a line was a tool call by testing
`level === "run" || level === "warn"`. Three unrelated things shared that level —
real tool calls, engine chatter like "Developer online", and the orchestrator's
own notices — so all three were classified as machinery and hidden from the chat.
A run parked four hours on a plan limit therefore said nothing in the
conversation, which contradicts treating a limit as a wait rather than a failure.

**Decision:** an adapter that knows a line is a tool call says so. `StageLogEntry`
carries an optional `StageActivity` — `tool`, `tool-error`, or `engine` — with the
tool's name and detail as data rather than only baked into the rendered message.
The transcript reads that structure; a `run` or `warn` line with no declared
activity is a notice and reaches the chat.

This is the same rule already recorded under "the run view is derived from the
log, never a second source": the chat/log split must be structural, never a proxy
like a log level, *because a proxy rots the day an adapter rewords a string*.

**Consequence:** the plan-limit wait, the resume line, and "no skill found" are
now visible in the chat, which is where a reader is looking when a run goes quiet.
The rendered message is kept alongside the structure, so persisted history stays
readable and `LogsPanel` is unchanged.

---

## 2026-08-03 — A shape and its codec are one definition

**Context:** `RunEvent` was declared in core as a flat interface with nine
optional fields while `run-persistence.ts` modelled the same event as a strict
15-arm discriminated union. Both were correct in isolation; neither could see the
other. The emitter and the UI therefore guarded against states the schema already
proved impossible, and closeout and the milestone proposal had each accumulated
three definitions of one shape.

**Decision:** zod is a dependency of `@adhd/core`. A shape is defined once, as a
schema, and its TypeScript type is `z.infer` of that schema. This extends the
rule already in force for runtime value lists — exported `as const`, defining
their unions — from lists to shapes.

**Rejected:** keeping schemas server-side and annotating them `z.ZodType<T>`
against a hand-written type. That annotation is checked covariantly on the output
type, so a union missing an arm still satisfies it — which is precisely how
`RunEvent` drifted. It cannot catch the failure it appears to guard.

**Consequence:** core shapes must stay transform-free, because `z.infer` yields
the *output* type and a transform makes the derived type dishonest about what the
schema accepts. Normalisation that belongs to an agent boundary — deduping string
arrays, rewriting severity prose — stays in the server, which is the same line
drawn under "Strict for what ADHD writes, salvaging for what an agent writes".

**Where this stops.** A schema earns its place where untrusted data crosses a
boundary at runtime — SQLite reads, HTTP request bodies, engine JSONL, agent
fenced blocks. Everywhere else a plain type is the whole contract, and deriving
one from a codec that validates nothing buys no safety while costing a runtime
object. `EngineLimit` is the worked example: produced by `detectEngineLimit` and
consumed in-process, so it is an interface, while `RunLimit` — persisted, and
carried on `stage.blocked` — keeps its schema.

Three `z.ZodType<T>` pairs survive on purpose, all of them request-input codecs
whose type the browser also imports: `projectPreferencesUpdateSchema` (whose
legacy-alias transform means input and output genuinely differ),
`engineConnectionUpdateSchema`, and `resolveLimitSchema`. Collapsing those means
core absorbing HTTP-input shapes and their trimming, which is a different
decision from this one and has not been taken.

---

## 2026-08-03 — A plan limit is a wait, not a failure

**Context:** every harness eventually says "you've hit your session limit · resets
4:30pm". ADHD treated that as a dead run: three adapters pattern-matched it into a
friendlier string that still flowed to `stageFailed`, the reset time was logged and
discarded, and recovery meant a human being present to press Restart — which re-ran the
whole stage. The one thing the machine knew (*when* it could continue) was the one thing
it threw away.

**Decision:** a limit is its own outcome. Adapters return `limit` on `EngineRunResult`
instead of prose, `STAGE_OUTCOMES.LIMITED` carries it through `interpretEngineResult`,
and the workflow parks the stage on a durable `limit:<runId>:<stageId>` signal whose
timeout is the time to the reset. Timeout fired means the reset passed; a signal means
the user chose. The run survives a hard process kill parked, because OpenWorkflow stores
the wake time in SQLite rather than in a timer — the "durable sleep (TASK-061)" case
[`workflow-runtime-options.md`](./workflow-runtime-options.md) picked that runtime for.
Three consequences worth defending:

- **`blocked` is its own status**, in both `StageStatus` and `RunStatus`, never
  `awaiting`. Reusing the gate state would make one "Approve Gate" button mean two
  incompatible things, and the same mistake `asking` was split out to avoid.
- **No retry budget.** A stage parks as many times as it takes. A budget would fail an
  overnight run at 3am for the crime of spanning two reset windows, which is exactly the
  case this exists for. The attempt count is shown in the popup instead, so a
  mis-detected limit is visible rather than silent.
- **A parked run keeps its project's admission slot.** Admission is per project, and a
  limit is account-wide: a second run would hit the same wall immediately. Releasing and
  re-admitting also invents a failure mode where re-admission is refused after a
  four-hour wait and the run dies having waited for nothing.

Running out of prepaid credit is deliberately *not* a limit and still fails the run —
waiting never clears it. Switching connection mode is likewise not a resolve choice: the
connection is read from `SettingsStore` on every turn, so the modal writes settings and
then resumes with `retry-now`.

**Rejected:** `step.sleep` for the wait. It wakes on time but cannot be interrupted, and
half the point is that the user may switch to a cheaper model rather than wait. A signal
with a timeout is both.

---

## 2026-08-03 — Strict for what ADHD writes, salvaging for what an agent writes

**Context:** rule **A7** says a codec rejects a malformed record whole rather than
repairing fields. Applied to LLM output that rule destroyed real work: the closeout
agent writes `"non-blocking"` where the enum demands `non_blocking`, and *any* schema
slip discarded an entire run's findings, task drafts and classification.

**Decision:** the boundary, not the shape, decides the strictness. An ADHD-owned record
— persisted JSON, settings, the project registry — validates completely or is rejected
with path-aware issues. An **agent-authored or vendor protocol** is salvaged: known
spellings are normalized, a failing field or array element is dropped alone, unknown
keys are reported rather than fatal, and everything discarded is named in
`validationErrors` for the UI to show. The same shape can therefore have two codecs —
the closeout block is salvaged on the way in and strict on the way to disk, with a
round-trip test holding the invariant that salvage output still satisfies the strict
schema.

**Rejected:** retrying the agent on a schema failure. It costs a second call every time,
and still answers a second failure with nothing.

**Amended 2026-08-03:** two codecs never meant two definitions. The shape now lives once
in `@adhd/core` as `CLOSEOUT_SHAPE`, transform-free, and the agent boundary overrides
only the fields whose input contract differs — trimming, deduping, severity prose. This
closed a real defect the duplication had hidden: the persisted-run codec was importing
the *agent-lenient* closeout schema, so ADHD's own records were being validated against
rules written for an LLM, silently accepting and rewriting `"Non-Blocking"` on the way
out of SQLite.

---

## 2026-07-31 — A blocking quality finding is not a crash

**Context:** a quality stage reporting `VERDICT: FAIL` is recorded as a `failed` stage so
the run ends `needs_attention`, but the pipeline deliberately continues to closeout. A
review that found a real problem looked identical to an engine that died.

**Decision:** `needs_attention` is a first-class outcome, distinct from failure, all the
way to the UI — the pipeline continues, closeout still runs and still writes follow-up
tasks, release and deploy are suppressed, and the stage renders amber rather than red.
Resolving one is an explicit **acceptance** (`POST /milestones/:id/features/:id/accept`)
that stamps who accepted it over which open findings, not a status edit — so a finalized
milestone can be read back to distinguish what a run completed from what a human waved
through. Blocking findings do not block acceptance; the alternative strands a milestone
on a false positive with no way out.

**Rejected:** widening `StageStatus` in `@adhd/core` so the colour could differ. The
persisted status is what the durable workflow branches on, and every runtime consumer
would have to handle a case that exists only for presentation.

---

## 2026-07-31 — Ship the seam, not the automation (TASK-092)

**Context:** Full Delivery carries `release` and `deploy` stages, but project deployment
automation was cut from Milestone D.

**Decision:** the stages stay and report `VERDICT: SKIP` when nothing is configured, so
the pipeline degrades honestly and the missing piece is a configuration follow-up rather
than a pipeline rewrite. Nothing in the UI renders a capability the product does not
have — no deploy-URL panel that is always empty, no evidence gallery for files no stage
writes.

**Rejected:** removing the two stages until automation lands.

---

## 2026-07-31 — Two testing rules the dogfood paid for

**Context:** Milestone D was closed on a live Full Delivery run rather than on tests
alone, and the run found what the suite could not.

**A restart test that does not confirm the run was non-terminal at the moment of the kill
is not a test.** Two durable-resume attempts verified nothing — the run had already
finished before the server was killed. Only a *timed* kill, with a stage mid-flight,
proves anything.

**Where an LLM fills a typed contract, a fixture-based test proves the parser and nothing
about what the model emits.** Every component test passed while the closeout defect
reproduced on 3 runs out of 3, because the fixtures were valid by construction.
Schema-shaped prompts need an example of *every* enum value.

---

## 2026-07-29 — Runtime schemas own every untrusted boundary

**Context:** routes asserted generic request bodies, persisted runs were trusted after a
single id check, adapters cast vendor JSONL before traversing it, and nested helpers
silently dropped invalid entries — so service code received plausible but incorrect data.

**Decision:** focused Zod codecs own every untrusted boundary — HTTP, settings, project
registry, TaskPlanner config, persisted records, AI output and engine JSONL. Domain and
service code receives validated types and never re-traverses `Record<string, unknown>`.
Engine codecs emit one shared normalized update shape so adapters never touch vendor
objects. Runtime value lists are exported `as const` and define their TypeScript unions.
ESLint enforces the boundary by rejecting typed `c.req.json<T>()` and casts around
`JSON.parse` in server source.

**Rejected:** one universal schema module — HTTP, persistence, TaskPlanner and each
vendor protocol change independently.

---

## 2026-07-29 — Absent and `undefined` are the same domain state

**Context:** `exactOptionalPropertyTypes` forced callers to distinguish a missing property
from a property explicitly set to `undefined`. ADHD gives those no different meaning, so
the flag produced `T | undefined` fields and conditional assembly protecting no invariant.

**Decision:** the flag is **off**. A value that may be absent is `field?: T`; callers may
omit it or pass `undefined`. `null` is reserved for an explicit cleared state.
`noUncheckedIndexedAccess` stays **on**.

---

## 2026-07-29 — Pure logic lives in a domain layer, grouped by what it parses

**Context:** rule A3 wants pure logic out of services. `@adhd/core` looked like the home,
and Markdown building was happening inline inside services that were also doing I/O.

**Decision:** `@adhd/core` stays the *shared* contract imported by the browser UI —
prompt builders and persona text have no business in the client bundle — so server-only
pure logic lives in `packages/server/src/domain/`, with Markdown parsing and rendering
grouped by format under `domain/markdown/`. Services own I/O and orchestration;
repositories store already-rendered content and know nothing about its format.

**Rejected:** one universal Markdown builder — task-board grammar, agent prompts and
closeout artifacts change for different reasons.

---

## 2026-07-29 — Milestones begin as an approved Product Manager proposal

**Context:** a user can describe an outcome more easily than a delivery backlog. Creating
tasks during an unfinished conversation would turn guesses into durable project work.

**Decision:** milestone planning is a dedicated Product Manager conversation whose
validated proposal is persisted as a draft, revisable by chat or direct edit, and creates
or links tasks **only after explicit approval**. One feature is one Full Delivery run and
may group several tasks. Existing TaskPlanner work is reused; missing work is created
idempotently through an ADHD-owned adapter, with `.adhd/tasks` as the fallback. Product
Manager also owns closeout: only explicitly completed source tasks move to Done,
unresolved work is preserved, and cleanup is confined to the run-owned temporary root.

**Deferred:** changing TaskPlanner itself. The Markdown integration stays behind an
adapter so an official transactional API can replace it later without changing milestone
behaviour.

---

## 2026-07-28 — Personas are identities; step tasks are assignments

**Context:** the Full Delivery preset needs conditional design and deployment, continued
QA after a blocking review, suppressed release work, and a closeout even after engine
failure. One human role also performs more than one assignment — Product Manager plans
and closes; Software Architect designs and independently reviews.

**Decision:** personas are stable identities while step-task Markdown defines each
assignment, so Full Delivery reuses Product Manager and Software Architect instead of
inventing Code Reviewer or Engineering Manager personas. Workflow control is **declared**
through `executionPolicy` — quality work may continue after `VERDICT: FAIL`, delivery work
is suppressed by any blocker, closeout is the only paid stage allowed after a runtime
failure — never by hardcoding stage ids, which would couple control semantics to today's
labels and make a renamed pipeline silently unsafe.

---

## 2026-07-28 — Persona and prompt text is Markdown, and ships as an asset

**Context:** persona text began as TypeScript template literals, which diff badly and let
a stray backtick break the build. The first fix generated one TS module, which still
duplicated every persona inside a literal.

**Decision:** the source of persona and step-task text is Markdown on disk, read directly
at runtime; the build copies it into `dist` with a platform-neutral script. The Architect
persona and its Claude Code skill are the one generated pair, emitted from named `gen:`
blocks in [`architecture.md`](./architecture.md), with `pnpm gen:skills --check` failing
the build on drift. Adding a persona is dropping in a file.

**Rejected:** a documented "edit both copies" rule — zero enforcement, drifts silently.

---

## 2026-07-28 — The run view is derived from the log, never a second source

**Context:** the obvious way to build a conversation is a `messages` table the agents
write to as they speak — which would duplicate what adapters already report through
`onLog(level, text)`, where the prose/tool distinction already exists.

**Decision:** one derived ordering feeds every view. `buildTranscript(run)` maps stage
logs onto agent prose, tool rows and notices and merges in `run.messages`, which holds
**only what the user typed**. Chat is that same ordering filtered **structurally** — on
`kind: "tool"`, never on matching prose, because prose matching rots the day an adapter
rewords a string. One writer, one ordering, and no way for two views to disagree.

**Numbers travel as data, not prose.** An adapter that knows a cost or token count hands
it up the seam as `StageUsage` rather than formatting it into a log line. Run totals are
derived by summing stages, never stored — a stored total drifts the moment a stage is
restarted, and money spent on a failed attempt was still spent. `formatUsage` is the one
place the engines' differences are expressed: dollars where an engine reports them,
tokens where it only counts those, nothing where it reports nothing, and nothing is not
an error state.

**Rejected:** a `messages` array the projection also appends agent text to — two copies of
the same sentences and a reconciliation problem the first time an adapter changes what it
logs.

---

## 2026-07-27 — An agent that asks resumes its session

**Context:** every adapter was one-shot, so an agent could not ask a clarifying question.
Two mechanisms were possible: re-run the stage with the question and answer folded into a
fresh prompt, or resume the CLI session.

**Decision:** resume the session. `EngineRunContext` carries `resumeSessionId` and the
result carries `sessionId` — one `run()` method, not a second `resume()`; the *flag*
declares the capability and the *context* drives the behaviour. Re-running was rejected
because the investigation is the expensive part: paying for it twice per question, and
losing the model's working context each time, makes the feature not worth having.

**Asking is its own run state,** not the gate state — reusing `awaiting` would make
"Approve" mean two different things. A parked run keeps its project slot, exactly as a
gate does; releasing it would let a second run write to the same workspace.

**Capabilities are verified against the installed CLI, never asserted from
documentation** — a flag claimed from docs alone fails silently at runtime. Unverified
capabilities stay off and are recorded as a known gap.

---

## 2026-07-24 — OpenWorkflow is the durable workflow runtime

**Context:** runs were an in-memory map with heap-promise gates; recovery marked
interrupted runs failed, and retries and durable timers did not exist. The runtime survey
([`workflow-runtime-options.md`](./workflow-runtime-options.md)) chose **OpenWorkflow** —
Apache-2.0, `node:sqlite`, no server process.

**Decision:** the durable runtime is OpenWorkflow, embedded **in-process**; there is no
daemon and no CLI. **The seam is the workflow, not one method** — `pipeline-workflow.ts`
is the run loop and `stage-execution.ts` the durable step, and durability owns the whole
lifecycle: start and queueing, gates, durable timers, retries, recovery, cancellation.
The older claim that a durable runtime replaces `executeStage()` alone is wrong and
under-budgets any migration.

**Single-writer rule.** OpenWorkflow's tables are the source of truth for execution
state; the `RunState` snapshot and event log are a rebuildable read model with exactly
one writer — the workflow drives it, the API only reads it.

**ADHD owns the semantics on top:** restart-from-a-stage is a fresh run seeded with
retained prior outputs, one-active-run-per-project is an admission guard below the API,
and subprocess-tree kill on cancel stays ours. **Behaviour change:** a second concurrent
run in one project now returns 400.

**Rejected:** Aiki — Postgres-only, so it would need us to write its SQLite backend *and*
fork-from-step — remains the recorded second choice.

---

## 2026-07-23 — SQLite is the sole run store, behind a layered repository

**Context:** a flat-file JSON store shipped first, with SQLite behind a selector. Run
state is a handful of rows, `node:sqlite` installs cleanly, and two storage formats plus
a selector is complexity with no live consumer.

**Decision:** SQLite is the **only** run store, with **no migration path** — pre-1.0 with
no active users, so the old format is dropped rather than imported. Persistence is
layered **services → repository → db**: one concrete `RunRepository` over a `Database`
and its tables. No interface, no factory, no barrel `index.ts`; folders are named for the
layer, never the backend.

**Rejected:** keeping the two-backend selector. It hedged against a `node:sqlite` problem
measurement had already ruled out, at the cost of two code paths nobody selected.

**Also rejected, and why (TASK-066, measured on Windows 11 + Node 24, not assumed):**

| Candidate | Why not |
| --- | --- |
| `better-sqlite3` | **Install fails outright here** — no prebuild for this Node, and the `node-gyp` fallback demands a Visual Studio C++ toolchain. This is what decided it: `node:sqlite` works where this does not. |
| `libsql` | Turso's SQLite fork; adds a native/remote story a local single-process app does not need |
| PGlite (Postgres in WASM) | Single user, single connection, alpha — cannot back an engine that pools connections |
| `embedded-postgres` | Tens of MB of binaries the upstream calls "intended for testing purposes", plus a data-directory lifecycle across app upgrades |
| A Postgres server | Disproportionate to a handful of rows per run, and pushes install/upgrade/backup onto every user — it breaks the "one install" story |

The cost of `node:sqlite` is an experimental-API warning and a Node version floor.
The storage choice also constrained the engine choice: most durable-execution
engines are Postgres-only, so "which embedded DB" and "which workflow runtime"
were the same question — see [workflow-runtime-options.md](./workflow-runtime-options.md).

---

## 2026-07-23 — A project owns its folder, its data, and its settings

**Context:** every path the server wrote was anchored to the ADHD source checkout, so a
user's project history lived inside the tool and every project shared one history and one
settings file. Separately, a run could be pointed at any directory the browser named.

**Decision:** a project is a directory that owns its own `.adhd/`, like `.git`, so history
travels with the code it belongs to. Storage takes a `ProjectPaths` value; a user-level
registry lists known projects and names the active one. The working directory is
**derived from the project and never sent by the client** — the answer to "I want to work
elsewhere" is to add another project. The fallback for "no project selected" is a home
project under `~/.adhd/home`, *not* the repo, which keeps the zero-setup path without
recreating the bug.

**Non-secret preferences are project state, not browser state** — engine, model,
permission mode and pipeline live in the per-project section of user-level settings, so a
second browser or cleared site data no longer silently reverts a project. **Secrets are
user-level and write-only:** API keys live in `~/.adhd/settings.json` (mode `0600`) as
`defaults` plus per-project overrides, and never leave the server. Each created `.adhd/`
ships a self-ignoring `.gitignore` so run artifacts never appear in a user's
`git status`.

**Rejected:** one global store filtered by a project column — it leaves history inside
the tool, so uninstalling or re-cloning loses or duplicates it. And validating a
client-supplied working directory against the project root: it keeps the second source of
truth for a knob nobody asked for.

---

## 2026-07-22 — Skills are layered, never seeded to disk

**Context:** the loader used to write the bundled persona into the project on first read.
Those copies then silently shadowed improved bundled text and had to be regenerated by
hand.

**Decision:** resolution is bundled default → user-level override → project addendum, and
**nothing is written to disk on read**. Composition is a pure function; the service only
reads. A full project replacement stays available for power users, but appending an
addendum is the default path.

---

## 2026-08-07 — The task board adapter caches where the board is, never what it holds

**Context:** every task-board operation re-probed `<root>/.tasks/config.json` and then
`<dataDir>/tasks/config.json` before doing anything, so a single closeout paid the
detection cost four times over.

**Decision:** `TaskBoardAdapter` is a class that resolves the board *location* once and
keeps it, while `config.json` and the state markdown are re-read on every call. The
split is deliberate: `.tasks/` is an external directory that a human, TaskPlanner, or
another agent edits between calls, so a cached `nextId` would hand out IDs that already
exist. Only a *positive* resolution is remembered — a project with no board is re-probed
next time, because a project can gain a `.tasks/` directory mid-session.

**Rejected:** caching the parsed `BoardConfig` alongside the location. It halves the
reads and reintroduces exactly the ID-collision bug that `nextTaskNumber`'s scan of the
board text exists to defend against.

---

## 2026-08-07 — The Product Manager closeout and the Orchestrator review are two paths, not one

**Context:** with the Orchestrator now deciding what happens after each run, the
Product Manager closeout stage looked like leftover scaffolding.

**Decision:** keep both. `FULL_DELIVERY_PIPELINE` ends in the `closeout` stage and
produces a `RunCloseoutRecord`; an Orchestrator-composed pipeline has no closeout stage
and produces a `RunArtifactRecord` from its review step instead. Consumers merge them at
`run.closeout?.report ?? run.artifacts?.report`, and the Orchestrator treats a supplied
closeout as authoritative rather than recomputing it. The file that held both was split
by owner into `services/run-closeout.ts` and `services/milestone-closeout.ts`, because
three of its five exports served the Orchestrator path and its name claimed otherwise.

**Rejected:** deleting the `closeout` stage and letting the Orchestrator review be the
only closeout. That also removes source-task transitions, run temp cleanup, and the
written `closeout.md` from every full-delivery run — a product change wearing a
refactor's clothes.
