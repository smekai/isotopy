# Backlog

## TASK-144: A run must name files it edited that were already dirty when it started
**Priority:** P0
**Tags:** server, testing, milestone-h
**Updated:** 2026-08-17 13:10

Found by the `TASK-141` dogfood. `RunChangeCollector` records a git-status baseline at run start
and compares status codes at the end, so a file already ` M` when the run began is still ` M`
afterwards and is reported as unchanged — even when the run rewrote it.

In the dogfood, run 3 existed **only** to edit `src/main.ts`, did edit it, and reported "1 created"
with no edits at all. This is not an edge case: every run after the first in an Orchestrator
initiative starts against a dirty tree, so `TASK-126`'s bar — a finished run names what it changed
— is systematically under-met from run 2 onward, exactly when the user most needs to see what the
retry actually did.

Compare content, not status codes: hash the tracked files at baseline (or record blob oids) and
diff hashes at capture. The snapshot path already does content comparison; the git path is the one
that regressed. Cover it with a test that dirties a file, runs, edits it further, and asserts it
appears as `edited`.

Cross-platform: n/a — hashing and git plumbing, no process spawning or new path construction.

---

## TASK-145: A run must not mutate the host's global toolchain
**Priority:** P0
**Tags:** engine, testing, milestone-h
**Updated:** 2026-08-17 13:10

Found by the `TASK-141` dogfood. With no native browser capability available, the tester persona
correctly fell back to Playwright — the policy `TASK-138` wrote into it — but reached that fallback
by running `npm install playwright@1.62.1` and `npx playwright install` in a scratch folder. That
pruned `chromium_headless_shell-1228` from the user-level `ms-playwright` cache: the exact build
this repo's own `@playwright/test@1.61.1` e2e suite depends on. `pnpm e2e` would have failed on the
host machine until the browser was reinstalled by hand, which the dogfood had to do.

A run must not leave the user's shared tooling worse than it found it. Options, cheapest first:
prefer the target project's own Playwright when it has one; pin `PLAYWRIGHT_BROWSERS_PATH` to a
run-scoped directory so an install cannot touch the shared cache; and state the constraint in the
tester persona so the fallback is bounded rather than open-ended.

Cross-platform: the shared cache exists on both Windows (`%LOCALAPPDATA%\ms-playwright`) and macOS
(`~/Library/Caches/ms-playwright`); the fix must scope the path on both.

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

Cross-platform: whatever this milestone builds carries the same Windows and macOS bar as
everything else.

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

## TASK-111: Reusable teams for later orchestrations
**Priority:** P3 | **Tags:** core, server, milestone-h
**Updated:** 2026-08-07 11:40

**Milestone H — Harmonic. Build only if feedback asks for it.** Written as post-MVP when
Milestone E deferred it; no user has yet said they recompose teams often enough to mind.

Persist approved team compositions to `.adhd/teams/<id>.json` with a strict schema and a single writer. The orchestrator lists and reuses saved teams across later conversations instead of recomposing from scratch.

Cross-platform: n/a — JSON + path-joined storage under the existing `.adhd` roots.

---

## TASK-113: Per-persona accumulated context (artifact distilled memory)
**Priority:** P3 | **Tags:** core, server, ui, milestone-h
**Updated:** 2026-08-07 11:40

**Milestone H — Harmonic. Build only if feedback asks for it.** The evidence to wait for
is a user saying an agent kept relearning the same thing about their project.

Distill closeout knowledge into per-persona accumulated notes under `.adhd` and inject those notes into `composeSkill` alongside existing user/project overrides.

Also add an orchestrator-facing constraint digest so the orchestrator can reason about “must-do differently for stage X in this project” without needing deep per-agent state.

Cross-platform: path-joined read/write to `.adhd` roots; no subprocess/shell assumptions.

---

## TASK-069: Spike — Aiki durable runtime on a comparison branch
**Priority:** P3 | **Tags:** server, engine, infra
**Updated:** 2026-08-07 11:40

**No milestone, deliberately.** Research cannot close a milestone, so this sits outside
F, G and H rather than diluting one of them. Pick it up when a runtime question forces it.

**Deprioritized to P3 on 2026-08-03:** OpenWorkflow landed under TASK-068 and then survived a real mid-flight process kill in the TASK-094 dogfood, resuming without re-running completed stages. The comparison this spike was written to force has largely been answered by that evidence, so it is no longer worth a branch's cost.

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

## TASK-036: Spike — sandcastle as the implement-stage harness/sandbox layer
**Priority:** P3 | **Tags:** adapters, engine
**Updated:** 2026-08-07 11:40

**No milestone, deliberately.** Same reason as `TASK-069`. Its premise has also weakened:
the subprocess harness it proposed replacing now exists, is dogfooded, and was hardened
again in `TASK-117`.

Evaluate [mattpocock/sandcastle](https://github.com/mattpocock/sandcastle) as the execution layer behind the implementation stage instead of building the subprocess harness (TASK-006) from scratch. It's a TS library (`sandcastle.run()`) that runs a coding agent in an isolated sandbox and merges commits back: Docker/Podman/Vercel-Firecracker providers, git-worktree isolation, branch strategies, session capture/resume, typed structured-output extraction, lifecycle hooks — provider-agnostic (Claude Code, Codex, Cursor).

**Questions to answer:**
- Does its `HarnessAdapter`-shaped surface map cleanly onto our EngineAdapter interface? What do we still own (stage handoff, artifacts, gates, dashboard)?
- Wrap `sandcastle.run()` vs. build generic subprocess harness (TASK-006) — cost, control, and lock-in tradeoff.
- Session resume + structured output: do they cover our restart-single-stage and artifact-capture needs?
- Sandbox providers: does Vercel/Firecracker help our deploy-anywhere story or is it out of scope?
- Maturity/API stability and dependency weight.

**Deliverable:** short recommendation (adopt / borrow patterns / pass) + impact on TASK-006/TASK-021. Not a competitor — a build-on candidate; see docs/competitor-matrix.md §6.

---
