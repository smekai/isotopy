# Workflow State Storage: which embedded database, and which engine can use it

**Task:** [TASK-066](../.tasks/IN_PROGRESS.md)
**Date:** 2026-07-23
**Status:** Complete
**Related:** [workflow-runtime-options.md](./workflow-runtime-options.md), [technical-architecture.md](./technical-architecture.md), TASK-039

---

## TL;DR — Recommendation: **SQLite via `node:sqlite`, behind the existing `RunStore` seam**

Do **not** require PostgreSQL. Run state is a handful of rows per run; making every user install,
start, upgrade, back up and uninstall a Postgres server to hold it is disproportionate, and it
breaks the "one install" story for a manually started local app on Windows and macOS.

**Use SQLite through Node's built-in `node:sqlite`** — no native module, no compiler, no server, one
file per project. This was **measured on this machine, not assumed** (§2), and it is decisive:
`better-sqlite3` *fails to install here at all*, while `node:sqlite` works.

| Option | Verdict | One-line reason |
|--------|---------|-----------------|
| **`node:sqlite`** (Node built-in) | ✓ **Recommended** | Zero dependencies, zero native build, works on Windows today; only cost is an experimental-API warning and a Node floor |
| `better-sqlite3` | ✗ Reject | **Measured install failure** on Windows 11 + Node 24 — no prebuild, `node-gyp` fallback demands Visual Studio C++ |
| `libsql` | ~ Watch | Turso's SQLite fork; adds a native/remote story we do not need for a local single-process app |
| **PGlite** (Postgres in WASM) | ✗ Reject | *"PGlite is single user/connection"*, single-process, alpha — cannot back a workflow engine that pools connections |
| `embedded-postgres` (bundled binaries) | ✗ Reject | Tens of MB of [zonky](https://github.com/zonkyio/embedded-postgres-binaries) binaries *"intended for testing purposes"*, plus data-directory lifecycle across app upgrades |
| Postgres server | ✗ Reject | Disproportionate to the data; an install/upgrade/backup burden pushed onto every user |

**And the storage choice turns out to decide the engine choice.** Most durable-execution engines are
Postgres-only, so "which embedded DB?" and "which workflow engine?" are the same question (§3).

---

## 1. What we are actually storing

Per run: one row of run state, one row per stage attempt, plus an event trail. A busy project might
accumulate a few thousand rows a year. Today this lives in `state.json` + `events.jsonl` under
`.adhd/runs/<id>/`, written by
[`JsonRunStore`](../packages/server/src/services/run-store.ts).

The reason to move off flat JSON is not volume — it is that durable **timers**, **gates** and
**leases** need atomic read-modify-write and indexed queries, which a rewritten JSON file cannot
give safely. That is a transactional-store requirement, and SQLite is the smallest thing that meets
it.

---

## 2. What we measured

Per the precedent set by [spike-beads-vs-ts-backlog.md](./spike-beads-vs-ts-backlog.md), these are
measurements on this repo's target platform, not citations.

**Environment:** Windows 11 (10.0.26200), Node **v24.12.0**, npm, clean scratch directory.

| # | Test | Result |
|---|------|--------|
| M1 | `npm install better-sqlite3` | ✗ **FAILED.** No prebuilt binary; fell back to `node-gyp`, which reported *"Could not find any Visual Studio installation to use"* and *"You need to install the latest version of Visual Studio including the Desktop development with C++ workload"*. Install aborted. |
| M2 | `node:sqlite` — create DB, 1000 inserts, transaction, `PRAGMA journal_mode=WAL`, indexed read | ✓ **Passed.** WAL enabled, 1000 rows, 77,824-byte file. Emits `ExperimentalWarning: SQLite is an experimental feature and might change at any time`. |
| M3 | `npm install openworkflow` | ✓ **1 package, ~2 seconds, zero dependencies.** `postgres` is an *optional* peer dependency only. |
| M4 | Which driver does its SQLite adapter use? | `require("node:sqlite")` — the built-in. No native module anywhere in the tree. |

**M1 is the load-bearing measurement.** `better-sqlite3` is the usual default recommendation (and is
the candidate named in TASK-039), but on the exact platform ADHD targets it does not install without
a C++ toolchain the user has no reason to own. Shipping it would mean shipping an install failure.

### The `node:sqlite` caveats, stated plainly

- **Experimental.** Node prints `ExperimentalWarning` and reserves the right to change the API.
  Mitigation: the surface we need (`DatabaseSync`, `prepare`, `run/get/all`, `exec`) is small and
  sits behind our own `RunStore`, so a driver swap is contained.
- **Node floor.** `node:sqlite` requires Node ≥ 22.5. The root `package.json` currently declares
  `"engines": { "node": ">=20" }`, which would have to rise.

---

## 3. Engine × storage support — the bridge table

This is the point of the document: **the storage decision eliminates most engines outright.**

| Engine | Embedded / file DB today | Windows | License · maturity |
|---|---|---|---|
| **OpenWorkflow** | ✓ **SQLite via `node:sqlite`** (`openworkflow/sqlite`), or Postgres | ✓ library, measured working | Apache-2.0 · v0.9.2, 1279★ |
| **Reflow** | ✓ SQLite (`node:sqlite` / `better-sqlite3` / `bun:sqlite`) | ✓ library | MIT · v0.5.0, 38★ |
| **Aiki** | ✗ PostgreSQL 14+; *"SQLite and MySQL coming soon"*; `database({ provider: "pg" })` seam exists | ✓ library, but needs a PG server | Apache-2.0 · alpha, 34★ |
| **DBOS TypeScript** | ✗ **Postgres only** — `pg` is the sole DB driver in its `package.json` | ✓ library, but needs a PG server | MIT · v4.24, 1289★ |
| DBOS *Python* | ✓ SQLite is the **default** (`sqlite:///<app>.sqlite`) | — | wrong language for this repo |
| **TanStack Workflow** | ~ pluggable `RunStore`; ships in-memory + Drizzle/Postgres + Cloudflare — **no SQLite adapter** | ✓ library | MIT · 0.0.x alpha, 185★ |
| **Resonate** | ✓ SQLite by default | ✗ **no Windows binary** — release assets are `darwin_{aarch64,x86_64}` and `linux_{aarch64,x86_64}` only | Apache-2.0 · v0.9.8, 626★ |
| **Restate** | — | ✗ no official Windows binary | screened out previously |
| **Custom engine** | ✓ free choice | ✓ | ours — TASK-039 |

Two engines are screened out purely on **Windows packaging** (Resonate, Restate) — the same failure
mode, twice. Two more are screened out on **Postgres-only storage** (DBOS TS, Aiki-as-it-ships).

**On DBOS:** its Python port ships SQLite as the default, with `use_listen_notify` forced to `False`
(polling instead of `LISTEN`/`NOTIFY`). So the architecture is portable to SQLite — the TypeScript
port simply has not done it, and no timeline is published.

---

## 4. OpenWorkflow — measured end to end

Because it is the only candidate that satisfies both constraints, it was exercised properly rather
than read about. A two-stage **Developer → gate → Tester** workflow, deliberately shaped like
`DEV_TEST_PIPELINE` in [`packages/core/src/pipelines.ts`](../packages/core/src/pipelines.ts).

| # | Test | Result |
|---|------|--------|
| M5 | Run Developer → durable gate → Tester on a SQLite file | ✓ Completed: `{"dev":"wrote backup.js","test":"verified (gate={\"by\":\"human\"})"}` |
| M6 | **Hard-kill the process while parked at the gate**, then start a *fresh* process against the same DB | ✓ **The run resumed.** The new process picked it up, accepted the signal, and executed the Tester. |
| M7 | Did the completed stage re-run after the crash? | ✓ **No.** `developer` did not re-execute — its result was replayed from SQLite. This is the memoization ADHD needs so a restart does not repeat paid model calls. |
| M8 | Is the durable history human-inspectable? | ✓ Tables `workflow_runs`, `step_attempts`, `workflow_signals`, `openworkflow_migrations`. Step rows read `developer / gate / tester → completed` with their outputs. |

M6 + M7 together are the capability the current engine most conspicuously lacks: today
`reconcileInterrupted()` marks an interrupted run **failed** and the user re-runs it by hand.

### What it gives us, and what it does not

Verified against the shipped type definitions and the official docs:

**Provided:**

- `step.run({ name }, fn)` — memoized durable steps with a `RetryPolicy` (`maximumAttempts` + backoff)
- `step.waitForSignal({ signal, timeout })` / `client.sendSignal({ signal, data })` — **durable gates**
- `step.sleep(name, duration)` — **durable sleep**, which is exactly TASK-061's "wait until the limit resets"
- `cancelWorkflowRun()`, with `sleeping` and `canceled` run statuses
- Crash recovery via heartbeats + `availableAt` leases; Postgres backend claims runs with
  `FOR UPDATE SKIP LOCKED`
- Parallel steps via `Promise.all` / `Promise.allSettled`
- `version?` on the workflow spec
- *"Database as source of truth avoids a separate orchestration service"* — no daemon, matching **S1**

**Not provided — stays ADHD-owned or becomes an upstream contribution:**

- **Restart from a *chosen* earlier stage (S2).** Nothing matching `fork` / `restartFrom` /
  `resumeFrom` exists in the shipped types. Recovery is automatic-from-last-completed only. This is
  ADHD's Resume/Restart distinction from TASK-060 and is the single most important gap.
- **One active run per project (S5).** `concurrency` is a *worker* pool size, not a per-key limit;
  there is no queue-per-key or rate-limit primitive. `idempotencyKey` exists on run creation and is
  the likely building block.
- Pre-1.0 (v0.9.2) — the API may still move.

---

## 5. Relationship to TASK-039

TASK-039 asks for a `RunStore` interface plus a selectable DB adapter, naming better-sqlite3/libsql
as candidates. Two updates:

1. **The interface half is already done.** TASK-059 built it:
   [`run-store.ts`](../packages/server/src/services/run-store.ts) already defines `RunStore`,
   `RunStoreFactory` and a `JsonRunStore` bound to a project, and the orchestrator already depends
   on the interface. TASK-039 reduces to *"add an adapter"*.
2. **The named candidate should change** from `better-sqlite3` to `node:sqlite`, on measurement M1.

Worth recording: **TanStack Workflow independently named its storage interface `RunStore` too** —
mild evidence that the seam TASK-059 landed is the conventional shape.

If OpenWorkflow is adopted, the relationship inverts: its SQLite database becomes authoritative for
execution state, and `state.json` / `events.jsonl` become an idempotent projection — see
[workflow-runtime-options.md §9](./workflow-runtime-options.md).

---

## 6. Decision

1. **SQLite is the storage substrate.** Postgres, PGlite and bundled-Postgres are rejected.
2. **`node:sqlite` is the driver**, on measurement M1. Raise the root `engines.node` floor to
   `>=22.5`. Keep it behind `RunStore` so the experimental API is contained.
3. **The storage decision selects the engine.** Requiring an embedded DB *and* Windows support
   leaves OpenWorkflow and Reflow standing; of those, only OpenWorkflow has durable gates, durable
   sleep and cancellation. Reflow has none of the three.
4. **Keep JSON as a projection, not a second writer.** Whatever owns execution state owns it alone.

---

## Sources

All verified 2026-07-23. Measurements M1–M8 performed on Windows 11 (10.0.26200), Node v24.12.0.

**OpenWorkflow** — [openworkflowdev/openworkflow](https://github.com/openworkflowdev/openworkflow) ·
[core concepts](https://openworkflow.dev/docs/core-concepts) ·
[advanced patterns](https://openworkflow.dev/docs/advanced-patterns) ·
[architecture](https://github.com/openworkflowdev/openworkflow/blob/main/ARCHITECTURE.md)

**Other engines** — [Reflow](https://github.com/danfry1/reflow-ts) ·
[Aiki](https://github.com/aikirun/aiki) ·
[DBOS TypeScript](https://github.com/dbos-inc/dbos-transact-ts) ·
[DBOS Python config (SQLite default)](https://docs.dbos.dev/python/reference/configuration) ·
[TanStack Workflow](https://github.com/TanStack/workflow) ·
[Resonate](https://github.com/resonatehq/resonate) ·
[Restate installation](https://docs.restate.dev/installation)

**Storage** — [`node:sqlite`](https://nodejs.org/api/sqlite.html) ·
[better-sqlite3](https://github.com/WiseLibs/better-sqlite3) ·
[PGlite](https://github.com/electric-sql/pglite) ·
[embedded-postgres](https://www.npmjs.com/package/embedded-postgres) ·
[zonky binaries](https://github.com/zonkyio/embedded-postgres-binaries)
