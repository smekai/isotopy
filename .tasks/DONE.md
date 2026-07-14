# Done

## TASK-001: Rebrand to ADHD (docs + repo)
**Priority:** P0 | **Tags:** docs, branding
**Updated:** 2026-07-14 12:23

Rename project to ADHD (Artificial Development, Human Directed). Update docs, CLI name, and `.adhd/` paths.

Done: bulk rebrand landed earlier (commits 5f63631, a51b87e — docs, `@adhd/*` packages, `adhd` CLI examples, `.adhd/` paths, GitHub repo/remote). This pass fixed the last leftovers: repo layout tree root in `docs/technical-architecture.md` (`artificial-developer/` → `adhd/`) and added the "formerly Artificial Developer" historical note to the README intro.

---

## TASK-019: Result display — result.md artifact, engine pill, result on run.completed
**Priority:** P0 | **Tags:** ui, milestone-c
**Updated:** 2026-07-13 21:40

`useRunEvents` copies `result` from the final `run.completed` event. StageFocusPanel: engine runs show `run.result` as a `result.md` artifact and no canned mock content (live log already streams adapter output). RunStatusBar: `⬡ Claude Code · <model>` pill when the run has an engine.

---

## TASK-018: SetupModal — wire engine radios, model, permission mode; SOON badges
**Priority:** P0 | **Tags:** ui, milestone-c
**Updated:** 2026-07-13 21:40

Drive the AI Harness radios from `ENGINES` (adds Codex); persist engine + model via settings; Cursor/Codex rendered disabled with a mono "SOON" pill. New Permission mode control: "Never block (recommended)" vs "Accept edits only (may stall on shell commands)".

---

## TASK-017: EmptyState — pipeline picker + working-directory field
**Priority:** P0 | **Tags:** ui, milestone-c
**Updated:** 2026-07-13 21:40

Segmented control "Full team · mock" / "Single agent" above the task input (persisted). Single-agent mode: ghost pipeline shows one Developer node, optional Working directory input (empty = scratch workspace per run), caption showing the configured engine · model.

---

## TASK-016: UI settings persistence — engine, model, permission mode, pipeline, workspace dir
**Priority:** P0 | **Tags:** ui, milestone-c
**Updated:** 2026-07-13 21:40

Extended `packages/ui/src/settings.ts` (same localStorage try/catch pattern as disabledStages): `adhd.engine`, `adhd.engineModel`, `adhd.permissionMode` (default `skip`), `adhd.pipelineId` (default `sequential`), `adhd.workspaceDir`. Extended api.ts `StartRunOptions`.

---

## TASK-015: POST /runs — engine/model/workspaceDir/permissionMode passthrough + validation
**Priority:** P0 | **Tags:** server, milestone-c
**Updated:** 2026-07-13 21:40

Extended the `POST /runs` body and passed the new fields to the orchestrator; validation errors surface through the existing 400 path (verified: unknown engine, unimplemented engine, nonexistent workspaceDir). No SSE changes (keepAlive ping already present).

---

## TASK-014: Orchestrator — executeEngineStage branch, abort wiring, result event
**Priority:** P0 | **Tags:** server, milestone-c
**Updated:** 2026-07-13 21:40

`startRun` branches for `one-box`: validates engine, resolves workspace, stores engine/model/workspacePath on the run. `runStages` dispatches `executeEngineStage` (real adapter) vs `simulateStage` (mock, untouched). AbortController per run wired into `abortRun`; final `run.completed` event carries `result`.

---

## TASK-013: Claude Code engine adapter (headless stream-json)
**Priority:** P0 | **Tags:** server, adapters, engine, milestone-c
**Updated:** 2026-07-13 21:40

Spawns `claude -p --output-format stream-json --verbose` (prompt via stdin; binary resolved ADHD_CLAUDE_PATH → where/which claude → IDE extension bundle fallback → actionable error). Parses NDJSON into live stage logs (init/assistant text/tool_use/result summary), captures final result + cost/turns, maps exit codes to failure, abort = process-tree kill (taskkill /T /F on win32, verified no orphans), timeout via ADHD_ENGINE_TIMEOUT_MS (default 10 min). Supersedes the Claude Code half of TASK-007.

---

## TASK-012: EngineAdapter contract + registry
**Priority:** P0 | **Tags:** server, adapters, milestone-c
**Updated:** 2026-07-13 21:40

`packages/server/src/engines/types.ts`: `EngineAdapter { id, run(ctx) }` with `EngineRunContext` (prompt, cwd, model, permissionMode, timeoutMs, AbortSignal, onLog callback → stage.log) and `EngineRunResult`. `registry.ts`: map seeded with claude-code; `cursor`/`codex` throw "not implemented yet"; unknown ids rejected. Streaming evolution of the HarnessAdapter contract in docs/mvp-scope.md.

---

## TASK-011: Run workspace resolution — scratch dir per run or validated user directory
**Priority:** P0 | **Tags:** server, milestone-c
**Updated:** 2026-07-13 21:40

`packages/server/src/paths.ts`: repo root anchored via `import.meta.url` (server dev cwd is `packages/server`); `resolveWorkspace(runId, workspaceDir?)` creates `.adhd/runs/<runId>/workspace` or validates a user-supplied directory (must exist and be a directory, else 400). `.adhd/` added to .gitignore.

---

## TASK-010: Core types — one-box pipeline, engines, permission mode
**Priority:** P0 | **Tags:** core, milestone-c
**Updated:** 2026-07-13 21:40

Added `ONE_BOX_PIPELINE` (id `one-box`, single `implementation`/Developer stage) to `DEMO_PIPELINES`; `EngineId`, `ENGINES` metadata (label/description/available), `EnginePermissionMode` (`skip` default — never blocks | `acceptEdits`); extended `RunState` with optional `engine/model/result/workspacePath` and `RunEvent` with `result`.

---

## TASK-009: Fix .tasks/config.json states shape (TaskPlanner extension unresponsive)
**Priority:** P0 | **Tags:** infra, setup
**Updated:** 2026-07-13 21:40

The `states` array in `.tasks/config.json` contained plain strings, but the TaskPlanner extension expects `{name, fileName, order}` objects — every `path.join(tasksDir, state.fileName)` threw on `undefined`, so no tasks loaded and the extension appeared dead for this repo. Rewrote the config to the canonical shape, deduped the stray migration-appended `Rejected` object, dropped the nonstandard `settings` key. Companion hardening task in the taskplanner repo: TASK-036 (validate/normalize config, log failures to the "TaskPlanner" output channel). Reload the VS Code window to confirm the sidebar lists tasks again.

---
