# Modules: what Isotopy is made of, and where the boundaries go

**Question.** The owner wants everything about agents and their configuration to live apart, as a
module or a service. Before deciding that for agents, map the whole product into modules: the
other research topics (agent configuration, memory, storage, parallel agents, UI) each land on
one or two of them.

Related: `TASK-202` (server organised by concept), `TASK-213` (split the three ~1000-line
services), `TASK-201` (document reader).

## What exists today

Three workspace packages:

| Package | Owns | Size hint |
|---|---|---|
| `packages/core` | Pure shared domain for server and UI: engines, pipelines and stages, team schema, runs and events, orchestration decisions, milestones, schedules, settings views, agent catalog types. Depends only on zod. | 19 files |
| `packages/server` | Hono on :9477, folders by **layer**: `routes/`, `schemas/`, `domain/{rules,markdown,skills}`, `services/`, `engines/`, `workflow/`, `repository/`, `db/`, `utils/`. | `orchestration-service.ts` 926, `run-service.ts` 977, `stage-execution.ts` 853 lines |
| `packages/ui` | React + Vite on :5173; `api.ts` is the one network module, hooks own state, components by area (`home/`, `run/`, `schedule/`, `setup/`). | — |

A concept is spread across layers. "Agent" is known in nine places
(`schemas/agent-definition.ts`, `domain/rules/agent-catalog.ts`, `domain/rules/persona-notes.ts`,
`domain/markdown/front-matter.ts`, `domain/markdown/skill.ts`, `domain/skills/*`,
`services/agent-catalog.ts`, `routes/agents.ts`, `core/agents.ts`); runs, schedules and milestones
are split the same way.

## Candidate modules

| Module | Owns | Depends on | Spread across today |
|---|---|---|---|
| **engines** (kernel) | Starting a CLI, its arguments, protocol parsing, permission flags, login check, model roster | `utils` | `engines/*`, `domain/rules/permission-plan.ts`, `services/model-roster-service.ts`, `core/engines.ts` |
| **agents** | What an agent is: identity prose, steps, knowledge, duties; catalog merge (bundled, project); per-agent settings that do not exist yet (tools/MCP, skills, permissions) and their translation into an engine's arguments | engines, memory, storage | the nine files above, `engines/persona.ts` |
| **memory** | Persona notes, Orchestrator context, knowledge listing; any future observational log | storage | `services/persona-notes-store.ts`, `domain/rules/persona-notes.ts`, `domain/rules/orchestrator-context.ts`, `schemas/orchestrator-context.ts` |
| **team** | `team.md`: roster, flows, composition into a pipeline, change proposals | agents | `services/team-service.ts`, `domain/rules/team-composition.ts`, `schemas/team-file.ts`, `core/team.ts` |
| **runs** | Run state, admission, stage loop, waits, evidence, changes | engines, agents, team, workflow, storage | `services/run/*`, `workflow/pipeline-*`, `workflow/stage-execution.ts`, `services/run-*`, `services/consumers/*` |
| **orchestration** | Initiatives, decisions, broker, branch and release | runs, team, milestones | `services/orchestration-service.ts`, `services/initiative-*`, `domain/rules/orchestration-*`, `domain/rules/initiative-*` |
| **milestones** | Features, planning proposals, closeout | runs | `services/milestone-*`, `domain/markdown/planning.ts` |
| **scheduling** | Schedule records, duties seeding, cron clock | runs, orchestration, workflow | `services/schedule-service.ts`, `workflow/*schedule*`, `domain/rules/schedule-*` |
| **board** | Reading and claiming tasks on the repo's board | storage | `services/task-board-adapter.ts`, `services/run/source-task-claim.ts` |
| **product** | Starting the product, preview, automation, deploy | engines? | `services/product-process-service.ts`, `services/deployment-runner.ts`, `services/automation-config-store.ts` |
| **projects & settings** | Project registry, user settings, preferences | storage | `services/project-registry.ts`, `services/settings-store.ts` |
| **workflow** (kernel) | Aiki runtime wrapper | — | `workflow/workflow-runtime.ts` |
| **storage** (kernel) | SQLite per project, JSON records, markdown files in git | — | `db/*`, `repository/*`, `utils/text-file.ts`, `utils/git-file-commit.ts` |
| **ui** | Screens and state | core, HTTP | `packages/ui` |

The dependency arrows above are a first guess drawn from imports by name; the research task
checks them against the real import graph and records every cycle.

## Boundary options

**A. A folder per concept inside `packages/server`** (`src/agents/`, `src/runs/`, …), the shape
`TASK-202` sketches. Purity set by file name (`*-service.ts`, `*-store.ts`, `*-repository.ts`,
`*-routes.ts` may do I/O), enforced by eslint.
- For: cheapest move; one PR per concept; no build or publishing change.
- Against: the boundary is a convention; nothing stops `runs/` importing `agents/` internals
  unless an eslint rule on import paths does.

**B. A workspace package per module** (`packages/agents`, `packages/runs`, …), each with an
`index.ts` that is its public surface.
- For: the boundary is enforced by the package graph; a module can be tested and versioned
  alone; a candidate for reuse outside Isotopy (agents, storage).
- Against: more `package.json` files to bump on every commit (the versioning rule bumps all of
  them); cross-package refactors are heavier; `core` already plays the shared role and some of
  its contents would move.

**C. A separate service or project** (its own process or repository, e.g. an agents service or
a markdown store).
- For: independent lifecycle; usable by other products; forces a real API.
- Against: Isotopy is local-first, one process, SQLite in `.isotopy/`; a second process means
  start-up, ports, versions and IPC on Windows and macOS for one user on one machine. It earns
  its place only for a module someone else would use on its own.

The options mix: A for most concepts, B for the kernel pieces that have no Isotopy concept in
them (engines, storage, workflow), C only where a module turns out to be a product of its own
(see [storage.md](storage.md) for one such candidate).

## Open questions

- Is "agents" one module, or two: the **definition** (catalog, prompts, settings) and the
  **engine translation** (how a definition becomes CLI arguments for Claude Code, Codex, Cursor)?
- Where does code two modules share live? `team-composition` serves both scheduling and
  orchestration.
- Do routes move into their module or stay one HTTP layer?
- Does `packages/core` stay a single shared package, or split along the same lines so the UI
  imports only what it shows?
- What enforces the boundary under option A: eslint `no-restricted-imports` per folder, or
  dependency-cruiser?
- Order against `TASK-213` (split the big services by concern) and `TASK-201`: which split goes
  first so that no file moves twice?

## What a decision needs

A module map with owners and allowed dependencies, the boundary option per module, the order of
moves, and the rewrite of A3 and "Server file placement" in `architecture.md` and `AGENTS.md`.
