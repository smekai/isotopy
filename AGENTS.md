<!-- TASKPLANNER:START -->
# TaskPlanner — AI Agent Instructions

This project uses [TaskPlanner](https://github.com/smekai/taskplanner) for task management.
Tasks are stored as markdown files in the `.tasks/` directory.

## Task File Structure

Each state has its own file:
- **Backlog** → `BACKLOG.md`
- **Next** → `NEXT.md`
- **In Progress** → `IN_PROGRESS.md`
- **Done** → `DONE.md`
- **Rejected** → `REJECTED.md`

Auxiliary file (optional rolling log, not a task state):
- **Work Log** → `WORK_LOG.md`

Completed work may be archived out of `DONE.md` into `.tasks/archive/` once a project sets
`archiveDoneAfterDays`. Those files are plain markdown in the same format but are not board states —
if a task is not in `DONE.md`, grep the archive before concluding it never existed.

## Task Format

Each task is a `## ` heading section separated by `---`:

```markdown
## TASK-001: Task title here
**Priority:** P1 | **Tags:** tag1, tag2

Description text in markdown.

---
```

- **ID prefix:** `TASK`
- **Priorities:** P0, P1, P2, P3, P4

## Tools

TaskPlanner ships an MCP server, and this repository wires it in `.mcp.json` — `node
node_modules/@smekai/taskplanner/dist/mcp-server.js`, running the version pinned in
`package.json`. If your host exposes these tools, **use them instead of editing the task files by
hand** — they allocate IDs, keep `nextId` and timestamps correct, and rewrite the markdown without
touching its encoding:

| Tool | Use for |
| --- | --- |
| `taskplanner_list` / `taskplanner_board` | Find work and see the current state. |
| `taskplanner_get` | Read one task in full. |
| `taskplanner_create` | Create a task; the ID is allocated for you. |
| `taskplanner_move` | Move a task between states. |
| `taskplanner_update` | Change title, description, priority, tags, epic, assignee, waiting-until, or plan. |

Check once at the start of a session whether the tools are available, and say which way you are
working. **If they are available, do not hand-edit these files.** Every instruction below that
describes editing markdown directly is the fallback for when they are not.

The files stay plain markdown on purpose, and a human is free to edit them in any editor at any
time. That freedom is not an invitation for an agent with working tools to do the same: hand-edits
are what desynchronise `nextId` and corrupt encodings.

## Workflow for Implementing a Task

When asked to implement a task:

1. **Pick the task** from BACKLOG.md or NEXT.md (highest priority first, or as specified by the user). Skip any task carrying a `**Waiting until:**` date that has not arrived — it is blocked on something outside the repository and cannot be started, whatever its priority. The tools mark these for you.
2. **Move the task** to IN_PROGRESS.md — `taskplanner_move` if it is available, otherwise cut the section from the source file and paste it into IN_PROGRESS.md.
3. **Implement** the task.
4. **Move the task** to DONE.md when complete — trim any `### Plan` to a done-summary, append a short entry to `.tasks/WORK_LOG.md` if that file exists, and add a **CHANGELOG.md** entry under `## [Unreleased]`.

This project sets `aiPlanRequired: false`, so a `### Plan` block is not required before coding. Tasks that carry one keep it, trimmed to a done-summary on the way to Done.

### Work Log

When moving a task to DONE.md, if `.tasks/WORK_LOG.md` exists, append **one short entry at the top** (after the header, before older entries):

```markdown
## TASK-001 — YYYY-MM-DD
**What:** One-line summary of what was delivered.
**Decisions:** Key choices made and why (skip if none).
**Outcome:** Result or follow-ups (skip if obvious from What).

---
```

Keep it to 3–5 lines total. Skip empty fields rather than writing "N/A". Detailed steps belong in the task's `### Plan`, not here.

## Mandatory checklist (do not skip)

These steps are **part of the work**, not optional housekeeping:

- **In Progress:** The task must actually **move** out of BACKLOG/NEXT into **IN_PROGRESS.md** before substantive implementation — not only be described as moving. Use `taskplanner_move`; without it, cut the whole `##` section and its `---` across by hand.
- **Done:** When the implementation is finished, **move** the same task section from IN_PROGRESS.md into **DONE.md** and add a **CHANGELOG.md** entry under `## [Unreleased]`.
- **Work log:** If `.tasks/WORK_LOG.md` exists, append one short entry at the top when moving a task to Done (see **Work Log** above).

## Creating a New Task

When the user asks you to create a task, call `taskplanner_create` if it is available. It allocates
the ID and advances `nextId` itself, so neither is yours to manage.

Without the tools, do it by hand:

1. **Read** `.tasks/config.json` to get the current `nextId` and `idPrefix`.
2. **Generate the ID** — format: `{idPrefix}-{nextId padded to 3 digits}` (e.g. `TASK-015`).
3. **Increment `nextId`** in `.tasks/config.json` and save the file.
4. **Write the task** into `BACKLOG.md` (or the file the user specifies) using this format:

```markdown
## TASK-001: Task title
**Priority:** P2
**Tags:** tag1, tag2
**Updated:** YYYY-MM-DD HH:mm

Description of the task in markdown.

---
```

Rules for new tasks:
- **Priority** is required. If not specified by the user, default to `P2`.
- **Waiting until** is optional — `**Waiting until:** YYYY-MM-DD` on its own line marks a task that cannot start before that date. Use it when work is blocked on something outside the repository, rather than lowering its priority.
- **Tags** are optional. Pick from the project's tag list if relevant: core, ui, server, adapters, engine, infra, setup, testing, milestone-c, milestone-d, milestone-e, milestone-f, milestone-g, milestone-h, milestone-i.
- **Updated** — set to the current date/time.
- Add the task at the **top** of the file (after the `# Heading` line). Beyond that, the order of tasks within a file carries no meaning — never reorder a file to match priority.
- Always end the task section with a `---` separator.
- If the user asks to create multiple tasks at once, increment the ID for each one.

## Important Rules

- Prefer the TaskPlanner tools over editing these files by hand whenever they are available.
- Do NOT change task IDs.
- Do NOT modify tasks you are not working on.
- Keep the `---` separator between tasks.
- When moving a task by hand, remove it entirely from the source file (including the trailing `---`), and read and write the file as UTF-8 so dashes and quotes survive the round-trip.

<!-- TASKPLANNER:END -->

## Versioning

All workspace packages (root + `packages/*`) share one version, bumped together.

- **Every commit:** increment the patch component from its parent and update the
  root plus every `packages/*` package together. A three-commit PR starting at
  `0.8.0` must therefore contain `0.8.1`, `0.8.2`, and `0.8.3`.
- **Minor** (0.x.0): start a new explicitly planned feature or milestone series.
- **Major** (1.0.0): when everything planned for the milestone set is done and the product is ready.

The current version lives in the root `package.json` — read it there. A hand-copied
number in this file drifts on the very next commit, which is why one is no longer kept.

## Runtime validation boundaries

- Parse untrusted HTTP, engine, database, settings, and file data once at its
  boundary with a strict runtime schema.
- Domain and service code receives validated types; do not repeat
  `Record<string, unknown>` traversal or silently filter malformed nested data.
- Derive runtime value lists and TypeScript unions from one exported `as const`
  tuple.
- Use `field?: T` when a property may be absent or `undefined`; those states have
  the same meaning in Isotopy contracts. Use `null` only when the contract needs an
  explicit cleared or removed value.

## Comments — default to zero

Code says *what*. Markdown says *why*. A comment is a smell, not a courtesy.

Before writing one, **rename** until it is redundant. If a name cannot carry it,
the explanation goes to [`docs/implementation-notes.md`](docs/implementation-notes.md)
(how something works, platform and CLI quirks) or
[`docs/decisions.md`](docs/decisions.md) (a dated entry: context, decision,
rejected alternative). It does not go in the source.

Only two kinds survive review under `src/`:

- a **one-line** pointer at genuinely intricate *local* logic — a subtle regex, a
  protocol quirk, a platform workaround on the very next line;
- anything under `packages/*/test/`, which may explain itself freely.

Do **not** write:

- `/** … */` on an interface field, a type, or an exported function. A doc comment
  that restates the signature is noise — and "the surrounding code already has
  some" is not a reason to add more.
- a comment that introduces a block (`// build the prompt`, `// then park the
  stage`). Extract a named function instead.
- a comment that argues for a design. That is a `docs/decisions.md` entry.
- a header paragraph summarising a `src/` file. That is `docs/architecture.md`.

Deleting a comment without relocating what it knew is data loss: move it first,
then delete it.

## Server file placement

Does this file name an Isotopy concept — a run, a milestone, a stage, a persona, a
task board? If it would make just as much sense in a different product, it is a
`util` under `packages/server/src/utils/`. If it names an Isotopy concept: parse an
untrusted boundary → `schemas/`; other pure logic → `domain/` (`rules/`,
`markdown/`, `skills/`); I/O or lifecycle → `services/`. A file's name is the
kebab-case of its main exported class (`run-service.ts` exports `RunService`).
