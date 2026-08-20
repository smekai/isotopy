# In Progress

## TASK-113: Per-persona accumulated context (artifact distilled memory)
**Priority:** P3 | **Tags:** core, server, ui, milestone-h
**Updated:** 2026-08-07 11:40

**Milestone H — Harmonic. Build only if feedback asks for it.** The evidence to wait for
is a user saying an agent kept relearning the same thing about their project.

Distill closeout knowledge into per-persona accumulated notes under `.adhd` and inject those notes into `composeSkill` alongside existing user/project overrides.

Also add an orchestrator-facing constraint digest so the orchestrator can reason about “must-do differently for stage X in this project” without needing deep per-agent state.

Cross-platform: path-joined read/write to `.adhd` roots; no subprocess/shell assumptions.

---

