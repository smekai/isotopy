# Model and Harness Strategy

**Purpose:** Single reference for how ADHD uses **Claude Code**, **Cursor CLI**, and LLM API providers across pipeline stages. Consolidates decisions spread across [product-brief.md](product-brief.md), [technical-architecture.md](technical-architecture.md), and [mvp-scope.md](mvp-scope.md).

For adapter implementation details, see the Harness adapter layer in [technical-architecture.md](technical-architecture.md).

---

## Two agent kinds

ADHD distinguishes two ways a stage gets work done:

### LLM stage agents

Used for stages that produce **documents and decisions** — not code edits.

- Prompt templates in `.adhd/agents/<stage>.md`
- Context injected from prior artifacts, `AGENTS.md`, and `.adhd/context/*`
- Provider via LiteLLM or direct API (Anthropic, OpenAI, Ollama)
- Output written to stage artifact paths; parsed for gate checks

### Harness agent (implementation)

Used for the **implementation stage** — code changes in an isolated git worktree.

- Delegates to a `HarnessAdapter` (Claude Code, Cursor CLI, or generic subprocess)
- Prompt built from `requirements.md` + `design.md` + implementation template
- Does not share chain-of-thought with the review agent (blind review rule)

---

## Primary harnesses (v0.1)

| Harness | CLI | Role | Status |
|---------|-----|------|--------|
| **Claude Code** | `claude` | Headless implementation agent | Planned ([TASK-007](../.tasks/BACKLOG.md)) |
| **Cursor CLI** | `cursor agent` | IDE-integrated implementation agent | Planned ([TASK-007](../.tasks/BACKLOG.md)) |
| **Generic subprocess** | User-defined | Any CLI command in a worktree | Planned ([TASK-006](../.tasks/BACKLOG.md)) |

The prototype uses **fake agents** (sleep + log). Real harness wiring comes in Milestone C.

---

## Stage-to-tool mapping

| Stage | Agent kind | Tool | Notes |
|-------|-----------|------|-------|
| `intake` | LLM | API provider (Anthropic, OpenAI, Ollama) | Normalizes task/text/issue input |
| `requirements` | LLM | API provider | Produces `requirements.md`; human gate |
| `design` | LLM | API provider | Produces `design.md`, diagrams; human gate |
| `implementation` | **Harness** | **Claude Code or Cursor CLI** | Code in isolated worktree; configurable per run |
| `review` | LLM | API provider | Blind review — receives diff only, not harness logs |
| `test` | LLM + subprocess | API provider + Playwright CLI | Unit checks + E2E; fix loop back to harness |
| `release` | LLM | API provider | PR body, changelog; human gate |
| `deploy` | Subprocess | Deploy adapter (Docker, Vercel, custom) | Platform CLI; human gate before production |

---

## When to use Claude Code vs Cursor

Both are first-class implementation harnesses. The choice is **explicit configuration**, not automatic routing in v0.1.

| Criterion | Claude Code | Cursor CLI |
|-----------|-------------|------------|
| **Environment** | Headless terminal, CI-friendly | IDE-integrated, local dev machine |
| **Model selection** | Anthropic models via Claude Code | Cursor's model routing |
| **Best for** | Automated runs, server/CI pipelines, batch work | Interactive development, IDE context |
| **Invocation** | `claude` subprocess in worktree | `cursor agent` subprocess in worktree |
| **Timeout default** | 30 min (`1800000ms`) | Same adapter contract |

### Decision guide

- **Default to Claude Code** when runs should be fully headless (CI, overnight runs, no IDE open)
- **Default to Cursor CLI** when the developer is actively working in Cursor and wants harness output in the IDE ecosystem
- **Override per run** via `config.yaml` or CLI flag (e.g. `adhd run --harness cursor`)
- **Use subprocess adapter** for any other CLI (OpenHands, Codex, custom scripts)

### Open decisions

- Per-stage harness override (implementation only vs any subprocess stage)
- Auto-fallback if preferred harness is not installed (`healthCheck()` → prompt user)
- Whether test-stage fix loops always reuse the same harness that did implementation

---

## Model providers (LLM stages)

LLM stages use **BYOK** (bring your own key):

| Provider | Use case | Integration |
|----------|----------|-------------|
| **Anthropic** | Requirements, design, review (Claude models) | Direct API or LiteLLM |
| **OpenAI** | Alternative LLM stages | Direct API or LiteLLM |
| **Ollama** | Fully local, no cloud dependency | Local endpoint |
| **LiteLLM** | Unified proxy for any provider | Single config point |

Harness stages (Claude Code, Cursor) bring **their own model selection** — ADHD does not route models for harness invocations.

Configuration lives in `.adhd/config.yaml` at the project level. Keys are stored locally, never committed.

---

## Configuration example

```yaml
harness:
  default: claude-code
  adapters:
    claude-code:
      type: claude-code
      command: claude
      timeoutMs: 1800000
    cursor:
      type: cursor
      command: cursor
      args: ["agent"]

llm:
  default: anthropic
  providers:
    anthropic:
      model: claude-sonnet-4-20250514
    openai:
      model: gpt-4o
    ollama:
      baseUrl: http://localhost:11434
      model: llama3
```

Full schema: [technical-architecture.md — Harness adapter layer](technical-architecture.md#harness-adapter-layer).

---

## Working across Cursor and Claude Code

A common workflow:

1. **Develop ADHD itself** (or any project) in **Cursor** — editing specs, reviewing runs, approving gates
2. **Run implementation stages** via **Claude Code** harness — headless code generation in a worktree
3. **Review results** back in Cursor — diff review, gate approval, stage restart

ADHD is the orchestrator; Cursor and Claude Code are **tools it delegates to**, not replacements for each other. The dashboard shows run progress regardless of which harness is active.

---

## Prototype to MVP path

| Phase | Harness state | Task |
|-------|--------------|------|
| **Now** | Fake agents (sleep + log) | TASK-003, TASK-004 (done/in progress) |
| **Milestone B** | File-backed workflow, subprocess stages | TASK-005 |
| **Milestone C** | Generic subprocess adapter | TASK-006 |
| **Milestone C** | Claude Code + Cursor CLI adapters | TASK-007 |

---

## Non-goals (v0.1)

- No automatic routing between Claude and Cursor based on task type or complexity
- No model selection UI in the dashboard (config file only)
- No multi-harness parallel implementation (one harness per run)
- No harness session sharing or context passthrough between Claude Code and Cursor
