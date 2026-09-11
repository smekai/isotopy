# In Progress

## TASK-162: A step names its agent, its tools and what it needs — and a marked task is not the team's to start
**Priority:** P1 | **Tags:** core, server, milestone-i
**Updated:** 2026-09-10 12:03

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

Delivered in four commits on `feature/task-162-step-declares-itself` (0.12.29 → 0.12.32):

1. **A step task declares its own agent and the context it needs** — front matter (`agent`, `summary`, `internal`, `context`), a pure splitter in `domain/markdown/front-matter.ts`, a strict schema in `schemas/step-task.ts`, layering in `services/step-tasks.ts`. `role.skill` optional, `STEP_TASK_CATALOG` gone, `resolveStageInputs` extracted.
2. **A step's declared tools reach the CLI that can carry them** — `mcpServers` and `deniedTools` join the capability catalog; `tool-catalog.ts`, `mcp-plan.ts`, `toml-value.ts`, `engines/mcp-config.ts`, and per-adapter rendering.
3. **One board parser** — `parseTasks`/`serializeTask` read and render; Isotopy edits around a task; CRLF normalised in and restored out; `boardDigest` replaces the planning context; built-in board moves to `<dataDir>/.tasks` with the legacy path still probed.
4. **A marked task is not the team's to start** — `assignee` on both drafts and the salvaging mirror, two stated skip reasons in the digest, `orchestrate` declares `tools: [taskplanner]`, and a rewritten poller prompt.

**Six amendments to this task, measured against 2.3.0 rather than assumed:**

1. `domain/markdown/task-board.ts` does **not** go entirely. `serializeStateFile` rebuilds a file from what it parsed: it drops a comment above a task and deletes a lowercase-prefix task outright. Six exports survive as the surgical writer.
2. `ConfigManager`, `FileStore` and `TaskStore` are all unusable. `ConfigManager.load()` rewrote the user's `config.json` on a **read** — reformatted, eight fields injected, a `Rejected` state that was never declared.
3. `renderTaskBoardPlanningContext` is **replaced, not deleted**. Deleting it makes milestone planning board-blind and leaves any engine without a tool with no board at all. `renderBoardDigest` renders typed tasks and shows the marks the old summary stripped.
4. The step-task library is discovered from disk, so `internal: true` — not absence from a hand-written array — is what stops the Orchestrator composing itself.
5. Step tasks get their own directories rather than sharing `skills/`, where a project step task named `developer.md` would silently replace the Developer persona.
6. `setup` was dropped. Its one member would have been `preview-deployment`, which does not *prepare* what a step needs — it replaces the agent. `PREVIEW_DEPLOY_STEP_TASK` stays an id literal until a second member earns the key.

**Probe results that settled open questions** (`claude 2.1.263`, `codex-cli 0.144.6`, `cursor-agent 2026.08.11-e8db854`): Cursor has no `--mcp-config` at all — it reads only `.cursor/mcp.json`, so Isotopy writes the project file for the run and restores it. `node -e` is right for this repo's own `.mcp.json` and wrong at runtime, because the engine's cwd is the user's project. And the skip predicate is *any* assignee, not the literal `owner` — this repo's own board already carries `@Fedor`.

**Evidence:** `pnpm lint`, `pnpm typecheck`, `pnpm test` (1135 passing, 41 new), `pnpm build`, `pnpm e2e` (75 passing). The rendered launch spec was run for real: `node <absolute dist/mcp-server.js>` started from `C:\`, pinned by `TASKPLANNER_WORKSPACE_ROOT`, listed its eight tools and read this repository's own board back. Tested on Windows; macOS reasoned through and recorded untested.

---
