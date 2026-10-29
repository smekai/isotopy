# In Progress

## TASK-210: Release through a pull request: push, PR, preview deploy, CI, merge
**Priority:** P1 | **Tags:** server, infra | **Epic:** Standing team
**Updated:** 2026-10-29 09:38

Child of `TASK-206`. Closed 2026-10-27, 0.14.35. Supersedes the 2026-10-15 decision line "Isotopy never pushes"; `docs/decisions.md` now carries one 2026-10-27 entry that absorbs it.

**Before.** `stop` with `merge: true` merged `isotopy/<orchestration>` into its base locally with `--no-ff`. On ShareTravel that put 35 unreviewed, CI-less commits on the fork's `main`.

**After.** When `origin` is a GitHub remote and `gh` is signed in, `OrchestrationService.end` starts a **release run** (`RELEASE_PIPELINE`). It has one deterministic stage, found by its `open-pull-request` step task, and no agent turn. Three Aiki tasks do the work:
- `isotopy.release-open` pushes the branch, deploys the `preview` target when one is configured, and writes the PR body under `.isotopy/runs/<run>/artifacts/pull-request.md`. The body holds the goal, the stop summary, the closeout summary, delivered scope, open findings, the preview URL and the per-category lines-changed table. It then runs `gh pr create --body-file`, or `gh pr edit` when a PR is already open.
- `isotopy.release-checks` reads `gh pr checks --required` once per poll, between durable `run.sleep`s. The poll budget is `timeout / interval`; there is no cron and no poller.
- `isotopy.release-settle` handles the result. Green: `gh pr merge --merge`, then switch to the base, `git pull --ff-only origin <base>`, and `git branch -d`. Red or timed out: the failing checks and their `gh run view --log-failed` tails become the stage output, and the run settles `needs_attention`.

Red CI then takes the `TASK-183` route. The Orchestrator's review starts a fix run from the implementing role, and the PR stays open to collect the fix. A `merge` straight after red CI is refused (`RELEASE_NEEDS_FIX`). A merged release is not reviewed: `settle` stops the initiative with the PR URL. With no GitHub remote, or `gh` missing or signed out, the local merge stays, and the completing run's log says why.

`run.pullRequest` records the URL, CI result, failing checks, preview URL and merge commit. The run view shows them under Artifacts → Pull request. Agents keep "Do not push". `git` and `gh` go through an injectable `SubprocessRunner` on `PullRequestRelease`.

**Structure.** The new code pushed `orchestration-service.ts` and `run-service.ts` past the 1000-line check. The release lifecycle moved to `InitiativeRelease` and the run-start option types to `run/run-options.ts`; two refusal constants and the generation helpers moved to their domain files.

**Tests.** `pull-request-release.comp.ts` uses `FakeGitHub`, a substituted runner: unscripted git runs for real, and unscripted `gh` behaves as not installed. It covers:
- green CI merges and syncs the base;
- red CI starts a fix run and leaves the PR open;
- merging again after red CI is refused;
- a preview URL lands in the body;
- no remote falls back to the local merge, with the reason logged;
- `gh` missing is reported, not fatal.

A spec covers the CI-state and change-category rules, and `PullRequestPanel.comp.tsx` covers the view. The refusal and review-skip guards were mutation-checked.

**Verified:**
- lint, typecheck, check (76), build: pass;
- test: 1054 passed, 4 skipped;
- gen:skills: no diff;
- e2e: 77 of 78 passed. The milestone-dashboard rail test timed out once, then the whole milestone file passed 8 of 8 on rerun.

Cross-platform: argument arrays only, the body goes through `--body-file`, and `gh` is found on `PATH` (WinGet on Windows, Homebrew on macOS). Tested on Windows; macOS reasoned through.

---
