# Backlog

## TASK-152: `pnpm dev` gives a UI that cannot reach the server on Windows
**Priority:** P1
**Tags:** infra, ui, server, milestone-h
**Updated:** 2026-08-18 23:30

Found while verifying `TASK-148` in the real app. `pnpm dev` starts both processes, the UI loads, and
**every** proxied request fails:

```
[vite] http proxy error: /settings
AggregateError [EADDRINUSE]: at internalConnectMultiple (node:net:1134:18)
```

The server binds `localhost`, which on this machine resolves to IPv6 only — `netstat` shows
`[::1]:9477 LISTENING`, `curl http://[::1]:9477/health` answers `200`, and
`curl http://127.0.0.1:9477/health` is refused. Vite's proxy client tries both families and reports
the aggregate as `EADDRINUSE`. So the whole app degrades to "Could not load projects" with no error
that names the cause.

`pnpm e2e` is unaffected — it starts its own pair on 9499/5199 and its 68 tests pass — which is
exactly why this has stayed invisible: the gate that would catch it does not use this path.

**Why it matters:** `pnpm dev` is what `.claude/skills/run-app/SKILL.md` tells an agent to run, so
every dogfood starts here. `TASK-141`'s pre-flight already lost time to stale claims in that skill;
this loses more, and silently.

**Decide which side moves.** Either the server binds both families (`ISOTOPY_HOST=0.0.0.0`, or
listening on `::` with dual-stack), or the Vite proxy targets an explicit literal rather than
`localhost` (`packages/ui/vite.config.ts` builds `serverUrl` from `ISOTOPY_PORT`). Whichever wins,
`pnpm dev` must work on a stock Windows box without an env var, and the health check in the run-app
skill should prove the *proxied* path, not just the direct one — today it checks
`http://localhost:5173/health`, which is the request that fails, so the skill's own gate should have
caught this.

Cross-platform: the failure is a Windows name-resolution difference; the fix must not break macOS,
where `localhost` usually resolves IPv4-first.

---

## TASK-151: Decide what `.agents/skills/` is for, and stop it rotting
**Priority:** P2
**Tags:** infra, testing, milestone-h
**Updated:** 2026-08-18 21:30

Found while fixing `TASK-146`. `.agents/skills/run-app/SKILL.md` is a fossil. Its last content
change was `332df5c` (`TASK-090`); everything since has been mechanical rename commits, so on top of
the three defects `TASK-146` fixed in the `.claude` copy it still claims:

- the server spawns "the Codex CLI for `one-box` runs" — `one-box` is a **retired** pipeline id that
  the sibling documents as rejected at the boundary;
- `packages/server/src/engines/Codex.ts`, `Codex.exe`, `Codex /login`, `~/.Codex.json` — none exist;
  this is a capital-preserving find/replace of `claude`;
- a mock `sequential` pipeline, which does not exist — every shipped pipeline drives a real engine;
- `.isotopy/settings.json` gitignored inside the project, when settings are user-level in
  `~/.isotopy/settings.json` keyed by project;
- a `workspaceDir` request field on `POST /runs`, removed when the working directory became derived;
- a duplicated test-id roster, which the sibling deliberately delegates to `architecture-ui.md` §9.

**The task is not "fix the text."** Hand-fixing it re-arms the same trap: two hand-maintained copies
where only one gets updated is exactly the failure `TASK-103` recorded during the `TASK-094` dogfood
and `TASK-146` recorded again from `TASK-141`'s. Twice is a pattern.

**Decide what `.agents/` is for, and record it.** Nothing in the build, config or CI references the
directory — but `REJECTED.md:22` treats `.agents/skills/qa-testing/SKILL.md` as one of three live
homes for the browser-fallback policy, so it is not obviously dead either. Either generate it from a
single source with a `pnpm gen:skills --check` drift gate, as `architect` and `write-tests` already
are, or delete it. Whichever wins, the outcome must be that no copy of a skill can silently disagree
with another.

Cross-platform: n/a — documentation and tooling.

---

## TASK-111: Reusable teams for later orchestrations
**Priority:** P3 | **Tags:** core, server, milestone-h
**Updated:** 2026-08-07 11:40

**Milestone H — Harmonic. Build only if feedback asks for it.** Written as post-MVP when
Milestone E deferred it; no user has yet said they recompose teams often enough to mind.

Persist approved team compositions to `.adhd/teams/<id>.json` with a strict schema and a single writer. The orchestrator lists and reuses saved teams across later conversations instead of recomposing from scratch.

Cross-platform: n/a — JSON + path-joined storage under the existing `.adhd` roots.

---

## TASK-113: Per-persona accumulated context (artifact distilled memory)
**Priority:** P3 | **Tags:** core, server, ui, milestone-h
**Updated:** 2026-08-07 11:40

**Milestone H — Harmonic. Build only if feedback asks for it.** The evidence to wait for
is a user saying an agent kept relearning the same thing about their project.

Distill closeout knowledge into per-persona accumulated notes under `.adhd` and inject those notes into `composeSkill` alongside existing user/project overrides.

Also add an orchestrator-facing constraint digest so the orchestrator can reason about “must-do differently for stage X in this project” without needing deep per-agent state.

Cross-platform: path-joined read/write to `.adhd` roots; no subprocess/shell assumptions.

---

## TASK-069: Spike — Aiki durable runtime on a comparison branch
**Priority:** P3 | **Tags:** server, engine, infra
**Updated:** 2026-08-07 11:40

**No milestone, deliberately.** Research cannot close a milestone, so this sits outside
F, G and H rather than diluting one of them. Pick it up when a runtime question forces it.

**Deprioritized to P3 on 2026-08-03:** OpenWorkflow landed under TASK-068 and then survived a real mid-flight process kill in the TASK-094 dogfood, resuming without re-running completed stages. The comparison this spike was written to force has largely been answered by that evidence, so it is no longer worth a branch's cost.

The standing second choice from [`docs/workflow-runtime-options.md`](../docs/workflow-runtime-options.md) §9 is **Aiki** — TypeScript, Apache-2.0, and the only candidate ADHD has a contributor on, so its gaps are ours to close. It is not the recommendation only because it requires **PostgreSQL 14+ today** (SQLite is "coming soon", i.e. we'd write it) and documents no fork-from-step (S2). This task builds the same durable runtime as TASK-068 but on Aiki, **on a separate branch**, to compare the two against ADHD's real shape before committing.

**Do it on a branch off TASK-068's work** so the two runtimes sit behind the same seam and can be measured head to head; the winner merges to `main`, the loser stays as a documented spike. (Note: the pre-1.0 "commit directly to main" norm is deliberately set aside here — a throwaway comparison branch is the point.)

**Scope:**
- Stand Aiki up against the same feature checklist (doc §3): durable start, crash recovery/resume, retries, durable approval gates, durable sleep (TASK-061 shape), cancellation, parallel branches, project concurrency (S5), semantic restart (S2).
- Confront its two hard gaps directly: **(a)** does its `database({ provider })` seam let us stand up SQLite via `node:sqlite` without a Postgres server (the storage constraint that ruled it out), and **(b)** can `restartRun(runId, stageId)` semantics be built without a native fork primitive? These are the two things that, if closed, make Aiki "directly competitive with OpenWorkflow, with the added advantage of influence over its direction" (§9).
- Run the doc's measured probe (a Developer → gate → Tester workflow, hard-killed at the gate, resumed in a fresh process, completed stage not re-run) on Aiki and record the result beside OpenWorkflow's.
- Write the comparison up as a dated decision-log entry (A8): integration cost, maturity/bus-factor (Aiki is alpha, 34★), and whether steering-the-dependency outweighs shipping-sooner.

**Deliverable:** a runnable Aiki branch behind the same runtime seam as TASK-068, a head-to-head write-up, and a go/no-go recommendation. If Aiki wins, its branch merges to `main`; otherwise TASK-068's OpenWorkflow branch is what merges.

**Cross-platform:** the deciding question **is** cross-platform — Aiki's Postgres-14+ requirement would mean bundling a database server invisibly on Windows *and* macOS, the packaging burden that eliminated it in the doc. The spike must confirm whether an embedded `node:sqlite` backend avoids that on both OSes, or Aiki fails the same platform bar as DBOS/Restate/Resonate. Tested on Windows; macOS packaging reasoned through.

---

## TASK-036: Spike — sandcastle as the implement-stage harness/sandbox layer
**Priority:** P3 | **Tags:** adapters, engine
**Updated:** 2026-08-07 11:40

**No milestone, deliberately.** Same reason as `TASK-069`. Its premise has also weakened:
the subprocess harness it proposed replacing now exists, is dogfooded, and was hardened
again in `TASK-117`.

Evaluate [mattpocock/sandcastle](https://github.com/mattpocock/sandcastle) as the execution layer behind the implementation stage instead of building the subprocess harness (TASK-006) from scratch. It's a TS library (`sandcastle.run()`) that runs a coding agent in an isolated sandbox and merges commits back: Docker/Podman/Vercel-Firecracker providers, git-worktree isolation, branch strategies, session capture/resume, typed structured-output extraction, lifecycle hooks — provider-agnostic (Claude Code, Codex, Cursor).

**Questions to answer:**
- Does its `HarnessAdapter`-shaped surface map cleanly onto our EngineAdapter interface? What do we still own (stage handoff, artifacts, gates, dashboard)?
- Wrap `sandcastle.run()` vs. build generic subprocess harness (TASK-006) — cost, control, and lock-in tradeoff.
- Session resume + structured output: do they cover our restart-single-stage and artifact-capture needs?
- Sandbox providers: does Vercel/Firecracker help our deploy-anywhere story or is it out of scope?
- Maturity/API stability and dependency weight.

**Deliverable:** short recommendation (adopt / borrow patterns / pass) + impact on TASK-006/TASK-021. Not a competitor — a build-on candidate; see docs/competitor-matrix.md §6.

---
