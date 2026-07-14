# Next

## TASK-020: End-to-end verification of the one-box Claude run
**Priority:** P0 | **Tags:** testing, milestone-c
**Updated:** 2026-07-14 09:11

Server-level verification complete: happy path (haiku created hello.txt in the scratch workspace, live SSE logs, result + cost captured on run.completed), custom workspaceDir run (file landed there; nonexistent dir → 400), abort mid-run (claude process tree killed, no orphans, stage skipped), `engine: cursor` → 400 not implemented, sequential mock pipeline regression (8 stages, gates, approve — untouched). Remaining: visual UI pass (pipeline picker, live log panel, result.md artifact, engine pill, persisted Setup settings) and confirming the TaskPlanner sidebar lists tasks after a window reload.

---
