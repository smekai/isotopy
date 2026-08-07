# In Progress

## TASK-108: Milestone E — Orchestrator epic
**Priority:** P1 | **Tags:** core, server, ui, engine, milestone-c
**Updated:** 2026-08-04 12:20

Milestone E adds a top-level Orchestrator entry point that conversations with the user, composes a reusable team from the persona catalog, launches composed runs, and decides what happens next after each run completes.

The Orchestrator is an ordinary persona — same markdown, same skill layering, same engine adapter — with two extra abilities: its turn ends in a typed decision rather than a `VERDICT:` line, and it brokers questions between the other personas and the user.

MVP scope includes `TASK-109`, `TASK-110`, `TASK-112`, `TASK-120`, and minimal UI from `TASK-114`. Post-MVP scope covers reusable teams (`TASK-111`), per-persona accumulated context (`TASK-113`), full UI (`TASK-114`), and per-role engine/model configuration (`TASK-115`).

**Order:** `TASK-109` (done) → `TASK-110` (done) → `TASK-120` (done) → `TASK-112` (done) → `TASK-114` (done, MVP slice) → `TASK-121` (done) → **`TASK-117`** (E2E). The refactor landed before the browser gate so the release verdict is recorded against the structure we intend to keep.

`TASK-120` inherits two blockers `TASK-110` found — the one-run-per-project admission claim and the per-project worker concurrency of 1 — plus the design question under both: whether the Orchestrator should run inside `PipelineWorkflow` at all.

Cross-platform: orchestrator reuses existing server filesystem/path helpers and OpenWorkflow; UI is web; verification covers Windows and macOS.

---

## TASK-117: E2E verification for the orchestrator milestone
**Priority:** P1 | **Tags:** testing, adapters, engine, ui, milestone-c
**Updated:** 2026-08-07 00:00

Following the `qa-testing` skill, run repository gates (lint, typecheck, test, build, e2e), then drive the app (Hono `:9477` + Vite `:5173`) through the full orchestrator flow using the internal browser and/or Playwright.

Verify: user chat with orchestrator, approval of the proposed team, execution of the composed run, and correctness of the post-run decision loop + run timeline. Record a release verdict for the milestone.

Cross-platform: verify on Windows (primary), and ensure test/run commands are valid on macOS (both shells).

### Plan

Engines under test: **Cursor (Auto)** first, then **Codex (gpt-5-mini)**. The app is driven
from the internal browser; Playwright is the fallback. Two target tiers: a throwaway smoke
folder per engine, and one persistent dogfood repo both engines evolve in sequence.

1. **Gates** — lint, typecheck, test, build, e2e, `gen:skills` clean before any change.
2. **Fix the ask-on-a-non-resumable-engine blocker.** `canAsk` requires
   `isConversational`, so on Cursor an `ask_user` decision is dropped: the stage passes, the
   orchestration flips to `awaiting_user`, and the run it should have parked on is already
   over. Park on the question for any interactive stage, and rebuild the prompt from the
   conversation when the engine cannot resume a session.
3. **Cursor pass** — smoke tier, then the dogfood repo (build v1, then evolve it).
4. **Codex pass** — the same two tiers on gpt-5-mini, which also covers the session-resume
   branch the Cursor pass cannot reach.
5. **Free-tier regression spec** — a seeded orchestrator e2e (proposal → approve, awaiting
   user, run timeline) so the UI contract is guarded without tokens.
6. **Verdict** — findings fixed here or filed; release verdict recorded in the done-summary.

---
