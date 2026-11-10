# TASK-211 — the standing team on ShareTravel

**Verdict: PASS** · **Date:** 2026-11-10 · **Platform:** Windows 11 Home · macOS not exercised

The Standing team epic's live evidence. One initiative took ShareTravel's `TASK-138` (redeem an invite
code in the same transaction as the sign-up) from a goal to a merged pull request in **22 minutes**, along
the expected path, with no approval from the owner. The owner's only act during the run was to sign the
Claude Code CLI back in after its session expired overnight (§4).

## 1. Setup

| | |
| --- | --- |
| Isotopy | 0.14.49, `main` at `9b71303`, the `isotopy_travel` copy (ports 9577/5273, user home `~/.isotopy-travel`) |
| Target | `smekai/sharetravel_ai` fork, `main` at `b98db4e` |
| Engines | primary Claude Code 2.1.302 (Pro subscription), secondary Codex 0.163.0 (ChatGPT sign-in) |
| Preferences | `modelTier: economy`, `permissionMode: skip`, no model pin |
| Team | `.isotopy/team.md`: the template's `delivery` flow, and a `discovery` flow of the project's `product-strategist` (audit → competitors → ranked gaps) |
| CI | `ci.yml` runs on `workflow_dispatch` only, so the release starts it once (`TASK-222`) |

The fork's local `main` was 36 commits ahead of GitHub: October's work, merged locally under the old
rule. It was pushed as is before the run, without CI.

## 2. The goal, verbatim

> Do TASK-138 from the board: redeem an invite code in the same transaction as the user insert, so two
> concurrent sign-ups cannot both use one code, with a test that races two sign-ups on one code.

## 3. What happened

| Run | Flow | Stages | Engine | Took |
| --- | --- | --- | --- | --- |
| `42b32c31` | orchestration | the Orchestrator read `main` and chose `delivery` without asking | Claude | 5 min |
| `06e38c12` | delivery | plan → implement → **review PASS** → **verify PASS** (incl. mutation of the rollback and the row lock) → release prep → closeout | review on Codex, the rest on Claude | 13 min |
| `2a81f8ef` | release | pushed `isotopy/ebc04443`, opened [PR #2](https://github.com/smekai/sharetravel_ai/pull/2), started CI by `gh workflow run`, waited durably, CI green in 2 min, merged `7579964` | Claude | 4 min |

The change is one commit, `87447b7`: email, Google and admin sign-ups redeem the code inside the
user-insert transaction, and a refused redeem rolls the insert back. Tests +200 lines, including a race of
two sign-ups on one code. The closeout filed three follow-ups on the fork's board: `TASK-151` (check the
production default code's use count before deploying, owner), `TASK-152`, `TASK-153`.

## 4. What the owner had to do

- **Sign the Claude Code CLI in again.** Its OAuth session had expired overnight; the Orchestrator's first
  turn failed on it and the initiative waited silently. After `claude auth login` the turn was restarted
  and nothing else was asked. → `TASK-223`.

Nothing else: no approval, no answer, no merge.

## 5. Gaps

| Found | Filed |
| --- | --- |
| A release required CI; a project without it waited six hours and merged nothing | fixed in `TASK-222` |
| Millisecond durable waits could be lost by Aiki, the CI flake in `stage-wait.comp.ts` | fixed with `TASK-222` (PR #97) |
| An initiative starts on a logged-out engine and waits without telling the owner | `TASK-223` |
| The closeout refused `TASK-138` as unknown because the Developer had moved it to Done; the stage ended `failed` with a `PASS` verdict | `TASK-224` |
| October's initiatives no longer parse and are skipped silently at startup | `TASK-225` |
| The merged initiative branch stays locally and on `origin` | `TASK-226` |
