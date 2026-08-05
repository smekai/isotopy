# In Progress

## TASK-108: Milestone E — Orchestrator epic
**Priority:** P1 | **Tags:** core, server, ui, engine, milestone-c
**Updated:** 2026-08-04 12:20

Milestone E adds a top-level Orchestrator entry point that conversations with the user, composes a reusable team from the persona catalog, launches composed runs, and decides what happens next after each run completes.

The Orchestrator is an ordinary persona — same markdown, same skill layering, same engine adapter — with two extra abilities: its turn ends in a typed decision rather than a `VERDICT:` line, and it brokers questions between the other personas and the user.

MVP scope includes `TASK-109`, `TASK-110`, `TASK-112`, `TASK-120`, and minimal UI from `TASK-114`. Post-MVP scope covers reusable teams (`TASK-111`), per-persona accumulated context (`TASK-113`), full UI (`TASK-114`), and per-role engine/model configuration (`TASK-115`).

**Order:** `TASK-109` (done) → `TASK-110` (done) → `TASK-120` → `TASK-112` → `TASK-114` → **`TASK-121`** (structural cleanup) → `TASK-117` (E2E). The refactor lands before the browser gate so the release verdict is recorded against the structure we intend to keep.

`TASK-120` inherits two blockers `TASK-110` found — the one-run-per-project admission claim and the per-project worker concurrency of 1 — plus the design question under both: whether the Orchestrator should run inside `PipelineWorkflow` at all.

Cross-platform: orchestrator reuses existing server filesystem/path helpers and OpenWorkflow; UI is web; verification covers Windows and macOS.

---
