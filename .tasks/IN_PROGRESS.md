# In Progress

## TASK-096: Conversational Product Manager milestone planning
**Priority:** P0 | **Tags:** core, server, ui, testing, milestone-d
**Updated:** 2026-07-29 08:56

Add a dedicated Product Manager planning conversation that reads the repository and open work, produces a validated editable milestone proposal, reuses matching tasks, drafts missing work, and activates the milestone plus idempotently created tasks after explicit approval.

Cross-platform: pure TypeScript domain, server, and browser UI. Use Node path helpers for project files and validate on Windows plus macOS CI.

---

## TASK-091: Product Manager closeout, task writers, and safe cleanup
**Priority:** P0 | **Tags:** server, infra, testing, milestone-d
**Updated:** 2026-07-29 08:56

Run the Product Manager again in closeout mode with the same delivery context. Validate and persist closeout JSON/Markdown plus milestone decisions, knowledge, problems, and cleanup reports. Create idempotent follow-up tasks through TaskPlanner or the built-in writer, link their source, transition selected tasks, and remove only allow-listed run-owned temporary resources.

Cross-platform: use Node path/OS helpers and existing process-tree termination on Windows and POSIX.

---

## TASK-088: Milestone domain, persistence, APIs, and autorun
**Priority:** P0 | **Tags:** core, server, ui, milestone-d
**Updated:** 2026-07-29 08:56

Add persisted Milestone and MilestoneFeature models, run/task links, progress and statuses; milestone CRUD/start-next/finalize APIs; and server-side Auto-run next. Autorun preserves the Product Manager approval gate and stops on runtime failure, cancellation, unanswered interaction, or an empty backlog.

Cross-platform: pure domain/API/UI with SQLite persistence.

---
