# Technology Comparison: TypeScript vs Python vs Rust vs Go

**Purpose:** Compare implementation stacks for Artificial Developer across multiplatform UI, workflow orchestration, runtime speed, AI-agent integration, and RPC/gRPC fit.

## Executive Recommendation

Use **TypeScript as the primary product stack** for the MVP:

- **CLI + local API + dashboard:** TypeScript on Node.js
- **UI:** React/Vite Web UI, with optional Tauri desktop wrapper later
- **API:** Hono REST + SSE for MVP
- **Workflow:** Aiki if it embeds cleanly; otherwise a file-backed state machine with the same interfaces
- **Agent integration:** TypeScript adapters for Cursor/Claude Code/generic subprocess, with Python allowed as subprocess glue where useful
- **RPC:** Do not start with gRPC for the MVP. Use REST/SSE locally, then add ConnectRPC or gRPC only when cross-language workers become real.

This keeps the product simple, cross-platform, web-friendly, and close to the current architecture while preserving future escape hatches for Go/Rust workers or Python AI utilities.

## Decision Criteria

| Criterion | Why it matters |
|-----------|----------------|
| Multiplatform UI | The product needs a local dashboard and may later need a desktop shell. |
| Workflow engine | Long-running runs, retries, human gates, restart/resume, and crash recovery are core. |
| Runtime speed | The orchestrator will spawn agents, read files, tail logs, run tests, and manage worktrees. |
| AI-agent integration | The product must call LLM APIs, local models, CLI agents, IDE agents, and subprocess tools. |
| RPC/gRPC fit | The product may eventually split into UI, daemon, workers, and external adapters. |
| Packaging | Users should install and run it locally without fighting native dependency chains. |
| Team velocity | The MVP should be shippable quickly with a small team. |

## Summary Matrix

| Language | Best fit | UI story | Workflow story | AI integration | Speed | RPC/gRPC | Main risk |
|----------|----------|----------|----------------|----------------|-------|----------|-----------|
| **TypeScript** | Primary MVP stack | Excellent Web UI; Tauri/Electron later | Aiki is aligned; custom FSM easy | Excellent JS SDKs, CLIs, web APIs | Good enough | Excellent REST, tRPC, ConnectRPC, gRPC-js | Node packaging and long-running process discipline |
| **Python** | AI utilities and subprocess helpers | Weak native UI; good Web UI via separate frontend | Good options, but heavier for local product | Best AI ecosystem | Medium | Good gRPC, FastAPI, JSON-RPC | Packaging, dependency isolation, slower single-process runtime |
| **Rust** | Future high-performance native sidecars | Excellent Tauri foundation; native UI possible | Fewer mature workflow engines | Improving, but weaker AI SDK coverage | Excellent | Excellent tonic/Connect support | Slower MVP velocity, ecosystem gaps for AI workflows |
| **Go** | Future daemon/worker runtime | Wails/Fyne possible; Web UI still separate | Temporal/Cadence ecosystem is strong | Solid but less rich than TS/Python | Excellent | Excellent first-class gRPC | UI and AI ecosystem less natural for this product |

## TypeScript

### Strengths

- Best fit for a **single-language CLI + API + Web UI** product.
- React/Vite gives the fastest route to a polished local dashboard.
- Hono provides a compact typed server with REST and SSE support.
- Aiki is TypeScript-native and matches long-running workflows with human gates.
- Strong SDK support for OpenAI, Anthropic, Vercel AI SDK, LiteLLM-compatible APIs, Ollama clients, GitHub APIs, and browser tooling.
- Easy subprocess integration for Cursor, Claude Code, Playwright, git, Docker, and deploy CLIs.
- Future desktop packaging can use Tauri without replacing the UI.

### Weaknesses

- Long-running orchestration in Node requires careful process supervision, cancellation, file locking, and cleanup.
- CPU-heavy work should not run in the main Node process.
- Native binary distribution is less clean than Go/Rust unless using a packager.

### Fit For Artificial Developer

TypeScript is the best MVP default because the product is dashboard-heavy, agent-adapter-heavy, and workflow-driven rather than CPU-bound. It also keeps shared domain types close to the UI and API.

Recommended usage:

- `packages/cli` - `adev` CLI
- `packages/core` - orchestrator, TaskManager, run state, adapter contracts
- `packages/server` - Hono local API
- `packages/ui` - React/Vite dashboard
- `packages/adapters` - harness/deploy adapters

## Python

### Strengths

- Best ecosystem for AI experimentation, LangChain/LangGraph, model tooling, notebooks, evaluation, and data-heavy workflows.
- Excellent for quick adapters around AI APIs or research workflows.
- FastAPI gives a strong API story if Python owns the backend.
- gRPC support is mature.

### Weaknesses

- Multiplatform UI is not its strength. A serious UI usually means a separate web frontend anyway.
- Packaging local apps with Python dependencies can be painful across Windows, macOS, and Linux.
- Dependency conflicts are more likely when users already have Python environments.
- Runtime speed is fine for orchestration, but worse for file-heavy or concurrent worker scenarios unless carefully structured.

### Fit For Artificial Developer

Python should be optional, not the primary product runtime. It is useful as subprocess glue for model tooling, evaluation, prompt experiments, or integrations where Python libraries are clearly better.

Recommended usage:

- Optional agent helper scripts
- Evaluation utilities
- Model/provider experiments
- Not the core CLI/API/UI stack

## Rust

### Strengths

- Excellent performance and memory safety.
- Strong fit for a native local daemon, file watching, process supervision, sandboxing, and secure plugin boundaries.
- Tauri is Rust-based and gives a strong desktop packaging path.
- Great for single-binary distribution.
- gRPC support via `tonic` is mature.

### Weaknesses

- Slower MVP velocity for a product that needs many integrations.
- AI SDK ecosystem is much thinner than TypeScript or Python.
- Workflow engine ecosystem is less mature for durable, human-in-the-loop product workflows.
- UI still likely becomes Web UI inside Tauri, which means TypeScript remains necessary.

### Fit For Artificial Developer

Rust is a strong future sidecar/runtime candidate, especially for a secure local daemon or desktop shell, but it is too heavy as the main MVP language.

Recommended usage later:

- Native daemon
- Worktree/process sandboxing
- File watcher
- Desktop shell via Tauri
- Performance-sensitive local workers

## Go

### Strengths

- Excellent for CLIs, daemons, process supervision, networking, and static binaries.
- First-class gRPC support and strong protobuf tooling.
- Temporal/Cadence workflow ecosystem is strongest here, with very good operational patterns.
- Fast compile/run loop and straightforward deployment.
- Good fit for long-running local services.

### Weaknesses

- UI story is weaker. Wails/Fyne/Gio exist, but React/Vite still gives a better dashboard.
- AI SDK ecosystem is decent but less rich than TypeScript/Python.
- If the UI is TypeScript anyway, Go introduces a cross-language boundary from day one.
- Less natural for prompt/template-heavy agent product code than TypeScript/Python.

### Fit For Artificial Developer

Go is the strongest alternative if the product becomes a **local daemon first** with strict process supervision and gRPC worker APIs. For the MVP, it adds complexity because the UI and much of the AI-agent ecosystem still pull toward TypeScript.

Recommended usage later:

- Durable local daemon
- Worker process manager
- gRPC service boundary
- High-concurrency log/event streaming

## Workflow Engine Comparison

| Stack | Workflow options | Fit |
|-------|------------------|-----|
| TypeScript | Aiki, custom file-backed FSM, XState-like state machines | Best aligned with current architecture and MVP speed. |
| Python | LangGraph, Prefect, Temporal SDK, custom FSM | Strong AI workflow ecosystem, but product packaging is harder. |
| Rust | Custom FSM, bindings to external engines, limited durable workflow choices | Good for low-level runtime, weak for fast product workflow iteration. |
| Go | Temporal/Cadence, custom FSM | Best durable workflow maturity, but adds UI/AI boundary complexity. |

Recommendation:

- Start with **Aiki or a custom file-backed FSM** in TypeScript.
- Keep workflow interfaces clean: `WorkflowEngine`, `RunController`, `StageExecutor`, `TaskManager`.
- If durability requirements outgrow local files, evaluate **Temporal** later. Go becomes more compelling at that point.

## Multiplatform UI Comparison

| Stack | Best UI path | Notes |
|-------|--------------|-------|
| TypeScript | React/Vite Web UI; Tauri later | Best MVP and product UX path. |
| Python | Web UI with separate frontend; Qt/Kivy/Flet if native | Native options exist, but not ideal for this product. |
| Rust | Tauri + Web UI; egui/iced for native | Great packaging later, but UI still likely TS/React. |
| Go | Wails + Web UI; Fyne/Gio for native | Viable, but less polished ecosystem than React/Vite. |

Recommendation:

- MVP: local Web UI at `localhost:9477`.
- Later: Tauri wrapper around the same Vite UI and local API.

## AI-Agent Integration Comparison

| Stack | Integration quality | Notes |
|-------|---------------------|-------|
| TypeScript | Excellent | Best balance across web APIs, SDKs, CLIs, Playwright, and local app code. |
| Python | Excellent | Best for AI research/evals/model tooling, but weaker app packaging. |
| Rust | Medium | Good HTTP/process primitives; fewer first-party AI SDKs. |
| Go | Good | Strong systems integration; fewer high-level agent libraries. |

Recommendation:

- Use TypeScript for core adapters.
- Allow subprocess adapters so Python, Go, Rust, or shell integrations can participate without becoming core dependencies.

## RPC and gRPC Recommendation

Do **not** make gRPC the first API surface. The MVP is local and benefits more from simple browser-friendly APIs:

- **Dashboard API:** REST + SSE via Hono
- **CLI to local server:** REST or direct in-process calls
- **Live logs/events:** SSE, because it is simple and browser-native
- **Adapter/plugin boundary:** subprocess contract plus JSON over stdio

Add RPC when the product has separate long-running processes or cross-language workers.

Recommended progression:

| Phase | Protocol | Why |
|-------|----------|-----|
| MVP | REST + SSE | Simple, browser-native, easy to debug. |
| Plugin/adapters | JSON-RPC over stdio | Great for local subprocess tools and agent adapters. |
| Multi-process local daemon | ConnectRPC | Protobuf contracts with browser-friendly HTTP support. |
| Remote/cloud workers | gRPC | Strong streaming, typed contracts, and mature infra. |

If we choose an RPC stack later, prefer **ConnectRPC** before raw gRPC for product APIs because it supports protobuf contracts while remaining friendlier to browsers and local HTTP debugging. Use raw gRPC for internal worker-to-daemon communication only when streaming and cross-language performance justify it.

## Final Recommendation

For v0.1:

1. Use **TypeScript** as the product language.
2. Use **React/Vite** for UI and **Hono** for the local API.
3. Use **REST + SSE** first, not gRPC.
4. Use **Aiki** if practical; otherwise implement the documented file-backed workflow interfaces.
5. Keep adapters subprocess-friendly so Python, Go, and Rust integrations can be added later.
6. Revisit **Go** if the product becomes daemon/worker-heavy.
7. Revisit **Rust/Tauri** when desktop packaging becomes a priority.

The practical path is TypeScript now, polyglot at the edges later.
