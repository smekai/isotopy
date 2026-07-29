# In Progress

## TASK-099: Make SQLite timestamps database-managed
**Priority:** P1 | **Tags:** server, infra, testing
**Updated:** 2026-07-29 18:44

Standardize persisted SQLite records with `created_at` and `updated_at` columns. Set both timestamps on insert through SQLite defaults, and make `updated_at` advance automatically on updates using supported SQLite schema behavior (evaluate an `AFTER UPDATE` trigger because SQLite has no MySQL-style column-level `ON UPDATE` clause). Migrate existing tables and rows safely, remove redundant application-supplied update timestamps, and keep one documented UTC timestamp format.

Add tests for insert defaults, automatic update behavior, migration/restart compatibility, and unchanged timestamps on reads. The schema and trigger behavior must work consistently on Windows and macOS; validate Windows directly and macOS through CI.

---
