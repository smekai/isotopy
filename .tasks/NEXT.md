# Next

## TASK-134: Milestone H — Harmonic: feedback, then what it asks for
**Priority:** P2 | **Tags:** ui, server, core, milestone-h
**Updated:** 2026-08-10 14:10

Show Isotopy to people who might want it, find out what they actually need, and build
that — rather than what we guessed while building it.

**Goal:** the features in this milestone are chosen by users, not by us. `TASK-135`
collects the feedback; what follows is decided by what it says.

**Parked here pending that evidence:** `TASK-111` (reusable teams), `TASK-113` (per-persona
accumulated context). Each was written as post-MVP by whoever deferred it, and none has a
user behind it yet. Build the ones feedback asks for; reject the rest rather than letting
them age in the backlog.

**Admitted 2026-08-17, out of the `TASK-141` dogfood.** Two different kinds arrived at once:

- **Defects, kept out of Milestone F deliberately** so F could close on its evidence rather than
  grow a tail: `TASK-144` and `TASK-145` (P0), `TASK-146` and `TASK-147` (P2). These are **not**
  feedback-gated — they are known-broken behaviour and should be fixed whatever `TASK-135` finds.
- **Three asks from the user**, who watched the dogfood: `TASK-148` (gates as real config),
  `TASK-149` (group an initiative's runs), `TASK-150` (compose a team per run). These came from the
  product owner, not from `TASK-135`'s prospective users. That is a legitimate source, but it is
  not the evidence this milestone was created to wait for — recorded plainly so "a user asked" does
  not quietly come to mean "we asked ourselves". `TASK-150` overlaps `TASK-111`; design them together.

That rule has been applied once already: `TASK-095` (agent-native browser testing for QA)
was **rejected on 2026-08-11**, answered by `TASK-138` rather than built. Its policy half
lives in the tester persona now instead of in a task.

Also unclaimed: the **full Orchestrator UI** beyond the MVP slice `TASK-114` shipped. No
task exists for it on purpose — write one when someone says what is missing. The first
such claim arrived and went to Milestone F, not here: `TASK-137` (one dialog instead of
an `Orchestrator` tab beside a `Chat` tab), because the demo cannot route around it.

**Started 2026-08-17.** The nine tasks that are not feedback-gated moved to Next; `TASK-111`
and `TASK-113` stay in Backlog until `TASK-135` produces the evidence they are waiting for.

Cross-platform: whatever this milestone builds carries the same Windows and macOS bar as
everything else.

---

## TASK-146: Refresh three stale claims in the run-app skill
**Priority:** P2
**Tags:** infra, testing, milestone-h
**Updated:** 2026-08-17 13:10

Found in `TASK-141`'s pre-flight. `.claude/skills/run-app/SKILL.md` is wrong in three ways:

- Its proxy list omits `/orchestrations` and `/automation`, both of which are in
  `packages/ui/vite.config.ts` `API_PROXY_PATHS` and mounted in `packages/server/src/app.ts`.
  `/automation` is the Preview surface and `/orchestrations` is the Orchestrator — the two things a
  dogfood most needs to drive.
- It documents no Preview endpoints at all (`GET/POST /automation/product{,/start,/stop}`).
- It states that a subscription session limit is "a hard failure, not a pause". `TASK-061` shipped:
  the stage now parks on a durable `limit:<runId>:<stageId>` signal and resumes via
  `POST /runs/:id/limit/:stageId/resolve`.

`TASK-103` already records this class of staleness costing real time during the `TASK-094` dogfood;
it cost planning time again here. Not fixed inside `TASK-141` because that run had to start from an
unmodified `main`.

Cross-platform: n/a — documentation.

---

## TASK-147: Surface the cost of post-run Orchestrator decision turns
**Priority:** P2
**Tags:** server, ui, milestone-h
**Updated:** 2026-08-17 13:10

Found by the `TASK-141` dogfood. The orchestration run reported `$0.35` after its first
`propose_team` turn and still reported `$0.35` after two further turns (`start_run` at settle time
and the closing `stop`). Those decisions call the engine, so the displayed total understates real
spend by an unknown amount — $6.69 was the figure the dogfood could evidence, not necessarily what
was billed.

Decide where a settle-time decision's usage belongs — folded into the orchestration run's stage,
or carried on the orchestration itself — and show it, so an initiative's cost is the sum of what
the user can see.

Cross-platform: n/a — accounting and display.

---

## TASK-148: Make human gates real configuration
**Priority:** P2
**Tags:** ui, server, core, milestone-h
**Updated:** 2026-08-17 13:10

Found in `TASK-141`, and confirmed with the user on 2026-08-17: gates should be a config.

`Setup → Gates` looks configurable and is not. `GatesSection.tsx` derives its list from the shipped
`DEMO_PIPELINES`, filters to stages with `gateAfter`, and renders each with a hard-coded `ENABLED`
badge. There is no toggle, and nothing it displays is stored or read back. A user who wants Full
Delivery's Product Manager gate off cannot turn it off, and the screen gives no hint of that.

**What to build:** make the section mean what it shows — per-gate enable/disable persisted with the
other preferences (server state keyed by project, as `PUT /settings/preferences` already does) and
honoured when a fixed pipeline runs.

**Scope note.** This is about *fixed* pipelines. Orchestrator-composed teams already decide gates
per role via `gateAfter` in the proposal, which is why the dogfood ran end to end on a single
approval at team composition with no mid-run pauses. That flow is already the "approve the plan and
the team, then let it run" model and needs no change — do not regress it while making fixed-pipeline
gates configurable.

Cross-platform: n/a — settings and UI.

---

## TASK-149: Group an initiative's runs visually in the UI
**Priority:** P2
**Tags:** ui, milestone-h
**Updated:** 2026-08-17 13:10

Asked for by the user on 2026-08-17, after watching the `TASK-141` dogfood.

An initiative's runs are already linked in the data — each run carries `orchestrationId` and the
orchestration keeps `runIds[]` — but the runs rail renders them as a flat list of independent
cards. In the dogfood the three runs (the Orchestrator conversation, the run that ended
`needs_attention`, and the fix) read as three unrelated things stacked by time. Nothing showed that
run 3 existed *because* run 2 failed, or that all three served one goal.

**What to build:** show the grouping. A collapsible initiative header carrying the goal, its runs
nested under it, and the relationship legible — which run followed which, and why the later one
started. The parent/child data is already there.

This meets, from the other direction, the question left open in `docs/decisions.md:144` — whether a
runs overview is needed. `TASK-141` found the flat rail adequate at three runs and said so; the
user asked for grouping anyway. Record that the ask came from the user rather than from the rail
failing at this scale, so the design is not over-built for a problem nobody has hit yet.

Cross-platform: n/a — UI only.

---

## TASK-150: The Orchestrator should compose a team for every run, not only the first
**Priority:** P2
**Tags:** core, server, ui, milestone-h
**Updated:** 2026-08-17 13:10

Asked for by the user on 2026-08-17, after watching the `TASK-141` dogfood.

Today an initiative approves **one** team and reuses it for every later run.
`OrchestrationService.launch` reads `orchestration.composedPipeline` and re-runs the same roles,
tiers and step tasks; the Orchestrator's only levers on a continuation are the task text and
`fromStage`. So a second run that needs a different shape — a bug fix wanting only a Developer and
a Tester, or a run that turns out to need a Software Architect nobody picked at the start — is
forced through the original composition.

That is visible in the dogfood: run 3 existed only to fix one function, and it carried the whole
five-role team, skipping planning and design by *seeding* rather than by being composed correctly.
Skipping is a workaround for composing.

**What to build:** let the Orchestrator propose a team per run, through the same approval flow the
first one gets. The machinery partly exists — a `propose_team` decision after a run settles already
parks the initiative at `awaiting_approval`, and `approveTeam` already replaces `composedPipeline`.
The work is telling the Orchestrator it may re-compose, making that a real option in the prompt and
step task, and showing in the UI which team a given run actually used.

**Decide, and record the choice:** whether re-composition needs approval every time or only when
the shape changes; how a run's team is shown in history once teams differ per run; and how this
meets `TASK-111` (reusable saved teams), which is the same question from the other side.

Cross-platform: n/a — composition and UI.

---

## TASK-135: Recruit prospective users and collect their feedback
**Priority:** P2 | **Tags:** ui, milestone-h
**Updated:** 2026-08-07 11:40

The input `TASK-134` runs on.

**Decide and record:** who to approach and why they are the target (developers who want a
local, model-agnostic team over a hosted app builder); what to put in front of them — a
README, a recording, or a session where they drive it themselves; what to ask, in
questions that surface what they *tried to do* rather than what they thought of the UI;
and where answers land so they are quotable in a task later.

The bar for a useful answer is a sentence naming something they wanted and could not do.

Cross-platform: n/a — process, not code.

---

## TASK-142: Rerun the Milestone F dogfood with Cursor after quota reset
**Priority:** P0 | **Tags:** testing, engine, ui, milestone-f
**Updated:** 2026-08-17 12:30

Repeat the clean newcomer focus-timer path with Cursor after the account's monthly
usage limit resets on 2026-09-03, or earlier if the user makes Cursor capacity available.
Start from refreshed `main`, the baseline named below, and isolated
`ISOTOPY_USER_HOME`/`ISOTOPY_HOME`; require product onboarding, user-approved team composition,
real execution, measured changed files, embedded Preview verification, and a clean
post-run Orchestrator stop.

**Match TASK-141, not TASK-128.** TASK-128's target and its literal goal string are both gone —
the target repo was deleted and the goal was never written into a task file. TASK-141 recreated
both, so *that* is the comparable run.

Restore its baseline from the bundle committed in this repository — **not** from any local
directory, which is how `4175c97` was lost:

```
git clone docs/dogfood/baseline/dogfood-focus-timer-87fe592.bundle <target>
cd <target> && pnpm install
```

That checks out `87fe5929f60f92b6f0c10ffc610229d34047f82b` exactly, with all 14 tracked files.
Confirm the SHA before starting, then type this goal verbatim:

> Evolve this focus timer into one I would actually use every day: let me set the focus and break
> lengths anywhere from 1 to 120 minutes, remember the timer's state across a page reload,
> alternate automatically between focus and break, and keep a history of completed focus sessions
> only. Keep the existing Start, Pause and Reset controls working, and make the timer's state
> announced accessibly.

Follow TASK-141's evidence record section-for-section so the two are diffable, and record Cursor's
tier, model and spend — the fields TASK-128 omitted, which is why its numbers are not comparable.

Confirm Cursor install/login through Isotopy before spending a run — unlike Claude Code, the Cursor
adapter does report `loggedIn`, so this check is available in-product. External authentication,
quota, or service unavailability is `SKIP`; a product defect is `FAIL`. Note that a mid-run
subscription limit is **not** a `SKIP` on its own: since TASK-061 the stage parks on a durable
timer and resumes. On `PASS`, combine the result with TASK-128's Codex evidence and TASK-141's
Claude evidence to make the final Milestone F release decision and update TASK-125 accordingly.

Cross-platform: run live on Windows. Audit Cursor binary lookup, Node 22.5+, pnpm/POSIX
executable selection, path handling, and process cleanup for macOS, recording macOS as
reasoned-through and untested unless a live Mac is actually used.

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

**Scope finalised 2026-08-17. `TASK-142` is the only work left in this milestone.**

`TASK-128` closed `SKIP` — Codex passed, Cursor was out of quota. `TASK-141` then closed **`PASS`**
on Claude Code: a five-role team built the feature, independent verification caught a real
accessibility bug in its own work, the Orchestrator recovered with one partial retry and stopped
itself, and the built product was seen running in the embedded Preview. That is F's bar, met on a
second engine.

`TASK-142` reruns the same path on Cursor once its quota resets on 2026-09-03, and is expected to
be done **in September**. It carries `TASK-141`'s baseline and goal string so the two are
comparable. Nothing else is admitted here.

**The four defects `TASK-141` found went to Milestone H, not here** — decided with the user on
2026-08-17. `TASK-144` and `TASK-145` at P0, `TASK-146` and `TASK-147` at P2. `TASK-144` does
under-cut `TASK-126`'s bar for the second and later runs of an initiative, which is a real argument
for fixing it inside F; the user chose H anyway, so F closes on the evidence it has rather than
growing a tail. That is the "nothing else" rule being kept rather than bent.

Cross-platform: every task here is verified on Windows and reasoned through for macOS, and
`TASK-126`'s folder reveal and `TASK-124`'s per-CLI mode flags are where that bites.

---
