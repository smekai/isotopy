# Backlog

## TASK-191: Switching engine on a usage limit drops the owner's model pin for that engine
**Priority:** P1 | **Tags:** engine, server, milestone-i
**Updated:** 2026-10-05 12:35

Found while planning the Isotopy.Travel run (2026-10-05), after `TASK-157`.

The owner pins one model per engine in Setup (`engineModels`), because the pin is the only cost cap: `orchestrate` is hard-coded to `deep`, and a tier alone climbs the ladder. Travel runs on Claude Code pinned to Sonnet, with Cursor pinned to Grok as the fallback when Claude's limits run out.

**The fallback never reaches Grok.** When a run parks on a usage limit and the owner picks *Switch engine*, `selectionAfterLimit` (`domain/rules/engine-limit.ts`) returns `{ engine, modelTier }` and `RunService.resolveLimit` deletes `run.model`. Every remaining stage then runs on the tier ladder of the new engine — `deep` resolves to Claude Opus on Cursor — and follow-up runs inherit that unpinned selection.

**Fix:** when the engine changes, the run takes the project's pin for the target engine (`settings.getPreferences(projectId).engineModels[engine]`) as `run.model`. With no pin, behaviour is unchanged. Evidence: a component test in `test/run/limit-pause.comp.ts` — blocked on Claude, resolved with switch-engine to Cursor in a project pinned to a Cursor model, and the next engine call carries that model.

Not in scope: switching engines automatically when a limit is hit. Unattended, a limited run parks until the reset and resumes on its own.

Cross-platform: none specific.

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
## TASK-181: On Windows, an automation command given as a bare .cmd name fails before it starts
**Priority:** P1 | **Tags:** server, infra, milestone-i
**Updated:** 2026-10-04 19:39

Found in `TASK-157` (2026-10-04), on both targets, and root-caused.

`Start the product` with `ui.start.windows.executable = "npm.cmd"` — exactly what the Setup presets write — exited at once with `MODULE_NOT_FOUND`. The same command typed by hand starts Vite in 236 ms. Replicating Isotopy's spawn (`cmd.exe /d /s /c ""npm.cmd" "run" "dev""`, `windowsVerbatimArguments`) shows the real error: `Cannot find module 'C:\Development\smekai\dogfood-arcade-cursor\node_modules\npm\bin\npm-cli.js'`. When a batch file is invoked by a **quoted bare name**, `cmd` resolves its `%~dp0` against the working directory, so `npm.cmd` looks for npm inside the project. With the executable given as its full path (`C:\Program Files\nodejs\npm.cmd`) the product started and reached `ready`.

Engines are unaffected because their adapters spawn CLIs by resolved full path. Everything in `.isotopy/automation.json` — `ui.start`, `validation`, `preview`, `production` — goes through `startSubprocess` → `resolveSpawnTarget` in `engines/subprocess.ts` and is affected whenever the executable is a bare `.cmd`/`.bat` name.

**Fix:** resolve a bare executable to its full path before building the `cmd /c` line (`lookupOnPath` already exists in `utils/`), and fail with a stated reason when it cannot be found. Evidence: a component test (Windows-only, skipped elsewhere) that a bare `npm.cmd` automation command runs in a temp project.

Also seen, smaller: with another process already answering the health URL, the product was marked `ready` 28 ms after start and then `exited` — readiness probed the URL, not our process. Worth a stated rule in the same change.

Cross-platform: POSIX spawns without a shell and is unaffected; the fix must leave that path alone.

---
## TASK-162: A step names its agent, its tools and what it needs — and a marked task is not the team's to start
**Priority:** P2 | **Tags:** core, server, milestone-i
**Updated:** 2026-10-04 17:49

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
MCP SDK enters this repo. The first and only tool is `taskplanner`, published as `@smekai/taskplanner`
by TaskPlanner's `TASK-046` and pinned in this repo's `package.json`.

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

Failing-first, one behaviour per test: a step-task file with front matter parses to its declaration
and a malformed one is rejected with a stated reason; a project override and addendum compose over
the bundled step task, and a project step task the bundled catalog never knew is selectable by a
role; a step declaring `tools: [taskplanner]` produces the right MCP config per adapter, and an
engine without the capability runs anyway and logs why; `**Assignee:** owner` round-trips a write
and re-read and TaskPlanner's own parser reads back the same assignee; a date-blocked task is
skipped for a different stated reason than an owner-marked one; a closeout creates a marked
follow-up; and the poller's prompt names the `@owner` rule. Then the full gate set, then the live
app with a marked task on the board that the agent reads and leaves alone. **No schedule fires
against a real CLI in the dev app** — firing is proven against `FakeEngine`, as `TASK-161` did.

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

**Moved to Backlog 2026-10-04, with the owner.** What remains here — a step that declares its own agent, tools and context, and the MCP plumbing that lets a step carry a tool — is a capability, not a blocker for Milestone I: the boundary it was written for shipped as `TASK-173`. PR #72 is closed; its branch `feature/task-162-step-declares-itself` stays as reference, but it predates `TASK-170`, `TASK-172`, `TASK-173` and `TASK-176` and conflicts on the board, so pick this up by rebuilding from `main`, not by reviving that branch. The `@smekai/taskplanner` 2.3.1 gate below is long cleared (the repo pins 2.4.7).

**Split on 2026-09-16.** This task had grown to +3345/−834 across four mechanisms, and the two halves
turned out to have different scope and different readiness:

- **`TASK-173` took the board reader and the owner's mark** — the half the milestone blocks on. It
  needs nothing new, works on both platforms today, and is already delivered.
- **This task keeps the mechanism** — a step task that declares its own agent, tools and context, and
  the MCP plumbing that lets a step carry a tool. That is roughly +1900/−143: 12 new modules and 7
  new test suites, almost pure addition, because it is new capability rather than a change to
  existing code.

The premise that joined them was that the agent must read `**Assignee:**` *through* an MCP tool,
because `taskSummariesIn` stripped every `**`-prefixed line. Making the digest show the mark is the
direct fix, and `TASK-173` did it. The tool path remains worth having on its own terms — a step
declaring what it needs is a product capability the owner asked for on 2026-08-26 — but it is no
longer the boundary's blocker.

**Gated on `@smekai/taskplanner` 2.3.1.** The MCP server is the agent's reader here, and 2.3.0 has
two defects that only reach that path: a CRLF board parses to zero tasks (indistinguishable from an
empty board), and any read tool rewrites the caller's `config.json`. Both are fixed in
smekai/taskplanner#10 and need publishing before this can land.

Two open questions for the owner on this half: whether to replace the hand-rolled front-matter
grammar with JSON metadata (~119 lines plus the coercions and the summary fallback — a format change
to 13 shipped files), and confirmation that `agent` defaults stay, given the approval card now
resolves the persona into the proposal.

---
## TASK-175: Isotopy raises its own events, and a long-running workflow awaits them
**Priority:** P2 | **Tags:** server, core, engine
**Updated:** 2026-09-24 17:07

The durable runtime can already park a workflow until a named signal arrives, and resume it after
a restart. Isotopy uses that three times: `gateSignal`, `answerSignal` and `limitSignal` in
`workflow/pipeline-workflow.ts`, sent by `WorkflowRuntime.approveGate` / `answerQuestion` /
`resolveLimit`. **Every one of them is sent because a person clicked something.** The code never
sends a signal on its own behalf. So long-running work that depends on something *Isotopy itself*
does has only three options: finish and hope a later tick notices, poll inline, or be chained by
hand through a settle callback.

**Raised 2026-09-24** by the product owner while reviewing Cursor Projects
(`docs/competitor-matrix.md` §6). This does not reverse the cron decision in `TASK-156`. **Cron
remains the only thing that starts work from outside.** An internal event only *resumes* a
workflow that is already waiting, and Isotopy's own code is the only thing that raises one.

### What to build

- **One event catalogue.** Event names come from a single exported `as const` tuple, and the union
  type is derived from it. Each event has a strict payload schema, parsed at the workflow boundary
  when the signal is delivered, as the runtime-validation rule requires. The three existing
  signals move into the same catalogue as its first entries.
- **A raising seam for services.** An interface in its own file, e.g. `WorkflowEvents.raise(event)`,
  that services receive rather than import. `WorkflowRuntime` implements it with `sendSignal`.
  Domain code decides *that* an event happened. Only the seam knows how it is delivered.
- **An awaiting helper for workflow code.** A `waitForEvent` step wrapper that takes the event
  name, its scope (run, stage, task) and a **mandatory timeout**, and returns the parsed payload or
  a timeout. The timeout is not optional: a wait that never ends is how a run silently stops.
- **Deterministic names.** A signal name is built from the event name and its scope, as
  `gateSignal(runId, stageId)` is today. Raising the same event twice is idempotent, and raising it
  before anyone waits is not lost. Check both against OpenWorkflow's delivery semantics in the plan
  and record the answer in `docs/implementation-notes.md`.

### Candidate first consumers. The plan picks one and proves the seam on it

- **The product is ready.** A stage that needs the running product (QA, preview) awaits a
  `product-ready` event raised by the preview service once its health check passes, instead of
  checking health inline.
- **A task is Done.** Work that depends on another task awaits `task-done`, raised when a closeout
  moves a task (`TASK-172` makes that move actually happen).
- **A run settled.** A run started behind another one awaits `run-settled` for it, rather than the
  schedule skipping with `run_active` and trying again on the next tick.

### The constraint to design around

Waiting costs the runtime nothing: OpenWorkflow 0.9.2 parks a waiting run and frees the worker, and
`sendSignal` wakes it immediately (see the 2026-08-24 entry in `docs/decisions.md`, corrected in
this change). **The cost is in our own rule.** `ScheduleService.skipReasonFor` counts every
non-terminal run as busy (`isRunActive`), so a run parked on an event blocks every schedule in the
project. A run waiting on an event needs a status that says so, and the plan decides whether that
status counts as busy.

**Evidence:** a spec for the catalogue (a payload that fails its schema is refused, not coerced),
and a comp test of the chosen consumer: the workflow parks, the service raises the event, the stage
resumes with the payload. The same test with the server restarted while parked, and a timeout
path that ends the stage with a named reason.

Cross-platform: n/a — pure logic. Signals go through the SQLite backend that runs already use. No
process, path or shell surface is touched.

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
