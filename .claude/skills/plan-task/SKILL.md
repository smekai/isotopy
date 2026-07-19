---
name: plan-task
description: Use when planning or creating a new TaskPlanner task, or designing any new feature or development work — enforces the cross-platform rule (every new development must support both Windows and macOS, at least in theory) with a checklist of platform hazards the plan must cover
---

# Planning a new task — the cross-platform rule

**Every new development must support both Windows and macOS** (treat
Linux like macOS: POSIX). The developer typically has only one
environment — that is not a reason to ship single-platform code. The
other platform must be supported *at least in theory*: the code branch
exists, is reasoned through, and degrades gracefully. Mark it
"untested on <platform>" in the task instead of omitting it.

## When creating or planning a task

Follow the TaskPlanner flow in CLAUDE.md (read `.tasks/config.json`
for `nextId`, write to `BACKLOG.md`, bump `nextId`). In the task
description, add a **Cross-platform:** line whenever the work touches
any surface from the checklist below — state what it touches and how
each OS is covered. If it touches none, write `Cross-platform: n/a —
pure logic/UI`.

## Platform hazard checklist

- **Spawning processes** — use `runSubprocess`
  (`packages/server/src/engines/subprocess.ts`). It already handles
  Windows `.cmd`/`.bat` shims (Node >= 20 shell rule) and kills the
  process tree via `taskkill /T` on win32 vs SIGTERM→SIGKILL on POSIX.
  Don't hand-roll `spawn`/`exec` in adapters.
- **Binary lookup** — branch `where` (win32) / `which` (POSIX); on
  win32 also try `.exe`/`.cmd` extensions. Reference pattern:
  `resolveClaudeBinary()` in
  `packages/server/src/engines/claude-code.ts`.
- **Filesystem paths** — `path.join` + `os.homedir()`/`os.tmpdir()`
  only. Never hardcode `C:\`, `/tmp`, `~`, or concatenate with `/`.
- **Env vars** — `LOCALAPPDATA`/`APPDATA` exist only on Windows;
  `HOME` only on POSIX. Guard every read; prefer `os.homedir()`.
- **Commands shown to users** (install hints, error messages, docs) —
  provide *both* variants (PowerShell and bash) or pick by
  `process.platform`. Never show a PowerShell one-liner to a Mac user
  or vice versa.
- **Shell one-liners in product code** — avoid; if unavoidable,
  branch per platform (`powershell.exe -Command ...` vs
  `sh -c ...`).
- **npm scripts** — no bash-only syntax (`rm -rf`, `VAR=x cmd`,
  `cp`); use node scripts, `rimraf`, or `cross-env`.
- **Line endings / output parsing** — split on `/\r?\n/`, not `"\n"`.

## Definition of done (for the plan and the implementation)

- Both platform branches exist in the design, even if one is
  theoretical.
- The untested platform degrades gracefully with an *accurate*
  message.
- The task/PR notes which platform was actually tested.
