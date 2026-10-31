# Storage: a database, or our own store on markdown plus metadata

**Question.** Isotopy keeps state in several shapes at once. Should it move to one database, or
build its own store where markdown files are the truth and metadata makes them queryable,
possibly as a separate project, if no such project exists yet?

## What Isotopy stores today

| Data | Format | Location | In git |
|---|---|---|---|
| Runs (state read model) | JSON records in SQLite | `.isotopy/runs.db` (`db/json-records-table.ts`, `repository/run-repository.ts`) | no |
| Run events | SQLite table `events` | `.isotopy/runs.db` (`db/events-table.ts`) | no |
| Admission (one active run) | SQLite table `active_runs` | `.isotopy/runs.db` | no |
| Orchestrations, milestones, schedules | `JsonRecordRepository<T>` in SQLite | `.isotopy/runs.db` | no |
| Durable workflow state, cron clock | Aiki on `node:sqlite` | `.isotopy/aiki.db` | no |
| Run evidence (handoffs, artifacts) | Files | `.isotopy/runs/<id>/` | no |
| Team, agents, steps | Markdown with front matter | `.isotopy/team.md`, `agents/`, `steps/` | **yes** |
| Memory (notes, Orchestrator context) | Markdown | `.isotopy/skills/*.notes.md`, `orchestrator.context.md` | no |
| Automation | JSON | `.isotopy/automation.json` | no |
| Task board | Markdown (TaskPlanner) | `.tasks/*.md`, `config.json` | **yes** |
| User settings, project registry | JSON | `~/.isotopy/settings.json`, `projects.json` | — |

So there are already two kinds of data: **what the owner and agents read and edit** (team,
agents, board, memory), kept as markdown, and **what the machine needs to run** (run state,
events, workflow state), kept in SQLite.

## Options

**1. One database for everything** (SQLite per project, as today, or a single user-level one).
- For: transactions across concepts; queries; one backup.
- Against: team, agents and board stop being reviewable in a pull request and editable in any
  editor; this cuts against "memory as markdown in git" (product brief) and "boundaries are
  data agents read".

**2. Keep the split, name it.** Markdown in git for human- and agent-facing data; SQLite for
machine state; a rule for which goes where.
- For: matches what works today; no migration.
- Against: no way to query markdown (e.g. "every agent with tool X", "tasks linked to run Y")
  without parsing all of it each time.

**3. Markdown is the truth, SQLite is a rebuildable index.** Write the file first, then upsert
its front matter and links into an index; rebuild the index on start or when a file changes on
disk.
- For: queries without giving up git and plain files; the pattern most of the projects below
  use.
- Against: two copies to keep consistent; a file edited by hand must be noticed (a watcher on
  Windows and macOS behaves differently).

**4. Option 3 as a separate project** (its own package or repository), shared by Isotopy and
TaskPlanner, which already keeps its board as markdown with an id counter in `config.json`.
- For: one tested store for both products; others could use it.
- Against: a library to maintain and version; worth it only if no existing project fits.

## Existing projects to evaluate

Found on 2026-10-29; maturity, activity and licence not yet checked.

| Project | Language | What it does |
|---|---|---|
| [MarkdownDB](https://github.com/datopian/markdowndb) (`mddb`) | JavaScript | Parses markdown (front matter, tags, links, tasks) into a JSON or SQLite index |
| [KiwiFS](https://docs.kiwifs.com/concepts/files-as-truth) | ? | Markdown files with YAML front matter as truth, indexed into SQLite, queryable |
| [GroundDB](https://docs.rs/grounddb) | Rust | Markdown with YAML front matter; SQLite system database as index |
| [MDQL](https://docs.rs/crate/mdql/0.1.0) | Rust | Folders of markdown as a schema-validated, queryable database |
| [sqldown](https://skills.cat/skills/mbailey/sqldown) | ? | Front matter to database columns, and back to markdown |
| mq-db | ? | Markdown as an embedded queryable database |
| [ai-memory](https://instagit.com/akitaonrails/ai-memory/what-is-the-role-of-sqlite-in-ai-memorys-architecture.md) | ? | Markdown wiki with SQLite as a derived index; write file first, upsert, re-index on start |

For Isotopy a candidate must run in Node on Windows and macOS without a native build step
(Isotopy already uses `node:sqlite`), validate front matter with a strict schema (zod, by the
runtime validation rule), and write files without reformatting what a person wrote.

## Open questions

- Which queries does Isotopy actually lack today? Without them option 3 has no user.
- Is run state ever something the owner should read or edit as a file?
- Would TaskPlanner adopt the same store? Its owner is the same team, so this is a real option.
- How are concurrent writers handled once several agent instances run at once
  ([parallel-agents.md](parallel-agents.md))? SQLite has one writer; files in git have merges.

## What a decision needs

The list of missing queries, an evaluation of MarkdownDB and one or two others against the
criteria above, and a yes or no from TaskPlanner on sharing it.
