# In Progress

## TASK-100: Extract server Markdown into a pure domain layer
**Priority:** P1 | **Tags:** server, testing, adapters
**Updated:** 2026-07-29 13:07

Move server-side Markdown parsing and rendering into focused pure modules under `packages/server/src/domain/markdown/`. Keep services responsible for orchestration and filesystem I/O, keep repositories format-agnostic, normalize generated document structure, and preserve TaskPlanner grammar, idempotency markers, unrelated content, and the existing file line-ending style.

Cover stage prompts and handoffs, skill composition, milestone-planning context, TaskPlanner task/work-log Markdown, closeout and cleanup artifacts, milestone summaries, and prior-closeout context. Add exact-output unit coverage and retain service integration coverage.

**Cross-platform:** Parse both LF and CRLF, preserve the dominant line ending when editing existing TaskPlanner files, generate ADHD-owned artifacts with LF, validate directly on Windows, and run macOS CI.

---
