# Backlog

## TASK-144: A run must name files it edited that were already dirty when it started
**Priority:** P1
**Tags:** server, testing
**Updated:** 2026-08-17 12:30

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
**Priority:** P1
**Tags:** engine, testing
**Updated:** 2026-08-17 12:30

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
**Tags:** infra, testing
**Updated:** 2026-08-17 12:30

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
**Priority:** P3
**Tags:** server, ui
**Updated:** 2026-08-17 12:30

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
