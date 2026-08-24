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

## 2026-08-24 — A stage that never reached a verdict is resumed, not restarted

**Context:** `TASK-142`'s dogfood spent 1h 58m on three verification attempts and got no verdict
from any of them. Each began from nothing: the stage's session was discarded, so attempt two
reinstalled the browser attempt one had already installed, into the same 600s wall.

**Decision:** a stage records the engine session it used, and a restart resumes it — but only when
the stage **never reached a verdict**. A stage that answered `FAIL` finished its thought; resuming
that would continue a conversation that had ended. Being cut off is the case worth carrying, and
it is the one the run record can tell apart, because a verdict is either there or it is not.

Whether the session can be resumed at all is answered by the capability catalog rather than by the
restart code, so a new engine cannot inherit a claim nobody checked.

**Rejected: replaying the prior attempt's transcript instead.** It was the other option the task
named. A transcript is lossy where a session is not — the agent's own working state, what it had
already ruled out, the files it had open — and on an engine that can resume, replaying is strictly
worse than continuing. Where an engine cannot resume, the existing question-loop replay already
covers the ground.

**And every stage is now told its time budget.** The deeper cause was not the retry at all: the
agent had no idea it was on a clock, so it reached for a browser install with four minutes left.
The stage prompt names the minutes and says what overrunning costs — no verdict, no partial
credit. A constraint an agent cannot see is one it cannot budget against.

---

## 2026-08-23 — An adapter declares what it can do, as data

**Context:** `implementation-notes.md` confidently described three Cursor behaviours that had
stopped being true — no accept-edits mode, auto-review only via a config file, no session resume —
and nothing failed when the CLI grew the flags, because a prose note cannot go red. `TASK-142`'s
dogfood then paid for the resume half at full price: three verify attempts, each starting cold.

**Decision:** capabilities are **data**, not prose and not a switch in each adapter.
`ENGINE_CAPABILITY_CATALOG` is an exhaustive `Record<EngineId, Record<EngineCapability, …>>`, so
adding a capability is a compile error until every engine answers it — the same guarantee a
`never`-closed switch would give, without asking three adapters to restate a table. Support is not
a boolean: `supported`, `unsupported`, `probed` (the CLI build varies and something must ask it),
and `posixOnly`.

**`posixOnly` exists because of a real flag.** `--sandbox enabled` is macOS and Linux only; on
Windows it exits 1. Mapping `acceptEdits` to it as originally planned would have broken every
accept-edits run on Windows. Declaring the gap and degrading with a notice is the standing rule —
name the mechanism, do not infer it — applied to a CLI instead of a skill path.

**Rejected: trusting the plan as written.** `TASK-154` specified `acceptEdits` → `--sandbox
enabled` outright. Running the flag first is what caught it. The rule that produced this entry is
worth more than the entry: verify against the installed binary and pin the version verified
(`cursor-agent 2026.08.11-e8db854`, `claude 2.1.215`).

---

## 2026-08-23 — Milestone F does not close on its third dogfood

**Context:** `TASK-142` ran the Cursor dogfood and closed `FAIL`. The team built the feature
correctly in 4m 18s — 23 tests green, every clause of the goal verified by hand — and then
verification ran three times over 1h 58m and never produced a verdict. The cause was ours, not the
engine's: the Developer stage left a `vite preview` on port 5180, it survived the timeout that
killed its parent process tree, and Isotopy's own product runner then reported the product
`exited` while that product answered 200 at the URL Isotopy had configured. A human killed the
orphan by hand; the Preview then worked in 4.4 seconds.

**Decision:** F stays **open** and the four defects go to Milestone I (`TASK-165`–`TASK-168`)
rather than into F, consistent with how `TASK-141`'s four defects were routed on 2026-08-17. What
is *not* decided, and is the product owner's: whether F can close at all on two passes and one
environment-defect failure, or whether `TASK-165` must come inside F because a demoable MVP is
precisely the thing that cannot require Task Manager. The "nothing else" rule argues the first;
the bar's own wording — *points it at a folder, describes a goal, and sees the thing that was
built* — argues the second.

**Recorded because it will be re-argued:** the run also produced the first *measured* cost of
Cursor's dropped `session_id` (`TASK-154`). Each retry started cold and redid the whole Playwright
setup, so the defect stopped being a design argument and became two wasted attempts. And a stage
reported "Timed out after 600s" after running 5316s, which means no duration in a run record is
trustworthy until that is fixed.

**The three-engine evidence F closes on**, since this is the comparison and not the narrative:

| | TASK-128 Codex | TASK-141 Claude Code | TASK-142 Cursor |
| --- | --- | --- | --- |
| Verdict | `SKIP` | `PASS` | `FAIL` |
| Feature delivered | yes | yes | yes |
| Verification reached a verdict | — | yes, caught a real a11y bug | **no, three times** |
| Recovery | — | one partial retry, then self-stop | two partial retries, then self-stop |
| Spend | not recorded | $6.69 | not reportable by the product |
| Wall clock | — | ~35 min | ~2h 03m, of which **4m 18s** was the work |

Cursor's own numbers: baseline `87fe592` restored from the committed bundle (14 files, 9 tests) to
5 files changed, 2 modules added, **721 insertions, 23 tests green**; runs `3606b6ff` (verify
5316s), `cf3c8c7b` (600s), `333406ca` (602s); every stage on `--model auto`, which the CLI echoed
back as `Cursor agent online · Auto`, so the subsidised pool was the one spent. The Orchestrator
then asked the user rather than attempting a fourth run, and was left unanswered.

**One finding in that run was wrong and is kept here rather than quietly dropped.** It was filed
as "the composer displays the tier for a run whose model is pinned". The composer does no such
thing — it already renders *"pinned in Setup, so the model above does not apply"*, tested since
`TASK-129`. The observation came from reading the tier dropdown before the pin was set. A dogfood
finding is a hypothesis, and this one reached a filed P1 task before anyone opened the component.

**Rejected: keeping the per-run record file.** `TASK-142`'s evidence lived at
`docs/dogfood/TASK-142-cursor-2026-08-23.md` in `TASK-141`'s section-for-section format, and was
deleted on 2026-08-24 with the product owner: three copies of one run — the record, the `DONE.md`
entry and this entry — bought less than the lines cost. What a run *decided* belongs here and what
a task *did* belongs in `DONE.md`; a third narrative between them did not earn its place. The cost
is accepted openly: `TASK-141`'s record survives and this one does not, so the two are no longer
diffable section for section, and the table above is what remains of that comparison.

---

## 2026-08-23 — A preset for the cheapest thing a harness sells

**Context:** preparing `TASK-142`'s Cursor dogfood, the account had capacity — Auto + Composer at
11% used, API at 100% — and no preset could reach it. Every Cursor rung was a `gpt-5.3-codex`
variant, and the tier named `auto` meant "pass no `--model`", which inherits whatever
`~/.cursor/cli-config.json` names. The cheapest thing Cursor sells was unreachable from every
preset, including the one called Auto.

**Decision:** `economy` becomes a sixth tier, directly after `auto`, and Cursor's ladder moves to
Composer plus Anthropic. Economy is a **tier rather than a relabelled `auto`** because
`MODEL_TIER_OPTIONS` order is the price ladder `LimitModal` slices for escapes, and `auto` is
excluded from it outright — a cheap pool parked under `auto` can never be offered when a run hits
a limit. Under `economy` it can, which is the whole value: a run that exhausts one pool falls to
the subsidised one and keeps going.

Economy takes today's Fast rung on Claude Code and Codex and Fast moves up one notch, so six rungs
stay monotone. **Rejected: letting Economy duplicate Fast there** — it leaves the picker showing
two presets with one answer and gives the limit ladder a rung that escapes to nothing cheaper. The
price is that Fast costs slightly more on two engines that were not the reason for the change.

Stored preferences need no migration. `tierOf` matches on model id alone and returns the first
tier naming it, so a pre-preset `haiku` pin now adopts Economy rather than Fast — correct, because
the old Fast *was* `haiku`/low, which is now Economy.

---

## 2026-08-21 — Milestone I is a product carried on a schedule, not a better seam

**Context:** F, G and H were all inward-facing — stabilise, rename, react to feedback — and H
closed admitting the user feedback it was gated on never arrived. The evidence base underneath
that is three dogfoods (`TASK-094`, `TASK-128`, `TASK-141`), each **one feature on a target that
no longer exists**. Meanwhile the Orchestrator is an aggregate, not a process, so every increment
begins with a human clicking, and there is no scheduled work anywhere in the codebase. The
product's own wedge is *"then built for v2, v3, and everything after"*, and that half has never
been measured.

**Decision:** Milestone I is **Induction** — Isotopy builds one small real product and then carries
it forward on a schedule, unattended, for a measured stretch. The gap list that falls out is what
MVP and public launch are scoped from. Four things fall out of it and hold beyond this milestone:

- **A schedule is a persisted record plus a ticker, not a durable workflow.** Crash safety comes
  from the record: a cron expression plus `lastFiredAt` recompute due-ness deterministically after
  any restart. `step.waitForSignal({ timeoutMs })` — the durable park `TASK-061` built for plan
  limits — is right for *one* wait of known length and wrong for a recurring one: `WorkflowRuntime`
  registers exactly one workflow and runs `concurrency: 1`, and a month-long parked workflow must
  be cancelled and rebuilt every time its expression is edited.
- **Cron is parsed in-process, never delegated to the OS.** `cron` and `schtasks` diverge by
  platform. Timezone resolution follows `domain/rules/engine-limit.ts` — ICU through
  `Intl.DateTimeFormat`, durations in server logs, clock times only in the browser.
- **The Orchestrator remains an episode handler and is allowed to die.** A schedule, not a
  long-lived supervisor, is what carries intent between episodes — which is why a standing goal
  never needed a home on the `Orchestration` record. The project's memory lives in the task board,
  in per-persona notes (`TASK-113`), and in run artifacts on disk, all of which outlive any
  orchestration. Accepted cost: an episode cannot cite the previous episode's artifacts directly,
  because `priorArtifacts()` filters by `orchestration.runIds`. It reads the board and the notes
  instead.
- **Product variants — a Travel build, a Games build, as forks of the core — come after MVP, not
  before.** A fork of a core that cannot carry a product by itself forks the problem too.

**Rejected:** keeping Milestone I as *Isomorphic* — the declarative engine capability catalog —
and deferring the dogfood behind it. It spends a milestone on internal seam quality while the
product's central untested claim stays untested. `TASK-154` survives inside Induction anyway,
because it is the part of that seam an unattended run depends on: an adapter that discards every
session id makes a long stretch measure nothing, whatever else is true of it.

**Also rejected:** giving an orchestration a resting state so it could survive between scheduled
episodes. It reads as the obvious fix for the amnesia above, and it is the wrong layer — it would
put durable intent on a conversation record when the schedule already holds it durably, and it
would make `stop` mean two things. The system already has one place for "what this project must
keep being true", and after this milestone it is a schedule.

---

## 2026-08-21 — One json-record table, one connection per project

**Context:** extends 2026-07-23 ("SQLite is the sole run store, behind a layered repository"),
which this does not overturn — `services → repository → db` stays. What had drifted is what
filled those layers. `runs`, `milestones` and `orchestrations` are all `(id, data, created_at,
updated_at)` with the same upsert, the same `updated_at` trigger and the same legacy-timestamp
migration, yet they were three table classes; `MilestoneRepository` and `OrchestrationRepository`
were byte-identical modulo names; and `schemas/milestone.ts` and `schemas/orchestration.ts` were
the same `JSON.parse`-then-validate function twice. Each of the three repositories also opened
its **own** connection to the same `runs.db`.

**Decision:** one `JsonRecordsTable` parameterized by a `JsonTableSpec`, one generic
`JsonRecordRepository<T>` carrying the parse-and-warn boundary, one `parsePersistedRecord`, and a
`ProjectDatabases` registry that hands every repository for a project the same `Database`.

**Consequences worth knowing:**

- A table can now register its schema *after* the shared connection is open, so
  `Database.connection()` applies not-yet-run registrations on every call and `settle()` resets
  that cursor. Without this, whichever aggregate loaded second queried a table that was never
  created.
- The unified `CREATE TABLE` carries `CHECK (json_valid(data))`, which the `runs` table alone
  had lacked. `CREATE TABLE IF NOT EXISTS` never alters an existing database — but the legacy
  timestamp migration *rebuilds* the table, and that path does apply the new constraint. Because
  the old `runs` table accepted anything and `RunRepository` skipped unreadable rows on read, a
  database could hold a row the rebuild would reject, and the failed migration would repeat on
  every later `connection()`. The copy therefore selects `WHERE json_valid(data)` and warns with
  a count: a row that could not be read before the migration is not lost by being dropped in it.
- Closing moved off the repositories onto `ProjectDatabases.settleAll()`, which must run **last**
  in shutdown — after the services have flushed — or Windows fails the temp-directory delete
  with EBUSY.

**Rejected:** collapsing `repository/` into `db/`. The repositories carry the parse-and-warn
boundary, and pushing that into services would put decoding back in the layer A3 keeps thin.

---

## 2026-08-21 — The projection stays narrow; the hooks beside it collapse

**Context:** three interfaces in `workflow/types.ts` each had exactly one implementation —
`RunProjection` (34 methods, `RunService`), `OrchestrationHooks` (12, `OrchestrationService`)
and `ProductHooks` (2, `ProductProcessService`). An audit read all three as ceremony: a type
restating the public surface of the single class behind it, which A2 does not ask for.

**Decision:** `RunProjection` **stays**; the other two are replaced by the class types.

The difference is what the seam excludes. `RunService` also exposes `approveGate`,
`resolveLimit` and `postMessage`, which *send signals into the running workflow*. Reaching one
from inside a durable step would re-enter the workflow that is currently executing it, and the
projection is what makes those methods unreachable from `workflow/` — interface segregation
doing real work, not a restatement. `bindOpenWorkflowRun` left the interface: `RunService` only
ever called it on itself.

`OrchestrationHooks` and `ProductHooks` excluded nothing their services would not; they existed
because both were registered *after* `RunService` was constructed. `ProductProcessService` is
built first, so it became a constructor parameter and its late-binding getter went. The
orchestration getter stays: `RunService` and `OrchestrationService` construct mutually, so the
late binding there is structural rather than incidental. Registration also collapsed from two
calls to one — `OrchestrationService` implements `StageOutputConsumer`, so the one
`registerOrchestration` now does both jobs.

**Consequence:** `workflow/types.ts` and `services/orchestration-service.ts` now reference each
other. The cycle is **type-only**, erased at emit, and `pnpm build` confirms it; there is no
runtime cycle and no `import/no-cycle` rule. Should a bundler ever object, `Pick<
OrchestrationService, …>` aliases would keep the collapse without the hand-maintained interface.

**Rejected:** collapsing all three (loses the reentrancy guard on the run's signal API); keeping
all three (two of them cost maintenance and bought nothing).

---

## 2026-08-20 — Every role remembers this project, and a run has exactly one closeout

**Context:** two stores were wrong at once. A handoff dies with its run, so every role began each
run knowing nothing about a project it had already worked on three times. Meanwhile a settled run
kept *two* accounts of itself — a closeout written by the Product Manager and a `RunArtifacts`
report written by the Orchestrator's review — the second a strict subset of the first.

**Each persona gets a private memory of the project**, stored beside its skill as
`<skills>/<id>.notes.md` and layered into that persona's prompt and no other. Merged, deduped,
capped at 40; a repeated note moves to the end, so the cap evicts what stopped being mentioned
rather than what was learned first. Facts about the **project**, not a summary of the run — the
handoff already carries that. *Rejected: one shared memory.* A QA Engineer's fact about flaky
selectors is noise in an Architect's context, and a shared blob cannot tell the Orchestrator *who
knows what* when it composes.

**The closeout belongs to the Orchestrator.** It consolidates the whole run; the Product Manager
only ever saw its own planning stage, so having it adjudicate asked one specialist to grade the
others. *Rejected: folding the closeout into the settle-time review.* The review only runs when an
orchestration exists and `routes/runs.ts` starts any pipeline directly, so a `full-delivery` run
launched from the run list would have silently stopped creating follow-up tasks. The closeout stays
a stage; only its persona changed.

**A stage is a closeout because of its step task.** `CloseoutConsumer` keyed on
`full-delivery`/`closeout`, so after `TASK-150` made teams composed per run, a composed team's
closeout was parsed by nobody — no follow-up tasks, no source tasks moved, no cleanup. It keys on
`closeout-feature` now, as `verify-feature` and `deploy-preview` already do, and only the
Orchestrator may take that step task. That guard is **structural**, not persona prose: the old
guarantee was an accident of the catalog (the Orchestrator was unlisted, so every pairing failed),
and trading it for an instruction would have been a real loss.

**A run has one closeout record.** `RunArtifacts`, `run.artifacts`, their renderer pair, their disk
directory and their UI panel are gone; a review of a run with no closeout stage writes a
`RunCloseoutRecord` with its task and cleanup fields empty. This is what removed the persona
instruction warning the Orchestrator not to contradict itself — two model-authored accounts can
disagree, one record cannot. `RUN_ARTIFACTS_SHAPE` survives as the base of `CLOSEOUT_SHAPE` and the
review block's wire format; the shape was never the problem, the second stored copy was. Runs
persisted earlier carry `artifacts`, read into `closeout` on load.

---

## 2026-08-20 — The rail groups an initiative's runs, and groups on the run's own claim

**Context:** `TASK-141`'s dogfood produced three runs of one initiative — the Orchestrator
conversation, a run that ended `needs_attention`, and the fix — and the rail rendered them as three
independent cards stacked by time. Nothing showed that run 3 existed *because* run 2 failed, or that
all three served one goal. The data was never missing: every run carries `orchestrationId` and every
orchestration keeps `runIds[]`.

**The surface was already decided.** The 2026-08-12 entry on the Orchestrator's dialog rejected a
sidebar panel and said where grouping would go if it were ever needed: *"If it does, the rail is the
place, not a panel."* This is that need arriving, and it is built where that entry said.

**Recorded because it changes how the evidence should be read:** `TASK-141` examined the flat rail at
three runs and found it adequate. The trigger here was the product owner asking for grouping on
2026-08-17, **not** the rail failing at that scale. Nobody should later cite this work as proof the
flat list broke — it did not. That is also why the scope stayed small: a header, nesting, a reason
line, and a chevron.

**Decision: group on `run.orchestrationId`, not on `orchestration.runIds`.** The two disagree for a
window, and the direction of the disagreement decides the rule. `useRunList` receives runs over SSE
the moment they exist; `useOrchestration` refetches on `orchestrationRefreshKey` and lands later. A
run therefore names its initiative before the initiative admits the run. Grouping on `runIds` would
drop such a run out of its group — and, since it is no longer loose either, off the rail entirely
until the refetch returned. Grouping on the run's own field cannot lose a run: one whose
orchestration has not loaded yet stays a top-level card for a frame, then joins its group. Showing a
run ungrouped is a smaller wrong than not showing it.

`runsForOrchestration` still reads `runIds` and is unchanged. It feeds the *thread*, which is a view
of one initiative the user already opened; there, `runIds` is the authority. The two functions answer
different questions and now say so.

**Ordering, both directions on purpose.** Items rank newest-first, so the rail reads as it always
has, and an initiative ranks on its most recent run rather than its oldest — an active initiative
should not sink because it started days ago. Runs *inside* an initiative run oldest-first, because
"which followed which" is a timeline and a timeline runs forward. This is the same split
`runsForOrchestration` already made for the thread.

**A run says why it exists, and the first one says nothing.** `startReasonFor` pairs a run with the
latest **launch-producing** turn at or before its `createdAt`. That is `start_run` *and*
`propose_team`, because a proposal starts a run on two paths — `approveTeam`, and the auto-approve
`launchUnchangedTeam` that `TASK-150` added — and neither records a turn of its own. Reading only
`start_run` was wrong twice over: the first work run of every initiative comes from an approved
proposal and so had no reason at all, and a proposal-started run that followed an earlier
`start_run` inherited that stale rationale on timestamp alone. Caught in PR review. A turn that
launches nothing — a question, a verdict — leaves the reason standing rather than blanking it.
`orchestration-service.ts` starts the composed run in the same handler that records the decision, so
the launching turn always precedes the run it produced. The run an initiative *began* as is the
Orchestrator conversation, which no decision started — it gets `undefined` and renders no reason
line. That is the honest answer rather than a gap to fill with the initiative's goal, which is
already on the header directly above it.

**Rejected: persisting which initiatives are collapsed.** Collapse state is local to `RunRail` and
resets on reload. Preferences would mean a settings key, a migration and a write on every chevron
click, for a rail that holds a handful of initiatives. Nobody has asked to keep a group shut. If
someone does, `SettingsStore` is where it goes.

**Rejected: putting the reason on `RunCard`.** "Why this run started" is a relationship between two
runs, not a property of one, and `RunCard` is also rendered for runs that belong to no initiative.
Giving it a second reason to change bought nothing, so the line renders in `InitiativeGroup` between
the cards instead.

---

## 2026-08-19 — A team is composed per run, and only a real change asks the user

**Context:** an initiative approved one team and reused it forever. `launch` read
`orchestration.composedPipeline` and re-ran the same roles, so a continuation needing a different
shape had only two levers: the task text, and `fromStage`. `TASK-141` watched run 3 exist purely to
fix one function while carrying the whole five-role team, skipping planning and design by *seeding*
rather than by being composed without them. Skipping is a workaround for composing.

**The code was never the obstacle.** `propose_team` is a full member of the decision union,
`extractOrchestratorDecision` parses a review's output against that same union, `refusalFor` refuses
only `start_run`, and a settle-time proposal already parked the initiative at `awaiting_approval`
without launching anything. What stopped it was one sentence of prompt: *"Do not propose a new team
here; the approved team is already composed."* The fix is mostly telling the model the truth.

**Approval happens only when the composition actually differs.** A settle-time proposal is composed
and compared against the running pipeline; identical means the run starts immediately, different
means the user approves first. This keeps the "approve the team, then let it run" model that the
dogfood validated and `TASK-148`'s scope note protects, while putting the human back in front of
composition whenever composition changes. Identical means identical where composition is concerned — a changed model tier is a real change,
because it changes what the run costs. A *rename* is not: `sameComposition` compares stages, so
identical roles under a new label run as the team already approved rather than quietly renaming it.

**A settle-time proposal carries a task.** On the opening turn the task is the goal; on a
re-composition it is "run *this* next, with *this* team". Without the field an auto-approved
proposal would have nothing to run, and `approveTeam` would have started the new team against the
initiative's original goal — which is what it did before this change, and would have been silently
wrong for every re-composition. A proposal that omits it is refused with a message saying so, the
way `NO_APPROVED_TEAM` already teaches.

**Teams are numbered so runs stay attributable.** `composedPipelineId` was `team-<orchestrationId>`
for every generation, so two teams' runs were indistinguishable. It now carries a generation, and
the name gains a `(team n)` suffix for the second onward — which means `run.pipelineName`, already
rendered on every run card, the status bar, the project drawer and child-run links, tells them apart
with no new UI. Each composed run already embedded its full `PipelineDefinition`, so the roles were
never lost, only unlabelled.

**Seeding across a team change stays refused.** `seedFromSettledRun` validates `fromStage` against
the pipeline being launched and refuses when the settled run never ran a preceding stage. A
re-composed team's ids do not line up, so `fromStage` fails — correctly. A new team starts from the
top, which is precisely the honesty run 3 lacked when it seeded past planning instead of being
composed without it. The prompt now says so rather than leaving the model to discover the refusal.

**`TASK-111` is not answered here.** Reusable *saved* teams is the same question from the other
side, and this composes fresh rather than recalling. It stays P3 and feedback-gated on `TASK-135`;
`start_run.teamId` remains declared and unread rather than half-wired to look like progress.

---

## 2026-08-19 — Two harnesses need two skill paths; the body belongs in one of them

**Context:** `.claude/skills/` and `.agents/skills/` held parallel copies of the same skills, and
only one copy ever got updated — `run-app` had drifted ~85%, still describing a retired `one-box`
pipeline and an `engines/Codex.ts` that never existed. `TASK-103` recorded the cost of that during
the `TASK-094` dogfood and `TASK-146` recorded it again from `TASK-141`'s pre-flight.

**The first answer was wrong, and the way it was wrong is the lesson.** `TASK-151` originally
deleted `.agents/` on the grounds that nothing read it: no reference in any `*.ts`, `*.mjs`,
`*.json` or `*.yml`, no `.codex/` directory, and Claude Code never offered `qa-testing` — which
lives only there — as a skill. Every one of those observations was true and the conclusion was
still false. **Codex scans `.agents/skills` from the working directory up to the repository root,
by documented convention, with no configuration file.** Convention-based discovery leaves no trace
in a repository, so grepping the repository can never disprove it. Absence of a reference is not
absence of a reader.

**Decision: keep both registration paths, single-home the body.** Each harness only discovers its
own path and neither can be redirected, so `SKILL.md` must exist twice. But the part that rots —
ports, endpoints, procedure — now lives once, in `docs/running-the-app.md` and
`docs/planning-a-task.md`, and both `SKILL.md` files are ten-line shims that point at it. The two
shims are byte-identical, so there is nothing left for them to disagree about.

**Rejected: a symlink.** Codex follows symlinked skill folders, so one real directory would have
served both. It cannot work here: this repository has `core.symlinks=false`, so git checks a
committed link out as a plain text file containing the target path, and the MSYS shell silently
creates a *copy* rather than a link unless `MSYS=winsymlinks:nativestrict` is set. The failure is
invisible to whoever commits it and broken for everyone else.

**Rejected: generating or mirroring the second copy.** Both work, and both add machinery to keep two
copies equal. Once the body is single-homed there is no second copy of anything that changes, so
the machinery has nothing to police.

**The standing rule.** A skill's registration may be duplicated as far as harness conventions
require; its content may not. Before concluding that a path is unused, name the mechanism that
would read it — a convention needs no configuration, and so leaves nothing to grep for.

---

## 2026-08-18 — A gate is a project's decision, and the shipped one is only a default

**Context:** `Setup → Gates` listed gates and could not change one. It computed a module-level
constant from `DEMO_PIPELINES`, filtered to stages carrying `gateAfter`, deduped by stage id — so
because both gated stages are called `intake`, it rendered exactly one card — and stamped it
`ENABLED` as a string literal. Nothing it showed was stored or read back, and the runtime read
`gateAfter` off the shipped constant, so there was no seam to store anything into.

**Decision, with the user on 2026-08-18: gates are not hardcoded.** A gate may be configured after
**any** stage, not only the ones that happen to ship with one. Preferences hold sparse overrides
keyed `"<pipelineId>:<stageId>"`, and resolution is `override ?? stage.gateAfter ?? false` in a
single pure function both the runtime and the screen call, so the two cannot disagree. A project
nobody has configured behaves exactly as before.

**Keyed per pipeline, not per stage id.** A stage id is not unique across pipelines — `intake`
appears in two — so a stage-id key would silently couple them. The screen groups by pipeline and
shows the pipeline id rather than a friendly name, which is enough to tell the two apart.

**Applied in `startRun`, never in the shared path.** `startRun` resolves a catalog pipeline and
`startComposedRun` takes one already built; both then call the same `startRunWith`. Putting the
override there and nowhere else is what keeps Orchestrator-composed teams untouched — they keep
deciding `gateAfter` per role, which is the flow the dogfood validated.

**A configured run stores its own definition.** `isCatalogPipeline` tested by *id*, so a
gate-configured `pm-dev-test` would still have counted as catalog and not been persisted — and
`pipelineForRun` would have re-resolved the unmodified pipeline on restart, giving a resumed run
whatever the config says *now* rather than what it started with. It now tests identity
(`findPipeline(id) === pipeline`), and `applyGatePreferences` returns the very same object when
nothing is overridden, so unconfigured runs still store nothing.

**The Orchestrator is told, not commanded.** A composed team gets the project's gate preferences as
a section in its context, keyed `pipeline:stage` so the advice stays unambiguous when one pipeline
gates a stage the other does not, and phrased as a preference it may follow. Making it deterministic would have
turned the "approve the team, then let it run" model into a mid-run pause the user did not ask for,
and the team already owns `gateAfter` per role.

**Rejected: adding the gates the product brief promises** (after Design, Release, before Deploy).
The screen's fault was lying about being configurable, not lacking gates. Shipping four new mid-run
pauses nobody asked for would work against the model the dogfood validated; now that a gate can go
after any stage, a user who wants them can add them.

---

## 2026-08-18 — A decision turn's cost belongs to the initiative, not to the run that triggered it

**Context:** the Orchestrator reviews a run when it settles, and that review is an engine turn
that costs money. Its usage was booked against `run.stages.at(-1)`, so a Tester's stage was billed
for a decision the Tester did not make — and because `run.stages` includes stages that never ran,
on a run that stopped early the cost could land on a stage the user sees as skipped. The
`TASK-141` dogfood saw the other half of the same fault: the initiative reported `$0.35` after its
first turn and still `$0.35` after two more decisions, because an orchestration carried no usage
at all.

**Decision:** an orchestration carries its own `usage`, accumulated with the same `addUsage` a run
uses, and **every** Orchestrator turn books there rather than on whatever stage it happened inside —
both the settle-time review and the question-mediation turns that broker a specialist's question.
The turn is the Orchestrator's work; an initiative's cost is now the sum of its runs plus its own
decisions, which is what the user is being asked to read. Splitting the two would have left the
same wrong-actor accounting in the half nobody had looked at.

**The booking must not depend on the decision being recorded.** `recordReview` refuses when the
orchestration has already stopped, and its caller answers by logging a warning — so routing spend
through it would have reproduced the same silence in a new place. `recordDecisionUsage` is
separate and unconditional: a turn that was spent is spent whether or not its decision survived.

**Rejected: folding it into the Orchestrator's own conversation run.** It needs no new field and
reuses the per-run cost display, but it mutates a second, already-settled run from the settled
run's workflow step, and a review is not a turn of that conversation.

**Rejected: keeping it on the work run under its own label.** That fixes the mis-targeting and
nothing else. The initiative would still have no cost of its own, which is the question the
dogfood actually went looking for.

**The review's log lines stay on the run.** A run's log stream is the only place they can go, so a
row can still appear against a stage that never executed. That is cosmetic once the money is not
there too, and moving it would mean inventing an orchestration log for one line.

---

## 2026-08-17 — A run installs tooling into the project, never into the machine

**Context:** with no native browser capability, the QA persona fell back to Playwright
exactly as `TASK-138` told it to — and reached that fallback with `npm install playwright`
and `npx playwright install`. A browser installer prunes builds it believes nothing
references, so that deleted `chromium_headless_shell-1228` from the user-level
`ms-playwright` cache: the build this repository's own e2e suite is pinned to. `pnpm e2e`
was broken on the host machine until it was reinstalled by hand. The agent did nothing it
was told not to do; the product gave it nowhere else to put a browser.

**Decision:** Isotopy points relocatable tool caches at the project.
`PLAYWRIGHT_BROWSERS_PATH` is set to `<project>/.isotopy/cache/ms-playwright` on **every**
engine child process, at the single place `adapter.run` is constructed — not only on the
QA stage, because a Developer adding a browser test prunes the shared cache exactly as
readily as a Tester does. The persona and the step task carry the matching policy: prefer
the repository's own Playwright, and never override the variable.

**Per project, not per run, and not one shared Isotopy cache.** The variable is both the
download target and the lookup path, so a per-run directory would mean re-downloading a
browser on every run, with no reliable sweeper — `tmp/` is only cleared on cancellation, or
when a Product Manager happens to name it during a full-delivery closeout. A single
Isotopy-wide cache would avoid that but lets two projects on different Playwright versions
prune each other. Per project pays one download per project and keeps projects from
interfering. The requirement was never that runs be isolated from each other; it is that a
run cannot reach the machine.

**This does not reopen the `CURSOR_CONFIG_DIR` rejection** recorded on 2026-08-10. That
was refused because relocating a *credential* root risks relocating stored auth, which
could not be verified without the CLI installed, and because CLI config files are read and
never written. A browser download cache carries no auth, is idempotently re-downloadable,
and is relocated by a documented environment variable rather than by writing someone's
config file. The standing rule survives intact: Isotopy still reads CLI configuration and
never writes it.

**The field is required, not optional.** Every run has a project and therefore a cache, so
an optional `toolCacheDir` would only have let some future call site opt out of the
protection without anything failing — and a run whose tooling is unscoped is exactly the
bug. The guarantee belongs in the type rather than in a test that describes a state nobody
should be able to construct.

**A home run caches inside its own workspace, not beside it.** The home project inverts the
usual nesting: its workspace is `<dataDir>/runs/<id>/workspace`, so a cache at
`<dataDir>/cache` sits *above* the only directory Codex's `--sandbox workspace-write` lets
an agent write. The install would be refused, and a QA stage with no native browser would
be left with no working fallback — which contradicts the persona rule that Playwright must
still prove the behaviour. Protecting the machine is not worth a stage that cannot finish,
so the home project's cache goes under the workspace. It costs one download per home run,
against a scratch workspace that is disposable by design.

---

## 2026-08-17 — Pre-existing dirt is subtracted on content, not on a status code

**Context:** the change set's git path subtracted what was already dirty at baseline by
comparing *status codes*. A file already ` M` when the run started is still ` M` when it
ends, so a run that rewrote it reported nothing. The `TASK-141` dogfood is the evidence:
run 3 existed only to edit `src/main.ts`, did edit it, and reported "1 created" with no
edits at all. Every run after the first in an initiative starts against a dirty tree, so
`TASK-126`'s bar was under-met from run 2 onward — exactly when the user most needs to see
what a retry actually did.

**Decision:** a blob oid is recorded for each file dirty at baseline, and again at capture
for the ones still dirty, and the subtraction requires the content to match as well as the
kind. **Only the baseline-dirty set is hashed**, not the index: a *clean* file the run
edits becomes ` M` and was always reported correctly, so hashing everything would cost a
full-repo pass on every run start and catch nothing more. The cost is one extra
`git hash-object --stdin-paths` per side, sized by the dirt rather than by the repository.

**A missing hash subtracts, it does not claim.** Only two blobs that positively disagree
promote a file to the run's work. A blob absent on either side — a baseline written before
this shipped, a `deleted` entry with nothing on disk, a failed hash — falls back to the
status-code behaviour. The opposite default would have made the first run after an upgrade
attribute every file the user had dirty to the agent, which is the failure this subtraction
exists to prevent.

**One unhashable path must not take the others with it.** Because a missing blob subtracts,
an all-or-nothing hash step would have restored the original bug in full whenever a single
path could not be hashed — and a dirty submodule is exactly that path: it reports as ` M sub`
and `hash-object` answers `fatal: Unable to hash sub`. Two things keep the failure local. The
paths are filtered to regular files before hashing, so a gitlink, a directory or a broken
symlink never enters the batch; and the oids git did emit are paired positionally with the
paths it was given, so a batch that dies partway keeps what it produced instead of being
discarded with the process's exit code.

**`RUN_CHANGE_BASELINE_VERSION` deliberately stays at `1`.** The field is optional and
additive, so an in-flight run's baseline still parses. Bumping the literal would fail its
validation instead, and `readRunChangeBaseline` answers a validation failure with
`undefined` — the run would then report *no* changes at all, which is worse than the bug
being fixed.

**Rejected: reusing the snapshot stamps.** A second workspace walk at capture would let
`diffSnapshots`' `(mtimeMs, size)` comparison answer for the git path too, with no git
plumbing at all. It was rejected for costing a 20 000-entry walk where hashing costs one
process, and for reporting a false edit whenever a formatter or an install touches a file
without changing it.

---

## 2026-08-13 — Isotopy is the complete product name, not a backronym

**Context:** the old name expanded to *Artificial Development, Human Directed*. The rename
needed one stable product identity before visible copy, code contracts, protocols, and
filesystem paths could move in separate green changes. Forcing another expansion would make
the wording drive the product rather than describe it.

**Decision:** the product name is **Isotopy**, with no expanded form. Its tagline is **“The
last mile for your ideas — turning them into working businesses.”** The short description is
an open-source, local AI development team that turns ideas into working products and keeps
them evolving. Visible surfaces adopt that identity first; technical identifiers and
physical paths remain unchanged until their later Milestone G cutovers.

**Rejected:** inventing a replacement backronym. It would preserve a constraint that belongs
to the former name and make otherwise plain product copy harder to understand.

---

## 2026-08-12 — A rejected decision informs the next attempt; a blocked one stops the loop

**Context:** two failures of the decision loop, observed the same day in the `dogfood`
project. An invented `executionPolicy` was rejected whole and the initiative died on one
string — `decisionError` was written and read by nobody but the status bar, and a restart
re-ran the stage against the frozen `run.task`, which never mentioned the rejection. And
runs `#10`–`#13` re-ran one composed pipeline four times, every one blocked because no
browser was available to QA, costing 3.44M input tokens: the Orchestrator was asking for a
verification-only re-run *in prose* each time, because `start_run` could not name a stage
and `launch` always began at the pipeline's first.

**Decision — the injection point is the workflow input, not the run record.**
`InputExtras.task` overrides `run.task` when `buildInput` assembles the workflow input, and
`OrchestrationHooks.restartTask` is what supplies it. `run.task` stays frozen: it is the
record of what the run began as, and rewriting it would make the stored history depend on
how many times a decision was rejected. The review context carries the same rejection, so a
re-reviewed run does not repeat the mistake either.

**Decision — a stage-targeted `start_run` starts a fresh run seeded from the settled one**,
rather than restarting the settled run in place. Restarting in place was the cheaper reach
(`restartRun` already seeds upstream outcomes and outputs) but it overwrites the very
evidence that justified the decision — the logs and outputs of the run that failed — and it
refuses a cleanly completed run, which is exactly the verification-only case. A fresh run
also gives the rail an honest second entry. The cost is that a carried stage would sit
`pending` forever, so `applySeededStage` marks a still-`pending` carried stage `skipped`
with a log line naming its source; the `pending` guard is what keeps a restart's real
upstream statuses untouched.

**Decision — the spin guard is derived, not persisted, and counts only blocked runs.**
`blockedLaunchRefusal` reads the tail of `Orchestration.turns` for consecutive `start_run`
decisions whose reviewed run ended `needs_attention` or `failed`. Three is the ceiling.
Counting *every* auto-launch would have capped a healthy initiative at three runs and broken
`continue_milestone` on an auto-running milestone at its fourth feature — the observed spin
was `start_run` against an unchanged environment, and that is what the rule names. The
prompts carry the primary fix (an unmet environment precondition is an `ask_user`, not a
verdict to re-run); the cap is the backstop for when the model does not follow them.

**Decision — a decision that cannot be acted on is refused before it is accepted.** The
first cut validated at launch time, inside the `act` catch that already recorded
`decisionError`. That is a dead end: `recordReview` has stored the decision as a turn by
then, so `hasTurnFor` discards the corrected decision of any re-review and `settledRuns`
declines to settle the run again — the initiative cannot recover from a refusal at all,
which is the failure this task exists to remove. `refusalFor` therefore runs at both
acceptance points, `consume` and `recordReview`, and a refusal records the reason with **no
turn**. Recovery is then the ordinary one: restart the run, and the rejection rides into the
next prompt.

**Decision — an initiative parked on the user gets its own answer channel.** Fix 3 tells the
Orchestrator to ask rather than re-run, which made an existing gap load-bearing: a question
raised by a lifecycle review reached the user as read-only text, because the run it reviewed
was terminal and `POST /runs/:id/messages` refuses a finished run. The only response
available was starting a new initiative, which supersedes the old one — the goal, the
approved team and every artifact discarded to answer a question. `POST
/orchestrations/:id/messages` answers the *initiative*: it routes to an `asking` stage when
one exists, and otherwise opens a fresh conversation turn carrying the goal context, the
approved team, prior run digests, the question and the answer. Rejected: keeping the
reviewed run alive in `asking` so the run-level channel could serve it — the run is over,
and holding a durable park open for a question about work that already finished puts the
lifecycle at odds with the record.

**Decision — a carried stage must exist in the settled run.** The run a decision is taken
against is not always of the composed pipeline: a conversation turn, a solo run, or a
milestone run can all be the settled run when a team is already approved. Seeding a stage
that run never had would mark a role `passed` with no output and let the roles after it
proceed as though the work were done, which is a worse failure than the one `fromStage`
exists to fix. Missing stages are named in the rejection.

**Rejected:** an automatic retry of a rejected decision — it spends a turn and hides a real
prompt bug behind it, and what it buys collapses once the next attempt is informed anyway.
A distinct stage outcome for "blocked on the environment" — it would touch `STAGE_OUTCOMES`,
the verdict parser, the UI and every step task that can be blocked, to express something the
review prompt can already state. Folding `interpretDecision` into `consume` — the two sites
are explained in the 2026-08-07 entry below; the rule kept is that no third site builds that
sentence. And loosening the decision schema: `.strict()` and the closed enums are what stop
an invented persona or a stage id that escapes the run directory. An invalid decision stays
invalid — it just stops being terminal.

---

## 2026-08-12 — The Orchestrator is a conversation, not a tab

**Context:** an orchestration run opened on an `Orchestrator` tab and put `Chat`
beside it. The team proposal, the latest decision and the child runs lived on one;
the conversation those decisions were about lived on the other. The product's own
copy admitted the seam — `LatestDecision` told the user to *"Answer in the Chat tab
to continue."* A panel that has to point at another tab to be usable is one panel
too many.

**Decision:** an orchestration run has a single dialog. `runThread` merges the
orchestration's turns into the chat transcript on one timestamp ordering, the team
proposal becomes an inline card carrying its own **Approve & start**, and child runs
are linked where they were started. `RunTab` loses `"team"`; `OrchestratorPanel` is
deleted.

Two consequences worth stating, because both look like omissions:

- **A decision that already reached the chat gets no card.** `ask_user` arrives as a
  `run.messages` question answered by the composer directly beneath it. Rendering the
  decision as well would print the question twice — so the merge deliberately emits
  nothing for it, and nothing for `start_run`, whose child-run link already says it.
- **One Stop, not three.** `TeamController`'s `stop-initiative` already existed and is
  bound to the same handler the panel's button used. The inline card carries approval
  only. The task text asked for a Stop on the card; a second control in a scroll region,
  for an action that is always available in the bottom bar, is worse than the asymmetry.

**Rejected:** keeping a slimmer panel for the run timeline. The rail is a flat list
with no orchestration grouping, so it does not answer "what else is in this initiative"
— but an inline, chronological link answers it better than a sidebar ever did, and
`TASK-128`'s dogfood is where a real need for the overview would show up. If it does,
the rail is the place, not a panel.

**Interacts with `TASK-139`:** that task observed *"nothing reads `decisionError` but
`OrchestratorPanel`"* and plans to feed it back into the model. Its UI reader moved to
`RunStatusBar` rather than disappearing.

---

## 2026-08-12 — The harness and the model are asked, and default to the cheap end

**Context:** neither was ever put to the user. `HomeComposer` printed
`Engine: … — change in Setup` and posted whatever Setup held, so the two things a run
spends money with were decided somewhere the person starting it was not looking. The
user's report was that the Orchestrator changes harnesses; it does not — it proposes a
per-role `modelTier` and nothing else. The real gap was the missing question.

**Decision:** both are controls on the start screen, seeded from the project preference
and written back through it, so every start path keeps reading `preferredRunOptions`
unchanged. The default is per engine — `auto` for Cursor, whose own routing is the cheap
path, `fast` elsewhere — because a single global default cannot express "cheapest" when
a tier names different models per harness. Switching harness re-defaults the model for
the same reason, and either choice clears that engine's exact-model pin, since
`run.model` outranks a tier outright at execution and a stale pin would silently beat the
tier just chosen. A pin set in Setup is still honoured, and the composer now says so
rather than hiding it.

**Consequence:** the `orchestrate` stage is pinned to `deep`. It reasons about every
other stage, and an economical run default would otherwise put it on the weakest model.

**Rejected:** removing the Orchestrator's per-role tiers. It proposes over the user's
explicit choice now rather than over an invisible default, which is what `TASK-115`
wanted in the first place.

---

## 2026-08-12 — A stage names an action; the persona comes from its skill

**Context:** the stage box printed a persona from `agentForStage(stage.id)` — a table
keyed by **stage id** — and a label taken straight from the pipeline, where every
shipped label was itself a job title. The two agreed redundantly in static pipelines
("Software Architect / Software Architect") and disagreed outright whenever the
Orchestrator invented an id, which it does freely: it is given catalogs for `skill` and
`stepTask` and no list of legal ids. A role of `{id: "design", skill: "product-designer"}`
rendered as *Software Architect*, because `AGENTS["design"]` is one.

**Decision:** the persona is keyed off `skill`, which `team-composition.ts` already
validates against `PERSONA_IDS`, so an invented id can no longer rename the person. The
label names the work — `Scoping`, `Architecting`, `Implementing`, `Verifying` — and
`orchestrate.md` says so with an action-phrased example, because the model copies the
example. Both directions are guarded: `pipelines.spec.ts` fails if a shipped stage names
a persona with no `AGENTS` entry or labels itself with a job title, and
`orchestrate-assignment.spec.ts` fails if the assignment's example ever labels a role
after its worker again.

**Accepted cost:** `architecture` and `review` share a persona and so now share a glyph.
The action label distinguishes them, and `specColor` still keys on stage id, so they keep
distinct colours.

**Not migrated:** labels already written to disk. A run composed before this keeps the
job title the Orchestrator gave it; only its persona is corrected.

---

## 2026-08-11 — A model preset belongs to a role, not to a run

**Context:** a run picked one tier and every stage used it, so the Product Manager
restating approved scope reasoned as hard as the Architect choosing the design, and
dropping a run to `fast` to save money took the Architect down with it. `TASK-129`
made this fixable by replacing per-stage *model ids*, which turn over monthly, with
five presets a person and an agent can both reason about.

**Decision:** the preset lives on the **role** the Orchestrator proposes, travels
into the composed pipeline as `StageDefinition.modelTier`, and is seeded onto
`StageState` at run creation. A stage resolves `stage.modelTier ?? run.modelTier`,
so the run's tier remains the default and every existing pipeline behaves exactly as
before. The user sees and can change each role's preset in the team-review card
before approving, which is the only moment the whole team is visible at once.

**Rejected — a per-persona default table.** Mapping `software-architect → deep`,
`tester → fast` would make the feature work without the Orchestrator cooperating, and
would guess a cost trade-off on the user's behalf for personas they never configured.
An unset role follows the run, which is what it did yesterday.

**Rejected — presets on the static pipelines.** `pm-dev-test` and `full-delivery` are
shared constants; a tier authored into one applies to every run of it forever. The
field exists on `StageDefinition` so a static pipeline *could* carry one, but none
does.

**Consequence for limits:** a limit still parks the stage and waits for the reset,
and a tier only ever changes when the user asks for it in that dialog — nothing is
re-rung automatically once a run has started. But the user's choice has to reach the
stage they are unblocking: a blocked role pinned to `deep` would otherwise resume on
`deep` and hit the same limit again, because the fallback prefers the stage's own
preset over the run's. `resolveLimit` therefore writes the chosen tier to the blocked
stage as well as to the run. Later roles with their own preset keep it; later roles
without one follow the new default. For a pipeline where no stage carries a preset —
every static one — this is identical to the old behaviour.

---

## 2026-08-11 — The product runs once per project, is shown in an iframe, and is driven by the agents' own browsers

**Context:** `TASK-138` had to show a user the thing a run built. The repo had no
embedding precedent — no iframe anywhere, no desktop shell — and dev servers
commonly refuse framing. The task's premise was that one surface could serve both
the user and an agent, since "showing the user and letting an agent look are the
same seam."

**Decision:** the shared seam is the **process and its URL**, not the rendering
surface. `ProductProcessService` owns one product process at a time, tagged with
its project, started only when asked. The UI frames its URL in an `<iframe>`; the
QA stage is handed the same URL through an `## Environment` block and drives it
with whatever browser capability its CLI has. This is what the established
harnesses converged on, recorded in [`embedded-preview.md`](./embedded-preview.md):
VS Code and Cursor frame localhost directly, while Cursor, Codex and Claude Code
all drive over CDP rather than through the frame.

**Rejected — a reverse proxy that strips framing headers.** It would make the
iframe work everywhere, and nobody ships it: VS Code's own guidance is that there
is no client-side workaround, and localhost dev servers do not set those headers
in the first place. It would also reverse the decision below that the server stays
a pure API. Instead the server preflights the ready URL once and reports the exact
header that refused, so the failure is legible rather than a blank rectangle.

**Rejected — ADHD hosting a Playwright Chromium and streaming it to the UI.** This
is the one design where a single mechanism genuinely serves both consumers, and it
costs a server runtime dependency plus a browser download at install. Milestone F's
rule is to stop adding, and the agents already have browsers.

**Consequence for QA:** the persona no longer forbids agent-native browsers, and
`TASK-095` is answered rather than deferred — the half of it that survives is the
policy, now written into the persona: where no browser capability exists,
Playwright is the complete fallback and the CI authority. The step task also stops
telling QA to start servers and pick ports, which is the failure `TASK-117` hit
from the other side.

**Consequence for the lifecycle:** the product is **project**-scoped, not
run-scoped. This deliberately overrides `TASK-138`'s own wording, which asked for a
run switch to reach the kill: an initiative's child runs would then each kill the
preview the user was watching. They share one process instead, and a completed run
that changed files *restarts* it, so the preview is never the previous build. It
dies on explicit stop, on exiting by itself, on a start for another project, on
project switch, and on the `SIGINT`/`SIGTERM` hook this added to `index.ts` — which
had no shutdown path at all before.

**Project switch is enforced on the server, not in the browser.** `POST
/projects/:id/activate` stops a product belonging to any other project, and
`DELETE /projects/:id` stops one belonging to the project being removed. A client
that crashes, is closed, or never runs cannot leak a process this way, which a
cleanup living in a React effect could.

**Every lifecycle operation is serialized.** Start, stop, restart and the
post-run refresh run through one promise queue, because two of them interleaving
at any `await` can each conclude that nothing is running and launch a second
process that then holds the port invisibly. This is also what makes the
idempotent-start promise in the QA prompt true under concurrency rather than only
when the UI happens to disable its button.

---

## 2026-08-10 — Blast radius is delegated to each CLI's own reviewer, not brokered by the Orchestrator

**Context:** every engine ran effectively unrestricted, and the one alternative,
`acceptEdits`, degraded back to unrestricted on two of three engines. `TASK-138`
is about to start long-lived processes on a stranger's machine, so the system
needed an opinion about blast radius first.

**Decision:** a third permission tier, `autoReview`, asks each CLI to use **its own**
auto-review mode — Claude's `--permission-mode auto`, Codex's documented
`approvals_reviewer = "auto_review"` over a `workspace-write` sandbox — and falls
back to today's `skip` behaviour, with a stage-log notice, only where a CLI has no
such mode at all.

**How support is decided differs per engine, on purpose.** Claude's auto-review is
a *flag value*, and an unknown value is a hard CLI error, so it is probed from
`--help`. Codex's is *configuration* passed with `-c`, which has no help listing to
read and is tolerated when unrecognised — and its fallback is safe by construction,
because a build that ignores the key still runs sandboxed. Probing where a wrong
guess breaks the run, and relying on graceful config degradation where it cannot,
is the rule; a uniform mechanism would have meant either a needless subprocess or
an unsound guess.

**Rejected — gating Codex on a `--approve-for-me` flag**, which is what this change
originally shipped. The flag appears in third-party write-ups but is in neither the
CLI reference nor the 0.144.6 binary; the binary's own help text documents
`approvals_reviewer` and its `auto_review` subagent. Gating on it meant a requested
*safety* mode silently became `--dangerously-bypass-approvals-and-sandbox` — strictly
wider blast radius than the user asked for. Caught in review on PR #38.

**Rejected — routing approvals to the Orchestrator**, which is what the task
originally asked for. Only Claude offers a live channel (`--permission-prompt-tool`,
which requires bidirectional stream-json); `codex exec` has no approval channel at
all, and `runSubprocess` writes stdin once and closes it. Delivering it would mean
a new park/resume state and a rewritten subprocess seam inside the milestone whose
rule is *stop adding*. The channel remains buildable later; nothing here forecloses it.

**On degrading to `skip`:** it remains the fallback where a CLI genuinely has no
auto-review, because it is the mode the user would otherwise have chosen. It is
*not* used where a safer expressible option exists — the Codex correction above is
exactly that case, and the rule it settles is that a degradation must never widen
the blast radius beyond what was requested.

**Rejected — reaching Cursor's Auto-review.** It is real, but selected by the
`approvalMode` key in `~/.cursor/cli-config.json` rather than by a flag. Writing it
would break the standing rule that CLI config files are read, never written, and
would **persist past the run** — a crash mid-run leaves the user's global Cursor CLI
reconfigured by ADHD. Relocating `CURSOR_CONFIG_DIR` instead risks relocating stored
auth, which cannot be verified without the CLI installed. Cursor reports
`unsupported` as a constant and says so.

---

## 2026-08-10 — What a run changed is measured, not reported by the agent

**Context:** a finished run said what it did in prose and left the files somewhere on
disk. Nothing in the system tracked file changes — no git integration, no watcher — and
the only file data was `listWorkspaceFiles`, a capped snapshot of *everything* in the
workspace, three clicks deep behind the Artifacts tab. `TASK-126`'s bar is that this works
for **every run, on every engine, with no project configuration**.

**Decision:** the change set is **measured by the server**. A snapshot of the project —
path, size and modification time — is taken when a run starts and again when it settles,
and the difference is what the run created, edited and deleted. When the project is a git
repository the snapshot baseline is kept but git answers instead, because it respects
`.gitignore` and, crucially, sees work the agent **committed**: a status-only reading of a
repository where the agent committed everything reports nothing at all. Both layers are
captured at baseline and the git one wins at read time — the same first-wins shape as the
model roster's `live → config → static`.

**Rejected: engine tool logs.** `StageActivity` already carries `Write`/`Edit` paths and
costs nothing to read, but only Claude's protocol adapter is known to emit them. "Every
engine" would have been a claim about Codex and Cursor that nobody had checked.

**Rejected: asking the agent to declare the files.** The `adhd-run-artifacts` fence is
optional, is only produced for orchestration runs, and is prose. A run's own account of
itself is the thing being replaced, not the thing to build on.

**This does not reopen "the run view is derived from the log."** That rule governs the
*conversation* — prose, tool rows and notices all come from one derived ordering, and
nothing appends agent text to a second store. A change set is a run-level record like
`closeout`, `release` and `deployment`: measured once when the run settles, written where
those are written, and never re-derived from a log line.

**Consequence for the run lifecycle:** `runCompleted` became asynchronous and captures the
change set *before* it emits `run.completed`, because the UI stops the run's event stream
on that event. The client refetches the run once when it lands — a change set cannot arrive
through the event-sourced projection, and capturing after the emit would race the refetch.
Abort and interrupt keep their synchronous emit and capture during settle, so an aborted
run shows its changes when reopened rather than instantly.

**Revealing the folder is a server capability.** "One click away" is literal: `POST
/runs/:id/reveal` opens the run's workspace in Explorer, Finder or the freedesktop opener
through `runSubprocess` with an argument array. The endpoint takes **no path** — it
resolves the folder from the run it is scoped to, so no client-supplied path, absolute or
relative, ever reaches an OS shell.

## 2026-08-10 — Deploying a preview is ADHD's job, not an agent's

**Context:** Full Delivery carried an SRE box whose step task told an agent to find the
project's deployment configuration, run it, verify it, and report. There was no such
configuration to find, so the box existed to end in `SKIP`. Milestone D had accepted that
deliberately — **ship the seam, not the automation**: keep the `release` and `deploy`
stages, let them report `VERDICT: SKIP` when nothing is configured so the pipeline
degrades honestly, and render no capability the product does not have (no deploy-URL panel
that is always empty). Removing the two stages until automation landed was rejected then;
this entry is where that seam was finally filled. Showing a user the product a run
built needs the same kind of fact — a start command, a readiness check, a port strategy —
which is why `TASK-138` will read the `ui` block rather than inventing its own.

**Decision:** project-owned commands live in `.adhd/automation.json` — validation, UI
start, preview and production deployment — as executable-plus-argument arrays with
per-platform overrides, never shell strings. ADHD executes the preview deployment itself:
any stage whose step task is `deploy-preview` runs deterministically from that
configuration, and no engine turn is spent. Keying on the **step task** rather than on
`pipelineId === "full-delivery"` is deliberate — an Orchestrator-composed team that gives
a role the same assignment gets the same deterministic behaviour, which is what makes the
step task the unit of meaning rather than the pipeline.

**Rejected:** letting the agent run the deploy command. It reads a configuration it did
not write, in a stage that costs money to reach, to do something with a blast radius —
and every failure mode becomes a prompt-engineering problem instead of a typed one.

**Rejected:** re-implementing a quality gate for deployment. The `delivery` execution
policy already suppresses `release` and `deploy` unless the run is whole; a second gate
would be a second thing to keep true.

**Production stays human-gated:** outside Full Delivery, outside milestone autorun, behind
a browser confirmation *and* a literal `DEPLOY PRODUCTION` string in the request body.
Preview automation is only safe to turn on because production cannot be reached this way.

## 2026-08-09 — A model choice is an intent, resolved per engine, not an id

**Context:** `TASK-117` lost a run to a model the account rejected — the shipped Codex
list offered `gpt-5-mini`, a ChatGPT-account login answered `400 — not supported`, and it
surfaced mid-stage after the user had waited. The first fix made rosters honest: resolve
live where the CLI allows it, mark bundled entries unverified, refuse an unoffered id
before a stage runs. Driving the app then showed the honest roster was still the wrong
surface — **Cursor's live list is 194 entries**, and every id in it turns over monthly.
Neither a first-time user nor an Orchestrator composing a team can track that; both can
say how much thinking a step needs.

**Decision:** what the system stores and reasons about is a **preset** on one effort
ladder — `auto · fast · balanced · deep · max` — resolved to a concrete `(model, effort)`
pair per engine at stage-execution time. The ladder borrows the CLIs' own
`low·medium·high·xhigh·max` vocabulary, which does not churn the way model names do, and
effort is a genuinely separate axis on two of three engines (`--effort` on Claude,
`-c model_reasoning_effort` on Codex; Cursor bakes it into the id). A preset that cannot
be satisfied *degrades* to Auto, which a raw id can never do — substituting is legitimate
precisely because the user asked for an intent. Setup always shows what the preset
resolved to, so the abstraction is never a black box. The three-layer roster
(`live → config → static`) stops being the UI surface and becomes what resolves and
validates a preset. A preset is engine-independent, so it survives switching harness; an
exact id stays available as a per-engine override behind a disclosure, and an override the
roster rejects is still refused at run start with a message naming Setup.

**Rejected:** *presets including a "coding" tier* — a real distinction on Cursor alone, and
on Codex and Claude it would be a label with the same model behind it, reintroducing the
per-engine divergence this task exists to remove. *A one-shot verification probe* to prove
an id works on the user's plan — it spends real tokens on every check, and Auto plus an
unverified badge covers the same ground for free. *Keeping the per-engine id bag as the
primary choice* — the stored value would go stale exactly as before, and per-step
assignment (`TASK-115`) would gain nothing to reason about.

**Known limits, stated rather than papered over:** the ladder is a maintained snapshot too,
just 3 engines × 4 rungs instead of 194 ids, and a wrong rung silently spends more than
intended — which is why the resolved model is always on screen. Codex's accepted effort
values above `high` are unconfirmed, so Max shares Deep's effort there. Cursor's config
file holds a CLI-managed object with a `"default"` sentinel, so hand-pinning an unlisted id
there is not a real escape hatch — it is unnecessary exactly where it does not work, since
Cursor is the one engine with a complete live roster.

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
closeout as authoritative rather than recomputing it. The file that held both was
dissolved into its callers, because three of its five exports served the Orchestrator
path and its name claimed otherwise: `applyProductManagerCloseout` and the closeout
files it writes now live in `services/consumers/closeout-consumer.ts`, the run-directory
artifact and cancellation writers in `services/run/run-service.ts`, and the milestone
summary and prior-closeout context in `services/milestone-closeout.ts`.

**Rejected:** deleting the `closeout` stage and letting the Orchestrator review be the
only closeout. That also removes source-task transitions, run temp cleanup, and the
written `closeout.md` from every full-delivery run — a product change wearing a
refactor's clothes.

---

## 2026-08-07 — A consumer that cannot use a stage's output is what fails the stage

**Context:** a `milestone-planning` run on Codex returned prose instead of a fenced
`adhd-milestone-plan` block. `MilestonePlanConsumer` recorded `approvalError` correctly,
and the stage still passed — the run completed and the Orchestrator's review reported
work as delivered. `StageOutputConsumer.consume` returned `Promise<void>`, and consumers
ran *after* `interpretEngineResult` had already fixed the outcome, so a consumer could not
influence the status of the stage whose output it had just rejected. The same swallow was
live on `full-delivery`: its own test fixtures fed the closeout stage prose, and four
tests asserted a green run over an empty closeout.

**Decision:** `consume` returns `StageOutputRejection | undefined`, and
`settleStageOutput` turns a rejection into `NEEDS_ATTENTION` with the consumer's reason.
**Only a `PASSED` outcome is downgraded** — `interpretEngineResult` returns no output for
three different reasons, and widening past `PASSED` would run the closeout consumer on a
*crashed* stage and write a "Product Manager produced no closeout text" artifact for a run
where the agent never returned. Empty output reaches the consumers instead of
short-circuiting on length, so usability is judged by whoever claims the stage. The
closeout splits report errors from side-effect errors, and that split is deliberately
**not persisted** — `RunCloseoutRecord.validationErrors` keeps its exact current content.
A rejected stage keeps the verdict the agent claimed: the contradiction between a claimed
`PASS` and a rejected artifact is the evidence a reader wants.

`OrchestrationService.consume` returns a rejection that is unreachable today — a
`decision`-protocol stage can never arrive at `PASSED` with unparseable output, because
`interpretDecision` has already caught it. It exists so the seam is uniform; do not go
looking for the test that covers it.

**Rejected:** a `claims()` predicate on the seam — a second thing to keep in sync with the
guard already at the top of every `consume`. Persisting `sideEffectErrors` on
`RunCloseoutRecord` — a core schema change, a `CloseoutPanel` change and every historical
`closeout.json`, to express something no reader needs. Downgrading inside
`captureStageOutput` — that would make the run service decide stage outcomes, which is
`stage-execution`'s job. Failing on task-board or cleanup errors — those are the board's
problem, not the report's. Treating an omitted source task as fatal — `validateSourceTaskOutcome`
already repairs it into `unresolvedTaskIds` before recording it, so failing on it would
turn a complete, correctly-recorded closeout red: this bug with the sign flipped. And
downgrading `SKIPPED` — an explicit skip is stated intent, not a silent swallow.

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

Artifacts were a `RunArtifacts` type and the closeout its task-board-coupled superset through a
shared `RUN_ARTIFACTS_SHAPE`. **Superseded 2026-08-20** — the two records collapsed into one
`RunCloseoutRecord`, since a subset stored beside its superset only invited the two to disagree.
See the 2026-08-20 entry.

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