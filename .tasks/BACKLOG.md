# Backlog

## TASK-040: Cross-platform audit — eliminate Windows-only assumptions
**Priority:** P2 | **Tags:** server, adapters, infra
**Updated:** 2026-07-19 20:55

Project rule (see `.claude/skills/plan-task/SKILL.md`): every development must support both Windows and macOS/POSIX, at least in theory, even when the developer only has one environment. Audit the repo and fix every place that violates this. Known offenders from an initial scan:

- `packages/server/src/engines/cursor.ts:22` — `INSTALL_COMMAND` is the PowerShell-only one-liner (`irm 'https://cursor.com/install?win32=true' | iex`) and `INSTALL_HINT` shows it on **every** platform. Add the POSIX variant (`curl https://cursor.com/install -fsS | bash`) and pick by `process.platform`.
- `packages/server/src/engines/cursor.ts:34` — `isCursorIdeInstalled()` checks only Windows locations (`C:\Program Files\cursor`, `%LOCALAPPDATA%\Programs\cursor`). Add macOS (`/Applications/Cursor.app`) and Linux checks, or return false-with-comment on untested platforms.
- `packages/server/src/engines/cursor.ts:326` — `install()` is Windows-only (`powershell.exe`) and the refusal message on other platforms shows the PowerShell command as the "manual" fallback, which cannot work there. Run the platform-appropriate installer (`sh -c "curl ... | bash"`) or at least show the correct manual command.
- `.claude/skills/run-app/SKILL.md` (and the `.agents/` mirror) — the stop/port-cleanup instructions are PowerShell-only (`Get-NetTCPConnection`). Add the POSIX equivalent (`lsof -i :9477 -i :5173`).

Then sweep the rest of the repo against the hazard checklist in the `plan-task` skill (spawning, binary lookup, hardcoded paths, Windows-only env vars, user-facing command hints, npm scripts, line-ending parsing). `subprocess.ts` and `claude-code.ts` already branch correctly — use them as the reference pattern.

**Acceptance:** no user-facing message ever shows a command that cannot run on the reader's OS; every platform-specific code path has a branch (or graceful, accurately-worded degradation) for the other OS; untested branches are marked as such in code comments.

**Cross-platform:** this task *is* the rule — macOS branches will be theoretical (developed on Windows); note that in the PR.

---

## TASK-039: Pluggable run persistence — storage adapter + selectable DB backend
**Priority:** P2 | **Tags:** server, core, infra
**Updated:** 2026-07-17 00:00

The file-backed store from TASK-005 (`state.json` + `events.jsonl` under `.adhd/runs/`) works but flat JSON files are not a great long-term home for run state. Introduce a `RunStore` interface and make the backend selectable, then implement a real DB adapter alongside the JSON one.

**Scope:**
- Extract a `RunStore` interface from `packages/server/src/services/run-store.ts` (`writeState`, `appendEvent`, `loadAllRuns`) so the orchestrator depends on the interface, not the file functions.
- Keep the current JSON files as the **default** adapter (`JsonRunStore`) — no behaviour change out of the box.
- Add at least one real DB adapter (candidate: **SQLite** via better-sqlite3/libsql — single-file, zero-server, fits the local-first story; evaluate vs. Postgres for the hosted story).
- Config/env selector (e.g. `ADHD_RUN_STORE=json|sqlite`) wired through `config.ts`; document in `.env.example`.
- Migration note: how existing `.adhd/runs/*` JSON is imported into the DB (one-shot importer or lazy).

**Deliverable:** `RunStore` interface + `JsonRunStore` (default) + one DB adapter, selectable by config, with the orchestrator unchanged behind the interface. Depends on TASK-005.

---

## TASK-038: Codex CLI engine adapter
**Priority:** P2 | **Tags:** adapters, milestone-c
**Updated:** 2026-07-17 00:00

Implement a real `codexAdapter` behind the `EngineAdapter` interface for the OpenAI **Codex** CLI, flip `codex.available = true` in `ENGINES`, and drop the SOON badge (the badge is `!available`-driven in `SetupModal.tsx`, so flipping the flag clears it).

**Scope:**
- New adapter `packages/server/src/engines/codex.ts` modeled on `packages/server/src/engines/claude-code.ts` (the reference implementation): resolve the `codex` binary (`ADHD_CODEX_PATH` env → PATH), spawn non-interactively in the run's `cwd` (`codex exec` / JSON output), map streamed output to `ctx.onLog`, honor `ctx.signal` by killing the process tree, enforce `ctx.timeoutMs`, and capture the final result/cost into `EngineRunResult`.
- Register it in `packages/server/src/engines/registry.ts`.
- In core `engines.ts`: set `codex.available = true`, add `connections` (subscription + api-key) and a `CODEX_MODEL_OPTIONS` list; handle `OPENAI_API_KEY` in the child-env builder for api-key mode.
- Add a `detect()` for the `/engines/:id/status` endpoint.
- Reuse the engine-aware model picker introduced in TASK-037 (SetupModal currently hardcodes `CLAUDE_MODEL_OPTIONS`).

Contract lives in `packages/server/src/engines/types.ts`. Was part of TASK-021 (now split).

---

## TASK-036: Spike — sandcastle as the implement-stage harness/sandbox layer
**Priority:** P2 | **Tags:** adapters, engine, milestone-c
**Updated:** 2026-07-16 00:00

Evaluate [mattpocock/sandcastle](https://github.com/mattpocock/sandcastle) as the execution layer behind the implementation stage instead of building the subprocess harness (TASK-006) from scratch. It's a TS library (`sandcastle.run()`) that runs a coding agent in an isolated sandbox and merges commits back: Docker/Podman/Vercel-Firecracker providers, git-worktree isolation, branch strategies, session capture/resume, typed structured-output extraction, lifecycle hooks — provider-agnostic (Claude Code, Codex, Cursor).

**Questions to answer:**
- Does its `HarnessAdapter`-shaped surface map cleanly onto our EngineAdapter interface? What do we still own (stage handoff, artifacts, gates, dashboard)?
- Wrap `sandcastle.run()` vs. build generic subprocess harness (TASK-006) — cost, control, and lock-in tradeoff.
- Session resume + structured output: do they cover our restart-single-stage and artifact-capture needs?
- Sandbox providers: does Vercel/Firecracker help our deploy-anywhere story or is it out of scope?
- Maturity/API stability and dependency weight.

**Deliverable:** short recommendation (adopt / borrow patterns / pass) + impact on TASK-006/TASK-021. Not a competitor — a build-on candidate; see docs/competitor-matrix.md §6.

---

## TASK-035: Spike — beads (bd) vs. TS-native task-graph backlog
**Priority:** P2 | **Tags:** core, server
**Updated:** 2026-07-19 18:22

Take Task Plan UI and Evaluate [gastownhall/beads](https://github.com/gastownhall/beads) (`bd`) as the engine for our repo-native task backlog (`.adhd/tasks/`) that feeds pipeline runs. We need compersion and choose a best task tracker

**Questions to answer:**
- Adopt `bd` as-is (shell out via subprocess) vs. absorb its model (dependency graph + ready-detection + compaction) into our TS/git-native backlog.
- Go + Dolt dependency weight in a TS/Hono local-first product — acceptable, or does it break the "one install" story?
- How would tasks-spawn-runs work: does `bd ready` become the intake queue for the pipeline?
- Merge/sync model vs. our git-native artifact approach — conflicts or synergy?
- What do we lose by staying markdown (`.tasks/*.md`) — is the dependency graph worth the dep?

**Deliverable:** short recommendation (adopt / borrow model / stay markdown) + backlog data-model implications. Pure intake/memory layer, not a competitor; see docs/competitor-matrix.md §2.

---
