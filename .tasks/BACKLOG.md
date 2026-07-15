# Backlog

## TASK-032: Code quality
**Priority:** P1 | **Tags:** code, qualtiy, beauty | **Assignee:** Fedor
**Updated:** 2026-07-15 07:46

We need to make and maintaine a hight code quality standatds. First - linter with base rules, second we should segregate code by some rules for exaple models stay sepparetly from services and entry endpoints stays aside like controllers. 
Move pure functions aside of context depended - domain logic and services should be spread. One file should be a bootstrapp or app, wehre we see what happening in service start.
Then please advice of other common practices. Maybe move constants away from code, dont lock on localhost _ ports, store this in the env files.

---

## TASK-022: Introduce a logger across the system
**Priority:** P2 | **Tags:** core, server, ui, infra
**Updated:** 2026-07-14 10:51

Replace ad-hoc `console.log`/`console.error` calls with a small structured logger used across all packages.

- Define the logger interface in `@adhd/core` (levels: debug/info/warn/error; per-module scope/prefix; timestamps).
- Server (`@adhd/server`): log HTTP requests, orchestrator/engine lifecycle events, and errors; level configurable via env (e.g. `LOG_LEVEL`), default `info`.
- UI (`@adhd/ui`): thin console-backed implementation of the same interface, silenced in production builds except warn/error.
- Keep it dependency-light (plain implementation or a minimal lib like `pino` on the server only); no log files yet — stdout/console is enough for the prototype.
- Sweep existing `console.*` usages and migrate them.

---

## TASK-021: Cursor & Codex engine adapters
**Priority:** P2 | **Tags:** adapters, milestone-c

Implement real adapters behind the EngineAdapter interface for the Cursor CLI and Codex CLI; flip `available` in ENGINES and remove the SOON badges. Supersedes the Cursor half of TASK-007.

---

## TASK-005: File-backed workflow engine (state.json + events.jsonl)
**Priority:** P1 | **Tags:** milestone-b

Replace in-memory mock with `.adhd/runs/` persistence and real subprocess stages.

---

## TASK-006: First harness adapter (generic subprocess)
**Priority:** P1 | **Tags:** milestone-c, adapters

Generic subprocess `HarnessAdapter` for any CLI command in a worktree.

---
