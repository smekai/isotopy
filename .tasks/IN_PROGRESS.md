# In Progress

## TASK-161: The built-in board poller, shipped disabled
**Priority:** P1 | **Tags:** core, server, milestone-i
**Updated:** 2026-08-21 12:00

The one schedule every project has from the start, and the task that closes the loop. Of
**Milestone I — Induction** (`TASK-156`); needs `TASK-159`, and must not be enabled before
`TASK-162`.

**What it does:** on its window, if no run is active, take the next thing off the board and start a
run for it. Nothing else. It is one stage and one persona — the smallest team that can read a board
and name what is next.

**Off by default**, through `ProjectPreferences` and `defaultProjectPreferences()`
(`core/src/settings.ts`), where every other per-project default already lives. A fresh install must
behave exactly as it does today until someone turns this on deliberately, and an upgrade must not
opt an existing project in.

**It respects admission by checking, not by catching.** `admitRun` (`services/run/run-service.ts`)
already refuses a second concurrent run per project. The poller asks first and records a skip; it
never starts a run it expects to be refused.

**It does not decide what is worth doing.** It takes what the board already says is next, and the
Orchestrator reviews the settled run as it reviews every run. A poller that reprioritises is a
different feature and is not this one.

**The order the board is read in is a real decision, not an implementation detail.** `.tasks/`
carries priorities and several states, and `TaskBoardAdapter.planningContext()` already renders
every state file. Say in `docs/decisions.md` which states the poller draws from and how ties break:
an unattended team will apply that rule thousands of times with nobody watching.

**Evidence:** failing-first — a due poller with an active run does nothing; with an empty board
does nothing and says so; with a task starts exactly one run for exactly that task; and the
default-off flag holds for both a fresh project and an upgraded one. Then the full gate set.

Cross-platform: nothing here is OS-specific beyond `TASK-159`'s ticker, which carries the platform
bar for both.

---

## TASK-171: Two packages the server should never have owned
**Priority:** P2 | **Tags:** core, server, engine, infra
**Updated:** 2026-08-25 14:00

**Two corrections since this was written.** The package is **`@isotopy/scheduler`**, not
`@isotopy/cadence` — "cron" would name only one input format, and the package is the mechanism. And
only the **scheduler half** lands with `TASK-161`; `@isotopy/engines` is 2,409 lines across 17 call
sites including `subprocess.ts`, has nothing to do with schedules, and gets its own PR.

`packages/server/src` is 15,095 lines behind one flat `services/` directory where any file may
import any other. Two parts of it are not Isotopy concepts at all, and the standard in `CLAUDE.md`
already says where they belong: *"If it would make just as much sense in a different product, it is
a util."* Both are currently filed as though they were domain.

**This is a boundary change, not a topology change.** No new process, no new port, no IPC. The
alternative — splitting the backend into services — was considered and rejected; record it in
`docs/decisions.md` with the reason, so it is not re-proposed every time the server grows a feature.

### 1. `@isotopy/engines`

`src/engines/` is 2,409 lines of CLI adapters, protocol parsers and process control — Claude Code,
Codex and Cursor, plus `subprocess.ts` and the protocol validation around them. Nothing in it is
about runs, milestones or teams. It is the piece most likely to be wanted somewhere else, and the
piece a future remote runner would sit behind.

**Six back-references have to be resolved before it can move**, and they are the whole difficulty of
this half: all three adapters reach into `../domain/rules/engine-limit.ts`,
`../domain/rules/permission-plan.ts`, `../schemas/engine-cli-config.ts` and `../utils/message-of.ts`;
`claude-code.ts` also pulls `../schemas/engine-auth.ts` and `../schemas/engine-cli-help.ts`;
`protocol-validation.ts` pulls `../domain/validation.ts`. Decide for each whether it travels with the
package or the dependency inverts — an `engine-*` schema almost certainly travels, `validation.ts`
almost certainly does not. **Seventeen call sites** across `workflow/`, `services/` and `routes/`
import from `engines/` today and change with it.

### 2. `@isotopy/scheduler`

`ScheduleService` is 269 lines that split along a seam already visible in the file. The **mechanism**
knows nothing about Isotopy: `nextScheduleFire` and `scheduleCronIssues`
(`domain/rules/schedule-cron.ts`), `scheduleAnchor`, `isScheduleDue` and `SCHEDULE_TICK_MS`
(`core/src/schedules.ts`), the `setInterval` ticker, and `claimWindow` with its write-then-rollback.
Given a cron, a timezone, a last-claimed window and a now, it answers what is due and claims it
durably. That is the package.

The **policy** stays in the server, because it cannot leave: `attemptRun` reads live run state
through `runs.listRuns()` to record `skipped: run_active`, and `startScheduledRun` chains
`orchestrations.ensureActive`, `composeTeamPipeline` and `runs.startComposedRun`. `ScheduleService`
shrinks to those two plus CRUD.

**Persistence crosses the seam as an injected port, not as a dependency.** The package decides *when*
and asks to claim; the SQLite write against `SCHEDULES_TABLE` stays in the server, where the update
path already touches the same row (`resumedFromPause` sets `lastWindowAt`).

**Prerequisite:** `domain/rules/schedule-validity.ts` welds `scheduleCronIssues` to `teamIssues` →
`composeTeamPipeline`. Cron validity and team-composition validity are unrelated concerns sharing one
function, and nothing can be extracted until they are separated. Worth doing on its own merits.

### Evidence

Both extractions are behaviour-preserving, so the bar is that the existing suites move rather than
shrink: `test/engine/` follows `@isotopy/engines`, `test/schedule/` splits between the scheduler package
and the policy left behind, and the `run_active` skip and the window-claim rollback each keep a test
in whichever package still owns them. A lint rule rejecting a deep import past a package's public
surface is what stops the boundary rotting back. Then `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm build`, `pnpm e2e`, `pnpm gen:skills`.

Old paths do not survive alongside new ones — per the standing rule, the move is a move.

**Versioning:** two new `packages/*` join the shared-version set and must be created at the current
value (root `package.json`, `0.12.19` at time of writing), then bump with everything else. Allocate
the patch sequence when planning: one commit per extraction plus one for the validity split is three
numbers.

Cross-platform: `subprocess.ts` carries the highest platform risk in the repo and moves wholesale —
the win32 `taskkill /T` tree-kill against the POSIX SIGTERM→SIGKILL path, and the Node >= 20 shell
rule for `.cmd`/`.bat` shims. Neither branch may be simplified in transit, and the tests asserting
both move with it. Binary lookup (`where` vs `which`, `.exe`/`.cmd` probing in `resolveClaudeBinary`)
travels the same way. The scheduler package depends on `Intl` time-zone data rather than anything
OS-specific, and `.unref()` behaves identically on both. Tested on Windows; macOS untested and the
branches are preserved unchanged rather than rewritten.

---
