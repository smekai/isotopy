# Backlog

## TASK-022: Introduce a logger across the system
**Priority:** P2
**Tags:** core, server, ui, infra
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

## TASK-008: Design the conversational pipeline workspace (Figma-agentic)
**Priority:** P1 | **Tags:** design, ux, ui, figma, design-system, voice

Design the ADHD desktop workspace as a **UI + speaking interface for directing an AI development team** across the full lifecycle: the fixed pipeline canvas is the hero (and *is* the stage/run view), with conversational + voice steering at two scopes — per-stage and whole-pipeline. Generated agentically in Figma from a prompt; the chosen direction replaces the old desktop-shell design; fresh Agent-proposed design system. Full brief in [docs/design-desktop-shell.md](../docs/design-desktop-shell.md); prompt in [docs/figma-agent-prompt.md](../docs/figma-agent-prompt.md).

### Deliverables
- Figma Agent generation prompt ([docs/figma-agent-prompt.md](../docs/figma-agent-prompt.md))
- 3 generated design options in Figma; one selected to replace the old design
- Fresh design system (color / type / spacing / status + gate + voice tokens) as Figma styles/variables
- Primary screens: pipeline canvas, focused stage (artifacts / logs / reasoning + per-stage steering), pipeline-level steering, setup/settings, human-gate approve/reject, run history/restart, empty state
- Voice affordance spec (mic control; idle/listening/transcribing/speaking states)
- Engineer handoff notes — map to `packages/ui`; SSE live status; Tauri + browser parity (no implementation in this task)

---

## TASK-002: Scaffold pnpm monorepo (server, ui, core)
**Priority:** P0 | **Tags:** infra, prototype

Set up `packages/core`, `packages/server` (Node + Hono), `packages/ui` (React + Vite).

---

## TASK-003: Mock orchestrator with SSE events
**Priority:** P0 | **Tags:** prototype, server

`POST /runs`, fake agents with sleep/log, `GET /runs/:id/events` SSE stream.

---

## TASK-004: Pipeline chart UI (live agent statuses)
**Priority:** P0 | **Tags:** prototype, ui

Hand-rolled SVG pipeline chart, log panel, sequential vs parallel demo toggle.

---

## TASK-005: File-backed workflow engine (state.json + events.jsonl)
**Priority:** P1 | **Tags:** milestone-b

Replace in-memory mock with `.adhd/runs/` persistence and real subprocess stages.

---

## TASK-006: First harness adapter (generic subprocess)
**Priority:** P1 | **Tags:** milestone-c, adapters

Generic subprocess `HarnessAdapter` for any CLI command in a worktree.

---

## TASK-007: Claude Code / Cursor adapters
**Priority:** P2 | **Tags:** milestone-c, adapters

Wire Claude Code and Cursor CLI as implementation harness adapters. Superseded by TASK-013 (Claude Code) / TASK-021 (Cursor, Codex).

---
