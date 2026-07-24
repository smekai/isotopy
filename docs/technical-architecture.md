# Technical Architecture: ADHD

**Version:** 0.1 draft  
**Stack recommendation:** TypeScript (CLI + API + UI) on Node.js; pnpm workspaces monorepo; Hono API; React/Vite dashboard; file-based persistence. Python acceptable for agent subprocess glue. Optional future Tauri desktop shell — not MVP.

---

## System context

```mermaid
flowchart TB
    subgraph userMachine [User Machine]
        CLI[CLI adhd]
        UI[Local Dashboard]
        Orch[Orchestrator Core]
        TaskMgr[TaskManager]
        State[State Store]
        Artifacts[Artifact Store]
        WT[Git Worktree Manager]
        Adapters[Harness Adapters]
        DeployAdapters[Deploy Adapters]
        E2E[Playwright Runner]

        CLI --> Orch
        CLI --> TaskMgr
        UI --> Orch
        UI --> TaskMgr
        Orch --> State
        Orch --> Artifacts
        Orch --> WT
        Orch --> Adapters
        Orch --> DeployAdapters
        Orch --> E2E
        TaskMgr --> State
    end

    subgraph external [External - BYOK]
        LLM[LLM APIs]
        Harness[Cursor / Claude Code / etc]
        GH[GitHub CLI]
        Platforms[Vercel / Docker / custom CLI]
    end

    Adapters --> Harness
    DeployAdapters --> Platforms
    Orch --> LLM
    Orch --> GH
    WT --> Repo[(Target Git Repo)]
    Artifacts --> Repo
```

---

## Core components

### 1. Orchestrator

Central state machine. Responsibilities:

- Load workflow definition (default pipeline YAML)
- Transition stages based on agent output and gate results
- Spawn stage agents (LLM-backed or harness-backed)
- Emit events to `events.jsonl`
- Handle pause at human gates
- Implement restart semantics (partial re-run)

**Key modules:**

| Module | Responsibility |
|--------|----------------|
| `WorkflowEngine` | Parse pipeline, validate transitions |
| `RunController` | CRUD for runs, cancel, restart |
| `TaskManager` | CRUD for tasks, status, link runs to tasks |
| `StageExecutor` | Invoke agent for one stage |
| `GateEvaluator` | Run soft/hard gates on artifacts |
| `EventBus` | Internal pub/sub; fan-out to UI SSE |

### 2. Task management

**TaskManager** handles repo-native backlog items. Tasks are independent of run state; a task can spawn multiple runs over time.

**Storage:**

| File | Purpose |
|------|---------|
| `.adhd/tasks/index.json` | Machine-readable summaries for fast listing and filtering |
| `.adhd/tasks/<task-id>.md` | Human-readable detail: title, description, acceptance criteria, run history |

**index.json shape:**

```json
{
  "nextId": 2,
  "idPrefix": "TASK",
  "tasks": [
    {
      "id": "TASK-001",
      "title": "Add dark mode toggle",
      "status": "in_progress",
      "priority": "P1",
      "tags": ["ui", "accessibility"],
      "runIds": ["a1b2c3"],
      "createdAt": "2026-06-28T09:00:00Z",
      "updatedAt": "2026-06-28T10:00:00Z"
    }
  ]
}
```

**Task statuses:** `backlog` | `ready` | `in_progress` | `blocked` | `done` | `rejected`

**Task markdown format** (`.adhd/tasks/TASK-001.md`):

```markdown
# TASK-001: Add dark mode toggle

**Status:** in_progress | **Priority:** P1 | **Tags:** ui, accessibility

## Description

User-toggleable dark mode with system preference detection.

## Acceptance criteria

- Toggle in settings persists across sessions
- Respects `prefers-color-scheme` when set to "system"

## Runs

- a1b2c3 (running) — started 2026-06-28
```

**Run linkage:** `state.json` gains optional `taskId`:

```json
{
  "runId": "a1b2c3",
  "taskId": "TASK-001",
  "slug": "dark-mode-toggle",
  ...
}
```

When a run completes or fails, TaskManager can update task status (configurable; default: manual).

### 3. Workflow state

**File:** `.adhd/runs/<run-id>/state.json`

```json
{
  "runId": "a1b2c3",
  "taskId": "TASK-001",
  "slug": "dark-mode-toggle",
  "status": "running",
  "currentStage": "implementation",
  "inputRef": "intake/raw-input.md",
  "worktree": {
    "path": ".adhd/worktrees/a1b2c3",
    "branch": "adhd/dark-mode-toggle-a1b2c3",
    "baseBranch": "main"
  },
  "stages": {
    "requirements": {
      "status": "passed",
      "startedAt": "2026-06-28T10:00:00Z",
      "completedAt": "2026-06-28T10:05:00Z",
      "attempts": 1,
      "artifacts": ["requirements/requirements.md"]
    },
    "design": {
      "status": "awaiting_approval",
      "startedAt": "2026-06-28T10:05:30Z",
      "attempts": 1,
      "artifacts": ["design/design.md"]
    }
  },
  "gates": {
    "req_gate": { "status": "approved", "approvedBy": "human", "at": "..." }
  },
  "harness": "claude-code",
  "cost": { "inputTokens": 0, "outputTokens": 0, "usd": 0 }
}
```

**Stage statuses:** `pending` | `running` | `passed` | `failed` | `awaiting_approval` | `skipped`

**Run statuses:** `pending` | `running` | `paused` | `completed` | `failed` | `cancelled`

### 4. Event log (audit trail)

**File:** `.adhd/runs/<run-id>/events.jsonl`

One JSON object per line:

```json
{"ts":"2026-06-28T10:00:01Z","type":"stage.started","stage":"requirements","runId":"a1b2c3"}
{"ts":"2026-06-28T10:05:00Z","type":"stage.completed","stage":"requirements","verdict":"pass"}
{"ts":"2026-06-28T10:05:01Z","type":"gate.awaiting","gate":"req_gate"}
{"ts":"2026-06-28T10:06:00Z","type":"gate.approved","gate":"req_gate","actor":"human"}
```

Enables dashboard live tail and post-run forensics.

---

## Workflow runtime (OpenWorkflow)

**Decision (TASK-066/068):** the durable workflow runtime is
[OpenWorkflow](https://github.com/openworkflowdev/openworkflow) — Apache-2.0,
TypeScript, durable execution on an embedded SQLite file via Node's built-in
`node:sqlite`, no server. It runs in-process inside the single manually-started
runner (its worker embeds; there is no daemon). Chosen over Aiki (Postgres-only
today) and DBOS (Postgres-only) because it is the only candidate that pairs an
embedded file DB with Windows support while shipping durable gates, durable
sleep, retries and crash recovery. See
[`workflow-runtime-options.md`](workflow-runtime-options.md) for the full
comparison; Aiki remains the recorded second choice.

**Why OpenWorkflow:**

| Need | OpenWorkflow capability |
|------|-------------------------|
| Long-running agent runs | Durable steps with memoised checkpoint/resume |
| Human approval gates | `step.waitForSignal` + `client.sendSignal` |
| Stage retries | `RetryPolicy` (`maximumAttempts` + backoff) per workflow/step |
| Crash recovery | Worker resumes from the last completed step (SQLite lease/heartbeat) |
| Durable timers | `step.sleep` survives restart (TASK-061 shape) |
| Local-first | In-process worker; the SQLite file lives inside `.adhd/` and travels with the project |

**Layering** (the durable runtime owns the *whole* lifecycle, not one method —
see `workflow-runtime-options.md` §4):

```
┌─────────────────────────────────────────┐
│  ADHD-owned                             │
│  definitions, agents, artifacts,        │
│  engine adapters, subprocess kill (G4)  │
├─────────────────────────────────────────┤
│  workflow/ (durable runtime)            │
│  RunOrchestrator hosts OpenWorkflow;    │
│  pipeline-workflow = the run loop,      │
│  stage-execution = the durable step     │
├─────────────────────────────────────────┤
│  db/ — one shared .adhd/runs.db         │
│  OpenWorkflow's tables (SoT) +          │
│  runs/events read-model projection      │
└─────────────────────────────────────────┘
```

Each pipeline **stage** is a durable step; a `gateAfter` stage parks on
`waitForSignal` and `approveGate` sends the matching signal. Semantic restart
(S2) and one-active-run-per-project (S5) are ADHD-owned on top (a seeded fresh
run, and a project-keyed admission guard). Subprocess-tree kill on cancel (G4)
stays ADHD-owned; `cancelWorkflowRun` only marks durable state.

**Fallback (not taken):** if the runtime had failed to embed in-process, the
same six capabilities were to be built on the same `node:sqlite` substrate behind
the repository seam — so the storage work is preserved either way.


---

## Git worktree isolation

Pattern borrowed from Sikula and AI-SDLC.

```mermaid
sequenceDiagram
    participant Orch as Orchestrator
    participant Git as Git
    participant WT as Worktree
    participant Harness as Harness Adapter

    Orch->>Git: git worktree add .adhd/worktrees/runId -b adhd/slug-runId
    Orch->>Harness: run(worktreePath, implementationPrompt)
    Harness->>WT: edit files, commit
    Orch->>Git: run tests in worktree
    alt success
        Orch->>Git: optional push branch
    else failure
        Orch->>Orch: preserve worktree for inspection
    end
```

**Rules:**

- Worktree created before `implementation` stage (or at run start if config says so)
- Base branch from config (`main` default)
- Dirty tracked files on base branch: block run with clear error (like Sikula)
- On cancel: worktree preserved; on success: worktree removed, branch kept
- `restart --from implementation`: reuse existing worktree if present

---

## Agent model

Two agent kinds:

### LLM stage agents (requirements, design, review, release, deploy)

- Prompt templates in `.adhd/agents/<stage>.md`
- Context injected: prior artifacts, project `AGENTS.md`, `.adhd/context/*`
- Provider via LiteLLM or direct API (Anthropic, OpenAI, Ollama)
- Output written to stage artifact paths; parsed for gate checks

### Harness agent (implementation)

- Delegates to `HarnessAdapter`
- Prompt built from `requirements.md` + `design.md` + implementation template
- Does not share chain-of-thought with review agent (blind review)

**Blind review rule:** Review agent receives task description, requirements, design summary, and `git diff` only — not implementation agent logs.

### Test agent (unit + Playwright E2E)

- Runs configured unit/integration command in worktree
- Runs Playwright E2E (`npx playwright test` default)
- Optionally starts dev server via `e2eStartServer` config before E2E
- On failure: emits `e2e-report.json`, optional trace paths; triggers fix loop to implementation harness
- Can use Playwright Test Agents (planner/generator/healer) to bootstrap specs for greenfield apps

---

## Deploy adapter layer

```mermaid
classDiagram
    class DeployAdapter {
        +id: string
        +deploy(ctx: DeployContext): DeployResult
        +healthCheck(): boolean
    }
    class SubprocessDeployAdapter {
        +command: string
        +deploy()
    }
    class DockerComposeAdapter {
        +deploy()
    }
    class VercelAdapter {
        +deploy()
    }
    DeployAdapter <|-- SubprocessDeployAdapter
    DeployAdapter <|-- DockerComposeAdapter
    DeployAdapter <|-- VercelAdapter
```

**Registration:** `config.yaml`:

```yaml
deploy:
  default: docker-compose
  environment: preview
  adapters:
    docker-compose:
      type: subprocess
      command: docker compose up -d --build
      cwd: worktree
    vercel:
      type: vercel
      command: vercel
      args: ["deploy"]
```

Deploy stage runs after release gate approval. Production deploy requires explicit config + human gate.

---

## Harness adapter layer

For when to use Claude Code vs Cursor and stage-to-tool mapping, see [model-and-harness-strategy.md](model-and-harness-strategy.md).

```mermaid
classDiagram
    class HarnessAdapter {
        +id: string
        +run(ctx: HarnessContext): HarnessResult
        +healthCheck(): boolean
    }
    class ClaudeCodeAdapter {
        +run()
    }
    class CursorAdapter {
        +run()
    }
    class SubprocessAdapter {
        +command: string
        +run()
    }
    HarnessAdapter <|-- ClaudeCodeAdapter
    HarnessAdapter <|-- CursorAdapter
    HarnessAdapter <|-- SubprocessAdapter
```

**Registration:** `config.yaml`:

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
```

**SubprocessAdapter** allows power users to wire any CLI without code changes.

---

## Restart and resume semantics

| Command | Behavior |
|---------|----------|
| `adhd run` (new) | New `runId`, fresh state |
| `adhd resume <runId>` | Continue from `currentStage` if paused/failed |
| `adhd restart <runId> --from <stage>` | Mark stage and all downstream as `pending`; keep upstream artifacts |
| `adhd restart <runId> --from <stage> --fresh` | Delete downstream artifacts; re-run stage from scratch |

**Implementation detail:** Restart invalidates stage entries in `state.json` from the target stage forward; does not delete upstream artifact files (unless `--fresh`).

---

## Artifact storage strategy

### Where a project's data lives

A **project** is a directory that owns its own `.adhd/`, the way a repository
owns its `.git/`. History travels with the code and is isolated by construction.
Nothing is anchored to the ADHD checkout: `paths.ts` exports a `ProjectPaths`
value (`id`, `root`, `dataDir`) that callers receive, and `REPO_ROOT` survives
only for loading the tool's own `.env`.

| Location | Holds | Scope |
|----------|-------|-------|
| `<project>/.adhd/runs/<run-id>/` | `state.json`, `events.jsonl`, per-stage `handoff.md` | One project |
| `<project>/.adhd/skills/<id>.project.md` | Persona **addendum** — project tweaks only | One project |
| `<project>/.adhd/skills/<id>.md` | Full persona replacement (power users) | One project |
| `<project>/.adhd/.gitignore` | `*` — the folder ignores itself by default | One project |
| `~/.adhd/projects.json` | Known projects (paths + metadata) and the active one | User |
| `~/.adhd/settings.json` | Engine connection modes and **API keys**, plus project preferences (engine, model, permission mode, pipeline, disabled stages), `defaults` + per-project overrides, mode `0600` | User |
| `~/.adhd/skills/<id>.md` | User-level persona override of the bundled default | User |
| `~/.adhd/home/runs/<run-id>/workspace/` | Scratch working folder — **home runs only** | User |
| `~/.adhd/home/` | Data root of the **home** project — the fallback when no project is selected | User |

**A run works in its project's folder.** The working directory is derived, never
requested: `resolveWorkspace(paths, runId)` returns the project root, or — for
the home project, which has no code of its own — a scratch
`runs/<run-id>/workspace/` used by that run alone. A client cannot name the
directory an agent runs in; it selects a *project*, and the project's root is
fixed when it is registered. Run artifacts always stay in the per-run folder
under `.adhd/`, which ignores itself from git.

**Secrets never enter a project folder.** `<project>/.adhd/` sits in the user's
git working tree, so credentials live only in the user-level store, keyed by
project id, with user-level defaults a new project inherits until it overrides
them.

**Skills layer rather than replace:** bundled default (`domain/skills/defaults.generated.ts`)
→ user-level override → project addendum appended. Nothing is written to disk on
read, so improvements to a bundled persona keep reaching every project.

**Resolving the active project:** the registry names one, and any request may
override it with an `X-ADHD-Project` header. Run-scoped routes (`/runs/:id/...`)
need no project — run ids are globally unique, which is also why SSE works
without a header.

`ADHD_HOME` overrides the home project's data directory and `ADHD_USER_HOME` the
user-level root; both exist so tests get isolated roots.

### Promotion

| Artifact type | Location | Git tracked? |
|---------------|----------|--------------|
| Tasks | `.adhd/tasks/` | Optional (gitignore by default) |
| Run state, events | `<project>/.adhd/runs/` | No (self-ignoring by default) |
| Approved specs | `specs/<slug>/` | Yes (on user opt-in) |
| Code changes | `adhd/*` branch | Yes (normal git) |
| Agent prompts | `.adhd/agents/` | Yes (team customization) |
| Project context | `.adhd/context/` | Yes |

**Principle:** Machine state is local and reproducible; human-approved artifacts promote into tracked repo paths.

---

## Local dashboard architecture

```
┌─────────────────────────────────────────┐
│  React/Vite SPA (localhost:9477)        │
│  - Task backlog / list                  │
│  - Run list + stage timeline            │
├─────────────────────────────────────────┤
│  REST API (Hono)                        │
│  Tasks:                                 │
│  - GET /tasks, POST /tasks              │
│  - GET /tasks/:id, PATCH /tasks/:id     │
│  - POST /tasks/:id/runs (start run)     │
│  Runs:                                  │
│  - GET /runs, GET /runs/:id             │
│  - POST /runs/:id/approve, /reject      │
│  - POST /runs/:id/restart               │
│  - GET /runs/:id/events (SSE)           │
├─────────────────────────────────────────┤
│  Orchestrator + TaskManager (in-process)│
└─────────────────────────────────────────┘
```

Single binary or `adhd ui` spawns API + static UI. No external database — reads `index.json`, task markdown, `state.json`, and `events.jsonl` directly.

**Packaging note:** MVP uses local server + Web UI. A future Tauri desktop app can wrap the same Hono API and Vite SPA without changing orchestrator design.

---

## Default pipeline definition

**File:** `.adhd/workflows/default.yaml`

```yaml
id: default
version: 1
stages:
  - id: intake
    agent: intake
    gates: []
  - id: requirements
    agent: requirements
    gates: [req_complete]
    humanGate: req_gate
  - id: design
    agent: design
    gates: [design_complete]
    humanGate: design_gate
  - id: implementation
    agent: implementation
    harness: true
    gates: []
  - id: review
    agent: review
    gates: [no_critical_findings]
  - id: test
    agent: test
    gates: [tests_pass]
    onFail: fix_loop
  - id: release
    agent: release
    gates: []
    humanGate: release_gate
  - id: deploy
    agent: deploy
    gates: [deploy_success]
    humanGate: deploy_gate
```

Custom workflows: copy YAML, edit stage list (v0.2 visual editor).

---

## Security considerations

- All execution local; API keys from env or OS keychain
- Harness runs in worktree only; no arbitrary path write
- Subprocess adapter: allowlist or explicit user confirmation for custom commands
- No telemetry by default
- Secrets scanner in review stage (optional gate)

---

## Repository layout (implementation)

```
adhd/
  packages/
    cli/              # adhd CLI entry (Commander or CAC)
    core/             # orchestrator, TaskManager, state machine, gates
    adapters/         # harness adapters
    agents/           # stage agent runners
    server/           # Hono local API for dashboard
    ui/               # React/Vite dashboard SPA
  templates/
    default/          # scaffold .adhd/ on init (incl. tasks/)
  docs/               # product docs (this folder)
```

**Monorepo:** pnpm workspaces. Shared types in `packages/core`.

---

## Suggested build order

1. **Core:** state.json, events.jsonl, workflow YAML parser
2. **TaskManager:** index.json, task markdown CRUD, run linkage
3. **CLI:** `init`, `run`, `task` subcommands (requirements + design only, no harness)
4. **Worktree manager:** git isolation
5. **One harness adapter:** Claude Code
6. **OpenWorkflow integration:** wrap stages as durable steps; gates via signals
7. **Review + test stages** with unit + Playwright E2E fix loop
8. **Deploy adapter:** Docker Compose or generic subprocess
9. **Dashboard:** task backlog + run list + stage timeline + approve
10. **Restart/resume** commands
11. **Second harness adapter:** Cursor or subprocess

---

## Open decisions

| Decision | Recommendation | Rationale |
|----------|----------------|-----------|
| Language | TypeScript | Single codebase for CLI, API, UI |
| Runtime | Node.js | Mature ecosystem for subprocess, git, SSE |
| Monorepo / package manager | pnpm workspaces | Fast, strict, good for monorepos |
| CLI framework | Commander or CAC | Lightweight, widely used |
| API framework | Hono | Compact, typed, good SSE support |
| UI | React + Vite | Fast dev, aligns with dashboard needs |
| Persistence | File-based `.adhd/` | No DB for MVP; index.json + markdown for tasks |
| Desktop packaging | Defer (Tauri later) | Server + Web UI sufficient; Tauri can wrap same stack |
| LLM abstraction | LiteLLM or Vercel AI SDK | Multi-provider, local Ollama |
| Worktree at run start vs impl stage | At implementation | Spec stages don't need branch |
| Commit specs automatically | Opt-in on gate approve | Keeps git clean |
| Workflow runtime | OpenWorkflow (`node:sqlite`, in-process) | Durable execution, gates, retries, crash recovery; embedded file DB, no server |
| E2E runner | Playwright | Industry standard; test agents; trace on failure |
| Deploy model | Adapter-based subprocess/CLI | Platform-agnostic; preview default |
| Fallback (not taken) | Custom engine on the same `node:sqlite` substrate | Same capabilities behind the repository seam if the runtime hadn't embedded |
