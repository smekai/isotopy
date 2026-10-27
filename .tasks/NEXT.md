# Next

## TASK-211: Restart ShareTravel on the standing team, and prove the epic with one task
**Priority:** P2 | **Tags:** setup, testing | **Epic:** Standing team
**Updated:** 2026-10-27 12:46

Child of `TASK-206`. Depends on `TASK-207`, `TASK-208`, `TASK-209` and `TASK-210`. This is the epic's live evidence.

**Setup.**

1. Update the `isotopy_travel` copy (`C:\Development\smekai\isotopy_travel`, ports 9577/5273, user home `~/.isotopy-travel`) to `main`.
2. ShareTravel fork (`C:\Development\smekai\sharetravel_ai`, `smekai/sharetravel_ai`): primary engine Claude Code, secondary Codex (installed and logged in through ChatGPT). Write its `team.md` from the template, adding a `discovery` flow with the project's `product-strategist`.
3. Get the work already done onto GitHub: the fork's local `main` is 35 commits ahead of `origin/main` (`TASK-107`, `TASK-104`, `TASK-147`, the discovery reports). Put them on a branch, open a PR, let the fork's CI (`.github/workflows/ci.yml`) run, and merge it by the new rule.

**Proof run.** One initiative for the fork's `TASK-138` (redeem an invite code in the same transaction as the sign-up). Expected path, with no owner approval: the Orchestrator picks the `delivery` flow → plan → implement on Claude → review on Codex with isolated context → verify against the local stack (`bun run init`) → release opens a PR in `smekai/sharetravel_ai` → CI green → Isotopy merges.

**Done when** that run completes as expected, and a short record under `docs/dogfood/` says what happened, what the owner had to do (target: nothing), and every gap found, each filed as its own task.

Cross-platform: a live Windows run; macOS is not exercised here and the record says so.

---
## TASK-209: The reviewer does not see the Developer's handoff unless the Orchestrator grants it
**Priority:** P1 | **Tags:** server, core | **Epic:** Standing team
**Updated:** 2026-10-27 12:46

Child of `TASK-206`. Independent of the other children.

**Today.** `upstreamFor` in `packages/server/src/workflow/stage-execution.ts` (~139–149) gives every stage every earlier stage's full output under "Handoff from previous steps" (`buildStagePrompt`, `packages/server/src/domain/markdown/stage.ts`). A reviewer therefore reads the Developer's own account of what it did and why — the framing an independent review should not start from. Persona notes are already private to each persona.

**Wanted.**

1. A stage declares `context: "handoffs" | "isolated"` (`stageDefinitionSchema` in `packages/core/src/pipelines.ts`, the role schema, run stages). `upstreamFor` filters by it.
2. `isolated` shows the task, its acceptance criteria and the plan stage's output, plus the initiative branch and its base so the reviewer reads `git diff <base>...<branch>` itself — but not the Developer's handoff or any other implementation-side markdown.
3. `review-implementation` defaults to `isolated`, in the bundled pipelines and in `TASK-208`'s template.
4. The Orchestrator may grant full context for one run: `start_run` takes `reviewContext: "handoffs"` with a required rationale, logged on the stage. The `review-run` and `orchestrate` steps say when that is worth it (e.g. a fix run whose reviewer must see why the previous review failed).
5. The review step task (`packages/server/src/domain/skills/step-tasks/review-implementation.md`) tells the reviewer to judge from the diff and the task, not from a narrative.

**Done when** component tests prove: an isolated reviewer's prompt has no Developer handoff and does name the branch and base; the plan output is present; a granted run includes the handoffs and logs the rationale; non-review stages are unchanged byte for byte. `docs/decisions.md` records what an isolated reviewer sees and why the plan stays visible.

Cross-platform: the diff command is the agent's to run; the prompt names refs, not paths, so nothing here differs between Windows and macOS. Tested on Windows.

---
## TASK-208: One team per project: team.md with named flows, changed only by an approved proposal
**Priority:** P1 | **Tags:** core, server | **Epic:** Standing team
**Updated:** 2026-10-27 12:46

Child of `TASK-206`. Depends on `TASK-207` (a role's `engine`).

**Today.** The Orchestrator composes a team for every initiative (`propose_team` in `packages/server/src/domain/skills/step-tasks/orchestrate.md`), the owner approves it (`OrchestrationService.approveTeam`, `packages/server/src/services/orchestration-service.ts` ~246–291), and it lives only on that orchestration (`approvedTeam`, `composedPipeline`). Schedules and duties pin a team of their own (`packages/core/src/schedules.ts` `team?`, duty front matter in `packages/server/src/schemas/agent-definition.ts`). Nothing persists a project's team.

**Wanted.**

1. **`<project>/.isotopy/team.md`**: YAML front matter parsed once at the boundary with a strict zod schema (a new file under `packages/server/src/schemas/`, modelled on `agent-definition.ts`), body free text for the owner. Visible to git like `agents/` and `steps/`.
   - `roster`: roles with `id`, `label`, `agent`, `engine` (`primary`/`secondary`), `modelTier`, `executionPolicy`.
   - `flows`: named, ordered lists of `{ role, step }`. The bundled template has `delivery` (plan → implement → review on secondary → verify → release → closeout) and `discovery` (research roles, no Developer).
2. **Seeding.** A project without `team.md` gets the bundled template the first time a team is needed, committed on the base like any other `.isotopy/` file the owner authors. The template replaces `FULL_DELIVERY_PIPELINE` and `PM_DEV_TEST_PIPELINE` as the source of team runs (`packages/core/src/pipelines.ts`).
3. **The Orchestrator picks a flow, not a team.** `start_run` names a `flow` from `team.md`, with no owner approval. `propose_team` is **replaced** by `propose_team_change`: a full new `team.md` plus a rationale. The owner approves it once; Isotopy writes and commits it, and it holds for every later initiative.
4. **Replace, don't accumulate:** in the same change remove `approvedTeam`, the team half of `approveTeam`, per-initiative composition in `orchestrate.md`, and the pinned `team` on schedules and duties (they name a `flow` instead). Keep `composeTeamPipeline` and `roleIssues` in `packages/server/src/domain/rules/team-composition.ts`, now building a pipeline from a flow.
5. Setup shows the team and its flows, read-only plus "edit team.md"; a pending `propose_team_change` shows as a diff to approve.
6. An invalid `team.md` refuses team runs with the validation issues, never a silent default.

**Done when** component tests prove: seeding and committing the template; a run started from a named flow without approval; a `propose_team_change` approved, written, committed and used by the next initiative; a schedule naming a flow; an invalid file refused. `docs/decisions.md` records "one team per project" and the rejected alternative (a default team with per-initiative edits); `docs/architecture.md` gains the team component.

Cross-platform: CRLF front matter (split on `\r?\n`), the team file path joined with `path.join`, ids validated before they reach a path; case-insensitive file systems on both Windows and macOS mean `Team.md` and `team.md` are the same file — read exactly `team.md`. Tested on Windows; macOS reasoned through.

---
## TASK-207: Each role runs on the primary or the secondary engine
**Priority:** P1 | **Tags:** core, server, engine | **Epic:** Standing team
**Updated:** 2026-10-27 12:46

Child of `TASK-206`. The foundation for an independent review: today one engine runs a whole run.

**Today.** `RunService.startRunWith` (`packages/server/src/services/run/run-service.ts`, ~386–416) sets `run.engine` once, falling back to `"claude-code"`, and `requireEngineReady` checks only that engine. Every caller of `runAdapter` in `packages/server/src/workflow/stage-execution.ts` (`runStageWork`, `runQuestionMediationWork`, `runOrchestratorReviewWork`) passes `run.engine`. Only `modelTier` varies per stage (`stageDefinitionSchema` in `packages/core/src/pipelines.ts`, `orchestratorRoleSchema` in `packages/core/src/orchestration.ts`, `withRoleTiers`). `selectModel` lets a pinned `run.model` override every stage.

**Wanted.**

1. Project preferences (`ProjectPreferences` in `packages/core/src/settings.ts`) hold a `primaryEngine` and an optional `secondaryEngine`, each with its model from `engineModels`. `preferredRunOptions` and Setup follow. Replace the single `engine` preference rather than keeping both.
2. A role and a stage declare `engine: "primary" | "secondary"` (default `primary`): `orchestratorRoleSchema`, `stageDefinitionSchema`, run stages in `packages/core/src/runs.ts` and `packages/server/src/schemas/run-persistence.ts`, copied by `toStage` in `packages/server/src/domain/rules/team-composition.ts`. The run records the resolved engine id on each stage, so history does not change when settings do.
3. Without a configured secondary engine, a `secondary` stage runs on the primary one and its log says so.
4. `runStageWork` runs a stage on its own engine; `selectModel` resolves the tier against that engine's roster, and a pinned model applies only to stages on the engine it belongs to.
5. `requireEngineReady` checks every distinct engine the pipeline uses before the run starts; an engine that is not logged in refuses the run with its name.
6. Engine labels, the "online" line, handoff metadata, usage and limit handling (`run-service.ts` ~653–696) are per stage. A limit on the secondary engine parks only that stage.
7. The bundled `review-implementation` role in `FULL_DELIVERY_PIPELINE` defaults to `secondary`.

**Done when** component tests (FakeEngine for two engine ids) prove: a stage on the secondary engine; the fallback to primary with its log line; readiness refused for an unready secondary; a pinned model not leaking to the other engine; a resumed turn staying on its stage's engine. `docs/decisions.md` records primary/secondary over a free per-role engine id, and why.

Cross-platform: engine discovery already differs per OS (`ISOTOPY_CLAUDE_PATH`, `ISOTOPY_CODEX_PATH`, `ISOTOPY_CURSOR_PATH`); this task adds no new path handling, only routing. Tested on Windows; macOS reasoned through.

---
## TASK-206: Standing team — one team per project, review by a second model, release through a pull request
**Priority:** P1 | **Tags:** core, server, engine | **Epic:** Standing team
**Updated:** 2026-10-27 12:45

The umbrella of the **Standing team** epic. Filed 2026-10-27 with the owner, from the ShareTravel dogfood.

**What the dogfood showed.** Isotopy delivered real features on ShareTravel (`TASK-107`, `TASK-104`, `TASK-147` in the fork), but:

- **No pull request, ever.** An initiative merges its branch into the local base (`InitiativeBranches.merge`, `--no-ff`; decision 2026-10-15 "Isotopy never pushes"). 35 commits reached the fork's `main` without CI or a human seeing them, and none of them is on GitHub.
- **A new team for every initiative.** `propose_team` → `approveTeam` → `composeTeamPipeline` keeps the team on the orchestration only (`approvedTeam`, `composedPipeline`). Membership, models and order differ each time, and each time the owner is asked to approve.
- **Review is not independent.** One engine runs the whole run (`run.engine`, set once in `startRunWith`), and the reviewer reads the Developer's full handoff (`upstreamFor` passes every earlier output).

**Owner decisions, 2026-10-27.**

1. Isotopy merges its own pull request when review passed and CI is green.
2. Review runs on a **secondary engine** (Codex or Cursor) by default. Without one, the same engine reviews, but with isolated context: the reviewer does not see the Developer's markdown handoff unless the Orchestrator grants it.
3. A project has **one team**, like a real team. It changes only through a proposal the owner approves once.
4. Release is push, pull request, preview or staging deploy when configured, and waiting for CI. Production deploys stay the owner's.
5. Fewer owner approvals is a goal in itself: a run with an unchanged team needs none.

**Children, in order.**

| Task | What | Depends on |
| --- | --- | --- |
| `TASK-207` | Each role runs on the primary or the secondary engine | — |
| `TASK-208` | One team per project: `team.md` with named flows | `TASK-207` |
| `TASK-209` | The reviewer does not see the Developer's handoff | — |
| `TASK-210` | Release through a pull request: push, PR, preview, CI, merge | — |
| `TASK-211` | Restart ShareTravel on the standing team | 207–210 |

`TASK-209` and `TASK-210` can run in parallel with `207 → 208`; each child is its own branch and PR.

**Done when** `TASK-211`'s live run passes: a ShareTravel task goes plan → implement (Claude) → review (Codex, without the handoff) → verify → release, a PR appears in `smekai/sharetravel_ai`, CI is green, Isotopy merges it, and the owner approved nothing.

**Not this:** production deploy by Isotopy; a marketplace of teams; changing what `TASK-196`'s agents and steps are.

Cross-platform: every child carries its own line; the shared hazards are `git`/`gh` subprocesses (argument arrays through `runSubprocess`, never a shell string), CRLF in `team.md` front matter, and paths in PR bodies.

---
## TASK-196: Shared agents — a team can be more than a dev team, and a project brings its own
**Priority:** P1 | **Tags:** core, server | **Epic:** Shared agents
**Updated:** 2026-10-11 18:20

The umbrella of the **Shared agents** epic. Filed 2026-10-10 with the owner, as the first step of the ShareTravel dogfood.

**Isotopy's team is fixed to software delivery.** Three hard-coded lists decide who may be on it:

- `PERSONA_CATALOG` and `STEP_TASK_CATALOG` in `packages/server/src/domain/skills/catalog.ts`. They are what the Orchestrator is told it can pick, and what `domain/rules/team-composition.ts` accepts.
- `AGENTS` in `packages/core/src/agents.ts`, the name and glyph the UI shows.

The loader is already open: `loadSkill` composes a persona that exists only as a project file. But the Orchestrator never hears of it, and `composeTeamPipeline` refuses it as `Unknown persona`. So a project cannot add a growth marketer, an SEO writer or a community manager, and even if it could, there would be no step for them to take: all thirteen step tasks are about building software.

**Why now.** The ShareTravel dogfood (the owner's decision of 2026-10-04, recorded in `NEXT.md` under `TASK-156`) is about getting people to use a product that already works, not about building it. A team that can only plan, implement, review and verify cannot do that.

### An agent is a folder

What makes an agent useful already exists, in pieces, in four places. This epic gives the pieces one home and separates what travels from what stays. All paths are under `<project>/.isotopy/`.

| Part | What it is | Where | Travels in a pack |
| --- | --- | --- | --- |
| Identity | Who it is and how it judges | `agents/<id>/agent.md` | yes |
| Knowledge | Reference material it ships with: playbooks, checklists, a market brief | `agents/<id>/knowledge/*.md` | yes |
| Duties | Recurring work it brings, as schedule templates | `agents/<id>/duties/*.md` | yes |
| Steps | Assignments an agent can take | `steps/<id>.md` | yes |
| Tools | MCP servers a step needs | step front matter (`TASK-162`) | yes |
| Notes | What it learned in this project (`TASK-113`) | `skills/<id>.notes.md` | **never** |
| Project addendum | This project's tweaks to it | `skills/<id>.project.md` | **never** |

The split is the point. A pack copied from one project to another must never carry what an agent learned about the first one.

### What this is not

- **Not a vector store or RAG.** Knowledge is markdown in the repository, and the harness reads it when the step needs it.
- **Not a trigger of its own.** A duty is a schedule; cron stays the only thing that starts work.
- **Not a plugin runtime.** An agent is data. Nothing in a pack runs on the server; the one thing that reaches past markdown is a declared tool, and installing a pack shows those first (`TASK-200`).
- **Not a marketplace, yet.** A marketplace is a list of packs. It waits until two projects want the same agents.

### Evidence for the epic

The ShareTravel fork brings a growth team as plain files: a `growth-marketer` agent with a knowledge folder, `plan-campaign`, `draft-content` and `review-metrics` steps, and a weekly metrics duty. The Orchestrator proposes that team for a growth goal, the owner approves it, it runs, and the duty fires once enabled — **with no change to Isotopy's source for ShareTravel's sake.**

Cross-platform: each child carries its own line; the shared hazards are directory discovery (`readdir` + `path.join`, ids validated before they reach a path), CRLF front matter, and case-insensitive file systems on both Windows and macOS.

### Plan

**Planned 2026-10-10, with the owner. Scope widened 2026-10-11:** `TASK-197` to `TASK-200` ship in one PR (`feature/shared-agents-196`, `0.14.0` onward). `TASK-162` stays open after it.

**Order inside the PR.** Front matter on every bundled file → `.isotopy/` lets git see what the owner authors → the catalog → `GET /agents` and Setup → runs record their agents → knowledge → duties → packs from a folder → packs from git → "Add agents from…" in Setup.

**Decided at planning.** Each is recorded in `docs/decisions.md` by the commit that lands it.

- **Front matter is YAML**, parsed with the `yaml` package and validated strictly with zod at the boundary. Keys follow Claude Code's own agent and skill files (`name`, `description`); Isotopy adds `title` and `glyph`. `name` is always an id, `title` always a display name. Rejected: the hand-rolled grammar on PR #72's branch, and JSON metadata.
- **There is one way to replace a bundled persona:** `agents/<id>/agent.md`. `skills/<id>.md` goes. A folder with a bundled id and no `agent.md` adds knowledge and duties to the bundled agent.
- **There is no user-level agents directory.** An agent reaches another project by being installed into it. The user-level override of a bundled persona stays.
- **`.isotopy/` stops ignoring what the owner authors:** `agents/`, `steps/` and `packs.json` become visible to git; everything Isotopy produces stays ignored.
- **A run records each stage's agent title and glyph**, so history does not change when an agent is renamed or removed. The core `AGENTS` table goes.
- **Seeded duties start disabled**, as the board poller does today. **Learned notes never leave the project.**
- **A pack source may name a folder inside a git repository**, so any project's `.isotopy/` is already a pack.

**Answered by the owner, 2026-10-10.**

1. `TASK-162` is rescoped: its catalog half is `TASK-197`'s; it keeps `agent`, `tools`, `context`, `setup` and the MCP plumbing.
2. The `builtInSchedules` switch covers every seeded duty.
3. Packs install from a folder or git, with no diff view; a re-install that would overwrite an edited file refuses and lists it.

---
## TASK-156: Milestone I — Induction: a product the team carries on its own
**Priority:** P1 | **Tags:** core, server, ui, engine, testing, milestone-i
**Updated:** 2026-10-09 17:59

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

**Status, 2026-10-09.**

| Scope item | State |
| --- | --- |
| 1 · `TASK-154` adapter capabilities, Cursor resume | Done |
| 2 · `TASK-159` schedules | Done |
| 3 · `TASK-160` schedules in the rail | Done |
| 4 · `TASK-161` built-in board poller (shipped disabled) | Done |
| 5 · `TASK-162` the owner's boundary | Its boundary half shipped as `TASK-173`; the remainder (steps declaring agent, tools and MCP) moved to Backlog as a capability, not a blocker. PR #72 closed. |
| 6 · The Orchestrator's own context | Done — `TASK-178` |
| 7 · `TASK-163` what Isotopy is for, restated | Last, as written |
| 8 · `TASK-157` the arcade | Base case done 2026-10-04; the inductive step is next |
| Added on the way | `TASK-172` done. `TASK-170` (the operator channel — pino to the console and `~/.isotopy/logs/server.log`) and `TASK-168` (adding an existing folder as a project) done in PR #79. From the arcade's gap list, `TASK-179`, `TASK-180`, `TASK-181` and `TASK-182` are done. |

**Remaining order:**

1. ~~**`TASK-157`, base case only.**~~ Done 2026-10-04; its gap list is `TASK-179`–`TASK-190`.
2. ~~**`TASK-178`** — the Orchestrator's own context.~~ Done.
3. **`TASK-157`, the inductive step.** The arcade's standing objectives as schedules, the poller enabled against a board with `**Assignee:**` marks, and the unattended stretch measured. `TASK-169` (a real sleep/wake with a schedule pending) is observed during it, because it needs a human at the machine anyway. Before it, weigh the open gaps that would undermine an unattended run: `TASK-185` (debris and nothing committed) and `TASK-186` (the time budget read as a deadline).
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
