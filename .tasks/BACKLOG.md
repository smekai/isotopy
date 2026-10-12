# Backlog

## TASK-202: The server is organised by concept, and a boundary schema is the domain type
**Priority:** P2 | **Tags:** server, infra
**Updated:** 2026-10-12 19:51

Raised by the owner on 2026-10-12, reviewing `schemas/agent-definition.ts` in the Shared agents PR (#86). **Think first**: the shape below is a starting point to discuss, not a decision.

### The problem

**1. One concept is spread across layers.** Nine places know what an agent is: `schemas/agent-definition.ts`, `domain/rules/agent-catalog.ts`, `domain/rules/persona-notes.ts` (`SKILL_ID`), `domain/markdown/front-matter.ts`, `domain/markdown/skill.ts`, `domain/skills/*`, `services/agent-catalog.ts`, `routes/agents.ts` and `core/agents.ts`. Schedules, runs and milestones are split the same way. That is rule A3: folders are named for a layer, never a concept.

**2. The line between `schemas/` and `domain/` is blurred, and moving files into concept folders would not fix it.**
- `agent-definition.ts` holds the zod shapes and, next to them, domain rules: `name` must equal the folder id, a duty's body must not be empty, `composable` defaults to `true`.
- It also hand-writes `AgentDefinition`, `StepDefinition` and `DutyDefinition`, which restate what zod already knows (`PersonaFrontMatter` → `toAgent` → `AgentDefinition`).
- The same thing is described twice. Put both files in `src/agents/` and the two halves simply sit in one folder.

### A shape to start from

1. **One rule that removes the duplicate.** Reading one input (a file, a request body, a stored JSON blob, a fenced block in an agent's report) returns the domain type directly.
   - The zod schema with its `.transform` is the type's definition: `type AgentDefinition = z.output<typeof agentFileSchema>`. No hand-written interface beside it.
   - Checks on that one input live in its schema, including those that need context such as "`name` equals the folder id"; the context is a parameter.
   - Only decisions that weigh several values become rules: merging the catalog, known ids, team composition, schedule validity.
   - "Schema versus domain" is replaced by "reading one input versus rules over many".
2. **A module per concept:** `agents/`, `schedules/`, `runs/`, `orchestration/`, `milestones/`, `projects/`, `settings/`.
   - The product-neutral kernel stays apart: `utils/`, `db/`, `workflow/`, `engines/`, and `TASK-201`'s document reader.
   - The bundled prompts move into their module (`agents/bundled/`).
   - `packages/core` is unchanged; the UI shares it.
3. **Purity is set by file name, not folder.** Only `*-service.ts`, `*-store.ts`, `*-repository.ts` and `*-routes.ts` may do I/O. eslint forbids `node:fs*`, `node:child_process` and `node:net` in every other module file. Today nothing enforces `domain/`'s purity at all, so this is a gain.
4. **Pilot on agents**, then one PR per concept, each a pure move with no behaviour change. Tests follow into `test/<module>/`.

### Open questions

- `src/<module>/` or `src/modules/<module>/`?
- Where does something two modules share live? `team-composition` serves both schedules and orchestration.
- Do routes move into their module, or stay one HTTP layer?
- Order against `TASK-201`: doing the document layer first would make the agents pilot's reader thin from the start.

### Done when

- `docs/decisions.md` has the entry: context, decision, and "keep A3" as the rejected alternative.
- A3 and the placement section of `docs/architecture.md` are rewritten.
- The eslint purity rule is on.
- The pilot is merged and the other modules are filed as tasks.
- The whole suite is green with no behaviour change, on Windows and macOS.

---
## TASK-201: One reader for every markdown document Isotopy parses
**Priority:** P3 | **Tags:** core, server
**Updated:** 2026-10-12 07:54

Raised by the owner on 2026-10-12, after the Shared agents PR (#86) added a fourth markdown file format. **Not now**: start when a fifth format arrives — most likely `TASK-162`'s `tools`, `context` and `setup` on a step — or when one of the readers below gets a bug the others already fixed.

### What exists

About 230 lines of hand-written parsing across six places, each solving the same small problems — CRLF against LF, a byte-order mark, markdown decoration around a marker, and what to do with a malformed input — in its own way:

| Input | Reader | What it handles |
| --- | --- | --- |
| Agent, step, knowledge and duty files | `domain/markdown/front-matter.ts`, `schemas/agent-definition.ts` | YAML front matter + body, BOM, CRLF |
| Persona notes | `domain/rules/persona-notes.ts` | a bullet list |
| Orchestrator context | `domain/rules/orchestrator-context.ts`, `schemas/orchestrator-context.ts` | free text with limits |
| Agent output protocols (decision, closeout, release, milestone plan, notes, run artifacts) | `schemas/fenced-block.ts` | a fenced JSON block |
| Verdict and question lines | `domain/rules/stage-context.ts` | a marker line tolerant of `**`, backticks, CRLF |

The task board is not on this list on purpose: TaskPlanner's own library reads it.

### Shape

A small document layer, not a markdown framework:

1. **Read a document**: normalise BOM and line endings once at the boundary, then return `{ meta, body }` validated by a schema. This replaces `splitFrontMatter`.
2. **Take a fenced block**: the JSON protocol in an agent's report, with one policy for malformed output.
3. **Find a marker line**: `VERDICT:` and `QUESTION:`, tolerant of markdown decoration.
4. **One error policy, written down**: a malformed file on disk is left out and reported on the operator channel; a malformed agent report is a refusal with the parser's reason.

Persona notes and the Orchestrator's context could then become ordinary front-matter documents instead of formats of their own.

### Rejected up front

**remark / unified, or any full markdown AST.** What Isotopy reads is a handful of small protocols carried inside markdown, not markdown structure. A full tree would make each protocol harder to state and add a dependency tree for nothing the five readers need.

### Out of scope

The prompt renderers in `domain/markdown/*` build markdown; they do not parse it, and `format.ts` already serves them.

Cross-platform: the point of the layer is that line endings and BOM are handled once, so a CRLF checkout on Windows and an LF one on macOS read identically everywhere. Tests: one spec over the layer's primitives, and the existing component tests for each format must stay green unchanged.

---
## TASK-200: Agent packs — install a set of agents from a folder or a git repository
**Priority:** P3 | **Tags:** core, server, ui | **Epic:** Shared agents
**Updated:** 2026-10-12 07:19

The "shared" in **Shared agents** (`TASK-196`), and the last part of it.

After `TASK-197` to `TASK-199`, a project's agents are files in its `.isotopy/`. A **pack** is the same files kept somewhere else, a folder holding `agents/` and `steps/`. Installing one copies them in.

**Start when** a second project wants agents that a first one already has, for example ShareTravel's growth team in the arcade. Designing the install format before then would be guessing.

### Shape, to confirm when started

- **Source:** a local folder, or a git URL at a ref. A git source is cloned into a temporary directory and copied into `<project>/.isotopy/`. `.isotopy/packs.json` records the source, ref, commit and the files the install wrote.
- **Only `agents/` and `steps/` are copied.** Never `skills/`: notes and addenda belong to the project.
- **Update re-copies and shows the diff before writing.** A pack file the project has edited is a conflict to show, not to overwrite. A project's tweaks belong in the addendum, which is why it exists.
- **A declared tool is shown before anything is written.** A step can declare an MCP server (`TASK-162`) that launches on the next run. That is the one place a pack reaches past markdown, so the owner sees it first.
- **Setup gains "Add agents from…".** A marketplace is a list of pack URLs on top of this, and is not part of this task.
- Agent front matter follows Claude Code's own agent and skill files (`name`, `description`; `TASK-197`). Whether a folder of Claude Code subagents installs as a pack unchanged is a question for when this starts.

### Evidence

- installing from a folder writes the files and the record;
- an install never touches `skills/`;
- updating over a locally edited file reports the conflict and writes nothing;
- a pack that declares a tool shows it before writing.

Cross-platform: `git` is found with `where` on Windows and `which` on POSIX, per the binary-lookup rule, and run through `runSubprocess`. The temporary clone goes under `os.tmpdir()` with `path.join`; files are copied with `fs.cp`. A pack whose files have CRLF line endings installs byte-identical. Install hints shown to the user come in both PowerShell and bash.

### Plan

**Built and withdrawn, 2026-10-12, with the owner.** A full implementation — install from a folder or a git repository with a ref and a folder inside it, `.isotopy/packs.json` with a sha256 per file, refusing a re-install over an edited file, and "Add agents from…" in Setup — was built on `feature/shared-agents-196` (commits a18c1be, 19e472d, 346b3cd, about 1500 lines with tests) and reverted before the PR. The owner's reasoning: agents are plain files, so copying a folder into `.isotopy/agents/` and `.isotopy/steps/` already shares them, and the two things an installer adds — a safe update that knows which files the owner edited, and seeding duties without a restart — only pay off once several projects share agents often. The reverted commits stay in the branch history as the reference implementation when that day comes.

**Start when** the owner finds themselves copying the same agents between projects more than once.

---
## TASK-192: A limit resolved as its reset fires cannot release a later park
**Priority:** P3 | **Tags:** server, engine
**Updated:** 2026-10-06 18:30

Found in TASK-069. Limit choices are Aiki events, and an event sent before a run waits is held in the mailbox until the next wait for that event. The race goes like this:
1. A stage is parked on a plan limit.
2. The user resolves the limit at the instant its reset timer fires.
3. The workflow takes the timeout and resumes.
4. The user's `limit` event stays in the mailbox.
5. The next time the same stage parks on a limit, it takes that stale choice at once and retries, instead of waiting for the reset or a new click.

`resolveLimit` already refuses a stage that is not `blocked`, so the window is the few milliseconds between the timer firing and `limitResolved` projecting. Each send dedupes on `limit:<stageId>:<detectedAt>`.

**Fix:**
- Give each park an id: `RunLimit.parkId`, set by `stageBlocked`.
- Echo it in the `limit` event.
- `awaitStageEventUntil` drops an event whose `parkId` is not the current park, the way it already drops one for another stage.

**Evidence:** a comp test that sends a limit event for an earlier park and proves the current park still waits.

Cross-platform: n/a, pure logic.

---
## TASK-190: The spend of an engine attempt that was killed mid-stage disappears from the run's cost
**Priority:** P3 | **Tags:** server, engine
**Updated:** 2026-10-04 19:40

Found in `TASK-157`'s Claude Code run (2026-10-04). The Developer's first attempt ran about 90 s (writing files, `npm install`, a dev server) before the server died; the stage re-ran after the restart. The run reports $0.55 — exactly the resumed Developer plus QA — so the killed attempt's spend is not in it. Usage is captured when the engine reports a result, and a killed process never reports one.

For a product whose pitch includes running unattended on someone's subscription, cost that silently drops out is worth recording honestly. At minimum, mark a stage's usage as partial when an attempt ended without a result; better, capture usage events as they stream. Evidence: a component test where an aborted attempt followed by a resumed one reports both, or reports the first as unknown.

---
## TASK-189: The run view goes stale after a server restart and hides what needs the owner
**Priority:** P2 | **Tags:** ui, milestone-i
**Updated:** 2026-10-04 19:40

Found in `TASK-157` (2026-10-04); all small, all in the run view, all in the way of a newcomer following a real run.

- **No recovery after a server restart.** After the API server died and came back, the open view kept showing the initiative as RUNNING and never re-subscribed; only a reload fixed it. Unattended runs will restart servers.
- **Automation configured elsewhere does not reach an open view.** The Preview tab appeared only after a reload.
- **The team card is on a tab you are not looking at.** After approving a milestone, the view stays on *Plan* while the header pill says *Team awaiting approval*; the *Approve & start* card is on *Chat*.
- **The run title is the whole rendered prompt.** An orchestration run's title in the rail and header is the full Orchestrator prompt (goal, persona catalog, step-task catalog), not the goal.
- **"See what was built" after a planning-only turn** (*No files changed*).
- **A direct link to another project's run** opened under the previously active project's rail.

Evidence: e2e coverage for the restart recovery and the card location; the rest are copy and selection fixes with component tests.

---
## TASK-188: Isotopy reports Cursor as logged in when the CLI cannot authenticate
**Priority:** P2 | **Tags:** adapters, engine
**Updated:** 2026-10-04 19:40

Found in `TASK-157` (2026-10-04). Before the owner re-ran `agent login`, `cursor-agent status` printed `✓ Login successful!` / `Logged in (unable to fetch user details)` while `cursor-agent models` failed with *"Authentication required"*. Isotopy's status endpoint answered `loggedIn: true, message: "✓ Login successful!"`, because `cursor.ts` only tests the first line of `status` against a not-logged-in pattern.

A run started in that state would fail at its first stage with an auth error the Setup screen said could not happen. Check login with something that actually needs a valid token (the `models` listing the roster already runs, or a stricter parse of `status`), and treat *"unable to fetch user details"* as not logged in. Evidence: an adapter spec over the two `status` outputs.

---
## TASK-187: Runs the Orchestrator starts for a milestone feature are not linked to that feature
**Priority:** P2 | **Tags:** server, milestone-i
**Updated:** 2026-10-04 19:40

Found in `TASK-157`'s Cursor run (2026-10-04). The Orchestrator delegated milestone planning (*Arcade MVP*, three features), the owner approved it, and the Orchestrator then proposed and started three delivery runs for feature `arcade-shell-scores`. Afterwards all three features were still `ready` with no run ids: the milestone dashboard showed no history and no blocking findings for work that had run three times. The Orchestrator's own rationale also said *"continue_milestone is disabled"*, so it used `propose_team`/`start_run` instead of the milestone path.

Decide which path the Orchestrator should use to deliver an approved milestone's feature, and make a run started for a feature carry `milestoneId`/`featureId` either way, so the dashboard, autorun and closeout findings all see it. Evidence: a component test where an Orchestrator-started run for a feature shows up under that feature.

---
## TASK-186: The Orchestrator reads the per-step time budget as a deadline for the whole goal
**Priority:** P2 | **Tags:** engine, milestone-i
**Updated:** 2026-10-04 19:40

Found in `TASK-157`'s Claude Code run (2026-10-04). The Orchestrator (haiku) proposed a two-role team with no planner and explained: *"Skipping the planner keeps us under the 10-minute time constraint"*. The ten minutes is the per-step budget each stage prompt states (`TASK-166`), not a deadline for the initiative. Team composition was cut to fit a limit that does not exist.

Make the environment text say what the budget applies to — one engine turn of one stage — in the prompt the Orchestrator reads, or keep the step budget out of the `orchestrate` prompt altogether. Evidence: the rendered `orchestrate` prompt either omits the step budget or states its scope.

---
## TASK-185: Agents leave dev servers running and verification debris in the repo, and nothing is committed
**Priority:** P2 | **Tags:** engine, milestone-i
**Updated:** 2026-10-04 19:40

Found in `TASK-157` (2026-10-04).

- **Dev servers left running:** the Claude team left three Vite servers on the arcade running after its run settled (the resumed Developer's and two of QA's). One held port 5192, so Isotopy's own product start later found the port taken.
- **Debris in the repo:** QA left `VERIFICATION_REPORT.md`, `playwright-report/` and `test-results/` at the root (not gitignored), and installed Playwright browsers into `.isotopy/cache`. Cursor's QA wrote tests and config that the Developer then listed as *"other uncommitted work (not from this assignment)"*.
- **Nothing committed:** neither team made a commit; both targets end with only untracked changes over the baseline.

Decide, and say in the step tasks, (a) that a stage stops every process it started before it hands off, (b) where verification output belongs — under `.isotopy/runs/<id>/` or in a gitignored path, never loose at the root — and (c) whether a passing feature run commits its work, and who commits (Developer, Release Manager, or Isotopy on closeout). (c) matters for the inductive step: an unattended stretch with no commits has no history to evolve.

Related: `TASK-179` (an agent killed Isotopy's own server while cleaning up).

---
## TASK-184: Cursor's closeout stage answers with a decision block instead of a closeout record
**Priority:** P2 | **Tags:** engine, milestone-i
**Updated:** 2026-10-04 19:40

Found in `TASK-157`'s Cursor run (2026-10-04): the `closeout` stage (Orchestrator persona, `closeout-feature` step task, Cursor · auto) failed in all three delivery runs. Its output ended in an `isotopy-orchestrator-decision` fence — the review-run's format — rather than the `isotopy-closeout` record the step task asks for, so closeout produced no record and the stage failed. Claude Code's run never reached a closeout stage, so this is unproven on Claude.

Likely cause: the same Orchestrator persona carries both the closeout step and the post-run review, and the persona text pulls a cheaper model toward the decision format. Check what the closeout prompt actually contains (persona + step task + handoffs) and make the required fence unambiguous in the step task; consider a failure message that names the fence that was expected and the one that was found. Evidence: the stage prompt for `closeout-feature` states its fence before any mention of decisions, and a re-run on Cursor · auto produces a closeout record.

---
## TASK-183: A review FAIL has no route back to the Developer inside the run
**Priority:** P2 | **Tags:** core, engine, milestone-i
**Updated:** 2026-10-04 19:40

Found in `TASK-157`'s Cursor run (2026-10-04). A design question, not a crash.

The Architect and QA failed the arcade shell on a one-line README fix (Node floor), with every functional criterion passing (6 unit tests, 10/10 Playwright). The pipeline has no route from a blocking review finding back to `implementation` inside the same run, so the whole feature failed and the only way forward was a new run from the Orchestrator — which then hit `TASK-180`. The product brief's risk table still promises *"Playwright E2E fix loops"*.

Decide whether a quality stage's blocking finding should send the run back to `implementation` once (bounded, recorded in the run) before the run settles, or whether the Orchestrator's follow-up run is the intended loop — and then make the product brief say which. Either answer is defensible; leaving it implicit is not. Record it in `docs/decisions.md`.

---
## TASK-162: A step names its agent, its tools and what it needs — and a marked task is not the team's to start
**Priority:** P2 | **Tags:** core, server, milestone-i
**Updated:** 2026-10-11 18:20

**Rescoped 2026-10-11, with the owner.** The catalog half of this task — step tasks as files with front matter, read from the project and replacing a bundled one by id, the catalog derived from those files, and `team-composition.ts` taking the known ids as a parameter — is delivered by `TASK-197` (**Shared agents**, `TASK-196`). What remains here is what a step *declares*: `agent`, `tools`, `context` and `setup` keys on that same front matter, and the MCP plumbing that lets a step carry a tool. The epic's agent packs (`TASK-200`) refuse a `tools:` key until this lands.

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
setup and the context it needs. The pairing is chosen by the *role* rather than by the task, tools
do not exist, and step-specific setup is a branch in code —
`if (stageDef.stepTask !== VERIFY_FEATURE_STEP_TASK)` in `stage-execution.ts`. That branch is the
smell this removes: a step declares what it needs instead of the workflow special-casing it by id.

**Front matter already exists** (`TASK-197`): YAML, parsed once in `schemas/agent-definition.ts`
against a strict schema, with `name` and `description`. This task adds `agent: developer`,
`tools: [taskplanner]` and `context: [product-environment]` to the step schema.

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
MCP SDK enters this repo. The first and only tool is `taskplanner`, published as `@smekai/taskplanner`
by TaskPlanner's `TASK-046` and pinned in this repo's `package.json`. Installing an agent pack
(`TASK-200`) must show the tools it declares before it writes anything.

### What TaskPlanner 2.3.0 changes about this task

**Reviewed 2026-08-28, against 2.3.0.** The blocker is gone and the scope moved with it. Four
findings, none of which were available when this task was rescoped:

1. **There are two entry points, not one.** `@smekai/taskplanner` ships an MCP server *and* a
   library with TypeScript declarations (`TASK-047`) — `parseTasks`, `TaskStore`, `FileStore`,
   `ConfigManager`, `serializeTask`. The README's own rule: the MCP server is for when **a model**
   picks the tools, the library for when **your own code** is the caller. Isotopy is both. So
   "one board reader" gets stronger than this task originally wrote it: the agent reads over MCP,
   and `TaskBoardAdapter`'s own writes — `createFollowUpTasks`, `transitionTasks` — call the
   library. `domain/markdown/task-board.ts` goes **entirely**, not just its two read functions.
   `parseTasks` reads this repo's own `NEXT.md` with zero warnings today, returning `assignee`,
   `epic`, `waitingUntil` and `updatedAt` as typed fields.
   **Package boundary:** the root `devDependency` covers this repository's own `.mcp.json` and
   nothing else. The moment `TaskBoardAdapter` imports the library, `@smekai/taskplanner` must be
   declared in `packages/server`'s own `dependencies` — a filtered or production install of
   `@isotopy/server` is not entitled to a root devDependency.
2. **`waitingUntil` is a second skip axis.** `**Waiting until:** YYYY-MM-DD` (`TASK-052`) marks work
   blocked on something outside the repository, and the tools flag it. The poller must skip a task
   that is date-blocked as well as one that is `@owner`-marked; these are different reasons and the
   run log should say which applied.
3. **`epic` replaces the milestone tags.** `epic` became settable in `TASK-051`, and TaskPlanner's
   changelog names the exact anti-pattern it retires: projects that "encoded milestones in tags and
   prose". That is this board — `milestone-c` through `milestone-i` are tags today. Migrating them
   is not this task's job, but this task must not add more.
4. **The parser cannot read CRLF, and that is a blocker.** Measured 2026-08-28 against 2.3.0: the
   same board content parses to 1 task with 0 warnings as LF and to **0 tasks with 4 warnings** as
   CRLF. It is not a distinguishable failure — a CRLF board reads as an empty one. Git for Windows
   defaults to `core.autocrlf=true`, and `TaskBoardAdapter` reads the *user's* repository, so a
   naive swap would be a regression: today's `taskSummariesIn` splits on `/\r?\n/` and copes.
   Isotopy normalises at the read boundary and restores the file's own ending on write — verified
   byte-identical round-trip for both endings. **One board reader** therefore means one parser plus
   that boundary, not one function. Worth reporting upstream.
5. **Done tasks may not be in `DONE.md`.** Archiving (`TASK-053`, `TASK-058`) moves completed work
   into `.tasks/archive/DONE-YYYY.md` once `archiveDoneAfterDays` is set. Any board reader that
   concludes a task does not exist must check the archive first.

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
**The server-side writer stays Isotopy's own path** — `createFollowUpTasks` and `transitionTasks` are
not the agent's, and routing them through MCP would make the server a client for no gain. They call
the library instead.

**Rejected, and recorded in `docs/decisions.md` with the rest:** a tag (TaskPlanner's config
allowlist filters drafted tags, so a mark could be silently dropped); a priority (it overloads an
axis a marked task still needs); an Isotopy-invented field (a second vocabulary for a field
TaskPlanner already has); and a server-side claim gate refusing to start a run against a marked task
— that is a different problem, it belongs to `TASK-172`, and the owner's position is that respecting
a stated boundary is the agent's job, not the scheduler's.

### Evidence

Failing-first, one behaviour per test: a step-task file declaring `agent`, `tools` and `context`
parses to its declaration and an unknown tool or context is rejected with a stated reason; a step
declaring `tools: [taskplanner]` produces the right MCP config per adapter, and an engine without
the capability runs anyway and logs why; a role without a `skill` takes the step's `agent:`;
`**Assignee:** owner` round-trips a write and re-read and TaskPlanner's own parser reads back the
same assignee; a date-blocked task is skipped for a different stated reason than an owner-marked
one; a closeout creates a marked follow-up; and the poller's prompt names the `@owner` rule. Then
the full gate set, and the live app with a marked task on the board that the agent reads and leaves
alone. **No schedule fires against a real CLI in the dev app** — firing is proven against
`FakeEngine`, as `TASK-161` did.

Cross-platform: `require.resolve('@smekai/taskplanner/mcp-server')` yields `dist/mcp-server.js`, and
handing that JavaScript path to Node is exactly what **avoids** the Windows `.cmd` shim and the
`shell: true` that the Node >= 20 rule would otherwise force. Only the bare `taskplanner-mcp` bin
resolves to a `.cmd`, and nothing here spawns it. A repository-relative path is no good either: a
host resolves `command` and `args` from its own launch directory rather than from `.mcp.json`, so
starting an agent in `packages/server` would look for a `node_modules` that is not there. The
repository config therefore launches `node -e` with a `require` of the package export and lets Node
resolution walk up; verified from a subdirectory against the real board. MCP config files are written with `path.join` under `os.tmpdir()` or the project data dir.
Front matter and CLI output split on `/\r?\n/`. Tested live on Windows; macOS reasoned through and
recorded untested unless a Mac is used.

### Plan

**Rescoped 2026-10-11.** The front-matter format question below is settled: YAML, parsed by the `yaml` package against strict zod schemas, as `TASK-197` delivered it. This task extends that schema; it does not choose a grammar.

**Moved to Backlog 2026-10-04, with the owner.** What remains here — a step that declares its own agent, tools and context, and the MCP plumbing that lets a step carry a tool — is a capability, not a blocker for Milestone I: the boundary it was written for shipped as `TASK-173`. PR #72 is closed; its branch `feature/task-162-step-declares-itself` stays as reference, but it predates `TASK-170`, `TASK-172`, `TASK-173` and `TASK-176` and conflicts on the board, so pick this up by rebuilding from `main`, not by reviving that branch. The `@smekai/taskplanner` 2.3.1 gate below is long cleared (the repo pins 2.4.7).

**Split on 2026-09-16.** This task had grown to +3345/−834 across four mechanisms, and the two halves
turned out to have different scope and different readiness:

- **`TASK-173` took the board reader and the owner's mark** — the half the milestone blocks on. It
  needs nothing new, works on both platforms today, and is already delivered.
- **This task keeps the mechanism** — a step task that declares its own agent, tools and context, and
  the MCP plumbing that lets a step carry a tool.

The premise that joined them was that the agent must read `**Assignee:**` *through* an MCP tool,
because `taskSummariesIn` stripped every `**`-prefixed line. Making the digest show the mark is the
direct fix, and `TASK-173` did it. The tool path remains worth having on its own terms — a step
declaring what it needs is a product capability the owner asked for on 2026-08-26 — but it is no
longer the boundary's blocker.

One open question for the owner on this half: confirmation that `agent` defaults stay, given the approval card now resolves the persona into the proposal.

---
## TASK-175: Isotopy raises its own events, and a long-running workflow awaits them
**Priority:** P2 | **Tags:** server, core, engine
**Updated:** 2026-10-06 18:30

**Rescoped 2026-10-06, after TASK-069 moved the runtime to Aiki.** Half of this task now comes with
the runtime.
- `workflow/pipeline-events.ts` is a catalogue of typed workflow events (`gate`, `answer`, `limit`).
- Each event has a strict zod schema, which Aiki validates at the sender.
- An event sent before the run waits is held in a durable mailbox, not dropped.
- A reference id makes a repeated send idempotent.

What is still missing is the reason this task was raised. **Every event is still sent because a
person clicked something.** Isotopy never raises one on its own behalf, so long-running work that
depends on something Isotopy itself does can only:
- finish and hope a later fire notices;
- poll inline; or
- be chained by hand through a settle callback.

**Raised 2026-09-24** by the product owner while reviewing Cursor Projects
(`docs/competitor-matrix.md` §6). This does not reverse the cron decision in `TASK-156`. **Cron
remains the only thing that starts work from outside.** An internal event only *resumes* a workflow
that is already waiting, and Isotopy's own code is the only thing that raises one.

### What to build

- **A raising seam for services.** An interface in its own file, e.g. `WorkflowEvents.raise(event)`,
  that services receive rather than import. `WorkflowRuntime` implements it with the Aiki event
  sender, scoped by run and reference id. Domain code decides *that* an event happened. Only the seam
  knows how it is delivered.
- **The new events join `PIPELINE_EVENTS`**, each with a strict schema and a scope field that the
  wait filters on, the way `awaitStageEvent` filters on `stageId` today.
- **A mandatory timeout.** Waiting for an internal event always has one, built on
  `awaitStageEventUntil`, and the timeout ends the stage with a named reason. A wait that never ends
  is how a run silently stops.

### Candidate first consumers. The plan picks one and proves the seam on it

- **The product is ready.** A stage that needs the running product (QA, preview) awaits a
  `product-ready` event, raised by the preview service once its health check passes.
- **A task is Done.** Work that depends on another task awaits `task-done`, raised when a closeout
  moves a task (`TASK-172`).
- **A run settled.** A run started behind another awaits `run-settled` for it, rather than the
  schedule skipping with `run_active`.

### The constraint to design around

Waiting costs the runtime nothing: an Aiki run parked on an event frees its worker, and the event
resumes it within milliseconds. **The cost is in our own rule.** `ScheduleService.skipReasonFor`
counts every non-terminal run as busy, so a run parked on an event blocks every schedule in the
project. A run waiting on an internal event needs a status that says so, and the plan decides
whether that status counts as busy.

**Evidence:** a comp test of the chosen consumer. The workflow parks, the service raises the event,
and the stage resumes with the payload. The same test runs with the server restarted while parked,
and with a timeout that ends the stage with a named reason.

Cross-platform: n/a, pure logic. Events go through the per-project Aiki SQLite file that runs
already use. No process, path or shell surface is touched.

---
## TASK-174: A schedule earns its way out of the human gate, and loses it on the first failure
**Priority:** P3 | **Tags:** server, core, ui
**Updated:** 2026-09-24 16:53

A gate today is a boolean: `gateEnabled(pipelineId, stage, gates)` reads
`ProjectPreferences.gates` and the stage's `gateAfter`, and it stays whatever the owner set until
they change it. For an unattended schedule that leaves two bad choices. Gate on, and nothing runs
while nobody is watching. Gate off from the first firing, and the owner has trusted a team they
have never seen work.

**Found 2026-09-24** in the Cursor Projects review (`docs/competitor-matrix.md` §6). Their
migration pattern lowers the amount of review as confidence builds. The product owner agreed it
is worth doing, and not at the top of the queue, so it sits outside Milestone I (`TASK-156`).

### What to build

A **trust ramp per schedule**. It replaces nothing for runs a human starts.

- A schedule may be set to **earn autonomy**. While it is earning, its runs keep their human gates,
  exactly as today.
- After **N consecutive clean runs** the gates stop applying to that schedule's runs. A clean run
  is one that settled `PASS`, whose closeout reported no blocking findings, and that the owner
  approved at every gate without editing. N is set per schedule, with a small default.
- The **first run that is not clean** puts the gates back and resets the count to zero: a
  `needs attention` verdict, a blocking finding, a failed stage, or a gate the owner rejected or
  edited. Losing trust is automatic. Earning it back takes the same N runs again.
- The owner can **pin** a schedule as always gated, or as never gated. A pin skips the ramp.
- The counter lives on the **schedule record**, beside `lastFiredAt`. It is not kept in memory, so
  a restart does not reset trust and a crash cannot grant it.
- The rail and the schedule editor show where the schedule is (`3 / 5 clean`, `trusted`,
  `gated — reset by run <id>`) and which run reset it.

### Open questions for the plan

- Should trust be counted per schedule, or per (team × step task)? Per schedule is simpler and
  matches how the owner thinks about "that job". Per team would carry across schedules that share
  a team. Start per schedule unless evidence says otherwise.
- Does an Orchestrator-reported `ask_user` count as not clean? Probably not: asking is not
  failing. Decide it and write it down in `docs/decisions.md`.

### Depends on

`TASK-159` (the schedule record) and `TASK-172` (tasks worked unattended actually move on the
board). Without `TASK-172` a trusted schedule could keep picking up the same task.

**Evidence:** domain specs for the counter (clean increments it, each not-clean kind resets it,
pins bypass it), and a comp test in which a schedule's runs gate until N clean runs, then run
without gates, then gate again after one blocked run.

Cross-platform: n/a — pure logic/UI. The counter is persisted through the existing schedule
record. No process, path or shell surface is touched.

---
## TASK-169: Observe a real sleep/wake with a schedule pending, on both OSes
**Priority:** P2 | **Tags:** testing, infra, milestone-i
**Updated:** 2026-08-24 14:00

`TASK-061` closed with the machine-suspend behaviour **reasoned through and never observed**, and
`TASK-159` was written as the work where that gap finally bites — an unattended schedule is the
first feature whose whole point is surviving the hours nobody is watching.

`TASK-159` did not close it. What it delivered is the rule expressed as a test: the tick reads the
wall clock every time and never accumulates elapsed time, and a schedule ticked as if the machine
woke three days later fires exactly once and not again. That is the *logic* proven against a
simulated clock. It is not the same claim as the OS actually suspending.

**What is still unobserved, and why a simulated clock cannot answer it:** whether the interval
survives S3/modern standby at all, whether Node's timer fires late or not at all on resume, and
whether the process is still holding its SQLite handle afterwards. `.unref()` is on the timer, which
is right for shutdown and says nothing about wake.

**What to do:** put a machine to sleep with an enabled schedule whose window falls inside the sleep,
wake it, and record what actually happened — how long after resume the first tick ran, whether
exactly one run started, and whether `lastWindowAt` advanced once. Then the same on macOS, or record
plainly that no Mac was used.

**This needs a human at the machine**, which is why it is its own task rather than a line item
someone is expected to fake. A reasoned-through answer here is what `TASK-061` already produced, and
repeating it would be the same non-answer twice.

Evidence: a short record under `docs/dogfood/` or an entry in
[`docs/implementation-notes.md`](../docs/implementation-notes.md), naming the OS build and the
observed timings. If the timer does *not* survive, that is a finding and a follow-up, not a failure
of this task.

---

## TASK-158: The adapter layer's unclaimed half, and the Orca comparison it came from
**Priority:** P3 | **Tags:** core, server, engine
**Updated:** 2026-08-21 00:00

**No milestone.** Held back from `TASK-153` when Milestone I was redefined as Induction
(`TASK-156`). `TASK-154` took the part an unattended run depends on; this is the rest. Pick it up
when a run actually hits one of these, not before.

Opened 2026-08-20 after comparing Isotopy's harness layer against
[stablyai/orca](https://github.com/stablyai/orca) at the user's request, and probing the CLIs
installed on this machine: `cursor-agent` (2026-08 build), `codex-cli 0.144.6`, `claude 2.1.215`.

| | Orca | Isotopy today |
|---|---|---|
| Agent definition | Declarative catalog — `src/shared/agent-session-option-catalog*.ts`, split per family, with `-types.ts` and per-agent `.test.ts` | Imperative argv built inline in three 300–400 line adapters |
| Capability shape | `CatalogOption { id, label, kind, apply }`; `apply` → `launchArgs`, plus `midSession` applicability | Nothing declared |
| Unknown model ids | `unknownModelOptions` — launch-safe options for opaque ids absent from the static catalog | `MODEL_FALLBACKS` maps to Auto; no launch-arg story |
| Detection | `agent-detection.ts`, `agent-kind.ts` — one place | `resolveXBinary()` written three times, near-identically |
| Trust / permissions | `agent-trust-presets.ts` — presets as data | Three hand-written `permissionArgs()` switches |
| Usage & limits | First-class subsystems: `usage/`, `rate-limits/`, `claude-usage/`, `codex-usage/` | `domain/rules/engine-limit.ts` plus per-protocol capture — empty for Cursor |
| Isolation | Git worktree per agent run | Agents run directly in `ctx.cwd` |
| Execution | PTY (`pty/`, `ghost-tty/`) | Plain pipes into headless JSON modes |

**The one pattern worth taking is the declarative catalog, and `TASK-154` takes it.**
`packages/core/src/engines.ts` already declares `ENGINES`, `EngineDefinition` and
`PERMISSION_MODES` exactly that way; it stops before capabilities and launch args, and that is
where the drift gets in.

**PTY execution is rejected, and recorded as rejected so it is not re-proposed.** Orca is a
terminal multiplexer: it renders agent output, it does not parse it. Isotopy drives `-p` / `exec`
JSON modes behind strict Zod codecs (`engines/protocol-validation.ts`), with billing-safety env
stripping, a real auto-review capability probe, and plan-limit detection with reset parsing. A PTY
would trade a validated protocol for screen-scraping. Isotopy is ahead here and stays ahead.

**What is left in this task:**

- **Setup parity.** `install()` is absent for Claude Code, `login()` is absent for Claude Code and
  Codex, and Cursor's `install()` is Windows-only. Three engines, three different Setup stories.
- **Shared binary resolution**, against Orca's `agent-detection.ts`. `resolveClaudeBinary`,
  `resolveCursorBinary` and `resolveCodexBinary` are the same function three times with different
  fallbacks; only Codex has the Windows shim-picking fix (`pickBinaryLine`).
- **Worktree isolation.** `cursor-agent` advertises `--worktree`, `--add-dir` and `--workspace`;
  git-worktree isolation is Orca's core primitive. Design it **with** `TASK-036`, the sandcastle
  spike, rather than around it — the spike asks the same question from the other side.

Cross-platform: the harness layer is where this bites hardest — binary resolution, `.cmd` shims,
stdin-versus-argv, and per-platform installers all differ by OS today.

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
