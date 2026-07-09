# ADHD — Artificial Development, Human Directed

Research and planning artifacts for **ADHD** — an open-source, local-first AI development team orchestrator for creating the first version of a product and evolving it over time.

> Previously named *Artificial Developer*. Local folder and repo: `adhd`.

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

| Document | Description |
|----------|-------------|
| [prototype-plan.md](docs/prototype-plan.md) | Temporary prototype roadmap (UI-first demo) |
| [competitor-matrix.md](docs/competitor-matrix.md) | What existing tools miss and why none fully owns ongoing local development |
| [product-brief.md](docs/product-brief.md) | Positioning, app-builder gap, target user, workflow, differentiation |
| [mvp-scope.md](docs/mvp-scope.md) | Smallest useful MVP: stages, built-in tasks, Playwright E2E, deploy adapters, dashboard |
| [technical-architecture.md](docs/technical-architecture.md) | Local architecture: TypeScript/Hono/React, Aiki runtime, tasks, worktrees, adapters |
| [technology-comparison.md](docs/technology-comparison.md) | TypeScript vs Python vs Rust vs Go: UI, workflow, speed, AI integration, RPC |

## One-line pitch

> ADHD is an open-source, local-running AI development team for real projects: build the first version, keep evolving it with prepared agents, test it end-to-end, and deploy anywhere with your own models and tools.

## Status

Planning complete. Prototype implementation in progress.

## Quick start (prototype)

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 for the live pipeline dashboard (API on port 9477).
