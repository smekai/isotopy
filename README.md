<div align="center">
  <img src="packages/ui/public/adhd-icon.png" alt="ADHD" width="128" height="128" />
</div>

# ADHD — Artificial Development, Human Directed

Research and planning artifacts for **ADHD** (formerly **Artificial Developer**) — an open-source, local-first AI development team orchestrator for creating the first version of a product and evolving it over time.

## One-line pitch

> ADHD is an open-source, local-running AI development team for real projects: build the first version, keep evolving it with prepared agents, test it end-to-end, and deploy anywhere with your own models and tools.

## Summary

**ADHD** is an open-source, local-running development team for real projects — model-agnostic, deployable to any platform, and built for long-term ownership.

Most hosted and local app builders excel at getting to a first version quickly. The hard part is everything after: unpredictable changes, lost context, fragile debugging loops, and infrastructure you don't fully control. ADHD targets **ongoing evolution** — the same prepared agents help you build v1 and keep improving the product with predictable, restartable stages.

**Tradeoff:** you bring more project context (specs, repo history, acceptance criteria). In return you get pre-configured agents you can adjust, artifacts stored in git, built-in task backlog, stage restart, Playwright E2E testing, and deployment adapters for any platform.

## Does This Product Make Sense?

**Yes — but the wedge is not "no competitors exist."** The market has:

- **Hosted app builders** — fast v1, weak v2+
- **Local OSS app builders** (Dyad, Locode, Singulary, Tinykit) — generation-focused, limited governed lifecycle
- **Lifecycle orchestrators** (Sikula, autonomous-sdlc) — developer tools, weaker first-run UX
- **Frameworks** (LangGraph, Aiki) — building blocks, not a product

**What nobody owns cleanly:** open-source + local + model-agnostic + fast first-run + **predictable ongoing evolution** with repo-native context, Playwright E2E, deploy-anywhere, and stage restart.

## Documents

### Product and architecture

| Document | Description |
|----------|-------------|
| [product-brief.md](docs/product-brief.md) | Positioning, app-builder gap, target user, workflow, differentiation |
| [mvp-scope.md](docs/mvp-scope.md) | Smallest useful MVP: stages, built-in tasks, Playwright E2E, deploy adapters, dashboard |
| [architecture.md](docs/architecture.md) | Local architecture: TypeScript/Hono/React, OpenWorkflow runtime, tasks, worktrees, adapters |
| [architecture-ui.md](docs/architecture-ui.md) | The frontend tier in full: module map, network seam, run data flow, state ownership, design tokens, testing |
| [competitor-matrix.md](docs/competitor-matrix.md) | What existing tools miss and why none fully owns ongoing local development |
| [technology-comparison.md](docs/technology-comparison.md) | TypeScript vs Python vs Rust vs Go: UI, workflow, speed, AI integration, RPC |
| [prototype-plan.md](docs/prototype-plan.md) | Temporary prototype roadmap (UI-first demo) |

### Design and agent strategy

| Document | Description |
|----------|-------------|
| [model-and-harness-strategy.md](docs/model-and-harness-strategy.md) | When to use Claude Code vs Cursor, stage-to-tool mapping, BYOK models |


## Status

**Milestone D — the Full Delivery loop — shipped at 0.8.7**, and was closed on a live
dogfood against a real project. The current version is in
[`package.json`](package.json); this section describes capability, not a release.

A run is driven by real coding agents (Claude Code, Codex, Cursor) through a durable
OpenWorkflow runtime backed by SQLite, so a run survives a server restart and resumes
without re-running completed stages. Three pipelines ship: **Single agent**,
**Product Manager + Developer + QA**, and **Full Delivery** — Product Manager gate →
Product Designer → Software Architect → Developer → independent review → QA Engineer →
Release Manager → SRE → Product Manager closeout.

**Milestones** group the runs that deliver one body of work. A Product Manager
conversation plans a milestone, you edit and approve the proposal, and its features
become a queue: start the next feature yourself, or turn on **Auto-run next feature**
and let the server chain them. The dashboard at `#/milestones/:id` shows feature
progress, each feature's run history, and the blocking findings that closeout
recorded. A quality stage that finds a blocking problem does not kill the run — it
marks it **needs attention**, and the pipeline still closes out and writes follow-up
tasks to your backlog. A feature left needing attention is resolved from the dashboard
with **Accept findings & complete**, which records who accepted it over which open
findings rather than silently flipping a status.

**Not yet automated:** release and deploy. The `release` and `deploy` stages exist and
report `VERDICT: SKIP` until project deployment automation lands (TASK-092).

## Prerequisites

- **Node.js 20+**
- **pnpm** — install via `npm install -g pnpm`, [Corepack](https://pnpm.io/installation#using-corepack), or `winget install pnpm.pnpm`

## Quick start (prototype)

```bash
pnpm install
pnpm dev
```

| Service | URL |
|---------|-----|
| UI (React dashboard) | http://localhost:5173 |
| API (Hono server) | http://localhost:9477 |

Run packages individually:

```bash
pnpm --filter @adhd/server dev   # API only
pnpm --filter @adhd/ui dev       # UI only
```

Other commands:

```bash
pnpm build      # build all packages
pnpm typecheck  # type-check all packages
```

## Project structure

```
packages/
  core/     # shared types: Run, Stage, AgentStatus, events
  server/   # Node.js + Hono: REST + SSE, orchestrator
  ui/       # React/Vite team workspace (pipeline, gates, history, setup)
docs/       # planning and design documents
.tasks/     # implementation backlog (TaskPlanner)
```

## Working with Claude and Cursor

ADHD orchestrates a full lifecycle pipeline but **delegates implementation to your coding tools**. LLM stages (requirements, design, review, release) call API providers with your keys; the **implementation stage** runs through a harness adapter — primarily **Claude Code** or **Cursor CLI**. You can work on the ADHD repo in Cursor while Claude Code runs as the implementation harness for target projects. See [model-and-harness-strategy.md](docs/model-and-harness-strategy.md) for the full stage-to-tool mapping and configuration.

<!-- TASKPLANNER:ATTRIBUTION:START -->
This project uses [TaskPlanner](https://github.com/smekai/taskplanner) for task planning.
<!-- TASKPLANNER:ATTRIBUTION:END -->
