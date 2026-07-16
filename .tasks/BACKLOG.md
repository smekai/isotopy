# Backlog

## TASK-034: Design the `smek.ai` brand icon (comic "SMEK" burst)
**Priority:** P2 | **Tags:** setup, ui
**Updated:** 2026-07-16 16:38

Design the icon/logo mark for the `smekai` GitHub org and the `smek.ai` brand. One master SVG that scales into the org avatar, the site favicon, and the VS Code extension icon.

Org context (for the designer):

- `smek.ai` is a small studio building AI-native, local-first tools for focused, low-friction work. Everything we make stays in the user's repo, in open formats, and is legible to both people and AI agents.
- Current products: **TaskPlanner** (task management as plain markdown inside the editor) and **ADHD** (an agent workspace where AI agents work as a team of professions — PM plans, dev builds, SRE ships).
- Brand personality: punchy, energetic, a little playful — tools that *get work done*, not another passive dashboard. The name plays on the comic-book sound effect "SMACK!".

Visual direction:

- **Concept:** a retro comic-book onomatopoeia / impact burst — the classic jagged "POW! / BAM! / SMACK!" explosion shape — but the word inside reads **SMEK**.
- **Keep the wordmark "SMEK"** integrated into the burst (bold retro display lettering).
- **Palette:** bright comic yellow + blue, with a thick black inked outline. Two primaries max besides the black/white.
- **Style cues:** Golden/Silver-age comics — heavy black outlines, Ben-Day / halftone dots, slight offset/drop shadow, punchy energetic angle. Avoid gradients and fine detail.

Constraints:

- Square, full-bleed to the edges (GitHub crops to a rounded square — no transparent margins).
- Must read at **40–60px** (avatar in lists/PRs) and stay legible in **black & white**.
- "SMEK" text will not survive at favicon size — deliver **two lockups**: (a) full burst-with-SMEK for large/hero use, and (b) a simplified small-size mark (bare burst silhouette or single-letter monogram) for favicon/tiny avatar.

Deliverables:

- Master **SVG** (editable), plus exports: org avatar **512×512 PNG**, favicon (`.ico` / 32px + 16px), VS Code extension icon **128×128 PNG**.
- Light- and dark-background versions (or one that survives both).
- 2 initial concept directions to choose from before final polish.

Done when: a final icon set is exported, the `smekai` org avatar + `smek.ai` favicon are updated, and the master SVG is committed to the repo.

---

## TASK-022: Introduce a logger across the system
**Priority:** P2 | **Tags:** core, server, ui, infra
**Updated:** 2026-07-14 10:51

Replace ad-hoc `console.log`/`console.error` calls with a small structured logger used across all packages.

- Define the logger interface in `@adhd/core` (levels: debug/info/warn/error; per-module scope/prefix; timestamps).
- Server (`@adhd/server`): log HTTP requests, orchestrator/engine lifecycle events, and errors; level configurable via env (e.g. `LOG_LEVEL`), default `info`.
- UI (`@adhd/ui`): thin console-backed implementation of the same interface, silenced in production builds except warn/error.
- Keep it dependency-light (plain implementation or a minimal lib like `pino` on the server only); no log files yet — stdout/console is enough for the prototype.
- Sweep existing `console.*` usages and migrate them.

---

## TASK-021: Cursor & Codex engine adapters
**Priority:** P2 | **Tags:** adapters, milestone-c

Implement real adapters behind the EngineAdapter interface for the Cursor CLI and Codex CLI; flip `available` in ENGINES and remove the SOON badges. Supersedes the Cursor half of TASK-007.

---

## TASK-005: File-backed workflow engine (state.json + events.jsonl)
**Priority:** P1 | **Tags:** milestone-b

Replace in-memory mock with `.adhd/runs/` persistence and real subprocess stages.

---

## TASK-006: First harness adapter (generic subprocess)
**Priority:** P1 | **Tags:** milestone-c, adapters

Generic subprocess `HarnessAdapter` for any CLI command in a worktree.

---
