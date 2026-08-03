# Implementation Notes

The "why" behind non-obvious code — the platform workarounds, protocol quirks,
and subtle decisions that used to live in code comments. Per Architect rules
**A1** (comments are a smell) and **A8** (evidence lives in Markdown), the source
carries almost none of this; it lives here, grouped by subsystem, so the code
stays clean and the reasoning stays discoverable.

Entries are keyed to a file (and where useful a function). If you are about to
"simplify" something that looks odd, check here first — most of it is load-bearing.

---

## Engines — subprocess harness (`engines/subprocess.ts`)

The generic harness runs any CLI in a workspace, streams output line-by-line,
enforces a hard timeout, supports abort, and kills the whole process tree. The
concrete adapters build binary resolution, argument construction, and output
parsing on top.

**Windows `.cmd`/`.bat` shims.** Node ≥ 20 refuses to spawn batch shims directly.
`resolveSpawnTarget` routes them through the command interpreter as a single
quoted command line: `cmd.exe /d /s /c "<line>"`. `/d` skips AutoRun scripts;
`/c` runs and exits; `/s` plus the outer quote pair is the documented way to keep
our own quoting intact — cmd strips exactly that outer pair and treats the rest
verbatim. `windowsVerbatimArguments: true` is what keeps `shell: true` (and the
DEP0190 deprecation, which concatenates an args array unescaped) out of this
module entirely. Everything off Windows takes the argv array untouched.

**Argument quoting (`quoteWindowsArg`).** Wraps one argument in double quotes
using the C runtime's backslash rules so the child parses argv back exactly as
given: backslashes before a quote are doubled then the quote escaped, and
trailing backslashes are doubled so they can't escape our closing quote. Quoting
also neutralises the cmd injection metacharacters (`&`, `|`, `<`, `>`) — the
interpreter does not act on them inside a quoted string, which is what makes it
safe to pass a stage persona (multi-line markdown) as an argument.
**Deliberate caveat:** `%VAR%` is still expanded inside quotes and `^` can't stop
it there — it can substitute an env value into an argument but cannot introduce a
new command.

**Multi-line args truncate under cmd.** cmd ends a command at a line break, so a
multi-line argument through a shim is silently cut. `runSubprocess` fails loudly
instead; callers with long text (a persona) must send it via stdin on that path.

**Process-tree kill (`killProcessTree`).** `child.kill()` alone orphans
grandchildren spawned under a Windows `.cmd` shim, so Windows uses
`taskkill /pid <pid> /T /F`. POSIX sends `SIGTERM`, then escalates to `SIGKILL`
after a grace period.

## Engines — binary resolution (all adapters)

Each adapter resolves its CLI in a fixed order and caches the result, clearing
the cache on `detect()`/`install()` so a freshly installed CLI is picked up
without a server restart:

1. `ADHD_<ENGINE>_PATH` env override (validated to exist).
2. `where`/`which` on PATH. **On Windows, prefer the `.cmd`/`.exe`/`.bat` shim
   over an extensionless shell shim** — only the former can be spawned directly
   (npm global installs drop both).
3. Fallbacks: Cursor scans its installer dirs (`~/.local/bin`,
   `%LOCALAPPDATA%\cursor-agent`); Claude Code scans the native binary bundled in
   the VS Code / Cursor IDE extension (`anthropic.claude-code-*`).

Cursor detection also flags when the **Cursor IDE** is installed but its headless
**Agent CLI** (a separate tool) is not — otherwise "not found" surprises users.

## Engines — billing safety (`buildChildEnv` in each adapter)

The provider's API-key env var is **stripped from the child environment** so a
stray key in the server's env can't silently switch billing away from the user's
CLI subscription login. The stored key is injected **only** in `api-key`
connection mode. Claude Code additionally deletes `ANTHROPIC_AUTH_TOKEN` (setting
both makes the CLI reject requests) and passes `--bare` in api-key mode, because
bare mode reads auth strictly from `ANTHROPIC_API_KEY` — without it a logged-in
CLI ignores the injected key and bills the plan.

## Engines — persona delivery (`engines/persona.ts`)

Claude Code takes the stage persona natively via `--append-system-prompt`, so it
stays in the system role. Cursor and Codex expose no equivalent flag, so
`withPersonaPrompt` folds the persona into the head of the user prompt (separated
by `\n\n---\n\n`) — same content reaches the model, keeping personas
engine-agnostic. It is a no-op when a stage has no persona. **Exception:** a
Claude `.cmd` shim runs through cmd.exe (multi-line flag can't survive), so on
that path Claude also falls back to prompt-folding via stdin.

## Engines — CLI-specific quirks

**Cursor (`engines/cursor.ts`).** Headless runs must not stop for confirmation;
Cursor has no accept-edits-only mode, so both permission modes use `--force`.
`--trust` is on by default (fresh scratch workspaces would otherwise hit the
workspace-trust prompt and hang). Experimentation knobs, since the CLI's headless
behavior on Windows is still being mapped: `ADHD_CURSOR_TRUST=0` drops `--trust`,
`ADHD_CURSOR_ARGS` appends args verbatim, `ADHD_CURSOR_PROMPT_VIA=stdin` pipes
the prompt instead of passing it positionally (Windows arg limit ≈ 32K).
Cursor's own `auto` router model is distinct from our **Auto** (which sends no
`--model` at all), so the roster prepends ours and relabels theirs.

**Codex (`engines/codex.ts`).** `codex exec --json` emits newline-delimited JSON
events. `--skip-git-repo-check` lets it run in a non-git scratch workspace.
Permission modes: `acceptEdits` → `--sandbox workspace-write` (writes confined to
the workspace; escalation is denied, not queued); otherwise
`--dangerously-bypass-approvals-and-sandbox`. The prompt is read from stdin via
`-` to sidestep the Windows arg-length limit. The CLI has no `models` subcommand,
so `listModels` reads the top-level `model = "…"` key from `~/.codex/config.toml`
(matched before the first `[section]` so a nested profile key isn't mistaken for
the global default). **`codex exec resume` does not accept `--sandbox`** — only
`--dangerously-bypass-approvals-and-sandbox` — so a resumed turn under
`acceptEdits` runs on Codex's own default sandbox rather than `workspace-write`.

**Auth probes (detect).** Cursor `status` and Codex `login status` are best-effort:
Cursor's exits 0 either way so the answer is in the text; Codex's exit code is the
signal (0 authenticated, 1 not) with text filling the status line.

## Engines — output parsing

All three adapters parse a JSON-per-line stream off `onLine`, ignoring non-JSON
lines, and capture the final `result`/`turn.completed` event for the run's
result text, cost, duration, and turn count. Error text can arrive as a
non-success subtype **or** as `is_error` on a success event — both are handled.
Known CLI failure signatures are matched by regex (`ERROR_HINTS`) and mapped to
actionable guidance while the raw error stays visible in the log.

---

## Run orchestration (`services/run-orchestrator.ts`)

`RunOrchestrator` owns run lifecycle — it starts pipelines, streams stage events
to subscribers, and executes each stage either as a simulation or through a real
engine adapter. State is in-memory for the prototype, persisted per transition.

**The durable-workflow seam is the whole `RunOrchestrator`, not one method.**
The durable runtime is **OpenWorkflow** (`workflow/`, see
`workflow-runtime-options.md`). `workflow/pipeline-workflow.ts` is the durable
workflow body (the ported run loop) and `workflow/stage-execution.ts` is the
durable *step* — the single decision point for how a stage runs (simulate vs.
engine). Durability owns starting/queueing, the loop, gates (durable signals),
durable timers, retries, recovery and cancellation state; `RunOrchestrator` is
the single writer of the `RunState`/events read model. The earlier claim that a
durable runtime "replaces `executeStage()` alone" was wrong (§4 of the runtime
doc). Keep stage-execution logic inside `workflow/stage-execution.ts`.

**Register the abort handle before the first `await` (`workflow/stage-execution.ts` `runEngineStage`, via `deps.beginEngineStage`).**
Resolving the persona touches the filesystem. An abort arriving in that window
used to find no `AbortController` to cancel, so the CLI was spawned anyway and
ran to completion for a run the user had already stopped. The controller is set
before any await, and cancellation is re-checked after the inputs resolve and
after the adapter returns. Cancel stays immediate and ADHD-owned (`abortRun` →
`controller.abort()` → `killProcessTree`); OpenWorkflow's `cancelWorkflowRun`
only marks durable state (G4).

**`run.result` holds only the last stage's output.** It is kept for the
run-level result view and for runs recorded before `stageOutputs` existed
(single-box runs). Per-box consumers must read `stageOutputs` instead, or a
multi-box run shows one box's text against every stage.

**A verification box's verdict can fail a passing exit.** The harness exiting 0
only means it ran; a `VERDICT: FAIL` in the output fails the stage anyway, or a
failed verification would be reported as a green run. Stages whose persona
declares no verdict stay governed by the exit code.

**`parseStageVerdict` scans backwards (`domain/stage-context.ts`).** It looks for
the *last* line that is *only* a verdict, tolerating markdown wrapping (bare,
backticked, bold) and CRLF line endings. Both matter: the persona text itself
contains the literal strings `VERDICT: PASS`/`FAIL`, and a report may discuss one
mid-prose ("I would fail this if…"), so a first-match-anywhere search would read
the wrong outcome. Absent a verdict line it returns `undefined`, which is how a
box with no verdict contract (the Developer) stays governed by exit code alone.
`buildStagePrompt` prepends the run task and one handoff block per upstream box;
the workspace is the source of truth, the reports only add what a box *said*.

## Core — model rosters & pipelines (`core/engines.ts`, `core/pipelines.ts`)

- **Auto (no `--model`)** is always offered and always safe: it lets the CLI's own
  configured default win, so it can't outlive a snapshot id our roster hard-codes.
  The Cursor and Codex rosters are snapshots that churn; `listModels()` trues them
  up against the live CLI.
- **`LEGACY_MODEL_ALIASES`** migrates stored preferences on read so a user who
  picked a since-retired model isn't stuck with failing runs. Claude full ids
  (`claude-opus-4-8`, …) resolve to 1M-context variants that subscription plans
  reject, so they map to the short id; Codex's `gpt-5-codex` is rejected on
  ChatGPT-account auth, so it maps to Auto.
- **A stage is engine-backed iff it carries a `skill`.** `pipelineUsesEngine`
  keys off the stage model, not a hardcoded pipeline id, so a new engine-backed
  pipeline needs no orchestrator change to get engine validation and a workspace.
- **Full Delivery behaviour is stage policy, not stage-name branching.**
  `executionPolicy` identifies quality, delivery, and closeout work. Blocking
  verdicts continue through quality evidence and closeout while suppressing
  release/deploy; engine failures suppress everything except closeout.
  Restart inputs carry upstream outcomes as well as handoff text, so retrying a
  downstream stage cannot erase an earlier blocker.

## Configuration & paths (`server/config.ts`, `server/paths.ts`)

- **`REPO_ROOT` is anchored to this module's location, not `process.cwd()`.** The
  dev server runs with `cwd = packages/server` (via `pnpm --filter`), so a
  cwd-relative path would land in the wrong place. Since TASK-059 it is used
  *only* to find the tool's own `.env` — no user data hangs off it.
- **Data paths are a value, not a constant.** Every storage call takes a
  `ProjectPaths` (`id`, `root`, `dataDir`): a project's data lives in
  `<root>/.adhd/`, so history sits beside the code it belongs to instead of
  inside the ADHD checkout. See [`decisions.md`](./decisions.md) (2026-07-23).
- **`homeProjectPaths()` and `userAdhdDir()` are functions, not constants.** A
  constant would freeze `ADHD_HOME` / `ADHD_USER_HOME` at import time; as
  functions, a test can point both roots at temp directories regardless of module
  load order. That is the seam the component tests use — `ADHD_HOME` isolates the
  home project's data, `ADHD_USER_HOME` the registry and credentials.
- **The `.env` loader fills gaps only.** Values already in `process.env` win, so
  `PORT=1234 pnpm dev` still overrides the file. Every config value has an env
  override and a sensible default; nothing is hardcoded.

## Toolchain pins

- **TypeScript is pinned to 6.0.3, not 7.x.** TypeScript 7 crashes the lint gate:
  `typescript-eslint@8.65` declares a peer range of `>=4.8.4 <6.1.0`, and its
  `typescript-estree` throws `TypeError: Cannot read properties of undefined
  (reading 'Cjs')` under TS 7. 6.0.3 is the newest release lint, typecheck and
  build are all green on. Revisit when typescript-eslint ships a TS 7 peer range.
- **TS 6 dropped automatic `@types` inclusion,** so each project declares `"types"`
  explicitly — `["node"]` for the server, `["vite/client"]` for the UI.

## UI

**Project scoping (`ui/src/api.ts`, `hooks/useProjects.ts`, `settings.ts`).**
`api.ts` stamps `X-ADHD-Project` onto every request from module state that
`useProjects` keeps in step; the server still falls back to its own active
project, so the browser copy is never the sole source of truth. `useProjects`
exposes `ready`, and `App` loads nothing project-scoped until it flips — the
switcher shows a placeholder name for that first tick, which is why an
assertion on it has to wait for the list rather than reading the trigger
immediately. Preferences are keyed `adhd.<projectId>.<name>` so two projects
can hold different pipelines, models and permission modes at once.

**Inline markdown renderer (`ui/src/inline-md.tsx`).** `INLINE_TOKEN` is one
alternation with one branch per inline style, tried left-to-right at each
position, so `**` outranks `*` and a `` `code` `` span consumes any markers
inside it. The underscore italic form requires non-word neighbours, so
`snake_case_names` in paths and tool summaries don't turn italic (real markdown
skips those too). Text goes through React's normal escaping — no HTML injection
is possible — and unmatched markers pass through literally. Bold/strikethrough
content renders recursively so a bold span containing an inline-code span still
styles the inner span; nesting can't loop because a lazy match never contains its
own delimiter.

**Live-run subscription ordering (`ui/src/hooks/useRunEvents.ts`).** The SSE
subscription is opened *before* the initial `fetchRun`, and events are buffered
until that initial state arrives, so no event is lost in the gap (the log dedupe
in `applyEvent` absorbs any overlap). On `run.completed` it stops the stream
explicitly, otherwise `EventSource` would reconnect forever once the server
closes it.

**Model preference migration (`server/src/domain/preferences.ts`).** `""` is a
real stored value (`AUTO_MODEL_ID` — let the CLI decide), so only a *missing*
entry falls back to the default. Retired model ids are rewritten on read via
`LEGACY_MODEL_ALIASES` (see the core note above) so a stale preference can't keep
failing runs. This ran in the browser until preferences moved server-side; it now
runs once for every client, which is also why a legacy id is accepted on write.

**Focus panel log-follow (`ui/src/components/StageFocusPanel.tsx`).** The live
log auto-scrolls only while the user is already within `FOLLOW_THRESHOLD_PX` of
the bottom; scrolling up to read must not be yanked away by new entries. A newly
opened stage starts following again. Its `run.result` handling mirrors the
orchestration note: only the last stage's output lives there, so per-box views
read `stageOutputs`.

**Interrupted runs now resume on boot (`init` + the per-project worker).**
OpenWorkflow's SQLite state is the source of truth, so on `init` each project's
worker resumes any non-terminal durable run from its last completed step — a gate
parked before a crash resumes and waits again (the old
`reconcileInterrupted`-marks-everything-failed is gone). Only a run with no
durable run behind it, or whose durable run already failed, is settled to failed
(`reconcileOnLoad`/`markInterrupted`).

**The read model is a projection; OpenWorkflow's SQLite is the SoT (`emit`/`schedulePersist`).**
Every event appends to the per-project `events` table immediately; `RunState`
snapshot transitions flush at once, while high-frequency stage logs are coalesced
behind a short debounce. The snapshot and events (formerly `state.json` /
`events.jsonl`, now SQLite tables) are a rebuildable read model with exactly one
writer — the durable workflow — never a second, independently advancing store.

**One workspace per run.** Every box works in the same directory, so the Tester
sees exactly what the Developer wrote.

## Projects (`domain/projects.ts`, `services/project-registry.ts`, `routes/project-scope.ts`)

A project is a directory owning its `.adhd/`; the user-level registry at
`~/.adhd/projects.json` holds paths and metadata only. See
[`architecture.md`](./architecture.md) for the storage table
and [`decisions.md`](./decisions.md) for why the home project is not `REPO_ROOT`.

- **Project ids are `<slug>-<sha1(normalized root)>`** — readable enough to
  recognise as a key in `settings.json`, and never a raw path (a path is neither
  a safe key segment nor stable across separator spellings). The hash is taken over
  the *normalized* root, so `C:\Dev\App` and `c:/dev/app/` yield one id.
- **Case is folded only on `win32`.** Windows filesystems are case-insensitive,
  so those two spellings must be one project; on Linux they are genuinely two
  directories and must stay distinct. This is why `normalizeProjectRoot` branches
  on platform rather than lowercasing unconditionally.
- **The home project is synthesised, never persisted.** It always exists, so the
  registry is never empty and `resolve()` always has an answer; persisting it
  would let a stale entry point somewhere that no longer matches `ADHD_HOME`.
- **`unregister` is deliberately not called `remove`.** It drops the registry
  entry and never touches the folder — a user's code and run history outlive
  their interest in seeing the project in a dropdown.
- **Requests resolve their project per call** via the `X-ADHD-Project` header,
  falling back to the registry's active project. Run-scoped routes
  (`/runs/:id/...`) need no project because run ids are globally unique — which
  is also why SSE works, since `EventSource` cannot send headers.
- **`dataDir` is derived on read, not stored.** `projects.json` holds only what a
  user chose (id, name, root, timestamps); `all()` maps each entry through
  `withDataDir` so the UI can name the folder runs land in without duplicating
  the layout rule, and a stored file can never disagree with `paths.ts`.
- **`ensureProjectDataDir` runs at run start as well as at registration.** A
  project registered before the self-ignoring `.gitignore` existed — or one whose
  `.adhd/` was deleted — would otherwise accumulate run artifacts that show up in
  the user's `git status`.

## Credentials (`services/settings-store.ts`)

Engine connection settings live in the user-level `~/.adhd/settings.json`
(mode `0600`) as `defaults` plus a per-project override map, never in a
project's `.adhd/`.

- **An inherited default is copied before it is edited**
  (`detachedCopyOfResolvedEntry`). Aliasing the object and mutating it wrote the
  edited entry back into `defaults`, leaking one project's API key to every other
  project — a real defect, now covered by `projects.comp.ts`.

## Persistence (`repository/` over `db/`)

Run history lives in one `node:sqlite` database per project at
`<project>/.adhd/runs.db`: a `runs` table holding the `PersistedRun` snapshot
(upserted on `run_id`) and an append-only `events` table. The layering is
**services → repository → db**: `RunOrchestrator` depends on `RunRepository`
(`repository/run-repository.ts`), a single concrete class that owns the
`PersistedRun` shape and coordinates the low-level pieces — a `Database` connection
plus `RunsTable` / `EventsTable` in `db/`, and the handoff file writer in
`repository/handoff.ts`. SQLite was chosen over `better-sqlite3`, which fails to
install on the target platform; see
[workflow-storage-options.md](./workflow-storage-options.md).

- **The `db/` layer knows nothing about `PersistedRun`.** `Database` owns the
  connection (lazy open, WAL, `busy_timeout`, schema, settle/close); `RunsTable` and
  `EventsTable` take strings in and hand strings out. `RunRepository` does the JSON
  encode/decode and the resilience policy on top.
- **Handoffs stay on disk** as `runs/<id>/<stageId>/handoff.md` — nothing reads them
  back and a markdown file is inspectable without a SQLite client. Only run state and
  the event trail live in the DB.
- **`node:sqlite` is imported lazily** in `db/database.ts`, not at module load. Its
  narrow surface (`DatabaseSync`, `prepare`, `run/all`, `exec`) is contained to that
  one file. Requires Node ≥ 22.5, which is why root `engines.node` is `>=22.5`.
- **The `ExperimentalWarning` is suppressed at launch, not in code.** node:sqlite
  fires it on the first require, on every startup. A `process.on('warning')` listener
  does *not* suppress the default printer (verified), so the shipped `start` script
  passes `node --disable-warning=ExperimentalWarning` — a plain node arg, identical on
  Windows and macOS. Dev/tests may still show it.
- **`Database.settle()` closes the connection, not just flushes it.** `DatabaseSync`
  writes are synchronous, so there is no write queue to drain — but the open file
  handle is what makes a Windows temp-dir `rm` throw `EBUSY`. So `settle()` runs
  `PRAGMA wal_checkpoint(TRUNCATE)` (removing the `-wal`/`-shm` sidecars), closes, and
  clears the memoised handle; the next operation transparently re-opens.
- **WAL mode plus `PRAGMA busy_timeout` (5 s)** let a concurrent reader coexist with
  the single writer rather than erroring on a lock.
- **SQLite owns audit timestamps for mutable projections.** `runs` and
  `milestones` default both `created_at` and `updated_at` to millisecond UTC ISO
  text, and table triggers advance `updated_at` on update. Repositories never
  supply those values. The known legacy schemas are rebuilt transactionally;
  their previous `updated_at` initializes both columns.
- **A corrupt or unopenable DB degrades to an empty load with a warning**, so a bad
  DB can't stop the server from booting. A failed open clears the memoised handle so
  a later call can retry. JSON parsing of a stored snapshot is confined to
  `parsePersistedRun` — the one trust boundary where `unknown` is narrowed by the
  `isPersistedRun` guard.

## Filesystem access (`services/workspace-files.ts`, `services/directory-browser.ts`)

These back read-only UI views and every path from the client is untrusted.

- **`resolveInsideWorkspace` is the single traversal gate.** It rejects absolute
  paths, checks the *lexical* resolved path first (so a non-existent traversal
  target is rejected as traversal, not "not found"), then resolves symlinks and
  re-checks — a link inside the workspace may still point out.
- **The workspace walk is bounded** (`MAX_DEPTH`, `MAX_ENTRIES`, ignored noisy
  dirs like `node_modules`) so a large repo can't stall the request; oversized
  files are listed but not previewed (`MAX_PREVIEW_BYTES`).
- **The directory browser is deliberately narrow.** It returns directory *names*
  only — never file contents, never file names — so it can't read anything off
  the machine; the server binds to localhost. Windows roots are found by probing
  drive letters `A:`–`Z:` (no cross-platform drive-enumeration API); POSIX uses
  the single `/` root.

## Skills / personas (`services/skills.ts`, `domain/skills/`)

Personas ("skills") are Markdown on disk so they can be edited and re-run
without a rebuild. The bundled files in `domain/skills/personas/` are the
shipped source of truth and the server build copies them into `dist`. Override
files are re-read whenever their mtime changes, so an edit applies to the next
run.

**Nothing is seeded to disk.** `loadSkill` used to write the bundled default to
`.adhd/skills/<id>.md` on first read; that copy then silently shadowed later
improvements to the constant and had to be regenerated by hand during the
TASK-053 follow-up. Personas are **layered** instead, composed by the pure
`domain/skills/compose.ts`:

1. bundled default in `domain/skills/personas/<id>.md`;
2. replaced by a user-level `~/.adhd/skills/<id>.md`, if present;
3. replaced by `<project>/.adhd/skills/<id>.md`, if present — the power-user
   escape hatch;
4. plus `<project>/.adhd/skills/<id>.project.md` **appended** — the default way
   to customise, carrying only the project's tweaks so improvements to the base
   keep reaching it.

The cache is keyed by resolved path, not skill id, because the data roots differ
per project and an id-keyed cache would leak one project's persona into another.
See [`architecture.md`](./architecture.md) for how the `architect`
persona is generated from a single source.
