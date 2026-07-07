# Backlog

## TASK-001: Rebrand to ADHD (docs + repo)
**Priority:** P0 | **Tags:** docs, branding

Rename project to ADHD (Artificial Development, Human Directed). Update docs, CLI name, and `.adhd/` paths.

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

Wire Claude Code and Cursor CLI as implementation harness adapters.

---
