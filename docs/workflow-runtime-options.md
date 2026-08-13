# Workflow Runtime Options — Decision Document

**Status:** Decision record · **Research date:** 2026-07-23 · **Task:** TASK-066

**Scope of this branch:** documentation only. No public API, schema, or runtime behaviour changes
here. Every interface and method name proposed below is a *conceptual recommendation*, not an
existing or committed contract.

This document decides how Isotopy executes long-running workflows. It also corrects a standing
architectural claim — then carried by `architect-standards.md`, `implementation-notes.md` and
`code-quality.md`, the first and last of which are now sections of
[`architecture.md`](architecture.md) — that a durable runtime replaces `executeStage()` alone.

**Recommendation in one line:** adopt **OpenWorkflow** — TypeScript, Apache-2.0, durable execution
on an embedded SQLite file with no server and no native dependencies — keep the workflow
*definition* layer Isotopy-owned, and treat semantic stage restart (**S2**) and per-project
concurrency (**S5**) as the two things we build or contribute upstream.

> **REVISION — 2026-07-23 (same day)**
>
> **The original recommendation in this document was DBOS, gated on bundling PostgreSQL invisibly.
> That is superseded.** Two things changed it:
>
> 1. **Postgres was rejected as disproportionate.** Run state is a handful of rows per run;
>    requiring every user to install and lifecycle-manage a Postgres server to hold it breaks the
>    "one install" story. The owner ruled it out.
> 2. **The engine survey was too narrow.** It compared three options because the task named three.
>    Widening it surfaced **OpenWorkflow**, **Reflow**, **TanStack Workflow** and **Resonate** —
>    and OpenWorkflow ships SQLite support *today*.
>
> Two facts then decided it, both **measured on Windows 11 / Node 24**, not cited — see
> [`decisions.md`](./decisions.md) (2026-07-23):
>
> - **DBOS TypeScript is Postgres-only.** `pg` is the sole DB driver in its `package.json`. The
>   SQLite support widely attributed to DBOS is in its *Python* port, where it is the default.
> - **OpenWorkflow ran Isotopy's exact shape end to end** on a SQLite file: Developer → durable gate →
>   Tester, surviving a hard process kill at the gate, resuming in a fresh process, and *not*
>   re-running the completed stage.
>
> §1–§4 and §8 are unaffected and stand as originally written. §5, §7 and §9 are revised below.
> The superseded DBOS reasoning is kept rather than deleted, so the change of mind stays legible.

---

## 1. Agreed semantics

These are the product decisions the runtime must satisfy. They are settled; the runtime choice
does not get to renegotiate them.

| # | Semantic | Consequence for the runtime |
|---|----------|-----------------------------|
| S1 | **The runner is a manually started process that keeps running after the UI closes.** OS login autostart is explicitly deferred. | Durability must survive *process restart*, not merely browser refresh. There is no always-on daemon to lean on, and no supervisor guaranteed to restart the runner. |
| S2 | **Restart/checkpoint granularity is a named workflow stage** — never an instruction inside a running agent process. | Checkpoints are coarse and *semantic*. Restarting the Tester means re-running the Tester box from its start, not rewinding a partially consumed model context. |
| S3 | **"Copy workflow" duplicates a reusable definition only** — never a run, its history, or its artifacts. | The definition is a first-class, user-owned, copyable document. Execution history is not part of what gets copied. |
| S4 | **Components are selected, and the definition frozen, when a run starts.** | A run carries an immutable snapshot of its definition plus its enabled components. Editing a definition mid-flight must not mutate an in-flight run. |
| S5 | **One active workflow per project; different projects may run concurrently.** | Concurrency control is keyed by project id, not global and not per-machine. |
| S6 | **Declared parallel branches may share the project folder.** Conflict avoidance is the workflow author's responsibility. | The runtime owes fan-out/fan-in and correct joins. It does *not* owe filesystem isolation, locking, or merge arbitration. |

Two consequences are worth stating plainly, because they shape the whole comparison:

- **S1 + S2 mean recovery is cheap to specify and expensive to fake.** A restart replays whole
  stages. That is exactly what durable-execution frameworks are built for, and exactly what the
  current engine does *not* do (§3).
- **S6 means we do not need the heavy end of the durable-execution feature set.** No distributed
  locking, no exactly-once side effects across machines, no saga compensation. This lowers the
  value of adopting a framework and raises the relative attractiveness of the custom option.

---

## 2. Where Isotopy is today

The workflow engine is [`RunOrchestrator`](../packages/server/src/services/run-orchestrator.ts) —
an in-memory `Map<string, RunState>` with debounced JSON persistence through
[`JsonRunStore`](../packages/server/src/services/run-store.ts), over the pure state model in
[`packages/core/src/runs.ts`](../packages/core/src/runs.ts) and the definition model in
[`packages/core/src/pipelines.ts`](../packages/core/src/pipelines.ts).

Delivered by TASK-003 (mock orchestrator + SSE), TASK-005 (`state.json` + `events.jsonl`),
TASK-014 (real-engine stage branch, abort wiring), TASK-043–046 (per-stage skills, prompt/handoff
composition, the `executeStage()` seam, shared workspace), TASK-055 (workspace artifacts in the
UI), TASK-058/060 (Rerun, and the Resume/Restart split), and TASK-059 (project scoping, which made
`RunStore` an interface bound to a project). See [`../.tasks/DONE.md`](../.tasks/DONE.md).

Open work that touches this area: TASK-039 (pluggable run persistence — the `RunStore` seam exists
after TASK-059; only a DB adapter remains), TASK-051 (Manual-Tester stage), TASK-061 (subscription
limit reached → durable wait + user choice), TASK-065 (project preferences moved server-side).

Roadmap position: the delivery item this was waiting on was
*"Aiki-backed durable workflow runtime (or thin fallback state machine)"*, with
[`architecture.md`](architecture.md) recommending Aiki plus a custom state machine
as the fallback. **This document is the research that item was waiting on**, and §9 revises that
default.

**Terminology.** The product concept is a *workflow*; the code still calls it a *pipeline*
(`PipelineDefinition`, `DEMO_PIPELINES`, `pipelineId`). This document says "workflow" for the
concept and uses the code names when it means the code. A *stage* is one box in the workflow — the
unit of restart under S2.

---

## 3. Capability map — requested vs. actual

| Capability | Today | Verdict |
|------------|-------|---------|
| **Start a run** | `startRun()` validates the engine/connection, allocates a run number per project, resolves a workspace, persists an initial snapshot, then fires `void this.simulateRun(...)`. | **Works, not durable.** The run is an un-awaited floating promise owned by the process. There is no queue, no admission control, and no record that a run *should* be running beyond its `state.json` status. |
| **Recovery after restart** | `init()` → `loadProject()` → `reconcileInterrupted()`. | **Not recovery — bereavement.** Any stage found `running` or `awaiting` is rewritten to `failed` with `"✗ Interrupted by server restart"`, and the run is marked `failed`. The user then manually clicks Resume. Nothing resumes itself. |
| **Retries** | None. | **Absent.** A flaky engine invocation fails the stage and the run. There is no retry policy, backoff, or attempt counter anywhere in the orchestrator. |
| **Definition copying** | None. Definitions are the frozen constants `SEQUENTIAL_PIPELINE`, `ONE_BOX_PIPELINE`, `DEV_TEST_PIPELINE` in `DEMO_PIPELINES`. | **Absent (S3 unmet).** There are no user-owned definitions, therefore nothing to copy. This is Isotopy product work regardless of runtime. |
| **Artifacts** | `writeHandoff()` → `.adhd/runs/<id>/<stageId>/handoff.md`; `stageOutputs` in `state.json`; workspace files listed and previewed via `GET /runs/:id/files` (TASK-055). | **Works.** No manifest, no content addressing, no retention policy — but the capability is real and stays Isotopy-owned. |
| **Durable user waits (gates)** | `stage.status = "awaiting"`, then `await new Promise(resolve => this.gateWaiters.set(key, resolve))`. | **Not durable.** The wait is a resolve callback in a `Map` in heap memory. Kill the process while a gate is open and the promise dies with it; the run is reconciled to `failed` on next boot. A gate that survives a restart is the single clearest thing the current engine cannot do. |
| **Durable external waits (e.g. TASK-061 limit reset)** | None. | **Absent.** "Subscription limit reached, wait until 16:30 and continue" requires a timer that survives restart. `setTimeout` does not. |
| **Optional stages** | `disabledStages: string[]` on the run; disabled stages start `skipped`; `restartRun()` refuses to target one. | **Works** for the run-start case, and is correctly frozen into the run — a partial instance of S4. |
| **Project concurrency (S5)** | Nothing enforces it. | **Absent.** `startRun()` performs no check for an already-active run in the project. Two concurrent runs in one project sharing a workspace is currently reachable through the API. |
| **Cancellation** | `abortRun()` sets a `cancelled` flag, fires the run's `AbortController`, releases gate waiters, marks non-terminal stages `skipped`. | **Works in-process, weakly.** Cancellation is cooperative and polled at await points. Subprocess-tree termination on Windows vs. macOS is the hard part and is owned by the engine adapters, not the orchestrator. |
| **Parallel execution (S6)** | `PipelineGroup.mode: "sequential" \| "parallel"` exists in the type — and `flattenPipelineStages()` is `groups.flatMap(g => g.stages)`. | **Declared but not implemented.** `runStages()` is a strictly sequential `for` loop. A group marked `parallel` runs sequentially today, silently. There is no fan-out, no join, no per-branch failure policy. |

**Summary:** of eleven requested capabilities, four work (artifacts, optional stages, in-process
cancellation, starting a run), one is declared but not executed (parallel), and six are absent or
non-durable (recovery, retries, definition copying, durable user waits, durable external waits,
project concurrency).

---

## 4. Correction — `executeStage()` is not the whole seam

Three documents currently state that a durable runtime swaps in behind one method:

> `RunOrchestrator.executeStage()` in `services/run-orchestrator.ts` is the single decision point
> for how a stage runs. A durable executor replaces that method alone — leave it intact.
> — `architect-standards.md`, now [`architecture.md` § Architect Standards](architecture.md)

> **`executeStage()` is the durable-workflow seam.** … A durable-workflow runtime (Aiki …) replaces
> this one method — the engine adapters and the surrounding stage lifecycle are untouched.
> — [`implementation-notes.md`](implementation-notes.md)

> **Deliberate seam:** … A durable-workflow executor (Aiki) replaces that method alone.
> — `code-quality.md`, now [`architecture.md` § Code Quality Standards](architecture.md)

**This is wrong, and it under-budgets the migration.** `executeStage()` decides *how one stage is
executed* — simulation or real engine. That is a genuine and valuable seam, and it should stay. But
it is not where durability lives. Durable execution has to own:

1. **Starting and queuing** — a run must be a durably enqueued unit of work, not `void this.simulateRun(...)`.
2. **The orchestration loop** — `runStages()` itself becomes the workflow body. The loop's position
   is the checkpoint (S2); a runtime that cannot checkpoint the loop cannot resume it.
3. **Gates and waits** — `gateWaiters` and any limit/backoff wait must become durable receive/sleep
   primitives, not heap promises.
4. **Retries** — a per-stage policy with attempt counts that survive restart.
5. **Fan-out / fan-in** — parallel branch scheduling and joins (S6).
6. **Recovery** — replacing `reconcileInterrupted()`'s mark-everything-failed with actual resumption.
7. **Cancellation** — durable cancel state, so a cancel issued before a crash is still honoured after it.
8. **Execution history** — one authoritative record of what ran, in what order, with what result.

Only items outside that list — engine adapters, prompt/handoff composition in
`domain/stage-context.ts`, persona loading, artifact writing, the SSE projection — are genuinely
untouched by the runtime choice.

**Practical consequence:** the honest description of the seam is *"`RunOrchestrator` is the durable
workflow; `executeStage()` is the durable step."* Migration cost should be estimated against the
class, not against one method. The three documents above should be amended once a runtime decision
is executed; this branch deliberately does not edit them.

---

## 5. Options

### Option A — Evolve the current TypeScript / file-backed state machine

Keep `RunOrchestrator` and `RunStore`, and build the missing six capabilities: durable gates and
timers persisted to the run store, a resumable orchestration loop driven from persisted stage
status, a retry policy per stage, a project-keyed admission check, a parallel scheduler with joins,
and a real recovery path replacing `reconcileInterrupted()`. TASK-039's DB adapter (SQLite is the
listed candidate) would give the durability substrate without a server.

- **For:** zero new runtime dependency and zero packaging risk — the decisive advantage given S1.
  State stays project-local and human-readable, which is the current source-of-truth story
  (`.adhd/` beside the code, like `.git`). No determinism constraints on our own code. No
  framework version to track. Cancellation and subprocess-tree kill stay entirely under our control,
  at the exact moment we want them rather than at a step boundary.
- **Against:** we write and own the hard parts. Durable timers, crash-consistent checkpointing, idempotent
  step replay and fan-in joins are individually unglamorous and collectively a real engine —
  precisely what [`architecture.md`](architecture.md) warned against building. Every bug in it is ours, and
  the failure modes (a wait that silently never fires, a double-executed stage after an
  ill-timed crash) are the kind that surface in front of users months later.
- **Cost:** high but incremental and de-riskable — each capability ships independently, and S6
  spares us the hardest distributed cases.

### Option B — Adopt Aiki

[Aiki](https://github.com/aikirun/aiki) is a TypeScript durable-execution platform: workflows are
plain async functions, Apache-2.0 licensed, requiring **PostgreSQL 14+** ("SQLite and MySQL coming
soon"). The README documents durable execution with checkpoint resume, child workflows for parallel
execution, typed events with timeout support, durable sleep (days/months/years), configurable
retries, workflow versioning that lets in-flight runs finish on their old version, idempotency via
custom ids, and scheduled runs.

- **For:** TypeScript-native with an ergonomic model, and the feature list maps well onto S1/S2 and
  onto gates. Versioning is a genuinely good fit for S4. It is the incumbent recommendation in
  [`architecture.md`](architecture.md), so choosing it costs no narrative rewrite.
- **The decisive advantage — Isotopy has a contributor on the project.** Aiki's public API already
  exposes a provider seam (`server({ db: database({ provider: "pg", url }) })`) and SQLite is a
  declared roadmap item, so the missing pieces are reachable rather than hypothetical. Uniquely
  among the candidates, its gaps are ours to close.
- **Against:** **the repository states plainly that "Aiki is in alpha — APIs may change between
  releases,"** and at **34 stars** it is by far the smallest project considered here — a real
  bus-factor risk for a component that owns run durability. It requires **PostgreSQL 14+ today**;
  SQLite is "coming soon", which means *we would be writing it*. And **no
  restart-from-a-chosen-earlier-step / fork primitive is documented as of 2026-07-23** — the S2
  semantic — so that would be a second contribution.
- **Cost:** medium integration **plus two upstream contributions** (a SQLite provider and
  fork-from-step), plus an ongoing alpha-tracking tax. Contrast with Option D, which already ships
  the SQLite provider and leaves only the fork gap.

### Option C — Adopt DBOS Transact (TypeScript)

[DBOS Transact](https://github.com/dbos-inc/dbos-transact-ts) is an MIT-licensed library — not a
server — that "runs directly inside your existing application code and uses your existing Postgres
database to store and recover workflow state and execution history" (v4.24, 2026-07-21; ~1.3k
stars). Workflows are registered with `DBOS.registerWorkflow()`; steps run through
`DBOS.runStep()`; DBOS "checkpoints the state of your workflows and steps to its system database.
If your program crashes or is interrupted, DBOS uses this checkpointed state to recover each of
your workflows from its last completed step"
([programming guide](https://docs.dbos.dev/typescript/programming-guide)).

Mapped against our list:

- **Recovery (S1/S2):** automatic on restart, from the last completed step. A stage = a step.
- **Retries:** per step — `retriesAllowed` (default `false`), `maxAttempts` (3), `intervalSeconds`
  (1), `backoffRate` (2), plus `shouldRetry` and `timeoutMS`; exhaustion throws
  `DBOSMaxStepRetriesError` ([steps](https://docs.dbos.dev/typescript/tutorials/step-tutorial)).
- **Durable user waits:** `DBOS.recv()` / `DBOS.send()` — "All messages are persisted to the
  database"; the documented human-in-the-loop pattern is a workflow that durably waits on `recv`
  for hours or days ([HITL](https://docs.dbos.dev/ai/hitl),
  [communication](https://docs.dbos.dev/typescript/tutorials/workflow-communication)).
- **Durable external waits (TASK-061):** `DBOS.sleep(durationMS)` — "DBOS saves the wakeup time in
  the database so that even if the workflow is interrupted and restarted multiple times while
  sleeping, it still wakes up on schedule."
- **Semantic stage restart (S2):** `DBOS.forkWorkflow(workflowID, startStep)` — "start a new
  execution of a workflow by forking it from a specific step", copying inputs and preceding steps
  and resuming from the chosen one. This is the closest match in any candidate to Isotopy's
  Resume/Restart semantics from TASK-060.
- **Project concurrency (S5):** `DBOS.registerQueue(name, { concurrency: 1 })` — global concurrency
  caps concurrent workflows across processes, and `concurrency: 1` is documented to "guarantee
  sequential, in-order processing". One queue per project gives per-project serialization with
  cross-project parallelism, which is S5 exactly.
  Also available: `deduplicationID` and `duplicationPolicy: 'return-existing'` for
  idempotent starts ([queues](https://docs.dbos.dev/typescript/tutorials/queue-tutorial)).
- **Parallel branches (S6):** `DBOS.startWorkflow()` for concurrent children, awaited with
  `Promise.allSettled` when launched in deterministic order.
- **Cancellation:** `DBOS.cancelWorkflow(id, { cancelChildren })`, and `DBOS.resumeWorkflow()`.
- **Status projection:** `DBOS.setEvent()` / `DBOS.getEvent()` and `DBOS.listWorkflows()`.

- **For:** the richest capability set of any candidate, and the only one with a documented
  fork-from-step primitive — the closest match anywhere to S2. MIT, actively released,
  library-not-server so it fits a single manually started process (S1).
- **Against — and this is now disqualifying: DBOS TypeScript is Postgres-only.** Its
  [`package.json`](https://raw.githubusercontent.com/dbos-inc/dbos-transact-ts/main/package.json)
  lists `pg` as its sole database driver — no `better-sqlite3`, no `node:sqlite`, no `libsql` — and
  the [configuration reference](https://docs.dbos.dev/typescript/reference/configuration) documents
  only `postgresql://` connection strings. The documented local path is `npx dbos postgres start`,
  which starts Postgres **in a Docker container**. Since Postgres is ruled out (see the revision
  note), DBOS TS is unusable as it ships.
  - *The SQLite support often attributed to DBOS is in the **Python** port*, where
    [it is the default](https://docs.dbos.dev/python/reference/configuration):
    `sqlite:///[application_name].sqlite`, with `use_listen_notify` forced to `False` so it polls
    instead of using `LISTEN`/`NOTIFY`. This proves the architecture ports to SQLite — but the
    TypeScript port has not done it and publishes no timeline.
- **Also against — determinism:** "Workflows must be strictly deterministic … All non-deterministic
  operations (database access, API calls, random numbers, timestamps) must execute within steps."
  Today's orchestration path does filesystem I/O inline (`loadSkill`), reads clocks (`nowIso()`),
  and generates ids (`randomUUID()`) in what would become workflow body code. That is a
  mechanical but non-trivial refactor of `RunOrchestrator`, and it is exactly the work §4 says the
  seam claim currently hides. *(This cost applies to every durable runtime, not just DBOS.)*
- **Verdict:** blocked on TS SQLite parity. Revisit if it lands.

### Option D — Adopt OpenWorkflow ✅ recommended

[OpenWorkflow](https://github.com/openworkflowdev/openworkflow) is an Apache-2.0 TypeScript
framework for durable, resumable workflows (v0.9.2, 1279★, actively pushed 2026-07-23). It stores
state in **PostgreSQL *or* SQLite** and states that a *"database as source of truth avoids a
separate orchestration service"* — so there is no daemon, matching **S1**.

**Why it wins: it was measured doing Isotopy's exact job.** Full detail in
[`decisions.md`](./decisions.md) (2026-07-23); the headline results, on
Windows 11 / Node 24:

- `npm install openworkflow` → **1 package, ~2 seconds, zero dependencies**, no native module. Its
  SQLite adapter calls `require("node:sqlite")` — Node's built-in.
- A **Developer → durable gate → Tester** workflow (deliberately shaped like `DEV_TEST_PIPELINE`)
  ran to completion on a SQLite file.
- **Hard-killing the process while parked at the gate, then starting a fresh process, resumed the
  run** — it accepted the signal and executed the Tester.
- **The already-completed Developer stage did not re-execute** — replayed from SQLite. That
  memoization is what stops a restart from repeating paid model calls.
- The history is plain, inspectable SQL: `workflow_runs`, `step_attempts`, `workflow_signals`.

Mapped to the capability list:

- **Recovery (S1/S2):** automatic, via heartbeats and `availableAt` leases. Replaces
  `reconcileInterrupted()`'s mark-everything-failed.
- **Retries:** `RetryPolicy` (`maximumAttempts` + backoff) per workflow/step.
- **Durable user waits:** `step.waitForSignal({ signal, timeout })` + `client.sendSignal({ signal, data })`.
- **Durable external waits:** `step.sleep(name, duration)` — TASK-061 exactly.
- **Cancellation:** `cancelWorkflowRun()`, with `sleeping` and `canceled` statuses.
- **Parallel branches (S6):** `Promise.all` / `Promise.allSettled` over durable steps.
- **Versioning (S4):** `version?` on the workflow spec.

- **Against — two real gaps, both Isotopy-owned or upstream contributions:**
  - **No restart-from-a-chosen-stage (S2).** Nothing matching `fork` / `restartFrom` / `resumeFrom`
    exists in the shipped types; recovery is automatic-from-last-completed only. Isotopy's
    Resume/Restart split (TASK-060) would have to be built on top or contributed upstream. **This is
    the one place DBOS was genuinely better.**
  - **No per-key concurrency (S5).** `concurrency` is a worker pool size, not a per-project limit;
    there is no queue-per-key. `idempotencyKey` on run creation is the likely building block.
  - Pre-1.0 (v0.9.2) — the API may still move, though it is far past Aiki's maturity.
- **Cost:** medium. The determinism refactor of `RunOrchestrator` applies here as to any runtime.

### Also surveyed, not recommended

- **[Reflow](https://github.com/danfry1/reflow-ts)** (MIT, 38★, v0.5.0) — *the right shape, the
  wrong feature set.* Single package, no services, checkpoints every step to SQLite, and offers a
  three-way driver choice (`node:sqlite` / `better-sqlite3` / `bun:sqlite`) that directly informed
  the storage decision. But it documents **no gates/signals, no durable sleep, and no
  restart-from-step** — S2, the approval gate and TASK-061, all missing. **Keep as a design
  reference, not a dependency.**
- **[TanStack Workflow](https://github.com/TanStack/workflow)** (MIT, 185★) — pluggable storage via
  an interface it calls `RunStore` (the same name TASK-059 chose for ours), but ships only
  in-memory, Drizzle/Postgres and Cloudflare adapters — **no SQLite** — and is at 0.0.x. Worth
  re-checking once it stabilises.
- **[Vercel Workflow SDK](https://github.com/vercel/workflow)** (Apache-2.0, 2240★) — the largest
  project surveyed, self-describes as *"fully portable… run locally, self-host"*, but its
  persistence story is oriented at Vercel's platform and is not documented as an embedded local
  file. Not screened out on capability; simply a worse fit than a library that names SQLite.

### Screened out — Resonate

[Resonate](https://github.com/resonatehq/resonate) (Apache-2.0, 626★, v0.9.8) is attractive on
paper — SQLite storage by default — but fails on the same ground as Restate. Its v0.9.8 release
assets are `resonate_darwin_aarch64`, `resonate_darwin_x86_64`, `resonate_linux_aarch64` and
`resonate_linux_x86_64`: **no Windows binary**. It is also a *separate server process* the SDK talks
to over HTTP, and the TypeScript SDK's dependency-free "local development mode" is in-memory, so it
provides no durability without that server. **Screened out on packaging, not capability.**

### Screened out — Restate

[Restate](https://github.com/restatedev/restate) is otherwise a serious candidate, but its
[installation docs](https://docs.restate.dev/installation) list pre-built server and CLI binaries
for **macOS (x64, arm64) and Linux (x64, arm64) only** — no official Windows binary; Windows means
Docker. Isotopy is a locally installed Windows-and-macOS product, so a Docker prerequisite on half the
target platforms is disqualifying. **Screened out on packaging, not on capability** — worth
revisiting only if official Windows binaries appear.

---

## 6. Matrix 1 — capability coverage

**Legend:** **Native** = the runtime provides it · **Isotopy-owned** = stays our product code by design,
regardless of runtime · **Custom** = must be built on top of the runtime · **Unsupported/undoc.** =
not supported, or not documented as of 2026-07-23.

| Capability (from §3) | A · Custom engine | B · Aiki | C · DBOS | **D · OpenWorkflow** |
|---|---|---|---|---|
| **Runs on an embedded file DB (no server)** | **Native** | Unsupported today ("coming soon") | **Unsupported** (Postgres only) | **Native** — `node:sqlite`, measured |
| Durable start / queuing | Custom | Native (idempotency ids) | **Native** (`registerQueue`, `deduplicationID`) | **Native** (`runWorkflow`, `idempotencyKey`) |
| Crash recovery, resume from last completed stage | Custom | **Native** | **Native** | **Native** — measured (M6/M7) |
| Retries with backoff | Custom | **Native** (configurable policies) | **Native** (`retriesAllowed`/`maxAttempts`/`backoffRate`) | **Native** (`RetryPolicy.maximumAttempts` + backoff) |
| Durable user wait (approval gate) | Custom | **Native** (typed events with timeout) | **Native** (`recv`/`send`) | **Native** (`waitForSignal`/`sendSignal`) — measured |
| Durable external wait / timer (TASK-061) | Custom | **Native** (durable sleep) | **Native** (`DBOS.sleep`) | **Native** (`step.sleep`) |
| Semantic restart from a *chosen* earlier stage (S2) | Custom | Unsupported/undoc. | **Native** (`forkWorkflow(id, startStep)`) | **Unsupported/undoc.** — the one real gap |
| Cancellation (durable state) | Custom | Native | **Native** (`cancelWorkflow`) | **Native** (`cancelWorkflowRun`) |
| Cancellation → immediate subprocess-tree kill | Isotopy-owned | Isotopy-owned | **Isotopy-owned** — DBOS interrupts "at the beginning of its next step" | **Isotopy-owned** — same reason |
| One active run per project, parallel across projects (S5) | Custom | Custom | **Native** (one queue per project, `concurrency: 1`) | **Custom** — worker-level concurrency only |
| Declared parallel branches + join (S6) | Custom | **Native** (child workflows) | **Native** (`startWorkflow` + `Promise.allSettled`) | **Native** (`Promise.all` over durable steps) |
| Definition versioning for in-flight runs (S4) | Custom | **Native** | Native | Native (`version?` on spec) |
| Project-local, human-readable execution history | **Native** | Custom (projection) | Custom (projection) | Native-ish — a SQLite file **inside the project**, plus a projection |
| **Workflow definitions (authoring, storage, schema)** | Isotopy-owned | Isotopy-owned | Isotopy-owned | Isotopy-owned |
| **"Copy workflow" — duplicate a definition (S3)** | Isotopy-owned | Isotopy-owned | Isotopy-owned | Isotopy-owned |
| **Enabled-component snapshot frozen at start (S4)** | Isotopy-owned | Isotopy-owned | Isotopy-owned | Isotopy-owned |
| **Artifacts + manifest (`handoff.md`, workspace files)** | Isotopy-owned | Isotopy-owned | Isotopy-owned | Isotopy-owned |
| **Generated code / files in the project workspace** | Isotopy-owned | Isotopy-owned | Isotopy-owned | Isotopy-owned |
| **Engine adapters, personas, prompt & handoff composition** | Isotopy-owned | Isotopy-owned | Isotopy-owned | Isotopy-owned |

The six Isotopy-owned rows are the point of the exercise: **no candidate reduces them**, and no
candidate should be allowed to absorb them. Choosing a runtime buys durability primitives — not
product semantics.

**Read the first and seventh rows together.** The embedded-DB row eliminates B and C outright. The
S2 row is the price of that elimination: DBOS was the only candidate with a native fork-from-step,
so choosing D means owning semantic stage restart ourselves — which, note, is exactly what
`restartRun()` in [`run-orchestrator.ts`](../packages/server/src/services/run-orchestrator.ts)
already implements today against our own state model.

---

## 7. Matrix 2 — operational fit

| Dimension | A · Custom engine | B · Aiki | C · DBOS | **D · OpenWorkflow** |
|---|---|---|---|---|
| **Maturity** | Shipped and running (TASK-003/005/014/043–046), but incomplete on 6 of 11 capabilities | **Alpha** — "APIs may change between releases"; **34★** | v4.24 on 2026-07-21, 1289★, MIT | v0.9.2, **1279★**, Apache-2.0, pushed 2026-07-23 |
| **License** | Ours | Apache-2.0 | MIT | Apache-2.0 |
| **Datastore requirement** | None today; `node:sqlite` via TASK-039 | **PostgreSQL 14+** (SQLite "coming soon") | **PostgreSQL only** (`pg` is its sole driver) | **SQLite *or* Postgres** — SQLite via built-in `node:sqlite` |
| **Runtime topology** | In-process | In-process worker or distributed | In-process library, but needs a PG server | **In-process library** — "database as source of truth avoids a separate orchestration service" |
| **Windows / macOS packaging** | ✅ No new surface | ❌ Must bundle PostgreSQL invisibly on both | ❌ Same — and its documented local path is `npx dbos postgres start`, i.e. **Docker** | ✅ **Measured: 1 package, ~2 s, zero dependencies, no native module, no server** |
| **Install risk** | None | Postgres | Postgres/Docker | ✅ None — but note `better-sqlite3` **failed to install** on this platform, which is why the driver must be `node:sqlite` |
| **Integration cost** | High (build 6 capabilities) — but incremental | Medium + **two upstream contributions** (SQLite provider, fork-from-step) + alpha tax | Blocked | Medium: `RunOrchestrator` becomes a workflow; inline I/O / clock / id generation move into steps; **build S2 restart + S5 concurrency** |
| **Source of truth for execution state** | `.adhd/runs/<id>/state.json` + `events.jsonl`, project-local | Aiki's Postgres | DBOS's Postgres | **A SQLite file that can live inside the project's `.adhd/`** |
| **Project portability** (copy/move a project folder, keep its history) | ✅ Native — history travels with the folder | ⚠️ Broken unless exported | ⚠️ Broken unless exported | ✅ **Preserved** — a per-project DB file travels with the folder, like `.git` |
| **Versioning of in-flight runs** | Custom | Native | Native | Native (`version?`) |
| **Lock-in** | None | Moderate — workflow bodies written to Aiki's API | Moderate | Moderate — workflow bodies written to its API; mitigated by an Apache-2.0, zero-dependency, inspectable SQLite schema |
| **Operational surface added for the user** | None | Postgres service: install, start, upgrade, backup, uninstall | Same | **None** — one file |

**The decisive rows are datastore requirement and packaging.** They eliminate B and C outright: both
demand a PostgreSQL server, which is disproportionate to a few thousand rows and pushes an
install/upgrade/backup burden onto every user. Only A and D clear that bar, and only D also brings
durable gates, durable sleep, retries and crash recovery already built.

**Note what D recovers that the original recommendation would have lost.** The row that most worried
§8 — project portability, the differentiator hardest for cloud competitors to copy — comes back:
a per-project SQLite file sits inside `.adhd/` and travels with the folder, exactly like `.git`.
Postgres would have moved execution history to a machine-level database and broken that.

---

## 8. Competitor landscape

Compact read of what shipping coding agents already do, and where Isotopy's semantics remain distinct.

| Product | Persistence & resume | Checkpoints | Approvals | Parallel / isolation |
|---|---|---|---|---|
| **[Cline](https://docs.cline.bot/features/checkpoints)** | Task history in extension storage | ✅ **Shadow Git repo, separate from your project's history**, committed "after each tool use"; restore Files / Task / both | Per-tool approval in the IDE | Single session per task |
| **[OpenHands](https://docs.openhands.dev/sdk/guides/convo-persistence)** | ✅ Persisted conversation state (event log, agent config, execution state, tool outputs); `openhands --resume [<id>\|--last]` | Event-log replay rather than file snapshots | ✅ [Confirmation policies](https://docs.openhands.dev/sdk/guides/security) — including an LLM risk analyzer that only escalates high-risk actions | Docker-sandboxed runtime; SDK scales to many agents |
| **[Devin](https://docs.devin.ai/work-with-devin/advanced-capabilities)** | Session-scoped; a coordinator can message, monitor, pause and terminate child sessions | ⚠️ [Golden Snapshots](https://docs.devin.ai/product-guides/snapshots) are a *starting* image, not a rollback point — "Every session boots a fresh copy" and "Session changes don't persist back to the snapshot" | Session-level human steering | ✅ Coordinator can "break down a large task and delegate pieces to a team of managed Devin sessions, each running in its **own isolated VM**"; [playbooks](https://docs.devin.ai/product-guides/creating-playbooks) are reusable prompt templates across parallel sessions |
| **[Cursor Cloud Agents](https://cursor.com/docs/cloud-agent/choose-runtime)** | Cloud-hosted; keeps running with the laptop closed | Saved environments, artifact capture | Review-before-merge | ✅ Isolated VM per agent; many in parallel; self-hosted runtime option |
| **[GitHub Copilot coding agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent)** | Task-scoped, **not resumable**; "maximum execution time of 59 minutes" | Branch + PR is the checkpoint | ✅ PR review is the gate | "one branch at a time", "exactly one pull request to address each task" |

**Baseline, not differentiator (three of five or better):** session persistence and resume,
checkpoint/rollback of some kind, human approval before risky actions, and isolated parallel agents.
Isotopy should stop treating these as selling points — Devin and Cursor ship VM-per-agent isolation,
Cline ships file-level checkpoints via shadow git, OpenHands ships resumable conversations with a
risk-scored confirmation policy.

**Still differentiating:**

1. **Semantic restart from a named workflow stage (S2).** Where competitors checkpoint at all, they
   do it at *tool call* (Cline) or *task/PR* (Copilot) granularity; Devin's snapshot is a clean
   starting image rather than a rollback point. Nobody offers "re-run the Tester box, keep the
   Developer's output" as a first-class product concept. This is the Resume/Restart distinction
   TASK-060 already shipped.
2. **Durable external waits.** No competitor documents "the subscription limit resets at 16:30;
   sleep until then, survive a restart, and continue" (TASK-061). Cloud products dodge it with
   always-on infrastructure; local products simply lose the run.
3. **Multi-persona pipelines over one shared workspace**, with typed handoffs between boxes
   (TASK-043–046) and a user-owned, copyable definition (S3). Competitors are session-shaped;
   Isotopy is pipeline-shaped.
4. **Local-first ownership** — history and artifacts beside the code (TASK-059), no cloud account
   for the orchestration layer.

Note the tension between (4) and §7: adopting either framework moves execution history out of the
project folder into a machine-level database, weakening the differentiator that is hardest for the
cloud competitors to copy. §9 addresses this directly.

---

## 9. Recommendation

**Adopt OpenWorkflow, on SQLite via `node:sqlite`.** It is the only candidate that satisfies both
hard constraints — an embedded file database and Windows support — while already providing crash
recovery, durable approval gates, durable sleep, retries, cancellation and parallel steps. It was
measured running Isotopy's exact two-stage shape with a gate, surviving a hard kill, and resuming in a
fresh process without re-running the completed stage. Apache-2.0, 1279★, zero dependencies.

**The honest trade against the superseded DBOS recommendation:** DBOS has a native
`forkWorkflow(id, startStep)` and per-queue `concurrency: 1`, which map perfectly onto S2 and S5.
OpenWorkflow has neither. We are trading two conveniences for the elimination of a PostgreSQL
server, and **we already implement S2 ourselves** — `restartRun(runId, stageId)` in
[`run-orchestrator.ts`](../packages/server/src/services/run-orchestrator.ts) resets stages from a
chosen point and clears their outputs. That logic ports onto durable steps; it is not new design.

**Keep Isotopy-owned, without exception:** workflow definitions and their schema, definition copying
(S3), the enabled-component snapshot frozen at run start (S4), artifact manifests, engine adapters
and personas, and all code and files generated into the project workspace. The runtime supplies
durability primitives; it does not get to define the product's vocabulary.

**Its database becomes authoritative for execution state — and it lives inside the project.** Put
the SQLite file under the project's `.adhd/`, so history travels with the folder like `.git` and the
local-first differentiator survives. Project-local `state.json` and `events.jsonl` are retained as an
**idempotent projection and export**, rebuildable at any time. This is the one non-negotiable
integration rule: **two independently advancing state machines is the failure mode to design out.**
The current file store must stop being a second writer of truth and become a derived read model.

**Second choice — Aiki, if steering the dependency matters more than shipping sooner.** Isotopy has a
contributor there, so its gaps are ours to close; but closing them means writing the SQLite provider
*and* fork-from-step, against an alpha API on a 34-star project, to reach where OpenWorkflow already
is. Choose it only as a deliberate bet on influence over readiness.

### Required feasibility spike — the gates

**Gates G1 and G3 from the original DBOS gate set are already answered** — G1 (invisible database
install) is obsolete because SQLite needs no install at all, and G3 (recovery after a kill) was
measured passing. What remains is what the probe did *not* cover.

| # | Gate | Why it is in doubt |
|---|------|--------------------|
| G1 | **Semantic restart from a chosen stage (S2)** | The one capability OpenWorkflow does not provide and DBOS did. Prove that Isotopy's existing `restartRun(runId, stageId)` semantics can be rebuilt on durable steps — most likely by starting a fresh run seeded with the retained outputs of stages before the restart point. Decide then whether to contribute it upstream as a fork primitive. |
| G2 | **One active run per project, concurrent runs across projects (S5)** | `concurrency` is a worker pool size, not a per-key cap, so this is Isotopy-owned. Prove an admission check keyed by project id — `idempotencyKey` plus a project-scoped guard — that survives restart and cannot be bypassed via the API, which it currently can be. |
| G3 | **Per-project database placement and portability** | Prove a SQLite file under each project's `.adhd/` works with a per-project backend instance, that copying the folder carries history, and that `state.json`/`events.jsonl` can be rebuilt idempotently as a projection with no code path writing both stores. |
| G4 | **Immediate subprocess-tree termination on cancel** | `cancelWorkflowRun()` marks state durably, but a stage *is* a long-running CLI. Killing the process tree stays Isotopy-owned and must be immediate on Windows and macOS — unchanged from the original analysis. |
| G5 | **Declared parallel branches sharing one project folder (S6)** | `Promise.all` over durable steps is documented and simple; prove fan-in, per-branch failure policy, and that the shared-workspace assumption holds under real concurrent agents. |
| G6 | **`node:sqlite` under sustained use** | It is an experimental Node API. Prove WAL behaviour under concurrent readers plus the writer, that the `ExperimentalWarning` can be suppressed or accepted in a shipped product, and pin the `engines.node` floor to `>=22.5`. |

### Fallback

**If G1 or G2 proves unexpectedly costly, build Option A — the custom engine.** It has zero
packaging risk and native project-local history, and S6 (author-owned conflict avoidance) spares us
the hardest parts of a durable engine. The work is then: durable gates and timers in the run store,
a resumable orchestration loop, per-stage retries, a project-keyed admission check, a parallel
scheduler with joins, and real recovery — on the same `node:sqlite` substrate, behind the `RunStore`
seam TASK-059 already built. Note that A and D share a storage decision, so the storage work is not
wasted either way.

### Second choice and re-evaluation triggers

**Aiki — the standing second choice, not a watch-list item.** Isotopy has a contributor on the project,
which no other candidate can say, and its `database({ provider })` seam plus a declared SQLite
roadmap make the gap closable rather than hypothetical. It is not recommended today only because
closing it means writing the SQLite provider *and* fork-from-step against an alpha API on a 34-star
project. **Revisit immediately if its SQLite backend lands** — that single change would make it
directly competitive with OpenWorkflow, with the added advantage of influence over its direction.

**DBOS — revisit if TypeScript SQLite parity lands.** The architecture already supports SQLite in the
Python port, and DBOS remains the only candidate with a native fork-from-step. If the TS port gains a
SQLite system database, it returns to the shortlist immediately.

**TanStack Workflow — revisit at 1.0 or when a SQLite `RunStore` adapter appears.** Its storage
interface is already the right shape.

**Restate and Resonate stay screened out** on missing official Windows binaries; revisit only if
that changes. Note this is now the *second* time that criterion has eliminated an otherwise strong
candidate — it deserves to be a first-class filter in any future evaluation, applied before
capability analysis rather than after.

---

## 10. Sources

All verified 2026-07-23.

**DBOS** — [dbos-transact-ts (GitHub, MIT, v4.24 · 2026-07-21)](https://github.com/dbos-inc/dbos-transact-ts) ·
[programming guide](https://docs.dbos.dev/typescript/programming-guide) ·
[workflows](https://docs.dbos.dev/typescript/tutorials/workflow-tutorial) ·
[steps & retries](https://docs.dbos.dev/typescript/tutorials/step-tutorial) ·
[queues & concurrency](https://docs.dbos.dev/typescript/tutorials/queue-tutorial) ·
[workflow management (cancel/resume/fork)](https://docs.dbos.dev/typescript/tutorials/workflow-management) ·
[communication (send/recv/events)](https://docs.dbos.dev/typescript/tutorials/workflow-communication) ·
[human-in-the-loop](https://docs.dbos.dev/ai/hitl) ·
[methods reference](https://docs.dbos.dev/typescript/reference/methods) ·
[quickstart (Postgres options)](https://docs.dbos.dev/quickstart)

**DBOS Python (SQLite default)** — [Python configuration reference](https://docs.dbos.dev/python/reference/configuration)

**OpenWorkflow** — [openworkflowdev/openworkflow (GitHub, Apache-2.0)](https://github.com/openworkflowdev/openworkflow) ·
[core concepts](https://openworkflow.dev/docs/core-concepts) ·
[advanced patterns](https://openworkflow.dev/docs/advanced-patterns) ·
[architecture](https://github.com/openworkflowdev/openworkflow/blob/main/ARCHITECTURE.md)

**Aiki** — [aikirun/aiki (GitHub, Apache-2.0, alpha)](https://github.com/aikirun/aiki) · [aiki.run](https://aiki.run/)

**Also surveyed** — [Reflow](https://github.com/danfry1/reflow-ts) ·
[TanStack Workflow](https://github.com/TanStack/workflow) ·
[Vercel Workflow SDK](https://github.com/vercel/workflow) ·
[Resonate](https://github.com/resonatehq/resonate) ·
[Restate](https://github.com/restatedev/restate) ·
[Restate installation / supported platforms](https://docs.restate.dev/installation)

**Storage** — see [`decisions.md`](./decisions.md) (2026-07-23) for the embedded-DB
comparison and the Windows measurements · [`node:sqlite`](https://nodejs.org/api/sqlite.html) ·
[PGlite](https://github.com/electric-sql/pglite) ·
[embedded-postgres (npm)](https://www.npmjs.com/package/embedded-postgres) ·
[zonkyio/embedded-postgres-binaries](https://github.com/zonkyio/embedded-postgres-binaries)

**Competitors** — [Cline checkpoints](https://docs.cline.bot/features/checkpoints) ·
[OpenHands persistence](https://docs.openhands.dev/sdk/guides/convo-persistence) ·
[OpenHands security & confirmation](https://docs.openhands.dev/sdk/guides/security) ·
[Devin advanced capabilities](https://docs.devin.ai/work-with-devin/advanced-capabilities) ·
[Devin playbooks](https://docs.devin.ai/product-guides/creating-playbooks) ·
[Cursor Cloud Agents runtime](https://cursor.com/docs/cloud-agent/choose-runtime) ·
[GitHub Copilot coding agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent)

**Internal** — [`architecture.md`](architecture.md) ·
[`decisions.md`](decisions.md) ·
[`implementation-notes.md`](implementation-notes.md) ·
[`competitor-matrix.md`](competitor-matrix.md) ·
[`../.tasks/DONE.md`](../.tasks/DONE.md) ·
[`../.tasks/BACKLOG.md`](../.tasks/BACKLOG.md)
