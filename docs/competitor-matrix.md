# Competitor Matrix: Isotopy

**Last updated:** August 2026 (added Open SWE; added Guild.ai; refreshed CrewAI; added launch resolution)  
**Purpose:** Map adjacent products, explain what each category misses, and show where Isotopy wins on **ongoing local ownership** — not just first-version generation.

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
| **Agent-workforce platforms** | Horizontal agent org coordination | Indirect but high-gravity (same buyer) |

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
| **beads (bd)** | Dependency-aware issue graph for agents | Task intake / persistent agent memory | Yes (Go + Dolt, git-sync) | Agent-agnostic (JSON output) |
| **OpenSpec / BMAD-style flows** | Spec-driven dev patterns | Varies | Repo-local | Depends on IDE |

**What they miss:** Implementation, E2E testing, deployment, and a runnable end-to-end pipeline. **Why not popular:** upstream-only tools feel like extra process, not a product.

**Gap:** Strong on artifacts and gates; weak on orchestrating implementation, Playwright E2E, deploy, and release as a unified runnable pipeline.

**beads note:** Not a competitor — a **build-on candidate for our task backlog**. `beads` (`bd`) is a *distributed graph issue tracker for AI agents* (Go + Dolt): dependency-aware task graph replacing markdown plans, hash-based IDs to avoid multi-agent merge conflicts, hierarchical epics/tasks/subtasks, `bd ready`/`bd prime` "ready work" detection, and semantic compaction of closed tasks to preserve context. It is pure **intake/memory — it does not implement, test, or ship anything** — so it slots exactly into our `.isotopy/tasks/` backlog role (tasks feed runs, not the reverse). **Decision (TASK-035 spike): borrow the model, stay TS/git-native.** Measured `@beads/bd@1.1.0` on Windows: 145 MB native binary, embedded Dolt as source of truth (gitignored), synced via a separate `refs/dolt/data` channel — breaks our "one install" and git-native-artifact stories. Absorb its three good ideas instead — dependency graph (`dependsOn`), `ready`-work detection as the intake queue, and closed-task compaction — into our own `.isotopy/tasks/` file store. Keep `bd` as a pattern source / validation, not a runtime dep.

**Our built-in tasks:** Isotopy includes repo-native task backlog (`.isotopy/tasks/`) that feeds the lifecycle pipeline — not a standalone kanban or Jira clone. We compete with spec/task layers only at **intake**; our differentiator remains full lifecycle execution through deploy. Borrow task contracts from Sikula, artifact hierarchy from spec-manager, kanban mental model from spec-intelligence — but tasks spawn runs, not the reverse.

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
| **LangGraph** | Code (Python + TypeScript) | None (you design graph) | Yes | Custom state machines |
| **CrewAI** | Code (Python) | Role-based crews + event-driven Flows | Yes | Rapid multi-agent prototypes → production automations |
| **AutoGen** | Code (Python) | Conversation-centric | Yes | Research / open-ended tasks |
| **n8n** | Visual + self-host | Generic automation | Yes | Integrations + AI nodes |
| **Manifold** | Visual + self-host (Go/Vue) | None (long-horizon agent workflows) | Yes | Teams of "specialist" agents; MCP tools auto-exposed as nodes; saved workflows become reusable tools |
| **Langflow / Flowise** | Visual | LLM flows | Yes | Prototyping chains |
| **Rivet** | Visual logic | Agent logic design | Yes | TypeScript teams |

**What they miss:** Product-level stages, git isolation, harness adapters, deploy adapters, and dashboard out of the box. **Why not popular as products:** frameworks require engineering to become a product.

**Manifold note:** The most product-like entry here — self-hosted (Go + Vue, SQLite/Postgres, MIT), ships a visual flow editor, specialist chat, observability dashboard, and scheduled runs (Pulse) out of the box. But it is model-API-driven (OpenAI/Anthropic/Google/llama.cpp/vLLM), not harness-driven: no Claude Code/Cursor adapters, no git/repo artifacts, no SDLC stages, no E2E or deploy story. Self-described **experimental** (~500 stars). Watch it as a pattern source for "workflows as reusable tools" and MCP-tools-as-nodes, not as a direct competitor.

**CrewAI update (Aug 2026):** Now the #2 multi-agent framework by mindshare after LangGraph (~54k stars, v1.15, MIT). Two layers: **Crews** (autonomous teams of role-playing agents — the same "team of professions" metaphor we use) and **Flows** (event-driven workflows with typed state, branching, and native Crew embedding), plus an enterprise platform (AMP). Why it still isn't us: it's a **build-your-own framework** — you write Python to define roles, tasks, and tools; there are no prepared SDLC professions, no repo-native artifacts, no coding-harness adapters (it orchestrates LLM calls, not Claude Code/Cursor sessions), no stage restart, no Playwright E2E, no deploy adapters. Known limits at scale per third-party reviews: coarse error handling, no built-in checkpointing, agent communication mediated through task outputs. **Threat vector:** the role-based-team metaphor is now mainstream vocabulary CrewAI owns; our messaging must lead with "ready dev team + full delivery pipeline," never with "crew of agents," or we read as a CrewAI wrapper.

**Artel (NicolasPrimeau/artel) note (Aug 2026):** Not a direct competitor — a **pattern / build-on source**. Self-hosted MCP + REST coordination layer for AI agent fleets (~early OSS): shared memory with semantic search and confidence decay, typed memory (`memory` / `doc` / `directive` / `skill` / `compiled`), tasks with claim/complete, async agent messaging, session handoffs across context resets, CRDT mesh between instances (feeds + mDNS), and an autonomous **archivist** that compacts raw session captures into clean memory. Claude Code plugin makes memory *ambient* (push relevant knowledge in; capture sessions out) rather than pull-only tool calls. **What it is not:** no prepared SDLC professions, no Full Delivery pipeline, no Playwright E2E, no deploy adapters, no visual run-control product for feature lifecycle — it coordinates fleets, it does not ship the delivery process. **Ideas worth borrowing:** ambient memory injection at session start; confidence-decay / heat-protected knowledge; archivist compaction of run transcripts into durable repo memory; session handoff packages so any harness can resume; `compiled` memory anchored to source files. Complementary framing: Artel-like memory could sit *under* an Isotopy run; Isotopy remains the opinionated pipeline on top. Also blocks **ARTEL** as a clean product name in our space.

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
| **Open SWE (LangChain)** | Async bot (Slack / Linear / GitHub) | High ("no confirmation prompts") | Self-hostable, but executes in a remote sandbox | **Rival at the implement stage** — not an adapter |
| **sandcastle** | TS library | High (sandboxed) | Yes (Docker/Podman/Vercel) | Sandbox/execution layer (build-on candidate) |

**Gap:** Single-task, single-session tools. No cross-stage artifact handoff or workflow dashboard.

**Open SWE note (Aug 2026):** LangChain's *"open-source asynchronous coding agent"* — MIT, ~11k stars, Python core (TypeScript UI/desktop app), built on LangGraph plus the `deepagents` harness. The most product-like thing in the langchain-ai org and the only one that touches our loop. You never open an editor: mention `@openswe` in a Slack thread, comment it on a Linear issue, or tag it in a GitHub PR comment; it clones the repo into an isolated cloud sandbox (Modal, Daytona, Runloop, E2B or LangSmith — pluggable, or bring your own), works autonomously with ~15 curated tools, and opens a **draft PR** linked back to the ticket. Each thread keeps a persistent sandbox that auto-recreates if unreachable; tasks run in parallel with no queuing. Subagents can fan out via a `task` tool, and deterministic middleware hooks fire pre-model and post-agent.

**Why it is not us:** one agent per ticket, not a pipeline. No prepared professions, no requirements/design/review stages, no cross-stage artifact handoff, no Playwright E2E in the loop, no deploy adapters, no visual run control, no restart-one-stage. **The draft PR is the only gate** — the README says plainly it runs with "no production access, no confirmation prompts", so oversight is review-after, not approve-between. Nor is it local-first in our sense: self-hosting is documented (your own LangGraph API server, or LangGraph Platform self-host), but the unit of execution is a **remote Linux sandbox**, and local development needs `ngrok` plus a GitHub App. LangChain concedes it is not turnkey.

**Why it matters anyway:** it owns the *"file a ticket, get a PR while you do something else"* story — the front half of Full Delivery — with LangChain's distribution behind it, and it validates the same primitives we build on (per-task isolation, parallel runs, pluggable execution backends, harness-agnostic middleware). **Threat vector:** it grows *backwards* into spec/design or *forwards* into test-and-deploy and lands in §1. **Positioning response:** ours is a pipeline you watch and restart stage-by-stage on your own machine; theirs is a fire-and-forget teammate in Slack whose sandbox lives in someone else's cloud. Note the harness relationship is competitive rather than complementary — unlike Claude Code or Codex, Open SWE wants to own the sandbox, the branch and the PR, so it is not an adapter candidate. Runtime evaluation of its LangGraph substrate is a separate question, settled in [`workflow-runtime-options.md`](workflow-runtime-options.md).

**sandcastle note:** Not a competitor — the **closest-fit build-on candidate for our implementation-stage adapter**. A TypeScript library (`sandcastle.run()`) that runs a coding agent in an isolated sandbox and merges commits back: pluggable sandbox providers (Docker, Podman, Vercel Firecracker VMs), git-worktree isolation, branch strategies, session capture/resume, typed structured-output extraction, TUI, and lifecycle hooks — provider-agnostic (Claude Code, Codex, Cursor, etc.). It has **no SDLC stages, no requirements/design/review, no Playwright, no deploy, no visual run control, no v1→evolution story** — orchestration on top is *our* value. Same TS stack as us, so it directly covers several "required" rows below (worktree isolation, harness adapter, session resume). See TASK-036: evaluate wrapping `sandcastle.run()` for the implement stage vs. building the subprocess harness (TASK-006) ourselves.

---

## 7. Agent-Workforce Platforms (Horizontal / Indirect)

| Product | Local | OSS | Focus | Lifecycle coverage | Harness support | Maturity |
|---------|-------|-----|-------|--------------------|-----------------|----------|
| **Paperclip** | Yes (self-hosted, embedded Postgres) | Yes (MIT) | Agent org: org chart, roles, budgets, heartbeats, audit trails | None (explicitly "orchestrates work, not pull requests") | Claude Code, Codex, Cursor, HTTP bots, bash — "if it can receive a heartbeat, it's hired" | 73k+ stars, 3k+ commits, plugin system shipped; desktop app + cloud agents in progress |
| **Guild.ai** | No (cloud control plane) | No | Agent governance: scoped credentials, read-only audit logs, cost visibility, Agent Hub registry | None (governs agents; does not run an SDLC) | Framework-agnostic — governs agents built with LangChain, CrewAI, custom code, or its TypeScript SDK | Series A March 2026; GA April 28, 2026; enterprise integrations (GitHub, Jira, Slack, New Relic, ...) |

**Guild.ai note (new, Aug 2026):** The team behind the old Guild AI experiment tracker pivoted; Guild.ai is now a **neutral control plane for AI agents** — every agent runs under workspace-scoped least-privilege credentials, every model call and tool invocation lands in immutable audit logs, with cost controls and an Agent Hub for sharing agents across an org. **What it misses (our wedge):** it sits *under* agents, not *in* the delivery loop — no SDLC stages, no prepared professions, no repo artifacts, no E2E, no deploy pipeline; enterprise-first, cloud-first, not local/solo. **Why it matters:** same broad buyer conversation ("how do I run AI agents responsibly"), well funded, and its dev-pipeline example (tracing which agent action broke a build) shows appetite for exactly the auditability story we tell with git-native artifacts. Complementary framing available: an Isotopy pipeline could run *under* Guild governance in an enterprise. Also blocks "Guild" as a product name in our space.

**What it is:** A horizontal platform for running teams of AI agents as an "autonomous business" — org hierarchy with reporting lines, per-agent budget hard-stops, scheduled heartbeat execution with persistent session state, atomic task checkout with goal tracing, approval workflows, multi-company isolation, immutable audit logs. Pitch: "If OpenClaw is an *employee*, Paperclip is the *company*."

**What it misses (our wedge):** No SDLC pipeline or stage restart, no pipeline/run visualization (UI is deliberately a task manager + org chart), approval gates govern agent authorization and spend rather than code artifacts, no repo-native artifact handoff, no Playwright E2E in the loop, no deploy adapters, no v1→evolution story.

**Why it matters anyway:**

- **Same buyer, same mental model.** A self-hoster who wants "a team of role-named AI agents running on Claude Code/Cursor" is our target user too; its org-chart-of-professions framing overlaps our PM → Dev → SRE agent identity. Found first, it makes us look like a subset.
- **Community gravity.** With its plugin system, a community-built "software dev company template" on Paperclip could compete with us without Paperclip Labs lifting a finger — the realistic threat vector.
- **Shared plumbing validated at scale:** git worktrees for isolated execution, persistent sessions, harness adapters, approval workflows, cost tracking — several items from our "required" list proven in the wild.

**Positioning response:** We own **the dev pipeline, not the company** — the artifact-producing lifecycle with visual run control and restartable stages. Complementary framing is available: an Isotopy pipeline could be a "department" a Paperclip agent triggers. Watch their desktop app and plugin ecosystem for scope creep toward SDLC.

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
        │   [Isotopy]                   │
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
        │   Paperclip                                  │
        │   (horizontal agent workforce, self-host)    │
        │                                              │
Low abstraction                             High abstraction
```

---

## Strategic Takeaways

1. **The idea is validated** — hosted app builders prove demand for AI app building; Dyad/Locode prove local OSS appetite; Sikula/autonomous-sdlc prove lifecycle orchestration demand; Paperclip (73k+ stars) proves self-hosters want role-named agent teams with governance. The gap is **combining them** into a dev-lifecycle product.

2. **Compete on iteration, not just v1 speed** — message: "build the first version, then keep building without losing control." Against Paperclip specifically: **the dev pipeline, not the company**.

3. **Borrow patterns from:**
   - **Dyad** — first-run UX and speed expectations
   - **Locode** — Playwright auto-fix in generation loop
   - **Sikula** — worktree isolation, task contracts, auditable state
   - **spec-manager** — L1/L2/L3 artifact hierarchy and confirm gates
   - **spec-intelligence** — kanban/backlog mental model (tasks feed runs, not standalone PM)
   - **Aiki** — durable TypeScript workflows, HITL event suspension, crash recovery
   - **n8n** — visual workflow mental model (stages as nodes)
   - **sandcastle** — sandbox/worktree execution primitive for the implement stage (same TS stack; candidate to wrap rather than rebuild)
   - **beads** — dependency-aware task graph + "ready work" detection + semantic compaction for the repo-native backlog
   - **Artel (NicolasPrimeau/artel)** — ambient shared memory, archivist compaction of session captures, session handoffs, confidence decay; coordination layer under the pipeline, not a substitute for it
   - **Open SWE** — pluggable execution backends behind one interface, per-task sandboxes that auto-recreate, and middleware hooks around the agent call as the extension seam

4. **MVP wedge:** "Capture tasks in repo-native backlog, run a feature through requirements → design → implement → review → test (Playwright E2E) → release → deploy" on your machine, with one-click restart of any stage.

---

## Launch Resolution (August 2026)

**Question:** With Guild.ai funded and live, CrewAI at ~54k stars, and Paperclip at 73k+, does launching v1 still make sense?

**Resolution: yes — launch.** The crowding is in adjacent layers, not in our slot:

| Layer | Who owns it | Do they do our job? |
|-------|-------------|---------------------|
| Governance under agents | Guild.ai | No — no SDLC, no artifacts, enterprise cloud |
| Frameworks to build agents | CrewAI, LangGraph | No — DIY libraries, no prepared dev team, no harness adapters |
| Horizontal agent workforce | Paperclip | No — org chart and budgets, explicitly not pull requests |
| Coding harnesses | Claude Code, Cursor, Codex | No — single-session tools; they are our adapters |
| Async ticket→PR agents | Open SWE, Codegen, Copilot coding agent | No — one PR per ticket, no lifecycle stages, no E2E or deploy |
| **Local, ready AI dev team running a full delivery pipeline** | **Unclaimed** | **This is us** |

Three reasons the timing argument favors launching, not waiting:

1. **Every funded neighbor validates the demand** we depend on: Guild.ai proves organizations want governed agents; CrewAI proves developers want role-based teams; Paperclip proves self-hosters want agent workforces. Nobody has combined that demand into a local, artifact-producing SDLC product — the longer the slot stays open, the more likely a Paperclip plugin or CrewAI template fills it approximately.
2. **Our differentiators are already shipped, not promised** — Full Delivery pipeline dogfooded (Milestone D), restartable stages, git-native artifacts, three harness adapters. We are not launching a roadmap.
3. **The window is a window.** CrewAI moving down into "prepared templates" or Paperclip's community shipping a dev-company plugin are realistic 6–12 month threats. Launching v1 on Aug 30 and owning "the dev pipeline, not the company / not the framework / not the control plane" is cheaper now than repositioning later.

**Conditions attached to the resolution:**

- Messaging must never lead with "crew/team of agents" generically — that vocabulary is CrewAI's; lead with **prepared professions + full delivery pipeline + local ownership**.
- The name question must be settled before the public teaser (see `.github/marketing/name-decision.md`) — GUILD and CREW are off the table as names for occupancy reasons.
- Re-check this matrix at each milestone: watch Paperclip's plugin ecosystem and CrewAI templates for SDLC scope creep.

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
| Paperclip | https://github.com/paperclipai/paperclip |
| Guild.ai | https://www.guild.ai |
| CrewAI | https://github.com/crewaiinc/crewai |
| sandcastle | https://github.com/mattpocock/sandcastle |
| beads (bd) | https://github.com/gastownhall/beads |
| Artel | https://github.com/NicolasPrimeau/artel |
| Manifold | https://github.com/intelligencedev/manifold |
| LangGraph | https://langchain.com/langgraph |
| Open SWE | https://github.com/langchain-ai/open-swe |
| OpenHands | https://www.openhands.dev |
