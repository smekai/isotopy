# In Progress

## TASK-203: Bundled models catch up with GPT-6, Claude 5.5 and Cursor's new roster, and every preset picker names its model
**Priority:** P2 | **Tags:** core, ui, engine
**Updated:** 2026-10-21 20:29

The bundled rosters and tier ladders in `packages/core/src/engines.ts` were last checked on 2026-08-23 (TASK-164). Every vendor has moved a generation since:

- **Codex** now offers the GPT-6 family — `gpt-6.1-sol` (workhorse), `gpt-6-astra` (frontier), `gpt-6-luna` (cheap), `gpt-6-sol` — beside the older `gpt-5.6-*`, and its own model cache confirms efforts above `high`.
- **Claude Code** aliases now resolve to Fable 5.1 / Opus 5.5 / Sonnet 5.5 / Haiku 5.5; the subscription default is Opus, not Sonnet, and `sonnet[1m]` no longer changes anything.
- **Cursor** lists Opus 5.5, Sonnet 5.5, Fable 5.1, Grok 4.7 and Gemini 4 Argon.

Separately, the presets are chosen in three places — the Home start picker, the orchestrator's team card (one preset per role) and Setup — and only Setup shows what a preset resolves to, and only for the selected one. Everywhere else the user sees "Economy" or "Deep" with no model behind it.

**Scope:**
- Refresh the three bundled rosters and the Codex/Cursor ladders to the current generation; Codex Max moves to `gpt-6-astra`/xhigh so it stops duplicating Deep.
- Every preset picker names the model each preset resolves to on the chosen harness, and a pinned model is shown where it overrides the preset.
- Docs: implementation notes on how to refresh the bundled lists; a decision entry for the Codex ladder.

Cross-platform: n/a — pure data and UI. Live rosters read on Windows; macOS untested but nothing platform-specific changes.

---
