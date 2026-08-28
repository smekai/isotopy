# Next

## TASK-156: Milestone I — Induction: a product the team carries on its own
**Priority:** P1 | **Tags:** core, server, ui, engine, testing, milestone-i
**Updated:** 2026-08-21 12:00

Induction proves a base case, then proves each step follows from the last. The base case is a
product built once with a human watching. The inductive step is the team building the next
increment without one. If the step holds it holds for every increment after — and that is the
claim this product has never tested.

**Opened 2026-08-21**, replacing *Milestone I — Isomorphic* (`TASK-153`, retired to
`REJECTED.md`). **Scope settled the same day** with the product owner: the mechanism below is
decided, so it is written as tasks rather than held as candidates.

### Why the evidence base is not enough

F, G and H were all inward-facing — stabilise, rename, react to feedback — and `TASK-134` closed
H admitting the feedback it was gated on never arrived. What Isotopy has instead is three
dogfoods: `TASK-094`, `TASK-128` (`SKIP`) and `TASK-141` (`PASS`). Every one was **one feature, on
a target that no longer exists** — `TASK-142` exists because `TASK-128`'s target was deleted.

None of them answers the question the product is selling: *fast first version — then built for v2,
v3, and everything after.* That second half is the wedge in
[`docs/product-brief.md`](../docs/product-brief.md), and it has never been measured, because every
increment begins with a human clicking.

### The loop

A recurring, clock-driven task runs on a schedule. It carries **one task and a fixed small team**
— usually one stage, one persona — not an Orchestrator conversation. One such schedule ships built
in: *check the board, and if nothing is running, start the next thing.* It is **off by default**.
Users add their own; product variants may ship their own.

A scheduled run is an ordinary run. It calls `ensureActive` like every other, so it is **owned and
reviewed by the Orchestrator on settle**, and closeout plus artifact capture are the normal run
lifecycle. The schedule is not a second path into run creation; it simply is not a conversation.

### The Orchestrator still dies, and that is the design

`terminate()` is one-way, and `ensureActive` then builds a fresh Orchestration — empty `turns`,
empty `runIds`, the scheduled task's text as its goal. Each episode therefore starts without the
previous one's digests, because `priorArtifacts()` filters by `orchestration.runIds`.

That is intended, because **the project's memory was never in the Orchestrator**:

| Memory | Where it lives | Survives |
| --- | --- | --- |
| What work remains | The task board, markdown in the repo | Yes |
| What each role learned | `<skills>/<id>.notes.md`, per persona (`TASK-113`) | Yes |
| What each run produced | `.isotopy/runs/<id>/`, closeout records | Yes |
| Standing intent | **A schedule** — a persisted, recurring intention | Yes |

So the Orchestrator is an **episode handler**, not a long-lived supervisor, and a schedule is what
carries intent between episodes. This is why a standing goal never needed a home on the
`Orchestration` record: the recurring task *is* the standing goal, in a form the system already
executes.

**The accepted cost, recorded rather than smoothed over:** an episode cannot cite the previous
episode's artifacts directly; it reads the board and the persona notes instead. If that turns out
to matter, the evidence comes from the unattended stretch, not from arguing about it now.

### Scope, in order

1. **`TASK-154`** — the adapter capability catalog, Cursor session resume and permission modes,
   Claude `loggedIn`. First, and not for tidiness: Cursor discards every session id, so every
   follow-up turn starts cold and silently. Unattended scheduled runs are exactly where that goes
   unnoticed.
2. **`TASK-159`** — schedules: a recurring task with a fixed team.
3. **`TASK-160`** — schedules in the rail.
4. **`TASK-161`** — the built-in board poller, shipped disabled. This closes the loop.
5. **`TASK-162`** — a step names its agent, its tools and what it needs, and work the team
   may draft but not start. Rescoped 2026-08-26; depends on TaskPlanner's `TASK-046` publishing
   its MCP server as a package. Lands before the poller is enabled.
6. **`TASK-163`** — what Isotopy is for, restated.
7. **`TASK-157`** — the arcade, built by the finished mechanism and then carried by it.

Left unwritten on purpose, because they are scoped from evidence this milestone has not produced
yet: the deploy target, the measured unattended stretch, and the MVP gap list that closes the
milestone and opens the launch.

**A schedule is a record plus a ticker, not a durable workflow.** `step.waitForSignal({ timeoutMs })`
is right for one wait of known length — a plan-limit reset — and wrong for a recurring one:
`WorkflowRuntime` registers exactly one workflow and runs `concurrency: 1`, and a month-long parked
workflow must be cancelled and rebuilt every time its expression is edited. Crash safety comes from
the record instead: the cron expression plus `lastFiredAt` recompute due-ness after any restart.

**Product variants — Isotopy.gaming, Isotopy.travel — may ship their own schedules**, and remain
the milestone *after* MVP, decided with the product owner on 2026-08-21. A fork of a core that
cannot carry a product by itself forks the problem too. Recorded so it is not lost; not filed,
because nothing about it is decidable yet.

Cross-platform: cron is parsed in-process, never delegated to the OS — no `cron`, no `schtasks`.
Timezones are the known hazard and were accepted when cron was chosen; follow
`domain/rules/engine-limit.ts`. And `TASK-061` closed with the real sleep/wake check on both OSes
**reasoned through and not observed** — this is the first work in the repo where that gap actually
bites, so it gets tested rather than argued.

---

## TASK-170: A team running unattended has no way to say something went wrong
**Priority:** P2 | **Tags:** server, infra, milestone-i
**Updated:** 2026-08-24 15:00

Of **Milestone I — Induction** (`TASK-156`). **Lands before the unattended stretch is measured**,
and before `TASK-161`'s poller is enabled — not because the poller needs it to run, but because the
first month nobody is watching is the worst possible time to discover the system cannot report.

### The state today, counted rather than felt

- **17 `console.*` calls, all in `packages/server/src`.** `packages/core` and `packages/ui` have
  none, so core purity and the UI's single-network-module rule both hold.
- **15 of the 17 are `console.warn`. Two are `console.log`. There is not one `console.error`.**
  A database that cannot be closed, a malformed persisted row, and a run whose cleanup failed are
  all reported at the same severity as "server listening on port 9477" — which is to say, there is
  no severity signal at all.
- **133 `catch` blocks across `packages/*/src`; 11 swallow completely.** Most of those 11 are
  correct — `config.ts` treating a missing `.env` as "no overrides" is the fallback *being* the
  answer. Some are not.
- **The convention has no enforcement.** `docs/architecture.md` records "no `console.*` in the new
  modules" as an upheld convention and there is **no `no-console` ESLint rule**, so it is prose that
  drifts every time someone needs to report something and finds no sanctioned way to.

**And the ticket everyone deferred to does not exist.** `.tasks/DONE.md:3312` reads *"structured
logging stays TASK-022"*. There is no `TASK-022` in Backlog, Next, In Progress, Done or Rejected. It
was never filed. That is the actual reason the silent catches accumulated: every author did the
right thing by deferring, to a number that was never real.

### Two channels, and the task must not confuse them

This is the distinction that decides the scope, and getting it wrong produces a logger that solves
nothing.

| | Operator channel | User-visible record |
| --- | --- | --- |
| Who reads it | whoever runs the server | whoever opens the app |
| Where it lives | stdout, and later a file | the run record, the schedule record, the rail |
| Answers | "why did the process behave like that" | "what did my team do, and what did it fail to do" |

**A logger alone would not have caught the defect that prompted this task.** Nobody reads stdout on
an unattended box. `TASK-159`'s scheduled-run failure needed a home in the *record*, and that fix
belongs with schedules, not here. This task owns the operator channel only, and says so, so the next
author does not reach for a log line where a persisted field is what the user needs.

### What this decides

- **One `Logger` interface behind a seam** (A2), in its own file, with a console implementation
  beside it. Services receive it; nothing imports a singleton, which is what lets a component test
  assert on what was reported instead of scraping stdout.
- **Levels that mean something.** At minimum `error` must exist and must be used where the code
  currently warns about a genuine failure. Deciding the level set is part of the work; keeping
  everything at `warn` is not an outcome.
- **What a `catch` is allowed to do.** Written down, then enforced: swallow silently *only* where
  the fallback is itself the answer, and that case should read as a fallback rather than as a
  rescue. Everything else reports — to the operator channel, the user-visible record, or both, and
  the rule says which.
- **An ESLint rule**, so the convention stops being prose. Whether that is `no-console` with an
  allowlist for the bootstrap's two `console.log`s, or a narrower restriction, is part of the work.

### Explicitly out of scope

Log files, rotation, log levels driven by configuration, and any external sink. Those need a
deployment story the product does not have yet — the deploy target is one of the things `TASK-156`
left unwritten on purpose. A task that grows a transport layer here has stopped being this task.

### Evidence

Failing-first per behaviour: a service handed a fake logger reports the failure it swallowed today,
with the context needed to act on it; a fallback that is genuinely the answer stays silent and has a
test saying so; and the lint rule rejects a bare `console.*` in a module that should be using the
seam. Then `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`.

The 17 existing call sites move onto the seam in the same change — per the standing rule that a new
approach means the old code goes with it, not beside it.

Cross-platform: stdout and stderr behave the same on both, but **line endings and console encoding
do not**. A Windows terminal and a POSIX one disagree on both, and the repo has already been bitten
by a CRLF assertion in the skill tests, so any test asserting on rendered output normalises rather
than hardcodes.

---

## TASK-172: A task worked unattended never leaves Next, so the next episode can pick it up again
**Priority:** P1 | **Tags:** server, core, milestone-i
**Updated:** 2026-08-25 16:00

Found while building `TASK-161`, and named there rather than fixed, because it is not about
schedules. **It has to close before the unattended stretch is measured.**

**The transition is gated on a human.** `run-service.ts` moves a run's `sourceTaskIds` to **In
Progress** only inside `approveGate`, and only for the stage id `intake`:

```ts
if (stageId === "intake" && run.sourceTaskIds?.length) { … transitionTasks(…, "In Progress", …) }
```

With gates off — `gates: {}`, the default — `approveGate` is never called, so **nothing ever
moves**. The Done transition has the same shape one step later: `closeout-consumer.ts` moves
`completedTaskIds`, which only exists if a closeout stage ran and reported them.

**Why that matters more now than it did.** Every episode starts with empty `runIds`
(`ensureActive` builds a fresh Orchestration, and `priorArtifacts()` filters by them), so the next
episode has no memory of the last. A task being worked still reads as *next* on the board, and
nothing in the record contradicts that. `TASK-161`'s poller prompt tells the Orchestrator to skip
what is already In Progress — which is worth having and is **not** a fix, because nothing put it
there.

**Two things this must decide rather than assume:**

1. **What marks a task as taken, and when.** Moving it at run start is the obvious answer and the
   wrong one if the run is refused a moment later; claiming it the way `TASK-159`'s window is
   claimed — durably, before the work it authorises — is the shape that already exists in this repo.
2. **What un-marks it when the run does not finish.** A crashed or aborted run currently leaves
   nothing behind to correct the board. A task stuck in In Progress forever is a worse failure than
   one picked twice, because no later episode will ever consider it again.

**Not in scope:** deciding *which* task is next. That is the Orchestrator's, per the decision
recorded for `TASK-161`.

**Evidence:** failing-first — a run started with `sourceTaskIds` and no gates moves its task to In
Progress; a second episode with the same board does not pick a task already In Progress; an aborted
run leaves the board in a state a later episode can act on. Then the full gate set.

Cross-platform: board files are plain markdown through `TaskBoardAdapter`, which already carries the
repo's line-ending handling; nothing new is introduced.

---

## TASK-162: A step names its agent, its tools and what it needs — and a marked task is not the team's to start
**Priority:** P1 | **Tags:** core, server, milestone-i
**Updated:** 2026-08-26 12:00

The owner's boundary, as data on a task rather than a judgment in a prompt. Of **Milestone I —
Induction** (`TASK-156`). **Lands before `TASK-161` is ever enabled.**

**Rescoped with the owner on 2026-08-26.** The boundary is unchanged. What changed is what it takes
to make it real, and the answer turned out to be a mechanism the product wanted anyway.

`domain/skills/personas/orchestrator.md` already says to escalate *"when it commits money,
credentials, or destructive action, or when you would be guessing at a preference only the user
holds"*, and that *"answering on the user's behalf when you should have asked is the failure that
costs most."* That instinct is right, and it is already written down. It is also **a judgment a
model makes per question** — one interruption with a human watching, a coin flip that spends money
without one.

### Three findings that turned a field into a mechanism

1. **The mark does not need inventing.** TaskPlanner already models `**Assignee:**` — parsed and
   serialized by its own board, rendered as `@assignee` by `taskplanner_board`, filterable in
   `taskplanner_list`, settable through `taskplanner_create` and `taskplanner_update`.
2. **The agent cannot see it.** `taskSummariesIn` strips every `**`-prefixed line before the
   Orchestrator sees a task, so *any* metadata mark is invisible today. Isotopy maintains a second
   board parser that is strictly worse than the one TaskPlanner ships.
3. **No step can call a tool.** There is no MCP anywhere in Isotopy — one incidental
   `mcp_tool_call` case in `codex-protocol.ts` and nothing else. A boundary the agent must read
   through a tool needs a step that can carry one.

### A step is a task that declares itself

The owner's shape, and the one this task builds: **the main point of a step is its task** — an MD
file describing a specific thing an agent must do — and that file names the agent, the tools, the
setup and the context it needs. Isotopy has half of this already: `PERSONA_CATALOG` (10 personas,
layered bundled → user → project) and `STEP_TASK_CATALOG` (10 bundled MD files). The pairing is
chosen by the *role* rather than by the task, tools do not exist, and step-specific setup is a
branch in code — `if (stageDef.stepTask !== VERIFY_FEATURE_STEP_TASK)` in `stage-execution.ts`.
That branch is the smell this removes: a step declares what it needs instead of the workflow
special-casing it by id.

**YAML front matter**, parsed once at the boundary with a strict schema — `agent: developer`,
`tools: [taskplanner]`, `context: [product-environment]`, and the `summary:` that used to live in
the catalog, fenced by the usual delimiters above the assignment prose. (Written inline here rather
than as a block: a bare `---` line inside a task section is what TaskPlanner's own parser uses to
end one, so an example carrying its delimiters would truncate this task on the next board read.)

- The split is pure (`domain/markdown/`), the schema strict (`schemas/`), the reading a service —
  domain never imports `node:fs`, and `structure.spec.ts` enforces it.
- **Step tasks start layering like personas do**: bundled → user override → project addendum,
  reusing `composeSkill` and the `userSkillsDir()` / `skillsDir()` paths. Persona *notes* stay
  persona-only. This is what makes the library the user's to grow rather than ours to ship.
- `STEP_TASK_CATALOG` stops being a hand-maintained array; each `summary` moves into its file.
  `team-composition.ts` is pure domain and builds its id sets at module scope, so it takes the
  known ids as parameters rather than importing a catalog that now reads the disk.
- `role.skill` becomes optional and defaults to the task's `agent:`. The task is the main point; a
  role may still override.
- `context` and `setup` are **closed vocabularies**, each derived from one `as const` tuple — not an
  open plugin surface. `setup` prepares what the step needs before the agent starts; `context` is
  what gets rendered into its prompt.

### Tools

`mcpServers` joins `ENGINE_CAPABILITIES`, with a row per engine. A pure tool catalog maps a tool id
to an MCP launch spec, and each adapter renders it into its own CLI's shape — a written config plus
`--mcp-config` / `--strict-mcp-config` for Claude Code, `-c mcp_servers.*` for Codex, and whatever
Cursor turns out to accept when probed. **A step declaring a tool on an engine that cannot carry one
runs without it and says so in the run log** rather than failing or pretending.

**Isotopy is not an MCP client — the engine CLI is.** Isotopy renders config and passes flags, so no
MCP SDK enters this repo. The first and only tool is `taskplanner`, which depends on TaskPlanner's
`TASK-046` publishing its MCP server as a package; until then there is nothing resolvable to point
at.

### The boundary

**`**Assignee:** owner`.** `renderTaskSection` emits it in TaskPlanner's exact metadata order so its
own parser round-trips it unchanged. `FollowUpTaskDraft` and `MilestoneTaskDraft` gain the optional
field, so **a closeout may create a marked follow-up** — the team may propose the monetisation
experiment, the pricing change, the credential-bearing integration; it may not start one.
**Nothing in the product clears the mark**, and that asymmetry is the whole boundary: an agent that
can mark its own work is useful, an agent that can unmark it has removed the boundary.

The poller's step declares `tools: [taskplanner]`, and `BOARD_POLLER_TASK` replaces its vague *"skip
anything that needs a person"* with reading the board through the tool and skipping `@owner`,
stating what it skipped and why.

**One board reader.** `taskSummariesIn` and `renderTaskBoardPlanningContext` go, with their callers
in `orchestration-service.ts` and `milestone-service.ts` — the standing rule is that a new approach
takes the old code with it. Isotopy's built-in board already writes TaskPlanner's exact format under
`<dataDir>/tasks`, so naming that directory `.tasks` lets one reader serve both backends.
**The server-side writer stays**: `createFollowUpTasks` and `transitionTasks` are Isotopy's own path,
not the agent's, and routing them through MCP would make the server a client for no gain.

**Rejected, and recorded in `docs/decisions.md` with the rest:** a tag (TaskPlanner's config
allowlist filters drafted tags, so a mark could be silently dropped); a priority (it overloads an
axis a marked task still needs); an Isotopy-invented field (a second vocabulary for a field
TaskPlanner already has); and a server-side claim gate refusing to start a run against a marked task
— that is a different problem, it belongs to `TASK-172`, and the owner's position is that respecting
a stated boundary is the agent's job, not the scheduler's.

### Evidence

Failing-first, one behaviour per test: a step-task file with front matter parses to its declaration
and a malformed one is rejected with a stated reason; a project override and addendum compose over
the bundled step task, and a project step task the bundled catalog never knew is selectable by a
role; a step declaring `tools: [taskplanner]` produces the right MCP config per adapter, and an
engine without the capability runs anyway and logs why; `**Assignee:** owner` round-trips a write
and re-read and TaskPlanner's own parser reads back the same assignee; a closeout creates a marked
follow-up; and the poller's prompt names the `@owner` rule. Then the full gate set, then the live
app with a marked task on the board that the agent reads and leaves alone. **No schedule fires
against a real CLI in the dev app** — firing is proven against `FakeEngine`, as `TASK-161` did.

Cross-platform: the MCP server is spawned as `node <resolved module path>`, never a bare bin name —
on Windows that resolves to a `.cmd` shim and needs the Node ≥20 shell rule that `runSubprocess`
owns. MCP config files are written with `path.join` under `os.tmpdir()` or the project data dir.
Front matter and CLI output split on `/\r?\n/`. Tested live on Windows; macOS reasoned through and
recorded untested unless a Mac is used.

---

## TASK-163: What Isotopy is for, restated
**Priority:** P2 | **Tags:** core, milestone-i
**Updated:** 2026-08-21 12:00

The last task of **Milestone I — Induction** (`TASK-156`), and the one that makes the documents
true. Do it **after** the mechanism works, so it describes something that exists.

**The promise already says this.** [`docs/product-brief.md`](../docs/product-brief.md) leads with
*"turning them into working businesses"* and *"keeps them evolving"*; the README sells *fast first
version — then built for v2, v3, and everything after*. Nothing there needs walking back. This is
not a repositioning; it is making the product match words it has carried since before it could
honour them.

**The honest change is what one phrase means.** "Keeps them evolving" has meant *you can start
another run*. After this milestone it means *it keeps going without you*. That is a different
claim, and every document leaning on the old reading has to be re-read against the new one.

**Where it lands:**

- `README.md` — "How it works" and "Where it is going", plus schedules as a thing the product has.
- `docs/product-brief.md` — the core workflow diagram ends at `deploy --> task`, which is the loop
  drawn but never closed. Close it, and say what closes it.
- `docs/architecture.md` — *"One persisted Orchestrator supervises a project… an aggregate, not a
  continuously running process"* stays true, and now needs the episode-handler reading beside it:
  what carries intent between episodes, and why that is a schedule rather than a daemon.
- The tagline. *"The last mile for your ideas"* is about getting something shipped. Whether a last
  mile is still the right image when the claim is that there is no last mile is a question for the
  owner. **Propose; do not rename unilaterally.**

**No new documents.** Anything that would be a fifth explanation of the same loop belongs in one of
the four above.

**Evidence:** the docs pass — every claim checked against the code that implements it, and every
stale sentence corrected rather than left standing in good faith. That is exactly how `TASK-153`
found `implementation-notes.md` wrong about Cursor in two places.

Cross-platform: documentation only; the bar applies to the claims it makes about platforms.

---

## TASK-157: The dogfood product — a minigame arcade whose leaderboard cannot stand still
**Priority:** P1 | **Tags:** testing, engine, ui, milestone-i
**Updated:** 2026-08-21 12:00

The base case of **Milestone I — Induction** (`TASK-156`): one real product, built by Isotopy with
the finished mechanism, and then carried by it.

**Comes after `TASK-159`–`TASK-163`.** It was written first, when no mechanism existed and its job
was to probe for one. The mechanism is now decided, so the arcade stops being a probe and becomes
the target the machinery runs against — and the thing the unattended stretch will be measured on.

### The product

A minigame arcade. Two or three small games, a leaderboard per game, and one **total leaderboard
where a record in a newer game is worth more than the same record in an older one.**

That weighting is the reason to build this rather than another to-do list. **Adding a game changes
every existing player's total score** — a recomputation across live data, a migration, and a
regression that shows up on the leaderboard rather than in a log. It cannot be built once and
frozen, which is exactly what a base case for something that has to keep going needs.

Small on purpose. The point is not the arcade.

### Its standing objectives are schedules, not a goal string

"A new game every month." "Keep the points fair as games are added." "Act on what players say."
These are what the product must keep being true, and `TASK-159` is what holds them: each is a
recurring task with a small fixed team, not a sentence in an `Orchestration.goal` that dies with
the episode that read it.

Write them as schedules from the start. A goal string that says all three would be the old shape
wearing the new one, and would tell us nothing.

### Shape

- A human creates the private `smekai` repo once — license, README stub, nothing else — and
  **commits the baseline as a git bundle under `docs/dogfood/baseline/`**. Not optional:
  `TASK-142` records that restoring from a local directory is how baseline `4175c97` was lost.
- Register it as an Isotopy project and configure `.isotopy/automation.json` — `validation`, and
  the `ui` start command and readiness URL so the embedded Preview can show the built product
  (`TASK-138`). Deployment is a later task.
- Give the team the work and let it build. **A human does not write the app.** A human having to
  fix it is a finding, and gets written down as one.
- Isolated `ISOTOPY_USER_HOME`/`ISOTOPY_HOME`, as `TASK-141` used, so the run cannot quietly depend
  on this machine's state.

### Evidence

`docs/dogfood/TASK-157-<engine>-<date>.md`, following
[`TASK-141`'s record](../docs/dogfood/TASK-141-claude-code-2026-08-17.md) **section for section**
so the two are diffable: team composition and whether it was edited, turns, changed files
*measured* rather than claimed, cost with tier and model, embedded Preview verification, and
whether the Orchestrator stopped itself. Plus what is new here — which schedules fired, what each
started, and what the poller skipped and why.

**The gap list is the deliverable, not the arcade.** Every friction, defect and missing capability
goes on it. It is what the deploy target, the unattended stretch and the MVP gap list are scoped
from.

Cross-platform: the arcade must build and run on Windows and macOS, and its automation commands are
arrays with a per-platform executable override, never shell strings
([`docs/project-automation.md`](../docs/project-automation.md)). Run live on Windows; record macOS
as reasoned-through and untested unless a Mac is actually used.

---
