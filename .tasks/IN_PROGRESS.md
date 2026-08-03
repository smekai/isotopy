# In Progress

## TASK-107: One definition per shape — RunEvent union, schema dedupe, structured tool calls
**Priority:** P1 | **Tags:** core, server, ui, testing
**Updated:** 2026-08-03 21:50

The schemas are strict but the types are loose, and the same shape is defined up to four times. `RunEvent` is declared in core as one flat interface with nine optional fields while `run-persistence.ts` models it as a strict 15-arm discriminated union — so the union's invariants are invisible to both the emitter and the UI, which compensates with defensive guards for states the schema already proves impossible. Closeout has three schemas for one shape; the milestone proposal has three.

Every shape gets exactly one definition, in `@adhd/core`, with the TypeScript type derived from the schema via `z.infer`. This extends the rule already recorded in `decisions.md` — runtime lists define their unions — from lists to shapes.

### Plan

zod becomes a dependency of `@adhd/core`. Core shapes stay transform-free so `z.infer` stays honest; agent-boundary salvage (`uniqueStrings`, `severityFromAgentProse`) stays in the server, preserving the strict-vs-salvaging boundary rule.

Five commits, each independently green:

1. **0.8.14** — zod enters core; `usageSchema`, `runLimitSchema`, `runMessageSchema`, `logEntrySchema` move, types become `z.infer`.
2. **0.8.15** — closeout collapses to one `CLOSEOUT_SHAPE` with strict and salvaging variants; milestone proposal collapses from three definitions to one; `runStateSchema` follows into core.
3. **0.8.16** — `RunEvent` becomes a real discriminated union in core; `applyEvent` becomes an exhaustive switch and sheds six defensive guards.
4. **0.8.17** — delete the structured→markdown-fence→regex round trip in `updateMilestoneProposal`; split extraction from construction.
5. **0.8.18** — engine adapters declare a structured `StageActivity` instead of flattening tool calls to `"▶ name detail"`; the transcript reads structure rather than inferring from log level.

Out of scope by decision: UI runtime SSE validation, the hand-rolled TOML and `.env` parsers, and the regex-on-error-message routing.

---
