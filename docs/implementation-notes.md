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
`taskkill /pid <pid> /T /F`. POSIX children are spawned `detached`, which puts
each in its own process group, and the signal goes to the group
(`process.kill(-pid, …)`) — `SIGTERM`, then `SIGKILL` after a grace period.
Signalling the pid alone left the same grandchildren running, which is the bug
the function's name always claimed it did not have.

**Settling on `exit`, not `close`.** `close` fires only once every holder of the
child's stdio has let go — and a coding agent that starts a dev server to smoke
check its own work hands that pipe to a process which never ends. TASK-117 hit
exactly this on a real Cursor run: the CLI exited, Vite kept the pipe, `close`
never came, and the stage sat past its ten-minute timeout with nothing left to
resolve it. `runSubprocess` therefore settles on `exit` after a short flush
grace (`STDIO_FLUSH_GRACE_MS`), and `close` settles it earlier when the stdio
does drain. The grace window is the whole trade: too short truncates a chatty
CLI's last lines, too long re-introduces the stall.

## Serving the built UI (`utils/built-ui.ts`)

`pnpm build` emits an API server and a static UI bundle; `pnpm start` runs the
compiled server, which serves that bundle itself, so the whole app is on one
port with no Vite process. The UI's `API_BASE` is `""`, so same-origin needs no
UI change.

**The mount lives in `index.ts`, never in `createApp`, and the import is
dynamic.** Importing `@hono/node-server/serve-static` at the top of `app.ts`
wedges the dev server: under `pnpm dev`, `concurrently` runs `tsx watch`, and the
server process then prints its banner and never binds — `pnpm dev` and the whole
Playwright suite hang for their full timeout while Vite comes up fine. Standalone
`tsx watch` is unaffected, which is what makes it easy to reintroduce by mistake.
Keeping it out of `createApp` also keeps every component test on a plain API app.

Mounting is additionally gated on **actually running the compiled build** — the
module checks that its own directory sits under `dist/` — so a developer who has
built once does not start silently serving a stale bundle from `pnpm dev`.
`ADHD_UI_DIR` overrides the location and bypasses that gate, which is how the
tests drive it. `serveStatic` rejects absolute roots, so the path is made
relative to `process.cwd()`; if that is impossible (a different drive on
Windows) the server logs and stays a plain API rather than failing to start.

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

## Engines — capability probes (`engines/permission-mode.ts`)

Each engine answers "can you auto-review?" the cheapest way that is actually
sound for it, and the three answers are deliberately different:

- **Claude is probed**, because its auto-review is a *flag value*
  (`--permission-mode auto`) and passing a value the build does not know is a
  hard CLI error that fails the run. So the mode list is read from `--help`,
  memoised in a map keyed by **binary path plus help arguments** — keying on the
  path makes an `ADHD_<ENGINE>_PATH` switch invalidate itself — and
  `detect()`/`install()` clear it alongside the binary cache. The probe runs
  **only** when a run asks for `autoReview`, so nobody pays a subprocess for a
  mode they did not choose. A probe that fails or times out answers `unknown`
  rather than throwing, and `unknown` degrades like `unsupported` with a
  different notice, because "the CLI said no" and "we could not ask" are
  different things to tell a user.
- **Codex is not probed**, because its auto-review is *configuration*
  (`approvals_reviewer`), passed with `-c`. There is no `--help` listing of
  config keys to read, and an unrecognised `-c` key is tolerated rather than
  fatal (`--strict-config`, which ADHD does not pass, exists precisely to opt
  into the strict behaviour). Crucially the fallback is safe by construction: a
  build that ignores the key still runs under `sandbox_mode="workspace-write"`,
  so the worst case is escalations denied rather than reviewed — never a wider
  blast radius than was asked for.
- **Cursor is not probed** — see the CLI-specific note below.

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
Cursor has no accept-edits-only mode, so every permission mode uses `--force`.
Its **Auto-review** run mode is real but is selected by the `approvalMode` key in
`~/.cursor/cli-config.json`, not by a flag, so ADHD cannot ask for it without
writing a file it has no business writing (see `decisions.md`). Cursor therefore
reports `unsupported` as a constant and runs no probe — which is why its `run()`
calls `resolvePermissionPlan` for the notice alone and discards the plan: no
strategy changes its argv.
`--trust` is on by default (fresh scratch workspaces would otherwise hit the
workspace-trust prompt and hang). **The prompt goes on stdin whenever the binary
is a Windows `.cmd` shim**, which is what `cursor-agent` always resolves to on
Windows: cmd.exe cannot carry a multi-line argument, and every ADHD prompt is
multi-line, so passing it positionally made the run fail before it spawned.
`cursor-agent -p` with no positional prompt reads it from stdin (verified against
the real CLI). Experimentation knobs, since the CLI's headless behavior on Windows
is still being mapped: `ADHD_CURSOR_TRUST=0` drops `--trust`, `ADHD_CURSOR_ARGS`
appends args verbatim, `ADHD_CURSOR_PROMPT_VIA=stdin` pipes the prompt on
platforms where it would otherwise be positional (arg limit ≈ 32K). That knob
cannot force the *opposite* — a shim always uses stdin.
Cursor's own `auto` router model is distinct from our **Auto** (which sends no
`--model` at all), so the merge prepends ours and relabels theirs.

**Codex (`engines/codex.ts`).** `codex exec --json` emits newline-delimited JSON
events. `--skip-git-repo-check` lets it run in a non-git scratch workspace.
Permission modes: `acceptEdits` → `--sandbox workspace-write` (writes confined to
the workspace; escalation is denied, not queued); `autoReview` → the same sandbox
**plus** `-c approval_policy="on-request" -c approvals_reviewer="auto_review"`,
which is Codex's documented Auto-review — escalations (sandbox escapes, blocked
network, MCP prompts) go to a reviewer subagent instead of to a human who is not
there; `skip` → `--dangerously-bypass-approvals-and-sandbox`. There is **no
`--approve-for-me` flag** — it appears in third-party write-ups but not in the
CLI reference and not in the 0.144.6 binary, whose own help text documents
`approvals_reviewer` instead. The prompt is read from stdin via
`-` to sidestep the Windows arg-length limit. The CLI has no `models` subcommand,
so `configuredModel` reads the top-level `model = "…"` key from `~/.codex/config.toml`
(matched before the first `[section]` so a nested profile key isn't mistaken for
the global default). **`codex exec resume` does not accept `--sandbox`** — the
flag is simply absent from that subcommand's option set. The sandbox therefore
goes through `-c sandbox_mode="workspace-write"` on resumed turns, which every
`codex exec` form accepts. That is also what closed the older hole where a
resumed `acceptEdits` turn quietly fell back to Codex's default sandbox.

**Claude Code (`engines/claude-code.ts`).** `--permission-mode` advertises its
modes as a `(choices: …)` list that **wraps across four lines** of `--help`
output, so the parser reads across newlines rather than line by line, and the
match is bounded to the flag's own block — an unbounded search would pick up a
later option's choices when a build stops offering any. Windows `.cmd` shims
print CRLF, so no line anchors.

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

Each adapter also declares what a line *is*, as a `StageActivity` beside the
rendered message: Claude maps `tool_use` to `tool` and an `is_error` tool result
to `tool-error`; Codex maps `command_execution`, `file_change`, `mcp_tool_call`
and `web_search`; Cursor maps its `tool_call` bag. Each adapter's "online" line
and Codex's `turn.completed` are `engine`. Anything left undeclared is a notice
the reader sees in the chat, so a new machinery line has to opt out on purpose.

---

## Engines — plan limits and reset parsing (`domain/engine-limit.ts`)

A limit is detected separately from `ERROR_HINTS`, because it is not a failure to
explain but a wait to schedule (see [`decisions.md`](./decisions.md)). One
`LIMIT_PATTERNS` table keyed by `EngineId` holds what a *time-based* limit looks
like per CLI. Running out of prepaid credit stays in `ERROR_HINTS` and still fails
the run: `insufficient_quota`, `credit balance is too low` and `quota exceeded`
never clear on a timer.

**The reset time is stored as a duration from detection, never as a wall clock.**
The CLI prints its own local time plus a named zone — `resets 4:30pm
(Europe/Tallinn)` — and the server may sit in a different zone, on a different DST
rule, on either OS. So `clockResetMs` asks ICU what time it is *in the zone the CLI
named*:

```ts
new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" })
  .formatToParts(now)
```

and subtracts, modulo 1440 minutes. Three things fall out of that shape for free:
DST is ICU's problem rather than ours; a reset earlier in the day than *now* rolls
to tomorrow instead of going negative; and Windows and macOS agree, because Node
ships full ICU on both. `hourCycle: "h23"` rather than `hour12: false` is
deliberate — the latter renders midnight as `24` under some locales.

An unrecognised zone name makes `Intl` throw, and the catch falls back to this
machine's clock rather than giving up on an otherwise parseable time. A phrase like
`try again in 2h 15m` is already a duration and is preferred over clock parsing when
both are present. The result is clamped to 24h so a bad parse cannot park a run for
a decade, and `limitWaitMs` falls back to `DEFAULT_LIMIT_WAIT_MS` (30 minutes) when
nothing parsed or the stored instant is already past.

**Step names carry the attempt (`stepName` in `pipeline-workflow.ts`).** A stage
that limits and retries runs its turn step more than once, and OpenWorkflow
memoizes a step by name — reusing the name would replay the *limited* result
forever. Attempt 0 keeps the original `${stageId}:turn:${n}` spelling on purpose:
a run parked across an upgrade must find its completed stages in history rather
than re-run and re-pay for them.

`EngineRunResult.limit` rides on a result whose `success` is `false`, because the
process really did fail — the presence of `limit` is what reclassifies it from a
death into a wait. `withStderr` (`engines/log-text.ts`) exists because each
adapter already folds stderr into the message it builds; appending it again
repeated the CLI line verbatim in the popup.

Only after parsing is the duration turned into an absolute UTC instant
(`resetAt`) — that is what survives a restart and what the browser renders in the
reader's own timezone. Server-side log lines name a duration (`waiting 3h 38m`) and
never a clock time, because the server does not know the reader's zone.

---

## Orchestration (`services/orchestration.ts`)

**`start()` registers in memory before the run, but persists only after it.** The
two halves look interchangeable and are not.

Persisting first is wrong: `startRun` throws on a project that already has an
active run, on a connection mode missing its API key, and on an unknown engine.
Any of those would leave a durable orchestration row with no runs, visible in
`GET /orchestrations` forever, with no endpoint that can remove it. Nothing is
written until the run is admitted, so a rejected start leaves no trace.

Registering in the map first is also required, for the opposite reason. The map
is what `consume()` looks the aggregate up in, and the workflow can reach the
first stage's output before `startRun` has resolved — a fast engine turn would
otherwise find no orchestration and drop its decision silently. The entry is
removed again if the start throws.

The transient row that `consume()` may write before `start()` finishes carries an
empty `runIds`; the write at the end of `start()` supersedes it, and the upsert
makes the ordering harmless.

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

- **What a user picks is a preset, not an id.** `MODEL_TIERS`
  (`auto·fast·balanced·deep·max`) is one axis borrowed from the CLIs' own effort
  vocabulary, which turns over far more slowly than model names do — Cursor's live
  roster alone is ~194 entries. `resolveTier` walks that engine's ordered
  `TIER_LADDERS` candidates and takes the first the resolved roster still offers,
  falling back to Auto with `degraded: true` rather than failing: the user asked
  for an intent, so substituting is legitimate in a way substituting an id is not.
  Setup always renders what a preset resolved to, so it is never a black box.
- **Effort is a separate axis on two of three CLIs.** Claude takes
  `--effort low|medium|high|xhigh|max`, Codex takes
  `-c model_reasoning_effort="…"`, and Cursor bakes it into the id
  (`gpt-5.3-codex-high`), so its ladder rides one model family across four rungs
  and ignores `EngineRunContext.effort`. Codex's accepted values above `high` are
  unconfirmed, which is why Max shares Deep's effort there.
- **A preset is engine-independent; a pinned id is not.** `ProjectPreferences`
  carries one `modelTier` for the project plus `engineModels` as a per-engine
  *override* — the advanced escape hatch. An override wins over the preset, and
  `null` clears it (the same idiom as clearing a stored `apiKey`). The tier is
  resolved per stage in `stage-execution.ts`, not at run start, which is the seam
  a per-stage tier (TASK-115) needs.
- **The roster is what a preset resolves against, and what run start validates.**
  Three layers, same order for every engine: `live` (a CLI listing command — only
  Cursor's `agent models` today) → `config` (the engine's own config file) →
  `static` (bundled, always). First occurrence wins, so an id the user's own CLI
  names outranks the bundled guess and is marked verified. `ModelRosterService`
  caches per engine with no TTL; the Setup Re-check (`?refresh=1`), a successful
  install and a successful login are the only invalidations, so editing
  `~/.codex/config.toml` mid-session needs a Re-check.
- **The config files are read, never written.** `~/.claude/settings.json` names a
  plain-string `model`; `~/.codex/config.toml` names one in its root table only
  (the scan stops at the first `[`, so a profile's model is not the CLI's);
  `~/.cursor/cli-config.json` holds an *object* whose `modelId` is the sentinel
  `"default"` meaning "let Cursor route", which is why Cursor is the one engine
  where hand-pinning an unlisted id in a config file is not a real escape hatch.
- **`startRunSchema.model` stays `z.string()`.** A Zod enum cannot see a roster
  that depends on which CLIs are installed here and what their configs say. The
  boundary parses shape; `RunService` enforces the rule, at run start and again on
  limit resolution, before any stage runs.
- **`LEGACY_MODEL_ALIASES`** migrates stored preferences on read so a user who
  picked a since-retired model isn't stuck with failing runs. Claude full ids
  (`claude-opus-4-8`, …) resolve to 1M-context variants that subscription plans
  reject, so they map to the short id; Codex's `gpt-5-codex` is rejected on
  ChatGPT-account auth, so it maps to Auto; Cursor's `composer-1`/`sonnet-4.5`/
  `gpt-5` no longer exist in `agent models`. Aliases are preference-scoped only and
  are never applied to a `model` on a run-start body — a request is not a stored
  preference, and a direct API call with a retired id gets the 400 that names Setup.
  A stored id the ladder already covers is adopted onto that preset and the
  override dropped, so an existing user lands on presets rather than pinned.
  **The adoption is keyed off the absence of `modelTier` in the stored file**, so
  it runs once for a pre-preset settings file and never again. Without that key it
  would run on every read, and pinning `opus` on Claude — a rung — would be
  silently rewritten back to Deep the moment it was saved, making the advanced
  escape hatch inoperative for every id the ladder happens to name (on Codex, that
  is both bundled models).
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

**Limit notifications (`ui/src/hooks/useLimitNotification.ts`).** Permission is
requested at the moment the *first* limit lands, never on load — asking a user
who has not yet seen a reason is how a browser gets told "never" for the origin.
Two browser facts shape the rest. **Chrome** resolves `requestPermission()`
without a user gesture, so the ask can ride the event; **Safari** rejects it
outside one, which is why the modal also renders an "Enable notifications"
button — the click is the gesture Safari wants. Both grant over
`http://localhost`, because localhost is a secure context, so no HTTPS dev
certificate is needed on either OS. `document.title` is set regardless, so a
background tab says something even where notifications are denied. There is no
native notifier binary and no Electron dependency on either platform.

`formatResetAt` renders the reset in the *reader's* timezone from the UTC
instant the server stored — the server never formats a clock time, because it
does not know where the reader is.

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

**Model preference migration (`server/src/schemas/preferences.ts`).** `""` is a
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
plus `RunsTable` / `EventsTable` in `db/`, and the handoff file writer that
`writeHandoff` tracks. SQLite was chosen over `better-sqlite3`, which fails to
install on the target platform; see [`decisions.md`](./decisions.md) (2026-07-23).

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

## What a run changed (`services/run-change-collector.ts`, `domain/rules/run-changes.ts`)

Two independent baselines are taken when a run starts, and the richer one answers
when it settles. Why each piece is the way it is:

- **The snapshot walk is its own function**, not `listWorkspaceFiles` with a bigger
  cap. The Solution-folder browser is a different contract — a *bounded* list for a
  reading pane — and raising its `MAX_ENTRIES` to suit a whole-project baseline
  would change what that view shows. `snapshotWorkspace` keeps its own depth and
  entry ceilings and reports `truncated` so the UI can admit a partial list.
- **`.adhd` is excluded from the snapshot walk.** Every run writes its own logs,
  handoffs and change set under the project's `.adhd/`, so without the exclusion a
  run would report its own bookkeeping as work it did. Git never sees it either —
  `ensureProjectDataDir` writes `.adhd/.gitignore` containing `*` — but
  `reportableChanges` filters both sources anyway, because the git path also has to
  survive a project that never called that function.
- **`git status` alone is not enough.** An agent that commits its work leaves a clean
  tree, and a status-only reading would report nothing. The collector diffs the
  baseline `HEAD` against the current one as well, and merges: what was committed,
  plus what is dirty now, minus what was *already* dirty at baseline with the same
  kind (that dirt is the user's, not the run's).
- **The empty-tree object `4b825dc642cb6eb9a060e54bf8d69288fbee4904`** is git's
  well-known hash for an empty tree. It stands in as the diff base when the
  repository had no commits when the run started — the case where an agent makes the
  *first* commit, which is exactly what a fresh project does.
- **A rename is a creation plus a deletion**, not an edit, on both the porcelain and
  the `--name-status` path. The file at the new path did not exist before; saying
  "edited" would name a path the user never had.
- **`--porcelain=v1 -z` puts a rename's original path in the *next* NUL field**, and
  `diff --name-status -z` splits the status code and the path into separate fields
  (three of them for a rename). That asymmetry is why there are two parsers rather
  than one.

## Revealing a folder (`utils/reveal-folder.ts`)

**`explorer.exe` exits 1 on success.** It returns a non-zero code even when it
opened the window, so on Windows the *exit code* is ignored — but only the exit
code. A process that never started (`exitCode: null` with a spawn error) or one
that hung past its timeout still fails, because those are not the quirk. Off
Windows, `open` and `xdg-open` are trusted to report failure the ordinary way. The
path is always a single argument in an array — never spliced into a shell string —
and the route resolves it from the run rather than accepting one from the client.

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
