# Artificial Developer — Product Discovery

Research and planning artifacts for **Artificial Developer** — an open-source, local-first AI app builder for creating the first version of a product and evolving it over time.

## Summary

**Artificial Developer** is an open-source, local-running app builder for real projects — model-agnostic, deployable to any platform, and built for long-term ownership.

Most hosted and local app builders excel at getting to a first version quickly. The hard part is everything after: unpredictable changes, lost context, fragile debugging loops, and infrastructure you don't fully control. Artificial Developer targets **ongoing evolution** — the same prepared agents help you build v1 and keep improving the product with predictable, restartable stages.

**Tradeoff:** you bring more project context (specs, repo history, acceptance criteria). In return you get pre-configured agents you can adjust, artifacts stored in git, built-in task backlog, stage restart, Playwright E2E testing, and deployment adapters for any platform.

## Does This Product Make Sense?

**Yes — but the wedge is not "no competitors exist."** The market has:

- **Hosted app builders** — fast v1, weak v2+
- **Local OSS app builders** (Dyad, Locode, Singulary, Tinykit) — generation-focused, limited governed lifecycle
- **Lifecycle orchestrators** (Sikula, autonomous-sdlc) — developer tools, weaker first-run UX
- **Frameworks** (LangGraph, Aiki) — building blocks, not a product

**What nobody owns cleanly:** open-source + local + model-agnostic + fast first-run + **predictable ongoing evolution** with repo-native context, Playwright E2E, deploy-anywhere, and stage restart.

**Why adjacent tools stay niche:**

| Reason | Detail |
|--------|--------|
| Fragmentation | Users must assemble harness + spec tool + CI + deploy themselves |
| Wrong optimization | App builders optimize demo speed; orchestrators optimize governance; neither optimizes both |
| Early OSS maturity | Most lifecycle tools are CLI-only, pre-1.0, or single-harness |
| Context tax | Governing evolution requires richer input — many tools hide that behind chat instead of making it explicit |
| No durable runtime | Long runs, human gates, and crash recovery need infrastructure most prototypes skip |

## Documents

| Document | Description |
|----------|-------------|
| [competitor-matrix.md](docs/competitor-matrix.md) | What existing tools miss and why none fully owns ongoing local development |
| [product-brief.md](docs/product-brief.md) | Positioning, app-builder gap, target user, workflow, differentiation |
| [mvp-scope.md](docs/mvp-scope.md) | Smallest useful MVP: stages, built-in tasks, Playwright E2E, deploy adapters, dashboard |
| [technical-architecture.md](docs/technical-architecture.md) | Local architecture: TypeScript/Hono/React, Aiki runtime, tasks, worktrees, adapters |
| [technology-comparison.md](docs/technology-comparison.md) | TypeScript vs Python vs Rust vs Go: UI, workflow, speed, AI integration, RPC |

## One-line pitch

> Artificial Developer is an open-source, local-running app builder for real projects: build the first version, keep evolving it with prepared agents, test it end-to-end, and deploy anywhere with your own models and tools.

## Status

Planning complete. Ready for implementation kickoff.
