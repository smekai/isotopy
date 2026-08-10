# Backlog

## TASK-125: Milestone F — Fixpoint: stabilise to a demoable MVP
**Priority:** P0 | **Tags:** core, server, ui, engine, infra, milestone-f
**Updated:** 2026-08-07 11:40

A fixed point is where a system stops changing under its own operation. That is the goal:
stop adding, and make what exists hold still and hold up.

**The bar:** someone who is not us installs it, points it at a folder, describes a goal —
and *sees the thing that was built*. Today the last step barely exists. A run ends and the
result is somewhere on disk, and you have to already know where.

**Scope:** `TASK-126` (show what was built), `TASK-092` (project automation and preview
deploy — the dependency under 126's second half), `TASK-124` (permission modes and blast
radius), `TASK-127` (a stage must not pass on output nothing could use), `TASK-129` (model
presets rather than ids the plan rejects), `TASK-115` (per-role presets, pulled out of
Milestone H once `TASK-129` made a stage's model something an agent can reason about),
`TASK-116` (README "How it works"), `TASK-137` (one dialog with the Orchestrator, last
before the dogfood), and `TASK-128` (the closing dogfood).

Nothing else. Features nobody has asked for belong to **Milestone H — Harmonic**; the two
research spikes belong to no milestone at all. `TASK-137` is here because a user asked for
it and because F's bar is a first-time user meeting the Orchestrator — the one surface the
demo cannot route around.

Cross-platform: every task here is verified on Windows and reasoned through for macOS,
and `TASK-092`'s process handling is where that bites hardest.

---

## TASK-126: Show the user what was built
**Priority:** P0 | **Tags:** ui, server, milestone-f
**Updated:** 2026-08-07 11:40

There is no clear way to look at the product ADHD just built. A finished run leaves files
somewhere and says so in prose; the user is left to find them.

**Always:** a finished run ends by naming what changed — the files it created and edited,
linked, with the project folder one click away. This must work for every run, on every
engine, with no project configuration at all.

**When the project declares how to start itself:** additionally offer to run it and show
it — start the product, wait for readiness, and put it in front of the user. That half
depends on `TASK-092`'s automation config for the start command, readiness check and port
strategy, and must degrade honestly to the always-half when no such config exists.

Do not start anything the user did not ask to start, and stop whatever was started when
they are done looking — `TASK-117` closed a stage that hung for its whole engine timeout
because an agent left a dev server running.

Cross-platform: opening a folder and starting a process differ per OS; go through
`runSubprocess` with executable-plus-argument arrays, never a shell string.

---

## TASK-137: One dialog with the Orchestrator, not two tabs
**Priority:** P1 | **Tags:** ui, milestone-f
**Updated:** 2026-08-10 12:41

**Last piece of work in Milestone F**, after `TASK-116` and immediately before the closing
dogfood `TASK-128` — the dogfood is where a first-time user meets the Orchestrator, so it
should meet the merged dialog rather than the two tabs.

An orchestration run opens on `Orchestrator` and puts `Chat` next to it, and the user has
to keep both in their head: the team proposal, the latest decision and the child runs live
on one tab, and the conversation those decisions are about lives on the other. The seam is
already visible in the product's own copy — `LatestDecision` tells the user to *"Answer in
the Chat tab to continue."* A panel that has to point at another tab to be usable is one
panel too many. The Orchestrator is who you talk to for most of an initiative; talking to
it should be one thread.

**The ask (from a user, which is what `TASK-134` said to wait for):** an orchestration run
has a single dialog. No `Orchestrator` tab.

**Fold into the thread.** Everything on `OrchestratorPanel` is either a message, a control
that belongs to a message, or run chrome:

- *Team proposal* — an inline card in the thread where the Orchestrator proposed it,
  carrying its own **Approve & start** / **Stop**. It is a turn in the conversation, not a
  standing panel; once approved it stays in the scrollback as what was agreed.
- *Latest decision* — a turn in the thread. An `ask_user` decision renders as the question
  it is, answered by the composer already sitting below it. The "Answer in the Chat tab"
  sentence is then deletable, which is the test that this worked.
- *Child runs* — each appears in the thread at the point the Orchestrator started it,
  linked, so the initiative reads chronologically instead of as a sidebar list. Decide
  whether the flat "Runs in this initiative" list still earns its place anywhere; if the
  rail already answers "what else is in this initiative", it does not.
- *Goal, status pill, stop reason, decision error, Stop* — run chrome. `RunStatusBar` and
  the pipeline row above the tabs are where a run already says what it is and how it is
  doing; the Orchestrator's goal and status are the same question asked about the
  initiative and belong with them, not in a scroll region.

**Keep the interleaving honest.** The thread is `buildTranscript(run)` over one run, and
orchestration state arrives from a different load (`useOrchestration`) that can land before
or after it — `RunTabs.comp.tsx` already pins that ordering hazard. The merged view needs a
defined order for orchestration turns against transcript turns, and must not jump or
duplicate when the second source arrives late.

**What falls out.** `RunTab` loses `"team"`; `tabsFor` loses its orchestration branch and
the effect that force-opens it; an orchestration run then has the same three tabs as any
other. `run-tab-team` disappears from the testid list. Update `docs/architecture-ui.md` —
"Two pipelines earn a fourth tab" becomes one pipeline (milestone planning keeps `Plan`;
this task does not touch it) — and `docs/decisions.md` gets the dated entry for why the
Orchestrator stopped being a tab. `RunTabs.comp.tsx` and `orchestrator-flow.e2e.ts` both
drive the tab today and both need rewriting against the single thread.

**Not in scope:** the `Plan` tab, the composer, and anything about *what* the Orchestrator
decides. This is where its output is shown, not how it thinks.

Cross-platform: n/a — pure UI, no paths, processes or shelling out.

---

## TASK-128: Closing dogfood for Milestone F
**Priority:** P1 | **Tags:** testing, engine, ui, milestone-f
**Updated:** 2026-08-07 11:40

Milestones D and E both closed on a live dogfood rather than on tests, and F closes the
same way — but from a *clean* state, because F's bar is a first-time user.

Start from an empty `ADHD_USER_HOME`, install as the README instructs, register a fresh
project, and drive one goal end to end: build, evolve, and **see the result** through
`TASK-126`. Record what a newcomer would hit — every place the app assumes knowledge the
person does not have. Fix what is small; file what is not.

Record a release verdict for Milestone F.

Cross-platform: run on Windows; confirm every documented command is valid on macOS.

---

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
**Updated:** 2026-08-07 11:40

Show Isotopy to people who might want it, find out what they actually need, and build
that — rather than what we guessed while building it.

**Goal:** the features in this milestone are chosen by users, not by us. `TASK-135`
collects the feedback; what follows is decided by what it says.

**Parked here pending that evidence:** `TASK-111` (reusable teams), `TASK-113` (per-persona
accumulated context), `TASK-115` (per-role engine/model configuration), `TASK-095`
(agent-native browser testing for QA). Each was written as post-MVP by whoever deferred
it, and none has a user behind it yet. Build the ones feedback asks for; reject the rest
rather than letting them age in the backlog.

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

## TASK-124: Orchestrator-brokered permission modes for the harnesses
**Priority:** P1 | **Tags:** core, server, engine, adapters, milestone-f
**Updated:** 2026-08-07 11:40

**Milestone F — Fixpoint.** Blast radius has to have an opinion before strangers point
agents at their own machines. `TASK-117` supplied the concrete argument: a Developer agent
started a dev server on port 5173 — ADHD's own UI port — and left it running, and nothing
in the system had a view on whether that was acceptable.

Every engine runs effectively unrestricted today — Claude `--dangerously-skip-permissions`, Codex `--dangerously-bypass-approvals-and-sandbox`, Cursor `--force` — and the one alternative, `acceptEdits`, degrades back to the same on Cursor and Codex, both of which log that they have no accept-edits-only headless mode.

Post-MVP, add a **controlled** mode per engine (Claude's `acceptEdits`/auto, Codex's `--sandbox workspace-write` with on-request approval, Cursor documented as degrading) and route the resulting approval requests to the Orchestrator, which already brokers questions (`TASK-120`). The Orchestrator decides on security and cost grounds and escalates to the user only when the blast radius is real: spending money, reaching the network, touching credentials, or writing outside the workspace.

The brokering policy is the point: **prefer the bounded option over the metered one** — a fixed-price host over pay-per-use credits, reversible over irreversible, and never enter credentials. That is what makes a controlled mode worth the stalls it costs.

Cross-platform: mode flags differ per CLI, not per OS; verify the Windows and macOS argument arrays through `runSubprocess` without shell-only commands.

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

## TASK-115: Per-role model presets, chosen by the Orchestrator
**Priority:** P2 | **Tags:** core, server, ui, engine, milestone-f
**Updated:** 2026-08-09 00:00

**Moved out of Milestone H by `TASK-129`.** It was parked as "build only if feedback asks
for it" because per-stage *model ids* meant asking a user, or an agent, to track ids that
turn over monthly. Presets removed that objection: a stage carrying `fast` or `deep` is
something both a person and the Orchestrator can reason about, and getting it wrong costs
a rung rather than a failed run.

**Most of the server work is already done.** `ModelTier` exists, and
`stage-execution.ts` resolves the run's tier **per stage** rather than at run start —
that seam was built for this task. What remains:

- a per-stage tier on the workflow input / stage state, falling back to the run's;
- the Orchestrator assigning one per role at team-composition time — a
  `team-composition.ts` schema field plus the prompt work to make the choice reasoned
  (cheap model doing the typing, expensive one deciding);
- the team-review UI showing and letting the user change each role's rung before approval;
- limit-park handling per stage: a rung that hits a plan limit must drop that stage, not
  the whole run.

Cross-platform: n/a — resolution and the effort flags already go through the adapters.

---

## TASK-116: README — top-level product schema (“How it works”)
**Priority:** P1 | **Tags:** ui, server, milestone-f
**Updated:** 2026-08-07 11:40

**Milestone F — Fixpoint.** Comprehension before exposure: the README still explains the
static pipelines and not the Orchestrator that now sits above them.

Add a “How it works” section to `README.md` with a mermaid diagram of the whole product flow: user → orchestrator conversation → team composition/approval → composed runs (personas + step-tasks + engines) → closeout artifacts → orchestrator decision loop → milestones/task board.

Update this section as part of the milestone so it reflects the orchestrator rather than only today’s static pipelines.

Cross-platform: n/a — docs only.

---

## TASK-095: Agent-native browser testing for QA
**Priority:** P3 | **Tags:** testing, adapters, engine, milestone-h
**Updated:** 2026-08-07 11:40

**Milestone H — Harmonic. Build only if feedback asks for it.** Playwright covered QA
through Milestone E without complaint, including the live browser verification in
`TASK-117`.

**Stays parked (re-confirmed 2026-08-03):** TASK-051 closed by deliberately keeping QA on Playwright only for the MVP and deferring agent-native browser support here. This is a new capability seam, not cleanup, so it does not ride along with the Milestone D close-out.

Add a vendor-neutral testing seam for browser-control capabilities exposed by Codex, Cursor, Claude, or another active harness. QA may use an available native browser first for exploratory and visual checks, then promote stable behaviour into repository-owned Playwright tests. When no compatible capability exists, Playwright remains the complete fallback and CI authority.

Cross-platform: support Windows and macOS capability detection and degrade to Playwright with an accurate recorded reason. This is explicitly outside the Milestone D MVP.

---

## TASK-092: Release management and preview deployment automation
**Priority:** P0 | **Tags:** server, adapters, setup, infra, milestone-f
**Updated:** 2026-08-07 11:40

**Milestone F — Fixpoint, and no longer deferrable.** `TASK-126` needs the start command,
readiness check and port strategy this task defines in order to run a built product and
show it. Deferred through Milestones D and E on the grounds that the seam degraded
honestly without it — that reasoning ends where "see what was built" begins.

Add typed project automation configuration for validation, UI startup, health checks, preview deployment, and production deployment. Make Setup deploy cards functional. Release Manager produces a manifest and checklist; SRE deploys preview only after quality passes and keeps production explicitly human-gated.

**Deliberately outside the Milestone D MVP.** The Full Delivery pipeline already carries the `release` and `deploy` stages, and their step-tasks end with `VERDICT: SKIP` when no target is configured — so the seam exists and degrades honestly without this task. Deferring it is also why TASK-093 presents neither deploy URLs nor QA screenshot/trace evidence.

Cross-platform: use executable-plus-argument arrays, `runSubprocess`, and Windows/POSIX overrides without shell-only commands.

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
