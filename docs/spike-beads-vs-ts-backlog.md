# Spike: beads (`bd`) vs. TS-native task-graph backlog

**Task:** [TASK-035](../.tasks/DONE.md)
**Date:** 2026-07-20
**Status:** Complete
**Related:** [competitor-matrix.md §2](./competitor-matrix.md), [mvp-scope.md](./mvp-scope.md), [technical-architecture.md](./technical-architecture.md)

---

## TL;DR — Recommendation: **Borrow the model, stay TS/git-native**

Do **not** adopt `bd` as a runtime dependency (subprocess or otherwise). **Absorb its three good ideas** —
dependency graph, `ready` detection, and closed-task compaction — into our own TS/git-native backlog under
`.adhd/tasks/`. `bd` validated the model and is worth studying; its Go + embedded-Dolt implementation is the wrong
shape for a local-first TS/Hono "one install" product and its source-of-truth-in-Dolt design directly conflicts with
our git-native artifact philosophy.

| Option | Verdict | One-line reason |
|--------|---------|-----------------|
| **Adopt `bd` as-is** (subprocess) | ✗ Reject | 145 MB binary + embedded Dolt, data lives outside git, invasive `init`, churning storage layer |
| **Borrow the model** into TS backlog | ✓ **Recommended** | Keep single `npm install`, keep git as source of truth, gain the dependency graph + ready-queue |
| **Stay pure markdown** (status quo) | ~ Partial | Fine for MVP, but no first-class dependencies = no real `ready` intake queue |

---

## What we actually measured

Installed and exercised `@beads/bd@1.1.0` on Windows 11 (this repo's target platform) to replace hearsay with facts.

| Observation | Finding | Source |
|-------------|---------|--------|
| Install path | `npm install -g @beads/bd` works; `postinstall` drops a **prebuilt native binary** — no Go toolchain needed | measured |
| Binary size | **`bd.exe` = 145 MB**; the single-dep `node_modules` = **140 MB** | `du -sh` |
| Storage backend | **Embedded Dolt** by default (`.beads/embeddeddolt/`), ~1.3 MB even near-empty; **gitignored** | `bd init` output |
| Source of truth | Dolt DB, **not** git. `bd init` prints: *".beads/issues.jsonl is an export, not cross-machine sync or the source of truth"* | measured |
| Git sync | Separate channel: `bd dolt push`/`pull` against `refs/dolt/data` on the remote — **not** the working tree | docs + init warning |
| `bd init` footprint | Invasive: writes `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.codex/`, `.agents/skills/beads/`, and **5 git hooks** | `git ls-files` |
| `bd ready` | Works, dependency-aware; returns only unblocked issues in priority order; clean `--json` | measured |
| Latency | ~**0.5 s per invocation** (embedded Dolt spins up each call) | `time bd ready` |
| JSON output | First-class `--json` on every command; stable, scriptable shapes | measured |
| ID scheme | Hash-based (`demo-f0n`), hierarchical epics (`.1`, `.1.1`) — designed for multi-agent merge safety | measured |

**Live demo run:** created two issues, added `Implement login` → *depends on* → `Design auth schema`, then `bd ready`
correctly returned **only** the unblocked design task. The dependency graph + ready-detection is real and it works.

---

## Answering the spike's questions

### 1. Adopt as-is vs. absorb the model → **Absorb**

Adopting `bd` means shelling out to a 145 MB Go binary that keeps its data in an embedded SQL database *outside* git.
Every value it provides — dependency edges, ready-work detection, semantic compaction — is a **data-model idea**, not a
technology we need Dolt for. We can implement all three in a few hundred lines of TypeScript over our existing file
store. We lose nothing by reimplementing and we keep full control of the schema our pipeline reads.

### 2. Go + Dolt weight in a TS/Hono local-first product → **Breaks the "one install" story**

This is the decisive point. Our stack is `pnpm` + Node ≥20 + Hono + Vite. Pulling in `bd`:

- **+140 MB** to `node_modules` for one dependency (vs. our entire current tree), or an out-of-band Homebrew/curl
  install that we can't guarantee on a user's machine.
- Introduces **Dolt** — a second database engine with its own on-disk format, daemon, and failure modes — into a
  product whose persistence story is "plain files in your git repo."
- The **SQLite → Dolt migration (v1.0)** broke real users badly (see issues
  [#2276](https://github.com/gastownhall/beads/issues/2276),
  [#2573](https://github.com/gastownhall/beads/issues/2573): *"Ever since the move to dolt, nothing works"*). The
  storage layer is young and churning — not something to bet our backlog's durability on.

For a local-first tool the "one install" promise (`npm i` / `npx adhd`) is a core feature. `bd` breaks it.

### 3. Does `bd ready` become the pipeline intake queue? → **The *concept* does, not the command**

Yes to the pattern: the intake stage should pull from a **ready queue** — tasks whose dependencies are all `done` —
rather than a flat priority list. That's exactly how tasks-spawn-runs should work:

```
tasks (graph)  ──ready()──▶  intake stage  ──▶  run  ──▶  (on close) unblocks dependents
```

No to the literal binary: we implement `readyTasks()` in `TaskManager` (topological filter over our own edges). It's a
graph traversal we own, invoked in-process (no 0.5 s subprocess tax per call), reading the same JSON our dashboard reads.

### 4. Merge/sync model vs. our git-native artifacts → **Conflict, not synergy**

This is the deepest incompatibility. ADHD's whole persistence model is **git-native artifacts**: runs, requirements,
designs, and tasks are plain files committed into the target repo, diffable and reviewable in normal PRs. `bd` inverts
this: the source of truth is the Dolt DB (gitignored), synced through a **parallel `refs/dolt/data` channel** that is
*not* your code history. You'd have two sync systems, two merge models, and task state that doesn't show up in a normal
`git diff`. Our markdown/JSON tasks merge with ordinary git; that is a feature we should keep, not trade away.

`bd`'s hash-based IDs solve multi-agent merge collisions — a real problem *for `bd`'s cloud/multi-writer scenario*. Our
product is single-user local-first; the same safety comes for free from committing task files on a branch per run.

### 5. What we lose by staying pure markdown → **First-class dependencies (worth fixing, cheaply)**

Pure `.tasks/*.md` (today's TaskPlanner format) has no dependency edges and no ready-detection. That's the one genuinely
valuable thing `bd` has that we lack. The fix is **not** adopting Dolt — it's adding a `dependsOn` field and a machine
index. See below.

---

## Backlog data-model implications

Keep human-readable markdown per task **and** a machine index (already the plan in
[technical-architecture.md](./technical-architecture.md) — `index.json` + `TASK-xxx.md`). Extend the model with the two
fields needed for a graph and a ready queue:

```jsonc
// .adhd/tasks/index.json
{
  "nextId": 3,
  "idPrefix": "TASK",
  "tasks": [
    {
      "id": "TASK-001",
      "title": "Design auth schema",
      "status": "ready",          // backlog | ready | in_progress | blocked | done | rejected
      "priority": "P1",
      "tags": ["core"],
      "dependsOn": [],            // NEW — edges; task is "ready" only when all are `done`
      "runIds": [],
      "compacted": false,         // NEW — closed-task memory decay (see below)
      "createdAt": "2026-07-20T09:00:00Z",
      "updatedAt": "2026-07-20T09:00:00Z"
    },
    {
      "id": "TASK-002",
      "title": "Implement login",
      "status": "blocked",
      "priority": "P1",
      "dependsOn": ["TASK-001"],  // blocked until TASK-001 is done
      "runIds": [],
      "compacted": false
    }
  ]
}
```

Three things to borrow, in priority order:

1. **Dependency graph (`dependsOn`).** A task is `ready` iff every `dependsOn` id is `done`. Cheap to store, cheap to
   compute. This is the single highest-value idea from `bd`.
2. **`ready` detection as the intake queue.** `TaskManager.readyTasks()` = tasks with status in `{backlog, ready}` whose
   deps are all `done`, sorted by priority. The intake stage and the dashboard's "start a run" affordance both read
   from this. Closing a task (its run reaches `deploy`/`done`) re-evaluates dependents and may flip them `ready`.
3. **Closed-task compaction (later, optional).** `bd`'s "memory decay" summarizes old closed tasks to save agent
   context. For us this is a `compacted` flag + a short summary that replaces the full body once a task is `done` and
   its runs are archived — a nice-to-have for long-lived repos, not MVP-critical.

**Do not adopt:** hash-based IDs (our sequential `TASK-xxx` is fine for single-user; keep it for readability), Dolt,
the `refs/dolt/data` sync channel, or `bd`'s invasive `init`.

### Effort estimate

Borrowing is small: `dependsOn` field + `readyTasks()` traversal + a cycle check + status re-evaluation on task close.
Estimate **~1 focused day** in `TaskManager`, entirely within our existing file-store and Hono routes. No new runtime
deps, no change to the install story.

---

## Decision

**Borrow the model into our TS/git-native backlog.** Add `dependsOn` + a `ready` queue now (feeds the intake stage);
defer compaction to v0.2. Keep `bd` on the radar as a pattern source and cite it as validation in the competitor
matrix, but do not take a Go/Dolt runtime dependency.

Follow-up task worth filing: *"Add task dependencies (`dependsOn`) + `ready` queue to TaskManager; wire `ready` into
intake stage."*

---

## Sources

- [gastownhall/beads (GitHub)](https://github.com/gastownhall/beads) — v1.1.0, MIT, embedded Dolt
- [Beads documentation](https://beads.gascity.com/) — architecture, `.beads/embeddeddolt` (gitignored)
- [`@beads/bd` on npm](https://www.npmjs.com/package/@beads/bd) — prebuilt native binary via postinstall
- [Better Stack: Beads issue tracker for AI agents](https://betterstack.com/community/guides/ai/beads-issue-tracker-ai-agents/)
- Storage migration friction: [issue #2276](https://github.com/gastownhall/beads/issues/2276),
  [issue #2573](https://github.com/gastownhall/beads/issues/2573)
- Empirical install/run measurements: this spike (Windows 11, `@beads/bd@1.1.0`, 2026-07-20)
