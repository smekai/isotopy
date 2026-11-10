# In Progress

## TASK-211: Restart ShareTravel on the standing team, and prove the epic with one task
**Priority:** P2 | **Tags:** setup, testing | **Epic:** Standing team
**Updated:** 2026-11-09 09:20

Child of `TASK-206`. Depends on `TASK-207`, `TASK-208`, `TASK-209` and `TASK-210`. This is the epic's live evidence.

**Setup.**

1. Update the `isotopy_travel` copy (`C:\Development\smekai\isotopy_travel`, ports 9577/5273, user home `~/.isotopy-travel`) to `main`.
2. ShareTravel fork (`C:\Development\smekai\sharetravel_ai`, `smekai/sharetravel_ai`): primary engine Claude Code, secondary Codex (installed and logged in through ChatGPT). Write its `team.md` from the template, adding a `discovery` flow with the project's `product-strategist`.
3. Get the work already done onto GitHub: the fork's local `main` is 35 commits ahead of `origin/main` (`TASK-107`, `TASK-104`, `TASK-147`, the discovery reports). Put them on a branch, open a PR, let the fork's CI (`.github/workflows/ci.yml`) run, and merge it by the new rule.

**Proof run.** One initiative for the fork's `TASK-138` (redeem an invite code in the same transaction as the sign-up). Expected path, with no owner approval: the Orchestrator picks the `delivery` flow → plan → implement on Claude → review on Codex with isolated context → verify against the local stack (`bun run init`) → release opens a PR in `smekai/sharetravel_ai` → CI green → Isotopy merges.

**Done when** that run completes as expected, and a short record under `docs/dogfood/` says what happened, what the owner had to do (target: nothing), and every gap found, each filed as its own task.

Cross-platform: a live Windows run; macOS is not exercised here and the record says so.

---
