# In Progress

## TASK-069: Aiki replaces OpenWorkflow as the durable runtime, and schedules fire from Aiki cron
**Priority:** P1 | **Tags:** server, engine, infra
**Updated:** 2026-10-06 17:43

**Rewritten 2026-10-06.** The August premises are gone. Aiki 0.43.2 (2026-10-02) ships SQLite
(through the optional peer `@libsql/client`) and a fully embedded single-process mode, so the
Postgres blocker that made Aiki the second choice no longer holds. The owner contributes to Aiki,
so any gap we find is fixed upstream rather than worked around here.

**The question this task answers:** does Aiki take more work off Isotopy than OpenWorkflow does,
enough to justify the switch? It is built for real on `feature/aiki-runtime`, and the decision is
made on the working PR from measured evidence.

### What Aiki is expected to take over

- **Early events are kept.** An event sent before the run waits is held in a durable mailbox.
  Today OpenWorkflow drops it silently, so a fast gate click can be lost.
- **Typed event payloads,** validated at the sender.
- **Fail-fast task retries.** The default is `never`; OpenWorkflow silently retries a throwing step
  10 times.
- **Content-addressed replay,** so step names no longer need attempt and turn suffixes.
- **Instant pickup.** An in-process push queue starts work at once, with no wake loop of our own.
- **Bounded worker stop.**
- **Durable cron schedules,** with timezones, a skip-overlap policy and pause/resume. These replace
  `Ticker`, `claimWindow`, `lastWindowAt` and the `@isotopy/scheduler` package.

### What stays Isotopy's

Per-project admission, seeded restart-from-stage, killing the engine process tree, the
`RunProjection` read model, and `reconcileOnLoad`.

### Phase 0 spike: done, every gate passed (Windows 11, Node 24, pnpm 10)

- The libsql prebuild installs and loads.
- Several embedded projects run in one process.
- The event mailbox holds early events and dedupes by reference id.
- Hard kills at a gate and mid-stage recover, and a finished stage is never re-run.
- Event to resume takes 15 ms; start to first task takes 20 ms.
- Skip-overlap fires one run for windows missed while down, which is Isotopy's current rule.

Upstream items, none blocking:
- the libsql file stays locked after `close()` until GC;
- migrations log to the console;
- an invalid cron expression returns a 500;
- stale claims and publish leases are not released at boot in single-owner mode;
- Aiki's CI is ubuntu-only.

### Commits (0.12.66 → 0.12.71)

1. An answer closes the question the moment it lands.
2. A finished run can never start another engine call.
3. Aiki is the durable runtime.
4. A durable run that fails shows failed at once.
5. Schedules fire from Aiki cron.
6. The decision is recorded and the comparison retired.

**Evidence the PR must carry:**
- net lines per category;
- tests that are red on the parent and green on the branch;
- Windows CI time against the 4.5 min baseline;
- dependency footprint;
- a dogfood run with a hard kill.

**Cross-platform:**
- The surfaces are the libsql native addon and the per-project DB path (`path.join`).
- Prebuilds exist for win32-x64, darwin-arm64, darwin-x64 and linux. win32-arm64 has none and fails
  at startup with a message naming the platform.
- No new subprocess, shell or env-var surface.
- Tested on Windows; macOS covered by CI only.

---
