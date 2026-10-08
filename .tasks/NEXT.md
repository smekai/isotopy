# Next

## TASK-194: After Aiki: shrink the docs and tests, reuse Aiki's types, and keep one logger
**Priority:** P2 | **Tags:** core, server, testing
**Updated:** 2026-10-08 16:36

`TASK-069` (PR #83, 0.13.0) moved the durable runtime from OpenWorkflow to Aiki. The repo still carries text and tests written across two runtimes and a migration, and a logger split in two. Clean that up in one pass.

### 1. Markdown: remove or shrink what is duplicated or no longer true

- The same runtime facts are written in several places: embedding, claim and outbox timings, replay by name and input, schedule identity, cancel, and the cost numbers. These live in `docs/decisions.md`, `docs/architecture.md`, `docs/implementation-notes.md`, `README.md`, `AGENTS.md`/`CLAUDE.md` and the skills (edit the `gen:` blocks, then `pnpm gen:skills`).
- Keep each fact once, where it belongs: what is, in `architecture.md`; how it works and its gotchas, in `implementation-notes.md`; why, as a dated entry in `decisions.md`. Link from the others.
- Delete text that is no longer true. History stays only in dated decision entries.
- Report the net lines removed.

### 2. Tests: revisit

- Remove tests that exercise Aiki rather than Isotopy, and merge near-duplicates.
- Keep the tests that pin Isotopy's own rules, and mutation-check every guard that stays.
- Look for harness scaffolding that existed for the runtime and Aiki now makes unnecessary.

### 3. Reuse what Aiki already defines

Where `workflow/` defines models, classes or enums that mirror Aiki's, use Aiki's exported types at the seam instead of a parallel copy. Candidates:
- `DurableRunState` against `WorkflowRunStatus`;
- the schedule spec;
- the event payload shapes.

Isotopy's domain types stay ours; this is only the seam.

### 4. One logger, not two

Today `AikiLoggerAdapter` wraps our `Logger` to fit Aiki's interface, which adds `trace`/`debug` and a `child(bindings)` that takes an object where ours takes a component name. The owner wants a single logger that implements both interfaces, so the adapter goes. Decide:
- how `child(component)` and `child(bindings)` coexist;
- what `trace` and `debug` do: pino levels below the operator log's `info`.

**Done when:**
- the docs and tests are smaller, and nothing in them is untrue;
- `AikiLoggerAdapter` is gone, with one logger serving Isotopy and Aiki;
- all gates are green.

---
## TASK-178: The Orchestrator keeps a small context of its own, curated rather than accumulated
**Priority:** P1 | **Tags:** core, server, engine, milestone-i
**Updated:** 2026-10-04 17:49

Step 6 of **Milestone I — Induction** (`TASK-156`), filed on its own 2026-10-04 so it can be worked. The *what* and *why* are settled in `TASK-156` ("The Orchestrator still dies — but it keeps a small context", decided with the owner 2026-09-24); this task is the *how*. **Lands before the unattended stretch is measured**, so the stretch measures episodes that remember.

### The gap

Every role keeps notes (`<skills>/<id>.notes.md`, `TASK-113`); the one agent that sees every run does not. `terminate()` is one-way and `ensureActive` builds a fresh Orchestration, so each episode opens knowing only the board, the closeout context and the persona digest — `goalContext` in `services/orchestration-service.ts` is exactly that list.

### Design

- **Fence.** The review step may return a whole revised context in an `isotopy-orchestrator-context` block — a markdown body, not JSON. Extract it with `takeFencedBlock` (`schemas/fenced-block.ts`) the way `schemas/persona-notes.ts` extracts `isotopy-persona-notes`. No block means no change.
- **Pure rules** in `domain/rules/orchestrator-context.ts`: parse; a hard cap (start at 4 KB and 60 lines — the cap is what forces curating); a revision **replaces** the whole context, so deleting a stale line or merging three is as ordinary as adding one; an over-cap revision is **refused** and the previous context kept. Normalise line endings to LF.
- **Store** in `services/orchestrator-context-store.ts` (`OrchestratorContextStore`): `orchestrator.context.md` beside the persona notes in `skillsDir(projectPath)`, written UTF-8/LF via temp file + `rename`, exactly as `persona-notes-store.ts` does (atomic on NTFS and APFS for a same-directory rename). A missing file is an empty context (`readOptionalText`); an unreadable one fails loudly, per "What a catch may do" in `docs/architecture.md`.
- **Write** on the review path: `workflow/stage-execution.ts` `runOrchestratorReviewWork` → `readReview` → `OrchestrationService.recordReview`. A refusal is recorded on the review (the user-visible record) and reported through the service's own `logger.child("OrchestrationService")` (the operator channel).
- **Read** in `goalContext`, rendered by `domain/markdown/orchestration.ts` into the opening prompt, follow-ups and the review prompt (`reviewContextFor`).
- **Prompts.** `domain/skills/step-tasks/review-run.md` and `orchestrate.md` state the lane — the owner's standing preferences heard in conversation, what recent episodes tried and how they ended, what to avoid, open threads — and what it is **not**: the task list (the board), role craft (persona notes), run output (`.isotopy/runs/`). State the cap. Then `pnpm gen:skills`.
- **Sizes.** `orchestration-service.ts` is near the 1000-line cap enforced by `structure.check.ts`; keep rendering and rules out of it.

### Evidence

A spec for the pure rules (a revision that deletes a line leaves it deleted; an over-cap revision leaves the file untouched; CRLF input is stored as LF). A component test with `FakeEngine` emitting the fence: episode 2's opening prompt carries what episode 1's review wrote, and a refused revision is visible on the review. Full gate set.

Cross-platform: the file is written with `path.join`, UTF-8 and LF on both OSes; parsing splits on `/\r?\n/`.

---
## TASK-156: Milestone I — Induction: a product the team carries on its own
**Priority:** P1 | **Tags:** core, server, ui, engine, testing, milestone-i
**Updated:** 2026-10-08 16:17

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

**Cron is the only trigger from outside, on purpose.** Reacting to a PR comment, a red CI run or
a new task on the board is a schedule whose task says *go and look* — not a webhook, a watcher or
a second kind of trigger. Decided with the product owner on 2026-09-24, after Cursor Projects
shipped event subscriptions (Slack, PR follow, schedules) as three separate mechanisms; see
[`docs/competitor-matrix.md`](../docs/competitor-matrix.md) §6. **Inside**, Isotopy may raise its
own events for a workflow that is already waiting — the product came up, a task reached Done, a
run settled. That resumes work; it never starts it. Filed as `TASK-175`, outside this milestone.

A scheduled run is an ordinary run. It calls `ensureActive` like every other, so it is **owned and
reviewed by the Orchestrator on settle**, and closeout plus artifact capture are the normal run
lifecycle. The schedule is not a second path into run creation; it simply is not a conversation.

### The Orchestrator still dies — but it keeps a small context

`terminate()` is one-way, and `ensureActive` then builds a fresh Orchestration — empty `turns`,
empty `runIds`, the scheduled task's text as its goal. Each episode therefore starts without the
previous one's digests, because `priorArtifacts()` filters by `orchestration.runIds`.

That stays, because **most of the project's memory was never in the Orchestrator**:

| Memory | Where it lives | Survives |
| --- | --- | --- |
| What work remains | The task board, markdown in the repo | Yes |
| What each role learned | `<skills>/<id>.notes.md`, per persona (`TASK-113`) | Yes |
| What each run produced | `.isotopy/runs/<id>/`, closeout records | Yes |
| Standing intent | **A schedule** — a persisted, recurring intention | Yes |
| **What the Orchestrator has come to understand** | **Its own small context, curated by it** | **Yes** |

So the Orchestrator is an **episode handler**, not a long-lived supervisor, and a schedule is what
carries intent between episodes. A standing goal still needs no home on the `Orchestration`
record: the recurring task *is* the standing goal.

**What changed (2026-09-24, with the product owner).** The earlier text accepted that an episode
starts knowing only what the board and the persona notes tell it. Every role already keeps a
context of its own; the one agent that sees every run did not. Cursor Projects makes the opposite
bet — its coordinator's value is context that compounds across turns — and the owner's intent was
always that the Orchestrator, like every agent, keeps a context it maintains. The Orchestrator
still dies each episode; its understanding no longer does.

**How it differs from persona notes.** Persona notes are append-only: merged, deduped, the oldest
evicted past 40 (`mergePersonaNotes`). Nobody ever deletes a wrong one. The Orchestrator's context
is **curated, not accumulated** — the Orchestrator cleans it, weighs what to keep and rewrites it:

- **Written whole.** When the Orchestrator reviews a settled run it may return a complete revised
  context in a fenced block; that version *replaces* the previous one. Removing a stale line, or
  merging three into one, is as ordinary as adding one. No block means no change.
- **Small, by a hard limit.** A byte/line cap enforced when the block is parsed at its boundary. A
  revision over the cap is refused, the previous context kept, and the refusal recorded on the
  review — the cap is what forces the curating.
- **Read at every episode's start.** `goalContext` loads it beside the board, closeout context and
  persona digest, so a fresh Orchestration begins from what the last one understood.
- **Its own lane.** It holds what nothing else does: the owner's standing preferences heard in
  conversation, what recent episodes tried and how they ended, what to avoid, open threads. Not
  the task list (the board), not role craft (persona notes), not run output (`.isotopy/runs/`).
  The prompt says so, or it duplicates all three and hits the cap with noise.
- **A plain file in the repo**, beside the persona notes, written atomically like them (temp file
  plus `rename`). The owner can read and edit it; an edit is simply the next version.

**Evidence:** a spec for the parse/cap/replace rules (a revision that deletes a line leaves it
deleted; an over-cap revision leaves the file untouched) and a comp test that a second episode's
opening prompt carries what the first episode's review wrote.

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
6. **The Orchestrator's own context**, as specified above. Lands before the unattended stretch is
   measured, so the stretch measures episodes that remember.
7. **`TASK-163`** — what Isotopy is for, restated.
8. **`TASK-157`** — the arcade, built by the finished mechanism and then carried by it.

Left unwritten on purpose, because they are scoped from evidence this milestone has not produced
yet: the deploy target, the measured unattended stretch, and the MVP gap list that closes the
milestone and opens the launch. Relaxing gates as a schedule earns trust is filed separately as
`TASK-174`, deliberately outside this milestone.

**A schedule is a record; Aiki's cron is its clock.** The record stays the source of truth, and its
Aiki activation is derived from it after every change (`TASK-069`). Skip-overlap owes one run for
the windows missed while the machine slept or the server was down, and that crash safety lives in
Aiki's database.

**Product variants — Isotopy.gaming, Isotopy.travel — may ship their own schedules**, and remain
the milestone *after* MVP, decided with the product owner on 2026-08-21. A fork of a core that
cannot carry a product by itself forks the problem too. Recorded so it is not lost; not filed,
because nothing about it is decidable yet.

Cross-platform: cron is parsed in-process, never delegated to the OS — no `cron`, no `schtasks`.
Timezones are the known hazard and were accepted when cron was chosen; follow
`domain/rules/engine-limit.ts`. And `TASK-061` closed with the real sleep/wake check on both OSes
**reasoned through and not observed** — this is the first work in the repo where that gap actually
bites, so it gets tested rather than argued. The Orchestrator's context file is written with UTF-8
and LF, through the same temp-file-plus-`rename` as persona notes, which is atomic on both NTFS
and APFS for a same-directory rename.

### Plan

**Status, 2026-10-04.**

| Scope item | State |
| --- | --- |
| 1 · `TASK-154` adapter capabilities, Cursor resume | Done |
| 2 · `TASK-159` schedules | Done |
| 3 · `TASK-160` schedules in the rail | Done |
| 4 · `TASK-161` built-in board poller (shipped disabled) | Done |
| 5 · `TASK-162` the owner's boundary | Its boundary half shipped as `TASK-173`; the remainder (steps declaring agent, tools and MCP) moved to Backlog as a capability, not a blocker. PR #72 closed. |
| 6 · The Orchestrator's own context | Filed as **`TASK-178`**, with the design |
| 7 · `TASK-163` what Isotopy is for, restated | Last, as written |
| 8 · `TASK-157` the arcade | Next — base case first |
| Added on the way | `TASK-172` done. `TASK-170` (the operator channel — pino to the console and `~/.isotopy/logs/server.log`) and `TASK-168` (adding an existing folder as a project) done in PR #79. |

**Remaining order:**

1. **`TASK-157`, base case only.** The arcade built once with a human watching, driven through the dev app with a browser alongside, recorded section for section against `TASK-141`'s record. Schedules, the poller and the unattended stretch are explicitly not part of this pass. Its gap list feeds every step below.
2. **`TASK-178`** — the Orchestrator's own context, so the episodes that follow remember.
3. **`TASK-157`, the inductive step.** The arcade's standing objectives as schedules, the poller enabled against a board with `**Assignee:**` marks, and the unattended stretch measured. `TASK-169` (a real sleep/wake with a schedule pending) is observed during it, because it needs a human at the machine anyway.
4. **`TASK-163`** — the docs made true, after the mechanism works.

The deploy target, the length of the measured stretch and the MVP gap list stay unwritten until step 3 produces evidence, as decided.

**Changed with the owner, 2026-10-04.** *Isotopy.Travel* was recorded below as the milestone after MVP. The owner wants it as the big dogfood on a real, existing product (ShareTravel) once the arcade base case has run, rather than after MVP, so it is filed as its own task and does not wait for step 4. Separately, the durable runtime moved to Aiki in its own task, `TASK-069` (PR #83), outside this milestone.

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
**Updated:** 2026-10-04 19:42

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

### Plan

**Base case run 2026-10-04 — two engines side by side, cheapest settings.** Records: `docs/dogfood/TASK-157-claude-code-2026-10-04.md` (holds the comparison) and `docs/dogfood/TASK-157-cursor-2026-10-04.md`.

- **Claude Code · haiku (Pro plan) — PASS.** No questions; Developer + QA; two playable games (Number Guess, Click Master) with a correctly weighted total, verified in the browser with seeded and played scores; the Orchestrator stopped itself. $0.67 recorded. Its Developer killed Isotopy's own server mid-stage (`TASK-179`); durable recovery resumed the run after a manual restart.
- **Cursor · auto (free allowance) — NEEDS ATTENTION.** Planned a three-feature milestone after one well-posed question; delivered a well-tested shell (6 unit + 10 e2e), failed review and QA on a README Node floor, and the two fix runs never delivered the fix because they resumed the original Developer session (`TASK-180`); the initiative then stuck on a rejected decision (`TASK-182`). 511k / 70k / 2.21M cached tokens.

**Gap list (filed, Backlog):** `TASK-179`–`TASK-190`. The three that block an unattended stretch outright: `TASK-179` (an agent can kill the server), `TASK-180` (fix runs cannot converge), `TASK-182` (a bad decision stalls the initiative silently). `TASK-181` blocks the embedded Preview for every bare `.cmd` automation command on Windows.

**Stays in Next for the inductive step** (schedules, the poller, the measured stretch), which waits for `TASK-178` and the P1 gaps above.

---
