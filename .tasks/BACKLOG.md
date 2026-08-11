# Backlog

## TASK-130: Milestone G — Gauge: rename ADHD to Isotopy
**Priority:** P1 | **Tags:** core, server, ui, infra, milestone-g
**Updated:** 2026-08-07 11:40

A gauge transformation changes the representation and not the physics. That is exactly
this milestone: the product becomes **Isotopy**, and nothing it does changes.

Do it before anyone outside sees the product, and after `TASK-125` — renaming a system
that is still moving means renaming it twice.

**Open question this epic settles first:** what "Isotopy" expands to, if anything. "ADHD"
was a backronym — *Artificial Development, Human Directed* — and the new name needs its
own answer or an explicit decision to have none. Everything downstream quotes it.

**Split by contract surface** — `TASK-131` (visible), `TASK-132` (code), `TASK-133` (data
and protocol) — because the rename touches 262 files and a half-renamed system is worse
than either end state.

**Clean break, decided with the user on 2026-08-07:** no migration, no dual-parsing, no
compatibility shims. Local run history under `.adhd` is abandoned rather than carried
across. There are no external users; a migration path written now is one we delete later.

Cross-platform: path and env-var handling already goes through `paths.ts` and `config.ts`;
the rename must not introduce a literal separator anywhere.

---

## TASK-131: Rename the visible surface to Isotopy
**Priority:** P1 | **Tags:** ui, infra, milestone-g
**Updated:** 2026-08-07 11:40

Product name and tagline, `README.md`, everything under `docs/`, `CLAUDE.md`, `AGENTS.md`,
the generated skills under `.claude/skills/`, UI strings and the window title,
`packages/ui/public/adhd-icon.png`, and the GitHub repository with its URLs in
`package.json` (`repository`, `homepage`, `bugs`).

Depends on `TASK-130` having settled the expansion, since the tagline quotes it.

Cross-platform: n/a — text and assets.

---

## TASK-132: Rename the code surface to Isotopy
**Priority:** P1 | **Tags:** core, server, ui, milestone-g
**Updated:** 2026-08-07 11:40

- `@adhd/core`, `@adhd/server`, `@adhd/ui` → `@isotopy/*` — 272 references across
  `package.json` files, imports, `tsconfig` paths and `pnpm-workspace.yaml`.
- `ADHD_*` environment variables → `ISOTOPY_*` — 145 references: `ADHD_HOME`,
  `ADHD_USER_HOME`, `ADHD_PORT`, `ADHD_UI_PORT`, `ADHD_ENGINE_TIMEOUT_MS`,
  `ADHD_E2E_LIVE`, and the per-engine path and argument overrides.
- The `X-ADHD-Project` header → `X-Isotopy-Project` — 14 references across
  `routes/project-scope.ts`, the UI's single network module, and the test harness.

Mechanical, but verify by running rather than by grepping: `pnpm dev`, one real run, and
the full e2e suite.

Cross-platform: env-var names are case-sensitive on POSIX and not on Windows — rename
every reader and writer together, not one side.

---

## TASK-133: Rename the data and protocol surface to Isotopy
**Priority:** P1 | **Tags:** server, core, engine, milestone-g
**Updated:** 2026-08-07 11:40

The two surfaces that are contracts rather than names, which is why they are their own
task.

- **On-disk `.adhd` → `.isotopy`** — 169 references. `~/.adhd/` (registry, settings,
  credentials, the home project) and every project's `.adhd/` (runs, `runs.db`,
  artifacts, orchestrations, milestones, teams). **No migration:** existing directories
  are left where they are and ignored, and the task must say so in the code review so
  nobody adds a reader for them later.
- **Protocol fences** — 42 references. `adhd-orchestrator-decision`, `adhd-run-artifacts`
  and `adhd-milestone-plan` appear in the bundled step tasks that instruct the model, and
  in the extractors under `packages/server/src/schemas/` that parse what comes back.
  Rename both sides in one change; a mismatch means every decision fails to parse and
  every run needs attention. **No dual-parsing** — old persisted outputs stop being
  readable, and that is accepted.

Verify with a real run on at least two engines: the model must emit the new fence and the
extractor must accept it.

Cross-platform: n/a — the directory name is a literal, and joins already go through
`paths.ts`.

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
