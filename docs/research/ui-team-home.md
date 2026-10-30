# UI: Home watches the team at work

**Question.** Isotopy started as a simple tool, and its UI grew one feature at a time. The owner
now sees that it needs many manual settings and ways to intervene when something goes wrong,
close to what Mastra Studio, ChatGPT or Claude offer, without copying any of them. Two things
must not change: **the team is at the top**, and **Home is watching what the team and its agents
are doing right now**. One agent holds one task (see [parallel-agents.md](parallel-agents.md)).

This file extends `TASK-204` (agents as free-standing blocks, recurring work shown apart).

## What the UI is today

`packages/ui`: React 19, Vite, no router library (hash routes in `src/route.ts`), no state or
component library, inline styles from `src/theme.ts`, light theme only.

| Area | Today |
|---|---|
| Layout | Top bar (project switcher, Project, Setup), left `RunRail`, main pane, bottom `TeamController` |
| Home `#/` | `HomeComposer` ("What are we building?"), or a redirect to the active run |
| Run `#/runs/:id` | Status bar, stage graph with gates, tabs Chat / Logs / Artifacts / Plan / Preview |
| Milestone, schedule | Their own dashboards |
| Team | Read-only in Setup; "edit `team.md` in your editor"; Orchestrator proposals approved on a card |
| Agents | Read-only catalog in Setup |
| Gates | Only for bundled pipelines, not team flows (`TASK-214`) |
| Live data | SSE per run and per project |

## What "watching the team" could mean

A first sketch to test against the competitors, not a design:

- **Home = the team board.** A grid of agent instances, without the edges of a stage graph.
  Each card: role and glyph, engine and model, the task it holds, its state (working, waiting
  on you, waiting on CI, idle), its last action live, time and spend. Idle roles show as empty
  seats.
- **A strip of "needs you"** at the top: gates, questions, team-change proposals, usage limits,
  across all instances.
- **Recurring work apart**: schedules and duties in their own strip or column, not mixed with
  one-off runs.
- **The Orchestrator as a chat panel** beside the board (as Claude and ChatGPT keep the
  conversation), not as the page itself.
- **Drill-down**: a card opens the instance's run (today's run view with its stage graph and
  tabs).
- **Agent page**: identity prose, model and engine, tools/MCP, skills, permissions, memory
  (notes, context, knowledge), duties, history; editable, saved as the agent's file and
  committed, so versions and rollback come from git (Mastra Studio's Agent Editor does versions
  in its own store).
- **Team page**: roster and flows, editable by the owner; Orchestrator proposals stay
  approval-only.
- **Navigation**: Team (Home), Tasks (board), Agents, History, Schedules, Settings.

## Manual control: what the owner may need to do

To collect from dogfood runs and the owner's own complaints. Starting list:

- stop, pause or restart one instance without touching others;
- reassign a task to another instance or engine;
- edit an agent's prompt, model or tools and rerun;
- edit the team and its flows;
- set gates on any flow stage (`TASK-214`);
- answer or override the Orchestrator's decision;
- edit memory an agent got wrong;
- see and change what the next scheduled run will do.

## Competitors to review

From `TASK-204` and [`competitor-matrix.md`](../competitor-matrix.md): Mastra (Studio, Factory's
Work and Review boards), Bernstein, the parallel-agent multiplexers (Cline and the rest of that
category), the agent-workforce platforms, plus ChatGPT and Claude for the conversation panel.
For each: how it shows many agents at once, how it shows recurring work, and how much it lets
a person change by hand.

## Open questions

- Does Home show instances (working now) or roles (the team as configured, some idle)? Both?
- Is the Orchestrator chat always visible or opened on demand?
- How many cards fit on a laptop screen before the board needs grouping?
- Does editing in the UI write files directly, or through the server with a commit per change?
- Dark theme and narrow screens: in scope of the redesign?
- Is a component library now justified? Any new UI dependency needs a `decisions.md` entry
  (`architecture-ui.md` §1).

## What a decision needs

The competitor review, a mock-up of Home, the agent page and the team page, and the list of
manual actions, ranked by how often the owner needed them.

Cross-platform: n/a for the research; the UI runs in a browser on both.
