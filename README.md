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

### Product

| Document | Description |
| --- | --- |
| [product-brief.md](docs/product-brief.md) | Positioning, app-builder gap, target user, workflow, differentiation |
| [competitor-matrix.md](docs/competitor-matrix.md) | What existing tools miss and why none fully owns ongoing local development |

### Architecture and standards

| Document | Description |
| --- | --- |
| [architecture.md](docs/architecture.md) | The code standard (A1–A9, source of the Architect skill), the package layout, and the system design |
| [architecture-ui.md](docs/architecture-ui.md) | The frontend tier in full: module map, network seam, run data flow, state ownership, design tokens, testing |
| [decisions.md](docs/decisions.md) | Dated decision log — context, decision, and the alternative that was rejected |
| [implementation-notes.md](docs/implementation-notes.md) | The "why" behind non-obvious code: engine quirks, paths, persistence, personas |
| [workflow-runtime-options.md](docs/workflow-runtime-options.md) | Durable-runtime comparison behind the OpenWorkflow choice, and the workflow seam |
| [embedded-preview.md](docs/embedded-preview.md) | How the harnesses show a running product, and why ADHD frames it rather than proxying it |

### Testing

| Document | Description |
| --- | --- |
| [testing.md](docs/testing.md) | How a test here is written (AAAAA), which layer a check belongs in, merge protection |
| [e2e-test-plan.md](docs/e2e-test-plan.md) | The browser layer: tiers, cost, and what the Playwright suite covers |


## Status

**Milestone E — Eigen: the Orchestrator — closed at 0.9.23** on live runs against two
harnesses, Cursor and Codex. An **Orchestrator** now sits above the pipelines: you
describe a goal, it talks it through, composes a team from the persona catalog for you to
approve, launches the composed run, and decides what happens next when that run settles —
another run, a milestone to plan, or a reasoned stop.

**In progress — Milestone F, Fixpoint:** stabilising to something a first-time user can
install, point at a folder, and *see the result of*. Its headline gap is exactly that last
step: a run finishes and the files are somewhere, and you have to already know where.
Next after it are **G — Gauge** (the product is renamed **Isotopy**) and **H — Harmonic**
(features chosen by the people who try it, not by us). Milestones are named for
mathematical terms; A–D keep their letters.

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

To run the built app instead of the dev servers, build once and start it. Same
two URLs as above — `pnpm start` serves the compiled UI with `vite preview`
rather than the dev server:

```bash
pnpm build && pnpm start
```

Other commands:

```bash
pnpm build      # build all packages
pnpm typecheck  # type-check all packages
```

### Seeing what a run built

Tell ADHD how your project starts itself — **Setup → Automation → Start the
product** — and a run gains a **Preview** tab that starts it, waits for its health
URL, and shows it inside ADHD. ADHD owns that process: it survives switching
between runs, restarts when a run changes files so you are never looking at the
previous build, and is stopped on Stop, on switching project, and when the server
shuts down. The QA agent asks for the same product through the same mechanism
rather than starting a server of its own.

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

ADHD orchestrates a full lifecycle pipeline but **delegates every stage to your coding tools**. It does not call model APIs itself: each engine-backed stage spawns a coding CLI — **Claude Code**, **Cursor**, or **Codex** — in the run's workspace, so the engine brings its own model selection and its own auth. What an agent *is* comes from a persona (Markdown you can override per user or per project); what it *does* comes from the stage's assignment. You can work on the ADHD repo in Cursor while Claude Code runs the stages for target projects. See [architecture.md](docs/architecture.md#agent-model) for the engine roster and persona layering.

<!-- TASKPLANNER:ATTRIBUTION:START -->
This project uses [TaskPlanner](https://github.com/smekai/taskplanner) for task planning.
<!-- TASKPLANNER:ATTRIBUTION:END -->
