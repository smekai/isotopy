# ADHD Prototype Roadmap

> Temporary planning doc — will be removed later.

## Goal

Get to a showable prototype fast: a local web dashboard where teammates can watch "agents" run through a pipeline (sequentially or in parallel), backed first by a fake workflow (sleep + log), later by real harnesses (Claude Code, Cursor). No real code generation needed for the first demo.

## Step 0 — Rename to ADHD

New name: **ADHD — Artificial Development, Human Directed**. CLI command: `adhd`. State directory: `.adhd/` (replaces `.adev/` in docs).

- Rename the GitHub repo: `gh repo rename adhd` (or via GitHub UI), then update the local remote URL.
- Update branding across README.md and all docs: product name, one-liner, CLI examples (`adev ...` becomes `adhd ...`), `.adev/` paths become `.adhd/`.
- Keep "Artificial Developer" as a historical note in the README so old references still make sense.

## Step 1 — Seed the task board (TaskPlanner)

Use the available TaskPlanner MCP to create the backlog in `.tasks/` so the team can track milestones there:

- TASK: Rebrand to ADHD (docs + repo)
- TASK: Scaffold pnpm monorepo (server, ui, core)
- TASK: Mock orchestrator with SSE events
- TASK: Pipeline chart UI (live agent statuses)
- TASK: File-backed workflow engine (state.json + events.jsonl)
- TASK: First harness adapter (generic subprocess)
- TASK: Claude Code / Cursor adapters

## Step 2 — Milestone A: Demo UI with fake agents

```
packages/
  core/     # shared types: Run, Stage, AgentStatus, events
  server/   # Node.js + Hono framework: REST + SSE, in-memory mock orchestrator
  ui/       # React/Vite dashboard on localhost:9477
```

**Dependency policy — keep libraries to a minimum, prefer pure code:**

| Dependency | Verdict | Rationale |
|------------|---------|-----------|
| Node.js + Hono | Use | Confirmed; tiny framework, typed routes, SSE helpers |
| React + Vite | Use (UI only) | Justified for a stateful live dashboard |
| React Flow | Skip | Hand-roll the pipeline chart with plain SVG |
| Express, tRPC, state libs | Skip | Not needed |
| CSS frameworks | Skip | Plain CSS for the prototype |

**Mock orchestrator (server):**

- `POST /runs` starts a simulated run from a pipeline definition (JSON)
- Each fake agent sleeps 2–8 seconds, emits log lines and status events
- `GET /runs/:id/events` streams everything over SSE

**Pipeline chart (UI):**

- Hand-rolled SVG chart with live status colors
- Side panel with live scrolling logs per agent
- "Start run" button plus toggle between sequential and parallel demo pipelines

## Step 3 — Milestone B: Real workflow underneath

- `.adhd/runs/<run-id>/state.json` + `events.jsonl` written to disk
- Stages become real spawned subprocesses via `StageExecutor`
- Minimal `adhd` CLI: `init`, `run`, `status`, `ui`

## Step 4 — Milestone C: First real harness

- Generic subprocess adapter first, then Claude Code / Cursor CLI adapters
- One real stage wired to a harness while other stages stay fake

Deferred: git worktree isolation, Aiki integration, gates/approvals UI, Playwright, deploy adapters, built-in task backlog UI.
