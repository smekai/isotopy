# Competitor Matrix: ADHD

**Last updated:** June 2026  
**Purpose:** Map adjacent products, explain what each category misses, and show where ADHD wins on **ongoing local ownership** — not just first-version generation.

---

## Category Overview

| Category | What it optimizes for | Relationship to our idea |
|----------|----------------------|--------------------------|
| **Direct lifecycle orchestrators** | Full lifecycle from spec to ship | Closest competitors |
| **Spec / workflow layers** | Requirements → tasks before coding | Partial overlap (upstream) |
| **App builders** | Prompt → working app fast | Adjacent (different buyer) |
| **Enterprise lifecycle platforms** | Org-scale agent coordination | Adjacent (cloud/team-first) |
| **Agent frameworks** | Build custom multi-agent graphs | Building blocks, not product |
| **Coding-agent runtimes** | Single-session implementation | Harnesses we would orchestrate |

---

## 1. Direct Lifecycle Orchestrators (Closest Competitors)

| Product | Local-first | Full lifecycle | Restartable stages | Harness-agnostic | Visual workflow | Maturity |
|---------|-------------|----------------|--------------------|------------------|-----------------|----------|
| **aiagentflow** | Yes (CLI) | Partial (architect→ship) | Limited | API providers, not IDE harnesses | TUI dashboard | Early OSS |
| **autonomous-sdlc** | Yes (repo-scaffolded) | Yes (11 phases) | Phase-level | IDE integrations (9 IDEs) | CLI + dashboard | Early OSS |
| **Sikula** | Yes | Partial (task→branch) | Resume runs | Codex, Claude, Gemini, OpenCode | CLI | Early OSS |
| **AI-SDLC** | Yes (self-hosted) | Yes (issue→PR pipeline) | Worktree-based | Claude, Copilot, Cursor, Codex | Operator TUI | Early OSS |
| **loki-mode** | Yes | Yes (PRD→deploy) | RARV cycles | Claude Code primary; others degraded | CLI | Early OSS |
| **Overcut** | No (SaaS) | Yes (triage→release) | Workflow config | Git/ticket-native | Drag-and-drop | Commercial |
| **OpenCastle / SDLC Orchestrator** | Partial | Yes (governance-heavy) | Gate-based | Cursor, Claude, Copilot, etc. | Web/control plane | Niche OSS |

**What they miss:** Developer-facing CLI/TUI, limited visual run control, weak prompt-to-app first-run UX, and no unified deploy + E2E story. **Why not popular:** too early, too fragmented, require assembling your own stack.

**Gap:** Few combine *local-first* + *visual run control* + *plug any harness* + *restart single stage* + *Playwright E2E* + *deploy adapters* in one product.

---

## 2. Spec & Workflow Layers (Upstream / Partial)

| Product | Focus | Lifecycle coverage | Local | Harness support |
|---------|-------|-------------------|-------|-----------------|
| **spec-manager** | L0–L3 specs, task lifecycle | Requirements → implementation spec | Yes (markdown + git) | Claude, Codex, Cursor, Windsurf |
| **Specmint** | Research-first SPEC.md | Specify → plan → implement | Yes (`.specs/`) | Universal skill (any agent) |
| **spec-intelligence** | Visual spec + kanban | Specify → clarify → plan → tasks | Yes (Tauri desktop) | File-first, agent-agnostic |
| **SpecMaker** | Multi-agent doc authoring | Requirements → design → tasks | Yes (SQLite) | Claude, Codex, Cursor |
| **OpenSpec / BMAD-style flows** | Spec-driven dev patterns | Varies | Repo-local | Depends on IDE |

**What they miss:** Implementation, E2E testing, deployment, and a runnable end-to-end pipeline. **Why not popular:** upstream-only tools feel like extra process, not a product.

**Gap:** Strong on artifacts and gates; weak on orchestrating implementation, Playwright E2E, deploy, and release as a unified runnable pipeline.

**Our built-in tasks:** ADHD includes repo-native task backlog (`.adhd/tasks/`) that feeds the lifecycle pipeline — not a standalone kanban or Jira clone. We compete with spec/task layers only at **intake**; our differentiator remains full lifecycle execution through deploy. Borrow task contracts from Sikula, artifact hierarchy from spec-manager, kanban mental model from spec-intelligence — but tasks spawn runs, not the reverse.

---

## 3. App Builders (Adjacent — First Version vs Evolution)

| Product | Local | OSS | Stack lock-in | Lifecycle | Ongoing evolution | Target user |
|---------|-------|-----|---------------|-----------|-------------------|-------------|
| **Hosted prompt-to-app** | No | No | High (hosted) | Prompt → deploy | Weak (debug loops, side effects) | Non-dev / founder |
| **Bolt / v0** | No | No | Medium–high | Prompt → prototype | Weak | Designer / founder |
| **Replit Agent** | No | No | High (Replit) | Prompt → hosted app | Platform-bound | General |
| **Dyad** | Yes | Partial | Low (export code) | Chat → app | Chat-only iteration | Power user |
| **Locode** | Yes | Yes | Low (Ollama local) | Prompt → React app | Reprompt modes; Playwright auto-fix | Self-hoster |
| **Tinykit** | Yes | Yes | Medium (PocketBase) | Agent → deploy | Self-hosted but template-bound | Self-hoster |
| **Singulary** | Yes | Yes | Medium (templates) | Chat → containerized app | Docker workspaces, limited stages | Self-hoster |
| **Pythagora** | Extension | No | React/Node only | Plan → code → test → AWS | Extension-scoped | Semi-technical |
| **Doable** | Yes | Yes | Medium | Multi-tenant app builder | Team builder, not dev lifecycle | Teams |
| **Tesslate Studio** | Yes | Partial | Medium (marketplace stacks) | Agent → full-stack | Template marketplace | Self-hoster |

**What they miss:** Durable multi-stage lifecycle, explicit repo artifacts, stage restart, blind review, and deploy-anywhere without template lock-in. **Why not popular:** Dyad/Locode/Singulary are gaining traction but still optimize for *generation*, not *governed evolution* on arbitrary repos.

**Gap:** Optimized for *speed to demo*, not *predictable iteration 2+*, *stage restart*, or *arbitrary repo/stack with full audit trail*.

---

## 4. Enterprise Lifecycle Platforms (Cloud / Team-First)

| Product | Deployment | Lifecycle stages | Harness model | Best for |
|---------|------------|------------------|---------------|----------|
| **Augment Cosmos** | Cloud + self-host VMs | Triage → spec → impl → review → test → deploy | Own expert registry + runtime | 10+ eng teams |
| **Factory (Software Factory)** | Cloud | Triage → codegen → validate → release → monitor | Droid agents (proprietary) | Enterprise automation |
| **Codegen** | Cloud (ClickUp-owned) | Trigger → sandbox → PR → auto-fix CI | Proprietary agents | Ticket-driven PR factory |
| **AgentIQ** | AWS Marketplace | 30+ pre-built SDLC agents | Platform agents | Enterprise governance |
| **Augment (guides)** | — | Agentic SDLC concept | Orchestration layer above assistants | Thought leadership |

**What they miss:** Local-first, BYOK models, bring-your-own Cursor/Claude session, and indie/small-team affordability. **Why not popular (for our user):** enterprise sales cycle, cloud dependency, proprietary agents.

**Gap:** Strong governance and integrations; not local-first, not “bring your own Cursor/Claude Code session.”

---

## 5. Agent Frameworks (Build vs Buy)

| Framework | Type | Lifecycle opinion | Local | Use case |
|-----------|------|-------------------|-------|----------|
| **Aiki** | Code (TypeScript) | Durable workflows (you design stages) | Yes | Long-running agent pipelines, HITL gates |
| **LangGraph** | Code (Python) | None (you design graph) | Yes | Custom state machines |
| **CrewAI** | Code (Python) | Role-based crews | Yes | Rapid multi-agent prototypes |
| **AutoGen** | Code (Python) | Conversation-centric | Yes | Research / open-ended tasks |
| **n8n** | Visual + self-host | Generic automation | Yes | Integrations + AI nodes |
| **Langflow / Flowise** | Visual | LLM flows | Yes | Prototyping chains |
| **Rivet** | Visual logic | Agent logic design | Yes | TypeScript teams |

**What they miss:** Product-level stages, git isolation, harness adapters, deploy adapters, and dashboard out of the box. **Why not popular as products:** frameworks require engineering to become a product.

**Gap:** Frameworks give flexibility; they do not ship app-builder stages, git isolation, Playwright E2E, or deploy adapters out of the box.

---

## 6. Coding-Agent Runtimes (Harnesses, Not Orchestrators)

| Runtime | Mode | Autonomy | Local | Role in our stack |
|---------|------|----------|-------|-------------------|
| **Cursor** | IDE | Medium (agent in editor) | Yes | Implementation harness |
| **Claude Code** | CLI/IDE | High | Yes | Implementation harness |
| **OpenHands** | Web/CLI/SDK | High (sandboxed) | Yes | Implementation harness |
| **Aider** | Terminal | Medium (pair programmer) | Yes | Implementation harness |
| **Cline** | VS Code ext | Medium (plan/act) | Yes | Implementation harness |
| **SWE-agent** | Headless | High (benchmark-oriented) | Yes | Research / CI harness |
| **Codex (OpenAI)** | CLI/API | High | Partial | Implementation harness |

**Gap:** Single-task, single-session tools. No cross-stage artifact handoff or workflow dashboard.

---

## Feature Comparison (Our Target vs Best-in-Class)

| Capability | Our target | Closest existing | Notes |
|------------|-----------|------------------|-------|
| Local artifact store (git-native) | Required | spec-manager, Sikula | Table stakes |
| Built-in task backlog (feeds runs) | Required | spec-intelligence (kanban), spec-manager (task lifecycle) | Intake only; we execute full pipeline |
| Predefined lifecycle stages | Required | autonomous-sdlc, aiagentflow | Need editable templates |
| Restart one failed stage | Required | Sikula (partial), LangGraph (DIY) | Key differentiator |
| Adapter: Cursor / Claude Code | Required | OpenCastle, skillfold (config) | No polished unified product |
| Playwright E2E in pipeline | Required | Locode, Open Orchestra | App builders partial; orchestrators rare |
| Deploy to any platform | Required | Tinykit, Singulary (limited) | Hosted builders = platform lock-in |
| Ongoing evolution (v2+) | Required | None cleanly | **Core wedge** |
| Human approval gates | Required | spec-manager, autonomous-sdlc | Common in spec tools |
| Visual run dashboard | Required | aiagentflow TUI, Factory web | CLI-only is common |
| Worktree isolation per run | Required | Sikula, AI-SDLC | Not universal |
| Release / PR automation | Required | Codegen, Factory | Often cloud-only |

---

## Positioning Map

```
High control / low-level                    High speed / low-level
        │                                              │
        │   [ADHD]                   │
        │   Local app builder + evolution            │
        │                                              │
        │   Sikula, aiagentflow,                     │
        │   autonomous-sdlc, spec-manager            │
        │                                              │
────────┼──────────────────────────────────────────────┼────────
        │                                              │
        │   LangGraph, CrewAI, Aiki, n8n             │   Bolt, v0,
        │   (build your own)                           │   Dyad, Locode, Singulary
        │                                              │
        │   Augment Cosmos, Factory, Codegen           │
        │   (enterprise cloud)                         │
        │                                              │
Low abstraction                             High abstraction
```

---

## Strategic Takeaways

1. **The idea is validated** — hosted app builders prove demand for AI app building; Dyad/Locode prove local OSS appetite; Sikula/autonomous-sdlc prove lifecycle orchestration demand. The gap is **combining them**.

2. **Compete on iteration, not just v1 speed** — message: "build the first version, then keep building without losing control."

3. **Borrow patterns from:**
   - **Dyad** — first-run UX and speed expectations
   - **Locode** — Playwright auto-fix in generation loop
   - **Sikula** — worktree isolation, task contracts, auditable state
   - **spec-manager** — L1/L2/L3 artifact hierarchy and confirm gates
   - **spec-intelligence** — kanban/backlog mental model (tasks feed runs, not standalone PM)
   - **Aiki** — durable TypeScript workflows, HITL event suspension, crash recovery
   - **n8n** — visual workflow mental model (stages as nodes)

4. **MVP wedge:** "Capture tasks in repo-native backlog, run a feature through requirements → design → implement → review → test (Playwright E2E) → release → deploy" on your machine, with one-click restart of any stage.

---

## Sources & Links

| Product | URL |
|---------|-----|
| aiagentflow | https://github.com/aiagentflow/aiagentflow |
| autonomous-sdlc | https://github.com/bitbitcodes/autonomous-sdlc |
| Sikula | https://github.com/sikula-ai/sikula |
| spec-manager | https://github.com/loki-ai-ch/spec-manager |
| AI-SDLC | https://ai-sdlc.io |
| Overcut | https://overcut.ai |
| Augment Cosmos | https://www.augmentcode.com/product/cosmos |
| Factory | https://factory.ai/product/software-factory |
| Codegen | https://docs.codegen.com |
| Dyad | https://dyad.sh |
| Locode | https://github.com/locode-dev/locode |
| Tinykit | https://github.com/tinykit-studio/tinykit |
| Singulary | https://github.com/sammwyy/singulary |
| Aiki | https://github.com/aikirun/aiki |
| LangGraph | https://langchain.com/langgraph |
| OpenHands | https://www.openhands.dev |
