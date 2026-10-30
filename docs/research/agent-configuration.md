# Agent configuration: copy Mastra, reuse it, or build our own

**Question.** Mastra gives an agent tools, skills, schedules, memory and a Studio editor with
versions. Should Isotopy agents be configured as richly, and if so, by copying the concepts,
by reusing Mastra, or by building our own? Whatever the answer, the owner wants agent
configuration to live apart as a module (see [modules.md](modules.md)).

## What an Isotopy agent has today

| Capability | Today | Where |
|---|---|---|
| Identity / instructions | A markdown persona; bundled, overridden per project or per user; plus a project addendum | `domain/skills/personas/*.md`, `.isotopy/agents/<id>/agent.md`, `~/.isotopy/skills/<id>.md`, `.isotopy/skills/<id>.project.md` |
| Assignment | A step task, separate from identity | `domain/skills/step-tasks/*.md`, `.isotopy/steps/` |
| Model | A tier per role, resolved per engine; an exact pin per engine in settings | `team.md` `modelTier`, `~/.isotopy/settings.json` |
| Engine | A slot per role (primary/secondary), never an engine id | `team.md` `engine` |
| Memory | Per-persona notes (capped at 40), Orchestrator context (4 KB), read-only knowledge files | `.isotopy/skills/<id>.notes.md`, `orchestrator.context.md`, `agents/<id>/knowledge/` |
| Schedules | Duties an agent ships, seeded disabled; cron through Aiki | `agents/<id>/duties/*.md`, `services/schedule-service.ts` |
| **Tools / MCP** | **None.** The CLI uses whatever its install has | — |
| **Skills (attachable)** | **None.** "skill" in code is a persona id; skills are layered at read time, never written into a project's `.claude/skills` (decision 2026-07-22) | — |
| **Permissions per role** | **None.** One `permissionMode` per project | `domain/rules/permission-plan.ts` |
| **Editing from the UI** | **None.** Team and Agents in Setup are read-only | `ui/src/components/setup/` |
| Versions | git history of the files | — |

## What Mastra gives an agent (as of October 2026)

- **Tools** via `createTool`, background tools with timeouts, retries and concurrency; MCP 2.x
  client and server.
- **Skills** in code or as markdown files (`@mastra/core` 1.48+); Studio's "Add Skill" installs
  from the skills.sh registry.
- **Schedules**: cron on an agent or a workflow, persisted, threaded (a signal into a
  conversation) or threadless; pause, resume, history in Studio. Best-effort delivery.
- **Memory**: message history, working memory, semantic recall, and observational memory (see
  [observational-memory.md](observational-memory.md)).
- **Studio Agent Editor**: edit prompts and tools without code, save versions, compare, roll back;
  traces, metrics, evals, datasets.
- **Running other harnesses**: `@mastra/claude` (Claude Agent SDK), `@mastra/cursor`,
  `@mastra/openai`, `@mastra/acp`. The provider SDK keeps the agent loop.
- **Licence**: Apache-2.0 except `ee/` directories.

## What each CLI can take per run

Isotopy never calls a model API: whatever an agent is configured with must reach the CLI as an
argument, a config file or an environment variable. To verify against each CLI's `--help`
(`engines/cli-config.ts` already reads help output) before anything is designed on it:

| Setting | Claude Code | Codex | Cursor |
|---|---|---|---|
| MCP servers | `--mcp-config <file\|json>`, `--strict-mcp-config` | `[mcp_servers]` in `config.toml`; `-c` overrides per run? | `.cursor/mcp.json` in the workspace; `--approve-mcps`? |
| Allowed / denied tools | `--allowedTools`, `--disallowedTools` | sandbox and approval policy only? | ? |
| Skills | `.claude/skills/<name>/SKILL.md`, plugins (`--plugin-dir`?) | skills directory? | rules (`.cursor/rules`), `AGENTS.md` |
| System prompt | `--append-system-prompt` (used today) | prepended to the prompt (today) | prepended to the prompt (today) |
| Permissions | `--permission-mode`, `--dangerously-skip-permissions` (used today) | `--sandbox`, `--dangerously-bypass-approvals-and-sandbox` (today) | `--sandbox` (today) |

The question marks are the research. A setting one CLI cannot take needs a stated fallback
(ignored with a warning, or the role refuses to run on that engine).

## Options

**1. Copy the concepts into Isotopy's own agent module.** Extend the agent file (front matter)
with `mcp`, `tools`, `skills`, `permissions`; the agents module translates them into each
engine's arguments, next to `engines/persona.ts` and `permission-plan.ts`.
- For: keeps the subscription-CLI bet; agents stay markdown in git (versions and rollback come
  free); fits the existing catalog and override layers.
- Against: three translations to maintain as the CLIs change; per-run MCP or skills on disk may
  conflict with "never seed a project's `.claude/skills`" (2026-07-22) and need a temporary
  directory per run instead.

**2. Reuse Mastra as the agent runtime.** Isotopy agents become Mastra agents; Claude Code runs
through `@mastra/claude`, others through ACP.
- For: tools, skills, memory, schedules, Studio and traces exist already and move fast.
- Against: Mastra's own loop is paid per token on provider keys, against "never calls a model
  API"; through `@mastra/claude` on the owner's own Claude Code login the subscription is used
  as Isotopy uses it ([competitor-matrix.md](../competitor-matrix.md), point 2), but the CLI
  then keeps the loop, so Mastra adds a second configuration layer over ours; a second durable runtime beside Aiki (adopted 2026-10-06) and a second memory
  in a database beside markdown in git; Codex has no named wrapper; a fast-moving dependency
  (three minors in eight days in October).

**3. Reuse parts of Mastra, not the runtime.** For example its skills format, MCP client, or
Studio's editor as a reference only.
- For: borrows what is standard (SKILL.md, MCP) without the loop.
- Against: the standard parts are not Mastra's (SKILL.md and MCP are open formats), so there may
  be nothing left to take but ideas.

## Open questions

- Which of tools, skills, permissions are really missing in practice? Collect the cases from
  dogfood runs (`docs/dogfood/`) where an agent lacked a tool or had too much power.
- Is a tool per agent a security boundary (agents must not reach it) or a convenience (fewer
  tools, less noise)? The 2026-08-10 decision leaves blast radius to the CLI's own reviewer;
  per-role permissions would revisit it.
- Does the owner edit an agent in the UI by writing its file and committing, or through a
  proposal like `team.md`?
- Skills: user-level library (`~/.isotopy/skills/`), project-level, or a registry such as
  skills.sh?
- Do agents carry their own schedules (as duties do today), or is a schedule always a team
  concern?

## What a decision needs

The verified CLI capability table, two or three real cases per missing capability, and the
agent file format the module would own.
