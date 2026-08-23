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
5. **`TASK-162`** — work the team may draft but not start. Lands before the poller is enabled.
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

## TASK-159: Schedules — a recurring task with a fixed team
**Priority:** P1 | **Tags:** core, server, milestone-i
**Updated:** 2026-08-21 12:00

The clock the product has never had. Of **Milestone I — Induction** (`TASK-156`), which carries
why the Orchestrator dying between episodes is the design rather than a defect.

**A schedule is a persisted record plus a ticker.** Not a durable workflow: `WorkflowRuntime`
registers exactly one workflow and runs its worker at `concurrency: 1`, and a month-long parked
workflow would have to be cancelled and rebuilt on every edit. Crash safety comes from the record —
the cron expression plus `lastFiredAt` recompute due-ness deterministically after any restart, with
no runtime involvement at all.

### The model

`Schedule` in `packages/core/src/schedules.ts`: id, projectId, name, cron expression, IANA
timezone, the task text, the pinned pipeline, enabled, `lastFiredAt`. Pure predicates live beside
it as `milestones.ts` does — whether a schedule is due at an instant, and when it next fires — so
the service and the UI answer the same question the same way.

**The pinned team is `composeTeamPipeline` output** (`domain/rules/team-composition.ts:150`), which
already validates every `skill` and `stepTask` against the persona and step-task catalogs and gives
each stage an explicit `executionPolicy`. A run already carries a non-builtin pipeline through
`RunState.pipeline` and `pipelineForRun`. Nothing new is needed to make a run use a fixed team —
only somewhere to keep one.

**Boundary parse in `packages/server/src/schemas/schedule.ts`.** An invalid cron expression, an
unknown timezone, or a pipeline naming a persona that does not exist are all rejected *when the
schedule is saved*, never at fire time. A schedule that cannot fire must not be storable.

**`ScheduleService` is the single writer**, beside `MilestoneService` and `OrchestrationService`,
over a `JsonRecordRepository` like theirs. `routes/schedules.ts` is a factory taking the service,
per the routes convention — and its prefix goes in `ui/vite.config.ts`'s proxy list or the browser
never reaches it.

### Firing

- **A missed window fires once. Catch up, never backfill.** A machine that was asleep for three
  days owes one run, not three.
- **The project's admission rule is respected by checking, not by catching.** `admitRun`
  (`services/run/run-service.ts:333`) already refuses a second concurrent run per project; a
  schedule that finds one active records a skip and waits for its next window. A caught exception
  is not a design.
- A disabled schedule does not fire and does not accumulate debt.

### Two consequences to resolve here, with a reason recorded either way

1. **Orchestration records accumulate.** Every tick that finds no active Orchestrator persists a
   new one, and `TASK-149` groups the rail by orchestration — an hourly schedule would produce
   roughly 720 initiative groups a month and make the rail unusable. Decide whether scheduled work
   forms an initiative group at all, or collapses into one.
2. **The post-run decision turn is board-blind.** `reviewContextFor`
   (`services/orchestration-service.ts:439`) passes goal, team, run label, status, closeout,
   artifacts, milestone and rejected decision — no `boardContext` — and `renderRunReviewContext`
   has no board section, while the *opening* turn gets the whole board through `goalContext`.
   Either the scheduled agent reads the board itself and names the next task in its report (which
   reaches the Orchestrator as `stageOutputsOf(run)`), or the review context gains the board.
   **Pick one and say why. Do not do both.**

### The dependency

Cron needs a parser with timezone support. The server has four dependencies today, so this is a
real decision and belongs in `docs/decisions.md` (A8), not in a commit message. `croner` is the
candidate — zero dependencies of its own, TypeScript, `nextRun()` with an IANA zone — but confirm
that before adopting it rather than after.

### Evidence

Per [`docs/testing.md`](../docs/testing.md), failing-first per behaviour: due-ness across a DST
boundary and across two zones that disagree with the runner's, a missed window firing exactly once,
a fire skipped because a run was already admitted, an invalid expression refused at save, and a
scheduled run reaching the engine with its pinned pipeline rather than the project default. Then
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`.

Cross-platform: cron is parsed in-process — no `cron`, no `schtasks`, no second process. Timezone
resolution follows `domain/rules/engine-limit.ts`: ask ICU through `Intl.DateTimeFormat`, keep
durations in server logs, and leave clock times to the browser. The sleep/wake check `TASK-061`
reasoned through and never observed is executed here on Windows and reasoned through for macOS.

---

## TASK-160: Schedules in the rail
**Priority:** P1 | **Tags:** ui, milestone-i
**Updated:** 2026-08-21 12:00

Recurring work is not a run, so it does not belong in the run list. Of **Milestone I — Induction**
(`TASK-156`); needs `TASK-159`'s model and API.

**A third rail section, built exactly like the second.** `MilestoneList` inside
`components/RunRail.tsx` is already a labelled, height-capped, `flexShrink: 0` block sitting
between the New run button and the flexible runs list. Schedules is the same shape with a different
icon, and the rail's existing `sectionLabel`, `MILESTONE_LIST` and `milestoneButton` styles are the
pattern to follow rather than reinvent. **This is not a new surface.**

Three to five schedules is the design point. A list that needs paging or search is a sign the
feature grew something nobody asked for.

**Create, edit, enable and disable**, plus each schedule's next fire time and whether it is on.
**The server computes the next fire time and sends it** — the UI never parses a cron expression, so
the parser stays a server dependency and the two can never disagree. A cron expression a human has
to compose by hand deserves a plain-language echo of what it means next to the field.

A schedule's detail view — its recent fires and what each started — gets a route in `route.ts`
beside `#/runs/:id` and `#/milestones/:id`, following `parseRoute`/`routeHash` and their existing
pair of accessors.

**Evidence:** a component test that the section renders, toggles, and disables without touching the
run list; a route test for parse/format round-tripping; and a seeded Playwright path that creates a
schedule and sees it listed, in the shape of `run-limit.spec.ts` so it spends no tokens. Overlay
rules apply to any dialog this adds — `role="dialog"`, `aria-modal`, Escape, focus moved in and
restored — as `LimitModal` and `SetupModal` already do.

Cross-platform: the browser renders the next fire time in the reader's own zone, never the
server's. Verified on Windows; macOS reasoned through unless a Mac is used.

---

## TASK-161: The built-in board poller, shipped disabled
**Priority:** P1 | **Tags:** core, server, milestone-i
**Updated:** 2026-08-21 12:00

The one schedule every project has from the start, and the task that closes the loop. Of
**Milestone I — Induction** (`TASK-156`); needs `TASK-159`, and must not be enabled before
`TASK-162`.

**What it does:** on its window, if no run is active, take the next thing off the board and start a
run for it. Nothing else. It is one stage and one persona — the smallest team that can read a board
and name what is next.

**Off by default**, through `ProjectPreferences` and `defaultProjectPreferences()`
(`core/src/settings.ts`), where every other per-project default already lives. A fresh install must
behave exactly as it does today until someone turns this on deliberately, and an upgrade must not
opt an existing project in.

**It respects admission by checking, not by catching.** `admitRun` (`services/run/run-service.ts`)
already refuses a second concurrent run per project. The poller asks first and records a skip; it
never starts a run it expects to be refused.

**It does not decide what is worth doing.** It takes what the board already says is next, and the
Orchestrator reviews the settled run as it reviews every run. A poller that reprioritises is a
different feature and is not this one.

**The order the board is read in is a real decision, not an implementation detail.** `.tasks/`
carries priorities and several states, and `TaskBoardAdapter.planningContext()` already renders
every state file. Say in `docs/decisions.md` which states the poller draws from and how ties break:
an unattended team will apply that rule thousands of times with nobody watching.

**Evidence:** failing-first — a due poller with an active run does nothing; with an empty board
does nothing and says so; with a task starts exactly one run for exactly that task; and the
default-off flag holds for both a fresh project and an upgraded one. Then the full gate set.

Cross-platform: nothing here is OS-specific beyond `TASK-159`'s ticker, which carries the platform
bar for both.

---

## TASK-162: Work the team may draft but not start
**Priority:** P1 | **Tags:** core, server, milestone-i
**Updated:** 2026-08-21 12:00

The owner's boundary, as data on a task rather than a judgment in a prompt. Of **Milestone I —
Induction** (`TASK-156`). **Lands before `TASK-161` is ever enabled.**

`domain/skills/personas/orchestrator.md` already says to escalate a question *"when it commits
money, credentials, or destructive action, or when you would be guessing at a preference only the
user holds"*, and that *"answering on the user's behalf when you should have asked is the failure
that costs most."* That instinct is right, and it is already written down.

**It is also a judgment a model makes per question.** With a human watching, a wrong call costs one
interruption. With a team running for a month and nobody watching, it is a coin flip that spends
money. The rule has to stop being persuasion and become a property of the work.

**A marked task can be drafted, written to the board with its reasoning, and left there.** The team
may propose the monetisation experiment, the pricing change, the credential-bearing integration —
it may not start one. The poller skips such tasks; the Orchestrator may not self-start them; and
the mark survives a board write and re-read through `TaskBoardAdapter`, which already owns
`createFollowUpTasks` and `transitionTasks`.

**Design questions this task answers rather than assumes:** whether the mark is a tag, a priority,
or its own field — and whether an agent may set it or only the owner. An agent that can mark its
own work as owner-gated is useful; an agent that can *unmark* it is the whole boundary gone. Record
the choice and the rejected alternative in `docs/decisions.md`.

**Evidence:** failing-first — a marked task is skipped by the poller with a stated reason and left
on the board; an unmarked one is taken; the mark round-trips through a write and re-read; and a
closeout may create a marked follow-up task. Then the full gate set.

Cross-platform: board files are plain markdown and carry the repo's existing line-ending and path
handling; nothing new is introduced.

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

## TASK-125: Milestone F — Fixpoint: stabilise to a demoable MVP
**Priority:** P0 | **Tags:** core, server, ui, engine, infra, milestone-f
**Updated:** 2026-08-10 14:10

A fixed point is where a system stops changing under its own operation. That is the goal:
stop adding, and make what exists hold still and hold up.

**The bar:** someone who is not us installs it, points it at a folder, describes a goal —
and *sees the thing that was built*. Today the last step barely exists. A run ends and the
result is somewhere on disk, and you have to already know where.

**Scope, in order:** `TASK-126` (a finished run names what it changed), `TASK-124`
(permission modes and blast radius), `TASK-138` (run the built product and show it),
`TASK-115` (per-role presets, pulled out of Milestone H once `TASK-129` made a stage's
model something an agent can reason about), `TASK-116` (README "How it works"), `TASK-139`
(the Orchestrator's decision loop stops dead-ending and spinning), `TASK-137` (one dialog
with the Orchestrator, plus the harness/model question at the start and honest stage
labels — widened on 2026-08-12, last before the dogfood), and `TASK-128` (the closing
dogfood). Already
closed: `TASK-092` (project automation and preview deploy), `TASK-127`
(a stage must not pass on output nothing could use), and `TASK-129` (model presets rather
than ids the plan rejects).

**Why `TASK-138` is here, decided with the user on 2026-08-10:** the second half of
`TASK-126` — starting the product and putting it in front of the user — was split into
Milestone H that morning and pulled back into F the same day. `TASK-126` delivered the
weaker reading of F's bar: a run *names* what it built. Seeing it run is the reading a
first-time user will have, and the demo cannot route around it. It sits after `TASK-124`
because it starts long-lived processes on someone else's machine, and that is exactly what
`TASK-124` gives the system an opinion about.

That is the **only** capability admitted after the "nothing else" rule below was written,
and admitting it is not licence for a second.

Nothing else. Features nobody has asked for belong to **Milestone H — Harmonic**; the two
research spikes belong to no milestone at all. `TASK-137` is here because a user asked for
it and because F's bar is a first-time user meeting the Orchestrator — the one surface the
demo cannot route around.

**Scope finalised 2026-08-17. All three dogfoods are now run, and the milestone does not close.**

`TASK-128` closed `SKIP` — Codex passed, Cursor was out of quota. `TASK-141` closed **`PASS`** on
Claude Code: a five-role team built the feature, independent verification caught a real
accessibility bug in its own work, the Orchestrator recovered with one partial retry and stopped
itself, and the built product was seen running in the embedded Preview. That is F's bar, met on a
second engine.

**`TASK-142` then closed `FAIL` on Cursor on 2026-08-23**, earlier than the 2026-09-03 reset it was
waiting for, because the quota turned out to be two pools with headroom in one. The team built the
feature correctly in **4m 18s** — 23 tests green, every clause of the goal verified by hand — and
then **verification ran three times in 1h 58m and never produced a verdict**. A `vite preview` the
Developer stage left behind survived the timeout that killed its parent, held port 5180 for two
hours, and made Isotopy's own product runner report `exited` while the app answered 200 at the URL
Isotopy had configured. A human had to kill it by hand before the Preview could show anything —
after which it worked in 4.4 seconds.

**That is F's bar failing on its last step, not a Cursor problem.** Every defect is ours: the leaked
process tree, the runner fighting its own leftover, and a timeout that discards everything it
interrupts so three attempts bought no information at all. Filed as `TASK-165`, `TASK-166`,
`TASK-167` and `TASK-168`, in Milestone I.

**So F stays open, and the decision about how it closes is the product owner's.** Two honest
readings: the milestone's bar is met on two of three engines and the third failed on environment
defects rather than on the loop F was about — or a demoable MVP is exactly the thing that must not
need a human with Task Manager, and `TASK-165` belongs inside F after all. The "nothing else" rule
says the first; the bar's own wording says the second. Nothing is admitted here until that is
decided.

**The four defects `TASK-141` found went to Milestone H, not here** — decided with the user on
2026-08-17. `TASK-144` and `TASK-145` at P0, `TASK-146` and `TASK-147` at P2. `TASK-144` does
under-cut `TASK-126`'s bar for the second and later runs of an initiative, which is a real argument
for fixing it inside F; the user chose H anyway, so F closes on the evidence it has rather than
growing a tail. That is the "nothing else" rule being kept rather than bent.

Cross-platform: every task here is verified on Windows and reasoned through for macOS, and
`TASK-126`'s folder reveal and `TASK-124`'s per-CLI mode flags are where that bites.

---
