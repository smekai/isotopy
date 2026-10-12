# In Progress

## TASK-199: An agent brings its recurring duties
**Priority:** P2 | **Tags:** core, server | **Epic:** Shared agents
**Updated:** 2026-10-11 18:19

Part of **Shared agents** (`TASK-196`). Comes after `TASK-197`; independent of `TASK-198`.

A growth marketer is not a one-off. "Every Monday, read last week's numbers and propose the next experiment" is the job, not a feature request. Isotopy already has the mechanism: a schedule is a recurring task with an optional pinned team (`TASK-159`), and `BUILT_IN_SCHEDULES` (`domain/rules/built-in-schedules.ts`) seeds the board poller into every project, disabled. What is missing is a way for an agent to bring its own.

### Change

- **`agents/<id>/duties/<key>.md`.** Front matter `name`, `cron`, `timezone`, and optionally `team` (an `OrchestratorTeamProposal`, so a duty can pin the agent that does it). The body is the schedule's `task`.
- **`ScheduleService.seedBuiltIns` becomes seeding from duties.** For each duty in the project's catalog, if no schedule carries its key in `builtIn`, write one, **disabled**. A project duty's key is `<agent>/<key>`. A duty is checked by `scheduleIssues` before it is written; an invalid one is not seeded and is named in the operator log.
- **The board poller becomes a bundled duty file** under `domain/skills/duties/`, and `BUILT_IN_SCHEDULES` goes. Its key stays `board-poller`, so a project that already has its poller schedule is not given a second one.
- **Seeding writes once.** After that the schedule is the project's record, and editing the duty file does not change it. That is what "a schedule is a record" (2026-08-21) already means. Removing an agent leaves its schedules in place; one whose pinned team names the removed agent fails to fire, with the reason `composeTeamPipeline` already gives.
- **A duty that publishes runs behind the human gate.** A post, an email or a spend is the owner's to approve until `TASK-174` lets a schedule earn its way out of the gate.

### Open for the owner

Does the project switch `builtInSchedules` (Setup → Gates, blocking as `built_ins_disabled`) cover every seeded duty, or only the bundled board poller? **Proposed: every seeded duty.** Each is something the project was given rather than wrote, and one switch is easier to reason about than two. Rejected: a second switch for agent duties.

### Evidence

- a project agent's duty is seeded disabled, with its cron, timezone and team;
- seeding twice writes once;
- a duty with an unparseable cron is not seeded and is logged;
- the board poller still seeds as `board-poller`, and a project that already has one is not given a duplicate;
- a seeded duty, once enabled, fires against `FakeEngine`. No schedule fires against a real CLI in the dev app, as with `TASK-161`.

Cross-platform: cron is parsed in-process and timezones resolve through ICU, as for every schedule (`domain/rules/engine-limit.ts`); no `cron`, no `schtasks`. File discovery as in `TASK-197`. Tested on Windows; macOS reasoned through.

---
## TASK-198: An agent carries a reference library
**Priority:** P2 | **Tags:** core, server | **Epic:** Shared agents
**Updated:** 2026-10-11 18:19

Part of **Shared agents** (`TASK-196`). Comes after `TASK-197`.

An agent's identity file says how it judges. It is the wrong place for a thirty-item checklist of App Store listing rules, a brief on the travel market, or a brand voice guide. A human specialist keeps those on the shelf and looks them up when the job needs it. Today an agent has two places to put them, and neither fits:

- **the persona text**, which every run pays for in full whether the step needs it or not;
- **notes** (`TASK-113`), at most forty bullets the agent writes itself from what it learned. They are what it believes, not what anyone vouched for.

### Change

- **`agents/<id>/knowledge/*.md`**, each file opening with front matter `description`.
- **The composed persona lists the library.** A section names each file by its project-relative path, with its description, and tells the agent to read what the step needs before it starts. Files are **listed, not inlined**: the prompt stays the size of the identity, and every supported harness can read files under its working directory.
- **Read-only to the agent.** What it learns still goes to `skills/<id>.notes.md`. Turning a note into knowledge is a human edit, on purpose: notes are what the agent believes; knowledge is what the owner vouches for.
- A knowledge file without valid front matter is still listed, by path with no description, and named in the run log. It is never silently dropped.

### Not this

Embeddings or search, a size budget, and knowledge shared across every agent. Project documents are already in the repository, and a project addendum can point at them.

### Evidence

- a knowledge file appears in the composed prompt with its path and description;
- an agent with no knowledge folder composes byte-identically to before;
- a malformed knowledge file is listed and logged;
- live: a run in the ShareTravel fork whose engine log shows the agent opening a knowledge file before it drafts.

`docs/decisions.md` records listing over inlining, and the rejected alternative.

Cross-platform: paths are rendered with forward slashes (`path.relative`, then split on `path.sep` and joined with `/`). Claude Code, Cursor and Codex all accept forward slashes on Windows, and each runs with the project root as its working directory on both OSes, so a relative path resolves the same way. Discovery hazards are as in `TASK-197`. Tested on Windows; macOS reasoned through.

---
## TASK-197: Agents and step tasks a project brings join the catalog
**Priority:** P1 | **Tags:** core, server, ui | **Epic:** Shared agents
**Updated:** 2026-10-11 18:19

The blocker of **Shared agents** (`TASK-196`): three hard-coded lists become files a project can add to.

### Today

- `PERSONA_CATALOG` and `STEP_TASK_CATALOG` (`domain/skills/catalog.ts`) feed the Orchestrator's context in `OrchestrationService.goalContext`, and the module-scope id sets in `domain/rules/team-composition.ts` that `composeTeamPipeline` and `scheduleIssues` check against.
- `AGENTS` in `@isotopy/core` `agents.ts` gives five UI call sites a profession and glyph through `agentForStage`, and `agentForSkill` already falls back for an id it does not know.
- `loadSkill` (`services/skills.ts`) composes a persona from a project file with no bundled base. The only closed part is the catalog.
- Step tasks load from the bundle only (`loadBundledStepTask`).

### Change

- **Every persona and step-task file opens with YAML front matter.** `name` (equal to the id), `description` (the catalog line that lived in `catalog.ts`), and for a persona `title` (the profession the UI shows) and `glyph`. The ten bundled personas and thirteen step tasks gain it; `scripts/generate-skills.mjs` emits it for the two personas it generates, `architect.md` and `tester.md`.
- **Discovery is a service.** Bundled files, then `<project>/.isotopy/agents/<id>/agent.md`, then `<project>/.isotopy/steps/<id>.md`. A project entry with a bundled id replaces it. The result is a per-project catalog of personas and step tasks, each `{ id, title, glyph, description }`.
- **Split the way the code standard asks.** The front-matter split is pure (`domain/markdown/`), the schema strict (`schemas/`), the reading a service. A malformed file, or one whose `name` is not its id, is left out of the catalog and named in the operator log. One bad file never empties the catalog.
- **`team-composition.ts` takes the known ids as a parameter** instead of importing a constant. `scheduleIssues` gets them the same way, so a schedule pinning a project agent saves and one naming a deleted agent is refused.
- **`loadSkill` reads `agents/<id>/agent.md` as the base when it exists.** The addendum and notes in `skills/` still layer on top, so a project agent learns the way a bundled one does. The step loader checks `steps/<id>.md` before the bundle.
- **The UI reads the catalog** from a project-scoped `GET` beside `schedules` (`scopeOf`, as `routes/schedules.ts` does). The core `AGENTS` record goes; the fallback for an id the catalog does not know, such as a run whose agent was later removed, stays.

### Removed (replace, don't accumulate)

`catalog.ts`, the core `AGENTS` record, `projectSkillFilePath` and the `skills/<id>.md` full-replacement layer. `agents/<id>/agent.md` becomes the one way to replace a bundled persona. No migration is needed: on 2026-10-10 no project on the owner's machine had a `skills/<id>.md`; the two dogfood projects carry only `*.notes.md`. The user-level `~/.isotopy/skills/<id>.md` override of a bundled persona stays, because it overrides rather than adds. `docs/architecture.md` (the Personas section and its table) is updated to match.

### Out of scope

- `agent`, `tools`, `context` and `setup` on a step stay in `TASK-162`. This task takes that task's catalog half: summaries moving into the files, step tasks read from the project, and the composition rule taking ids as a parameter.
- Knowledge (`TASK-198`) and duties (`TASK-199`).
- The Orchestrator's prompts give only software examples. Change nothing there unless the live check below shows it refusing a non-dev team.

### Evidence

Failing first, one behaviour per test, each guard mutation-checked:

- a persona file's front matter parses to its catalog entry, and a malformed one is rejected with a stated reason;
- a project agent appears in the catalog the Orchestrator is given;
- a team naming it composes, and one naming an unknown id is still refused;
- a project agent with a bundled id replaces the bundled text and keeps the project addendum and notes;
- a project step task is selectable by a role and loads;
- a schedule pinning a project agent saves;
- the UI shows a project agent's title and glyph.

Then the full gate set, and the live app: put a `growth-marketer` agent and a `plan-campaign` step into a scratch project, ask the Orchestrator for a launch plan, and screenshot the team it proposes.

Cross-platform: discovery uses `readdir` and `path.join` under the project's data dir, and every id passes `SKILL_ID` before it reaches a path, so a folder named `..` cannot escape. Front matter splits on `/\r?\n/`, so a CRLF checkout (Git for Windows `autocrlf`) parses the same as LF. NTFS and APFS are both case-insensitive by default; `SKILL_ID` allows lowercase only, so `Growth-Marketer/` is left out and logged rather than shadowing `growth-marketer`. Tested on Windows; macOS reasoned through and recorded untested.

### Plan

**Planned 2026-10-10.** One commit per step, `0.14.0` to `0.14.6`.

1. **Front matter, pure and strict.** Add `yaml` to `packages/server`'s own `dependencies`. `domain/markdown/front-matter.ts` separates the fenced block from the body and splits on `/\r?\n/`. `schemas/agent-definition.ts` parses the block with `yaml` and checks it against strict zod schemas, one for a persona and one for a step task. Specs: valid, no fence, bad YAML, an unknown key, `name` not matching the id.
2. **The bundled files carry their own catalog line.** Front matter goes on the ten personas and thirteen step tasks, taken from `catalog.ts` and the core `AGENTS` record. `scripts/generate-skills.mjs` emits it for the two generated personas, `architect.md` and `tester.md`, through its existing `frontmatter` helper. `pnpm gen:skills` and `pnpm check` stay green.
3. **Front matter never reaches a prompt.** `markdownBody` only normalises line endings, so without this step the YAML would be composed into every persona and step task. `composeSkill` and the step loader take the body only. Test: a composed persona contains no front-matter fence.
4. **`AgentCatalog`** (`services/agent-catalog.ts`). It discovers bundled files, then `agents/<id>/agent.md`, then `steps/<id>.md`; caches by mtime, as `readCached` does; and logs and skips a bad file. `catalog.ts` is deleted.
5. **Composition, schedules and loaders read the project's catalog.** `team-composition.ts` and `schedule-validity.ts` take the known ids. `OrchestrationService.goalContext` and `ScheduleService` pass the project's catalog. `loadSkill` takes its base from `agents/<id>/agent.md`, then the user override, then the bundle. The `skills/<id>.md` layer and `projectSkillFilePath` go. The step loader checks `steps/<id>.md` first.
6. **UI.** A project-scoped catalog route beside `schedules`. The five `agentForStage` call sites (`PipelineHeader`, `ArtifactsPanel`, `LogsPanel`, `GatesSection`, `StageNode`) read it, and the core `AGENTS` record is deleted. The fallback for an unknown id stays.
7. **Docs.** `architecture.md`: the Personas section, its table of override paths, and the `src/` file table. `decisions.md`: one dated entry covering YAML front matter, the single replacement path, and no user-level agents directory, each with its rejected alternative.

**Live check, after the gates.** In a scratch project with an isolated `ISOTOPY_USER_HOME` and `ISOTOPY_HOME`, add a `growth-marketer` agent and a `plan-campaign` step, ask the Orchestrator for a launch plan, and screenshot the proposed team. If it refuses or ignores a non-dev team, that is a finding for `orchestrate.md`, fixed here.

---
