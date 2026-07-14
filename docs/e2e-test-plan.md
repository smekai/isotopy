# E2E Test Plan — one-box Claude run UI

Regression checklist for the milestone-c surface, distilled from the TASK-020
verification pass. Two tiers:

- **Free tier** — no engine spend, no `claude` CLI needed. Automated in
  [`packages/ui/e2e/ui-smoke.spec.ts`](../packages/ui/e2e/ui-smoke.spec.ts)
  (`pnpm --filter @adhd/ui e2e`).
- **Live tier** — starts a real one-box run (≈ $0.01 with haiku). Manual for
  now; automate later if it earns its keep. Requires an authenticated
  `claude` CLI and a server that was **not** started from a sandboxed agent
  shell (see the run-app skill: sandboxed spawns die with 0xC0000142).

## Free tier

1. **Empty state & pipeline picker**
   - Page renders the ghost pipeline, task input, and the segmented picker
     with "Full team · mock" and "Single agent".
   - "Start run" is disabled while the task input is empty.
2. **Single-agent mode**
   - Clicking "Single agent" switches the heading to "What should the
     Developer build?", shows the working-directory input, and the footer
     caption `Engine: <label> · <model> — change in Setup`.
3. **Setup → AI Harness**
   - Claude Code listed and selectable; Cursor and Codex rendered disabled
     with a `SOON` pill.
   - Model select works (opus / sonnet / haiku options).
   - Permission modes: "Never block (recommended)" and "Accept edits only".
4. **Persistence across reload** (localStorage)
   - Pipeline selection, engine model, and permission mode survive a page
     reload — footer caption and Setup controls both reflect the saved
     values.
5. **History drawer**
   - Opens from the header; shows "No runs yet." on a fresh server, or run
     cards (status pill, task text, duration) otherwise.

## Live tier (manual)

1. Switch to "Single agent", set model `claude-haiku-4-5` in Setup, point
   the working directory at a scratch folder, task: *"Create a file named
   hello-ui.txt containing exactly the text: hello from the UI pass. Do
   nothing else."*
2. During the run:
   - status bar shows `RUN #n`, the task, the engine pill
     `⬡ Claude Code · claude-haiku-4-5`, and a pulsing RUNNING dot;
   - the Developer stage node is RUNNING and auto-focused;
   - the Live Log tab streams entries as they arrive ("Developer online…",
     "Claude Code online · N tools", tool-use lines).
3. On completion:
   - status flips to COMPLETED, stage to PASSED;
   - Artifacts tab lists `result.md` with a non-empty preview;
   - the requested file exists in the working directory with the exact
     content;
   - the final log line shows cost/turns/duration.
4. History drawer lists the run; clicking the card re-attaches to it.
5. Abort path (occasionally): start a run, hit Abort — run goes CANCELLED,
   no orphaned `claude` processes remain (`tasklist | findstr claude`).

## Known non-bugs

- Right after switching tabs in the stage focus panel, a screenshot can
  catch the old tab still underlined — that's the 0.18s CSS transition,
  not a state bug (verified settled in TASK-020).
