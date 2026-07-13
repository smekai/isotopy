# Figma Agent Prompt: Conversational Pipeline Workspace

**Task:** [TASK-008](../.tasks/BACKLOG.md)
**Purpose:** A copy-paste-ready prompt for the **Figma Agent** (canvas / left-rail AI) that generates
the ADHD workspace design and a fresh design system in several visual directions. This is the primary
artifact of the redesign: paste it into the Figma Agent, generate options, pick one, and let the chosen
direction **replace** the old desktop-shell design.

Full narrative context lives in [design-desktop-shell.md](design-desktop-shell.md). If you want the
Agent to honor ADHD's conventions more strictly, encode this file's "Design system" and "States"
sections as a Figma Make Skill later — optional, not required for the first pass.

---

## How to use

1. Open the target Figma file (a new blank design file is fine).
2. Open the Figma Agent (left rail) and paste the **Prompt** block below.
3. Ask for **3 distinct directions**; iterate on the one you like with follow-up prompts.
4. Have the Agent extract the chosen direction's tokens into **Figma variables/styles**.
5. Record the picked direction as the new design of record; supersede the old shell design.

Tuning knobs before pasting: number of directions, target width(s), and whether to include a light
theme. Sensible defaults are baked into the prompt.

---

## Prompt

> **Role & product.** You are designing the desktop UI for **ADHD** — a local-first app where a
> developer directs an **AI software-development team** through a full delivery lifecycle. The user
> both *sees* the work (a live pipeline) and *talks to* the team (chat + voice). Think of it as the
> midpoint between an automation graph (n8n) and a conversational build tool — but with **predefined,
> human-gated stages**, not free-form nodes and no live app preview.
>
> **Design a fresh design system.** Do **not** reuse any existing palette. Propose: a neutral surface
> ramp (background → panels → borders), a small accent set, a type scale, spacing scale, corner radii,
> and elevation. It must read as a **dense, information-rich, IDE-adjacent professional tool** —
> keyboard-friendly, calm, not a marketing site. Provide the tokens as Figma **variables/styles**.
>
> **Hero surface — the pipeline canvas.** A horizontal, left-to-right pipeline whose nodes are the
> **fixed lifecycle stages**, each anthropomorphized as a specialist on the team:
> *Intake → Requirements → Design → Implementation → Review → Test → Release → Deploy*.
> Draw connectors between them and place **human-gate markers** after Requirements, after Design,
> after Release, and before Deploy. Each node shows a **live status** with a distinct, accessible
> visual treatment for: `pending`, `running`, `passed`, `failed`, `awaiting-approval`, `skipped`.
> The canvas is the hero; navigation and settings are secondary chrome.
>
> **Focus a stage in place.** Selecting a node **expands/focuses that stage within the canvas** (not a
> disconnected side panel). The focused stage shows: its artifacts (e.g. requirements.md, design.md —
> rendered), a live **log stream**, the agent's **reasoning**, a **Restart-from-here** action, and a
> **conversational + voice steering** input scoped to that stage — i.e. "talk to this specialist."
>
> **Talk to the whole team.** Provide a **pipeline-level conversational + voice controller** always
> reachable from the canvas: start or steer a run, approve/reject gates, and ask for status ("talk to
> the team"). So there are **two steering scopes**: per-stage and whole-pipeline.
>
> **Design the voice affordances explicitly.** For both scopes show a mic / push-to-talk control and
> clear states for `idle`, `listening`, `transcribing` (live transcript), and `speaking` (the team
> responding). Make voice feel first-class, not a bolt-on.
>
> **Setup, not authoring.** Include a **setup surface** to toggle which of the predefined stages are
> active and configure gates, the implementation **harness** (Claude Code / Cursor), model API keys,
> and the deploy target. Users **adjust** a fixed pipeline — they do **not** draw or author arbitrary
> nodes.
>
> **Also design:** a **run history** list with restart-from-stage, and an **empty / first-run** state
> for before any task or run exists. **Do not** design a live app-preview panel.
>
> **Deliverables.** Produce **3 distinct visual directions**. For the strongest direction, show the
> full workspace at **desktop 1280px+** and one **narrow 960px** adaptation that preserves density,
> plus the pipeline canvas in several live-status combinations (idle, mid-run, a gate awaiting
> approval, a failed stage). Extract the design-system tokens as Figma variables/styles.

---

## States the design must express

The fresh visual system must give a distinct, accessible treatment to every value below (source:
[technical-architecture.md](technical-architecture.md) run/state model).

| Group | Values |
|-------|--------|
| **Stage status** | pending · running · passed · failed · awaiting-approval · skipped |
| **Run status** | pending · running · paused · completed · failed · cancelled |
| **Gate** | awaiting · approved · rejected |
| **Voice** | idle · listening · transcribing · speaking |

---

## The fixed stage catalog (predefined; users adjust, not author)

| # | Stage | Team role | Human gate |
|---|-------|-----------|------------|
| 0 | Intake | Normalizer | — |
| 1 | Requirements | Requirements agent | ✅ approve spec |
| 2 | Design | Design agent | ✅ approve design |
| 3 | Implementation | Implementation agent (harness) | — |
| 4 | Review | Blind review agent | — |
| 5 | Test | Test + fixer (unit + Playwright E2E) | — |
| 6 | Release | Release agent | ✅ approve PR |
| 7 | Deploy | Deploy agent (platform adapter) | ✅ approve deploy |

---

## Optional follow-ups (not required for the first pass)

- Encode the "Design system" + "States" sections as a **Figma Make Skill** so future generations stay
  on-convention.
- Wire the **`use_figma` MCP server** so Claude Code can pull the chosen frames into
  [`packages/ui`](../packages/ui) and round-trip design↔code.
