# In Progress

## TASK-094: Dogfood Full Delivery and close Milestone D at 0.8.7
**Priority:** P1 | **Tags:** testing, infra, milestone-d
**Updated:** 2026-07-31 12:10

**Revised 2026-07-31.** The original 0.8.0 target was stale — every workspace package already read 0.8.6 after PR #14 — so the close lands on **0.8.7**. Preview deployment verification is dropped with TASK-092.

### Deterministic half — done 2026-07-31

All six gates green on `main` at 0.8.7:

- `pnpm lint` · `pnpm typecheck` · `pnpm build` — clean.
- `pnpm test` — 48 files, **337 tests** (301 before this task).
- `pnpm e2e` — 35 passed, 1 skipped (the opt-in live canary).
- `node scripts/generate-skills.mjs --check` — bundled skill outputs up to date.

Docs updated: `architecture.md` (core file table, a milestone → feature → run section), `architecture-ui.md` (milestone route, rail group, `useMilestones` refresh derivation, testid roster, proxy list), `decisions.md` (two dated entries), `e2e-test-plan.md` (free-tier entry), `README.md` (the Status section, which still claimed runs were in-memory). Root plus `packages/{core,server,ui}` bumped together to 0.8.7.

### Live dogfood half — NOT RUN, this task stays open

Real engine spend and a long wall clock; run these on Windows with the sandbox disabled (see the `run-app` skill), then move this task to DONE.

1. **Disposable sample app.** Point ADHD at a throwaway repo → *Plan this as a milestone first* → approve a two-feature plan → open the milestone from the rail → enable **Auto-run next feature** → start feature 1. Confirm: feature 2 starts on its own after feature 1 reaches a terminal status; `release` and `deploy` both record `VERDICT: SKIP` with no automation configured; closeout writes `closeout.md` and follow-up tasks; the Artifacts → **Closeout** tab shows the created-task links.
2. **One real ADHD feature** through the TaskPlanner backend. Confirm tasks land in `.tasks/` with correct IDs, and that re-running the closeout stage creates no duplicates.
3. **Durability.** Kill and restart the server mid-run → the run resumes without re-running completed stages.
4. **A blocking finding.** Force a quality FAIL → the stage reads amber **NEEDS ATTENTION** (not red FAILED), the run continues to closeout, the feature ends `needs_attention`, and **Finalize milestone** stays disabled.
5. Record Windows as directly tested and macOS as CI-only, naming exactly what stays unverified.

Cross-platform: test Windows directly, use macOS CI where available, and record remaining manual-only checks accurately.

---
