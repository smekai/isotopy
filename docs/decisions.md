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
