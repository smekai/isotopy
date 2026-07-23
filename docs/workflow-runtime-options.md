# Workflow Runtime Options — Decision Document

**Status:** Decision record · **Research date:** 2026-07-23 · **Task:** TASK-066

**Scope of this branch:** documentation only. No public API, schema, or runtime behaviour changes
here. Every interface and method name proposed below is a *conceptual recommendation*, not an
existing or committed contract.

This document decides how ADHD executes long-running workflows: keep evolving the
hand-written TypeScript state machine, adopt [Aiki](https://github.com/aikirun/aiki), or adopt
[DBOS Transact (TypeScript)](https://github.com/dbos-inc/dbos-transact-ts). It also corrects a
standing architectural claim in `architect-standards.md`, `implementation-notes.md` and
`code-quality.md` that a durable runtime replaces `executeStage()` alone.

**Recommendation in one line:** spike DBOS as the default candidate, keep the workflow *definition*
layer ADHD-owned, and treat invisible PostgreSQL packaging on Windows and macOS as the gate that
decides adoption — with the current custom engine as the fallback if that gate fails.

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

## 2. Where ADHD is today

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

Roadmap position: [`mvp-scope.md`](mvp-scope.md) still carries the unchecked delivery item
*"Aiki-backed durable workflow runtime (or thin fallback state machine)"*, and
[`technical-architecture.md`](technical-architecture.md) recommends Aiki with a custom state machine
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
| **Definition copying** | None. Definitions are the frozen constants `SEQUENTIAL_PIPELINE`, `ONE_BOX_PIPELINE`, `DEV_TEST_PIPELINE` in `DEMO_PIPELINES`. | **Absent (S3 unmet).** There are no user-owned definitions, therefore nothing to copy. This is ADHD product work regardless of runtime. |
| **Artifacts** | `writeHandoff()` → `.adhd/runs/<id>/<stageId>/handoff.md`; `stageOutputs` in `state.json`; workspace files listed and previewed via `GET /runs/:id/files` (TASK-055). | **Works.** No manifest, no content addressing, no retention policy — but the capability is real and stays ADHD-owned. |
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
> — [`architect-standards.md`](architect-standards.md)

> **`executeStage()` is the durable-workflow seam.** … A durable-workflow runtime (Aiki …) replaces
> this one method — the engine adapters and the surrounding stage lifecycle are untouched.
> — [`implementation-notes.md`](implementation-notes.md)

> **Deliberate seam:** … A durable-workflow executor (Aiki) replaces that method alone.
> — [`code-quality.md`](code-quality.md)

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
  precisely what `technical-architecture.md` warned against building. Every bug in it is ours, and
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
  `technical-architecture.md`, so choosing it costs no narrative rewrite.
- **Against:** **the repository states plainly that "Aiki is in alpha — APIs may change between
  releases."** For a component that owns run durability in a locally installed product, alpha API
  churn is a recurring migration tax. It carries the same PostgreSQL requirement as DBOS — the
  entire packaging burden — without a documented advantage in return. In particular, **no
  restart-from-a-chosen-earlier-step / fork primitive is documented in the README as of
  2026-07-23**, which is exactly the semantic S2 asks for and exactly where DBOS is strongest.
- **Cost:** medium integration, plus PostgreSQL packaging, plus an ongoing alpha-tracking tax.

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
  and resuming from the chosen one. This is the closest match in any candidate to ADHD's
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

- **For:** the strongest capability match of the three, by a wide margin, and the only one with a
  documented fork-from-step primitive. MIT, actively released, library-not-server so it fits a
  single manually started process (S1).
- **Against:** two real costs. **PostgreSQL** — see the packaging risk below, which is the decisive
  issue. And **determinism**: "Workflows must be strictly deterministic … All non-deterministic
  operations (database access, API calls, random numbers, timestamps) must execute within steps."
  Today's orchestration path does filesystem I/O inline (`loadSkill`), reads clocks (`nowIso()`),
  and generates ids (`randomUUID()`) in what would become workflow body code. That is a
  mechanical but non-trivial refactor of `RunOrchestrator`, and it is exactly the work §4 says the
  seam claim currently hides.

### Screened out — Restate

[Restate](https://github.com/restatedev/restate) is otherwise a serious candidate, but its
[installation docs](https://docs.restate.dev/installation) list pre-built server and CLI binaries
for **macOS (x64, arm64) and Linux (x64, arm64) only** — no official Windows binary; Windows means
Docker. ADHD is a locally installed Windows-and-macOS product, so a Docker prerequisite on half the
target platforms is disqualifying. **Screened out on packaging, not on capability** — worth
revisiting only if official Windows binaries appear.

---

## 6. Matrix 1 — capability coverage

**Legend:** **Native** = the runtime provides it · **ADHD-owned** = stays our product code by design,
regardless of runtime · **Custom** = must be built on top of the runtime · **Unsupported/undoc.** =
not supported, or not documented as of 2026-07-23.

| Capability (from §3) | A · Custom engine | B · Aiki | C · DBOS |
|---|---|---|---|
| Durable start / queuing | Custom | Native (idempotency ids) | **Native** (`registerQueue`, `startWorkflow`, `deduplicationID`) |
| Crash recovery, resume from last completed stage | Custom | **Native** | **Native** |
| Retries with backoff | Custom | **Native** (configurable policies) | **Native** (`retriesAllowed`/`maxAttempts`/`intervalSeconds`/`backoffRate`/`shouldRetry`) |
| Durable user wait (approval gate) | Custom | **Native** (typed events with timeout) | **Native** (`recv`/`send`, persisted messages) |
| Durable external wait / timer (TASK-061) | Custom | **Native** (durable sleep) | **Native** (`DBOS.sleep`) |
| Semantic restart from a *chosen* earlier stage (S2) | Custom | Unsupported/undoc. | **Native** (`forkWorkflow(id, startStep)`) |
| Cancellation (durable state) | Custom | Native | **Native** (`cancelWorkflow`, `cancelChildren`) |
| Cancellation → immediate subprocess-tree kill | ADHD-owned | ADHD-owned | **ADHD-owned** — DBOS interrupts "at the beginning of its next step", so killing a running CLI stays ours |
| One active run per project, parallel across projects (S5) | Custom | Custom (no documented per-key concurrency cap) | **Native** (one queue per project, `concurrency: 1`) |
| Declared parallel branches + join (S6) | Custom | **Native** (child workflows) | **Native** (`startWorkflow` + `Promise.allSettled`) |
| Definition versioning for in-flight runs (S4) | Custom | **Native** | Native (workflow versioning) |
| **Workflow definitions (authoring, storage, schema)** | ADHD-owned | ADHD-owned | ADHD-owned |
| **"Copy workflow" — duplicate a definition (S3)** | ADHD-owned | ADHD-owned | ADHD-owned |
| **Enabled-component snapshot frozen at start (S4)** | ADHD-owned | ADHD-owned | ADHD-owned |
| **Artifacts + manifest (`handoff.md`, workspace files)** | ADHD-owned | ADHD-owned | ADHD-owned |
| **Generated code / files in the project workspace** | ADHD-owned | ADHD-owned | ADHD-owned |
| **Engine adapters, personas, prompt & handoff composition** | ADHD-owned | ADHD-owned | ADHD-owned |
| Project-local, human-readable execution history | **Native** (it *is* the store) | Custom (projection) | Custom (projection) |

The six ADHD-owned rows are the point of the exercise: **no candidate reduces them**, and no
candidate should be allowed to absorb them. Choosing a runtime buys durability primitives — not
product semantics.

---

## 7. Matrix 2 — operational fit

| Dimension | A · Custom engine | B · Aiki | C · DBOS |
|---|---|---|---|
| **Maturity** | Shipped and running (TASK-003/005/014/043–046), but incomplete on 6 of 11 capabilities | **Alpha** — "APIs may change between releases" | Actively released library; v4.24 on 2026-07-21, ~1.3k stars, MIT |
| **License** | Ours | Apache-2.0 | MIT |
| **Datastore requirement** | None today; SQLite candidate via TASK-039 | **PostgreSQL 14+** (SQLite/MySQL "coming soon") | **PostgreSQL** (`DBOS_SYSTEM_DATABASE_URL`) |
| **Runtime topology** | In-process | In-process worker or distributed | **In-process library** — "No heavyweight orchestration server is required" |
| **Windows / macOS packaging** | ✅ No new surface | ❌ Must bundle PostgreSQL invisibly on both | ❌ Same. **DBOS does not ship an embedded Postgres** — the documented local path is `npx dbos postgres start`, which *starts Postgres in a Docker container*, or an existing instance via `DBOS_SYSTEM_DATABASE_URL`. Docker is not an acceptable prerequisite, so bundling (e.g. `embedded-postgres` with `@embedded-postgres/windows-x64` / `darwin-arm64`) becomes **ADHD-owned work** |
| **Integration cost** | High (build 6 capabilities) — but incremental | Medium + alpha-tracking tax | Medium-high: `RunOrchestrator` becomes a workflow, and inline I/O / clock / id generation must move into steps to satisfy determinism |
| **Source of truth for execution state** | `.adhd/runs/<id>/state.json` + `events.jsonl`, project-local | Aiki's Postgres | DBOS's Postgres |
| **Project portability** (copy/move a project folder, keep its history) | ✅ Native — history travels with the folder | ⚠️ Broken unless exported | ⚠️ Broken unless exported — history lives in a machine-level database, not in `.adhd/` |
| **Versioning of in-flight runs** | Custom | Native | Native |
| **Lock-in** | None | Moderate — workflow bodies written to Aiki's API | Moderate — workflow bodies written to `DBOS.*`; the *durable* parts of `RunOrchestrator` are rewritten against it |
| **Operational surface added for the user** | None | Postgres service: install, start, upgrade, backup, uninstall | Same |

**The single decisive row is Windows/macOS packaging.** It is the only one where the custom engine
is unambiguously better, it is the only one that can fail outright rather than merely cost effort,
and — per S1 — it must work for a manually started local process with no admin ceremony and no
Docker. The task premise records that bundled PostgreSQL is acceptable in principle; what the
research shows is that **neither framework bundles it for us**.

---

## 8. Competitor landscape

Compact read of what shipping coding agents already do, and where ADHD's semantics remain distinct.

| Product | Persistence & resume | Checkpoints | Approvals | Parallel / isolation |
|---|---|---|---|---|
| **[Cline](https://docs.cline.bot/features/checkpoints)** | Task history in extension storage | ✅ **Shadow Git repo, separate from your project's history**, committed "after each tool use"; restore Files / Task / both | Per-tool approval in the IDE | Single session per task |
| **[OpenHands](https://docs.openhands.dev/sdk/guides/convo-persistence)** | ✅ Persisted conversation state (event log, agent config, execution state, tool outputs); `openhands --resume [<id>\|--last]` | Event-log replay rather than file snapshots | ✅ [Confirmation policies](https://docs.openhands.dev/sdk/guides/security) — including an LLM risk analyzer that only escalates high-risk actions | Docker-sandboxed runtime; SDK scales to many agents |
| **[Devin](https://docs.devin.ai/work-with-devin/advanced-capabilities)** | Session-scoped; a coordinator can message, monitor, pause and terminate child sessions | ⚠️ [Golden Snapshots](https://docs.devin.ai/product-guides/snapshots) are a *starting* image, not a rollback point — "Every session boots a fresh copy" and "Session changes don't persist back to the snapshot" | Session-level human steering | ✅ Coordinator can "break down a large task and delegate pieces to a team of managed Devin sessions, each running in its **own isolated VM**"; [playbooks](https://docs.devin.ai/product-guides/creating-playbooks) are reusable prompt templates across parallel sessions |
| **[Cursor Cloud Agents](https://cursor.com/docs/cloud-agent/choose-runtime)** | Cloud-hosted; keeps running with the laptop closed | Saved environments, artifact capture | Review-before-merge | ✅ Isolated VM per agent; many in parallel; self-hosted runtime option |
| **[GitHub Copilot coding agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent)** | Task-scoped, **not resumable**; "maximum execution time of 59 minutes" | Branch + PR is the checkpoint | ✅ PR review is the gate | "one branch at a time", "exactly one pull request to address each task" |

**Baseline, not differentiator (three of five or better):** session persistence and resume,
checkpoint/rollback of some kind, human approval before risky actions, and isolated parallel agents.
ADHD should stop treating these as selling points — Devin and Cursor ship VM-per-agent isolation,
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
   ADHD is pipeline-shaped.
4. **Local-first ownership** — history and artifacts beside the code (TASK-059), no cloud account
   for the orchestration layer.

Note the tension between (4) and §7: adopting either framework moves execution history out of the
project folder into a machine-level database, weakening the differentiator that is hardest for the
cloud competitors to copy. §9 addresses this directly.

---

## 9. Recommendation

**Spike DBOS Transact (TypeScript) as the leading candidate and default choice.** Given that bundled
PostgreSQL is acceptable in principle, DBOS has the strongest match to ADHD's semantics of the three
options: automatic recovery from the last completed step, configurable step retries, durable
`recv`/`send` signals for gates, durable `sleep` for limit backoff, workflow cancellation,
`forkWorkflow(id, startStep)` for semantic stage restart, child workflows for declared parallel
branches, and per-queue `concurrency: 1` for project-keyed serialization. It is MIT, actively
released, and a library rather than a server — which suits a manually started local process (S1).

**Keep ADHD-owned, without exception:** workflow definitions and their schema, definition copying
(S3), the enabled-component snapshot frozen at run start (S4), artifact manifests, engine adapters
and personas, and all code and files generated into the project workspace. The runtime supplies
durability primitives; it does not get to define the product's vocabulary.

**If DBOS is adopted, its database becomes authoritative for execution state.** Project-local
`state.json` and `events.jsonl` are retained as an **idempotent history projection and export**,
rebuildable from DBOS at any time. This is the one non-negotiable integration rule: **two
independently advancing state machines is the failure mode to design out.** The current file store
must stop being a second writer of truth and become a derived read model — which also preserves the
project-portability story from §7 as an *export*, honestly labelled, rather than a live second
source.

### Required feasibility spike — the gates

Adoption is conditional on a spike proving all six. Any of the first two failing should stop the
adoption.

| # | Gate | Why it is in doubt |
|---|------|--------------------|
| G1 | **Invisible PostgreSQL install, start, upgrade, backup and removal on Windows and macOS** | The decisive gate. DBOS's documented local path is Docker (`npx dbos postgres start`), which is unacceptable for a locally installed app. Bundling via `embedded-postgres` (`@embedded-postgres/windows-x64`, `darwin-x64`, `darwin-arm64`) is the candidate route, but those binaries come from a project describing them as "intended for testing purposes" — so data-directory lifecycle across app upgrades, and clean uninstall, must be proven, not assumed. |
| G2 | **Project portability / history projection** | Execution truth moving to a machine-level database is a real regression against local-first ownership (§8). Prove that `.adhd/runs/` can be rebuilt idempotently from DBOS, that a copied project folder degrades gracefully, and that no code path writes both stores independently. |
| G3 | **Recovery after killing the server mid-stage *and* mid-durable-wait** | The two cases differ. A killed stage tests step-level checkpointing plus orphaned-subprocess cleanup; a killed durable wait tests persisted timers and `recv` state. Both must resume without user intervention — replacing `reconcileInterrupted()`. |
| G4 | **User signals and limit polling with persisted timers** | Gate approval via `send`/`recv` and TASK-061's "wait until the limit resets" via `sleep`, each surviving a restart, each surfacing correctly to the UI through the SSE projection. |
| G5 | **One active run per project, concurrent runs across projects** | Requires a queue per project with `concurrency: 1`. Queue registration is typically startup-shaped; prove that queues can be registered per project dynamically as projects are added at runtime. |
| G6 | **Immediate subprocess-tree termination despite step-boundary cancellation, plus declared parallel branches** | DBOS interrupts "at the beginning of its next step", but a stage *is* a long-running CLI. Killing the process tree on cancel stays ADHD-owned and must remain immediate on both platforms. Separately, prove fan-out/fan-in with branches sharing one project folder (S6). |

### Fallback

**If G1 or G2 fails, build Option A — the custom engine.** It is the only option with zero packaging
risk and native project-local history, and S6 (author-owned conflict avoidance) spares us the
hardest parts of a durable engine. The work is then: durable gates and timers in the run store,
a resumable orchestration loop, per-stage retries, a project-keyed admission check, a parallel
scheduler with joins, and real recovery. TASK-039's SQLite adapter is the natural substrate.

### Watch list

**Aiki stays on the watch list, not the shortlist.** It is alpha with explicitly unstable APIs, it
carries the identical PostgreSQL packaging burden as DBOS, and it documents no equivalent to
`forkWorkflow` — the primitive that maps most directly onto ADHD's S2 restart semantics. There is
currently no reason to prefer it over DBOS. Revisit when it reaches a stable release or when its
promised SQLite backend lands, which would materially change the packaging calculus.

**Restate stays screened out** on missing official Windows binaries; revisit only if that changes.

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

**Aiki** — [aikirun/aiki (GitHub, Apache-2.0, alpha)](https://github.com/aikirun/aiki) · [aiki.run](https://aiki.run/)

**Restate** — [restatedev/restate](https://github.com/restatedev/restate) · [installation / supported platforms](https://docs.restate.dev/installation)

**PostgreSQL bundling** — [embedded-postgres (npm)](https://www.npmjs.com/package/embedded-postgres) ·
[@embedded-postgres/windows-x64](https://www.npmjs.com/package/@embedded-postgres/windows-x64) ·
[zonkyio/embedded-postgres-binaries](https://github.com/zonkyio/embedded-postgres-binaries)

**Competitors** — [Cline checkpoints](https://docs.cline.bot/features/checkpoints) ·
[OpenHands persistence](https://docs.openhands.dev/sdk/guides/convo-persistence) ·
[OpenHands security & confirmation](https://docs.openhands.dev/sdk/guides/security) ·
[Devin advanced capabilities](https://docs.devin.ai/work-with-devin/advanced-capabilities) ·
[Devin playbooks](https://docs.devin.ai/product-guides/creating-playbooks) ·
[Cursor Cloud Agents runtime](https://cursor.com/docs/cloud-agent/choose-runtime) ·
[GitHub Copilot coding agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent)

**Internal** — [`technical-architecture.md`](technical-architecture.md) ·
[`architect-standards.md`](architect-standards.md) ·
[`implementation-notes.md`](implementation-notes.md) ·
[`code-quality.md`](code-quality.md) ·
[`competitor-matrix.md`](competitor-matrix.md) ·
[`mvp-scope.md`](mvp-scope.md) ·
[`../.tasks/DONE.md`](../.tasks/DONE.md) ·
[`../.tasks/BACKLOG.md`](../.tasks/BACKLOG.md)
