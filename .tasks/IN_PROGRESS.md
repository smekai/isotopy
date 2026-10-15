# In Progress

## TASK-185: Agents leave dev servers running and verification debris in the repo, and nothing is committed
**Priority:** P2 | **Tags:** engine, milestone-i
**Updated:** 2026-10-15 08:14

Found in `TASK-157` (2026-10-04).

- **Dev servers left running:** the Claude team left three Vite servers on the arcade running after its run settled (the resumed Developer's and two of QA's). One held port 5192, so Isotopy's own product start later found the port taken.
- **Debris in the repo:** QA left `VERIFICATION_REPORT.md`, `playwright-report/` and `test-results/` at the root (not gitignored), and installed Playwright browsers into `.isotopy/cache`. Cursor's QA wrote tests and config that the Developer then listed as *"other uncommitted work (not from this assignment)"*.
- **Nothing committed:** neither team made a commit; both targets end with only untracked changes over the baseline.

Decide, and say in the step tasks, (a) that a stage stops every process it started before it hands off, (b) where verification output belongs — under `.isotopy/runs/<id>/` or in a gitignored path, never loose at the root — and (c) whether a passing feature run commits its work, and who commits (Developer, Release Manager, or Isotopy on closeout). (c) matters for the inductive step: an unattended stretch with no commits has no history to evolve.

Related: `TASK-179` (an agent killed Isotopy's own server while cleaning up).

### Plan

**Decided with the owner, 2026-10-15.** Each initiative works on its own branch, each stage commits its own work there, and the Orchestrator decides at the end whether the branch is merged or the work goes on.

**(a) Processes** — already true since `TASK-179`: every stage's `## Environment` says to stop everything it started before handing off. No change.

**(b) Verification output — 0.14.19.** Every engine stage's `## Environment` names the run's artifacts folder, `.isotopy/runs/<run>/artifacts/` (git-ignored with the rest of `.isotopy/`), created by Isotopy. Reports, screenshots, traces and test-runner output go there; tests added to the project are code and stay in it.

**(c) Commits — 0.14.19.** The same section tells every stage of a team run to commit its own changes before handing off, with a message saying what and why; to leave out what was already uncommitted when it started; to fix a failing hook rather than bypass it; and never to push, switch branches or rewrite commits it did not make. The Orchestrator's own conversation stage does not get it.

**Initiative branch and merge — 0.14.20.**

- `InitiativeBranches` (`services/`): `enter` cuts `isotopy/<orchestration>` from the checked-out branch on an initiative's first team run and checks it out again on later ones; `merge` switches to the base, merges `--no-ff`, deletes the merged branch, and on any failure aborts and returns to the initiative branch; `leave` switches back to the base. All git through `runSubprocess`.
- `RunService.startRunWith` enters the branch for every engine run that belongs to an initiative, after admission and before the change baseline; a failure releases the admission and fails the start. The run records `branch` (name and base); the orchestration records it too.
- Not a repository, a detached HEAD or the home project: no branch, logged, the run works where it is as today.
- `stop` gains `merge: true`. With it, the branch is merged into its base before the initiative ends; a merge git refuses parks the initiative on the owner with git's reason. Without it, the initiative ends, Isotopy switches back to the base and leaves the branch for the owner. A user's Stop or a superseded initiative does not touch git. Isotopy never pushes.
- The run review shows the branch and its base; `review-run.md` and `orchestrate.md` say when to merge.
- `docs/decisions.md` and `docs/architecture.md` record it.

**Evidence:** comp tests against real temporary repositories: the first team run cuts the branch and a later one reuses it; a folder that is not a repository runs unbranched; `stop` with `merge` lands the work on the base and deletes the branch; a conflicting merge parks on the owner with the branch still checked out; `stop` without `merge` returns to the base and keeps the branch; a stage prompt carries the artifacts folder and the commit rule, and the Orchestrator's conversation does not. Each guard mutation-checked.

Cross-platform: git is spawned through `runSubprocess` with argument arrays (no shell), branch names use only `[a-z0-9/]`, paths go through `path.join`. Tested on Windows; macOS reasoned through.

---
