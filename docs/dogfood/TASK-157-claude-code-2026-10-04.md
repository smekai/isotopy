# TASK-157 dogfood — the arcade's base case on Claude Code (haiku, Pro plan)

**Date:** 2026-10-04 · **Verdict:** **PASS** — the team built a playable two-game arcade with a
correctly weighted total leaderboard, QA passed it, and the Orchestrator stopped itself. Run side by
side with [the Cursor record](./TASK-157-cursor-2026-10-04.md) on the same goal; the comparison is
§15. The base case's deliverable is the gap list in §13, not the arcade.

## 1. Setup

| | |
| --- | --- |
| Isotopy | 0.12.56, `main` at `ab1ab72` |
| Node / pnpm | v24.12.0 / 10.26.0 |
| Claude Code CLI | 2.1.263, `C:\Users\novik\AppData\Local\Microsoft\WinGet\Links\claude.exe` (`source: "path"`) |
| Connection | subscription, `claude auth status` → `loggedIn: true`, `subscriptionType: "pro"` — the cheapest paid plan |
| Preferences | `engine: claude-code`, `modelTier: economy`, **`engineModels: { claude-code: "haiku" }`**, `permissionMode: skip`; composer showed *"Engine: Claude Code · haiku — pinned in Setup"* |
| Isolation | `ISOTOPY_USER_HOME=C:\tmp\isotopy-dogfood-157\user`, `ISOTOPY_HOME=C:\tmp\isotopy-dogfood-157\home` |
| Target | `C:\Development\smekai\dogfood-arcade-claude`, baseline `e2fdcf2` |
| Project id | `dogfood-arcade-claude-5eadf13d` |
| Ports | 9488 server · 5188 UI · 5192 product |

**Why a pin and not a tier.** `selectModel` gives `run.model` precedence over every tier, and the
`orchestrate` stage is hard-coded to `deep`. A tier alone would have run the Orchestrator on opus; the
pin is the only cap (`TASK-142` found the same).

**Green baseline before spending:** lint, typecheck, **936 tests passed** (2 skipped), **52 checks**,
build, `gen:skills` with no diff, **e2e 77 passed / 4 skipped**.

**How the server was launched, and why it matters.** The engine CLIs fail from a sandboxed shell
(`docs/running-the-app.md`), and the Terminal panel's prompt detection failed (its shell-integration
script was missing), so the server ran first from an unsandboxed background shell and later from its
own PowerShell window. The background shell's 30-minute limit and one window closing are artefacts of
this setup, recorded in §12 so they are not mistaken for product defects.

## 2. The goal, verbatim

> A minigame arcade for the browser: two small games, a leaderboard per game, and a total leaderboard
> where a record in a newer game counts more than the same record in an older one. Vite + TypeScript,
> scores in localStorage, no backend. Serve the dev server on port 5192.

Identical to the Cursor run's goal except the port. A fixed answer sheet (reaction + memory games,
newer game ×2, typed player name) was prepared for the Orchestrator's questions; this run asked none.

## 3. The baseline the run started from

An empty repository: `README.md` stub, `.gitignore` (`node_modules/`, `dist/`, `.isotopy/`), one
commit `e2fdcf2`. Bundled as `docs/dogfood/baseline/dogfood-arcade-claude-e2fdcf2.bundle`.

## 4. Onboarding — what a newcomer meets

First launch is the goal composer over **Scratch workspace — this run gets its own folder**. The new
path (`TASK-168`) worked first time: **Project → Add project… → paste
`C:\Development\smekai\dogfood-arcade-claude` → Enter → Select this folder**, and the switcher named
the project. No clicking through `C:\` this time.

## 5. Team, as proposed and as approved

The Orchestrator (haiku, 25 s, **$0.084**) asked nothing and proposed two roles:

| Role | Persona · step task | Tier |
| --- | --- | --- |
| Implementing the arcade | developer · implement-feature | run default (pinned haiku) |
| Verifying the arcade | tester · verify-feature | run default (pinned haiku) |

Approved **unedited**. Its rationale included *"Skipping the planner keeps us under the 10-minute time
constraint"* — the per-step budget read as a deadline for the whole goal (`TASK-186`).

## 6. Runs

| # | Run | Started (UTC) | Settled | Stages | Cost |
| --- | --- | --- | --- | --- | ---: |
| 1 | `a8ab518f` Orchestration | 18:32:32 | 18:33:01 | orchestrate ✓ | $0.084 |
| 2 | `0c7d09d9` Minigame Arcade Build | 18:33:19 | 18:52:32 | implementation ✓, verification ✓ PASS | $0.553 |
| — | Orchestrator review of #2 | | | decision `stop` | $0.036 |

**The Developer killed Isotopy's server.** About 90 s into implementation it cleaned up its dev
server with `Get-Process -Name "node" | Stop-Process -Force`, which stopped Isotopy's API server too
(18:34:50 UTC). Nothing was logged — the process was killed, not failing (`TASK-179`). After a manual
restart at 18:44:18 the durable runtime **resumed the run**: implementation re-ran, found its files
already on disk, fixed two TypeScript errors, stopped its dev server **by port** this time, and
passed. QA then ran 35 turns, installed Playwright, wrote 9 tests, and reported PASS.

The recorded $0.637 for the runs excludes the killed first Developer attempt (`TASK-190`).

## 7. What the team built — per capability

| Capability | Built |
| --- | --- |
| Two games | **Number Guess** (score `100 − 5 × attempts`) and **Click Master** (clicks in 10 s) |
| Per-game leaderboard | Top 5 per game, from localStorage |
| Weighted total | Fixed weights: Number Guess ×1, **Click Master (newer) ×2** |
| Persistence | `arcade_scores` in localStorage |
| Stack / port | Vite 5.4 + TypeScript, dev server on 5192 |
| Player identity | `prompt("Enter your name:")` on each saved score |

**Product gaps (the arcade's, not Isotopy's — not filed on this board):** the total **sums every
play** rather than each player's record, so playing more inflates it (Eve's three plays of 10 total
30); the per-game Top 5 lists the same player more than once; names come from a blocking `prompt()`.

## 8. Embedded Preview checks

`Start the product` (automation configured by hand: `npm.cmd run dev -- --port 5192 --strictPort`)
**failed** with `MODULE_NOT_FOUND` — root-caused in the Cursor run (§8 there) to the quoted bare
`npm.cmd` (`TASK-181`). It was also marked `ready` 28 ms after start, because QA's leftover dev
server was already answering on 5192.

The product was verified through that leftover server, in the browser:

- **Seeded scores** — Ann G80/C30, Bob G50/C50, Cara G40, Dan C40, Eve G10×3 — gave exactly the
  expected totals: **Bob 150, Ann 140, Dan 80, Cara 40, Eve 30**. Dan's 40 in the newer game outranks
  Cara's 40 in the older one: the weighting holds.
- **Played Click Master:** 12 clicks → score 12, saved.
- **Played Number Guess:** binary search found 20 in seven attempts → score 65, saved.
- **Total for the new player:** 65 × 1 + 12 × 2 = **89**, as shown.

`window.prompt` was stubbed in the browser to play without a modal (§12).

## 9. Measured changed files

No commits (`git rev-list --count e2fdcf2..HEAD` = 0). Untracked, excluding report folders:

| File | Lines |
| --- | ---: |
| `src/main.ts` | 276 |
| `src/index.css` | 283 |
| `tests/arcade.spec.ts` | 254 |
| `VERIFICATION_REPORT.md` | 124 |
| `package-lock.json` | 1,066 |
| `playwright.config.ts`, `package.json`, `tsconfig.json`, `index.html`, `vite.config.ts` | 82 |
| **Total** | **2,085** |

Plus `playwright-report/` and `test-results/`, not gitignored. Isotopy's own change capture recorded
the same 12 paths.

## 10. Orchestrator stop

**Yes.** After reviewing run #2: *"Orchestration goal is fully met. All acceptance criteria verified:
two playable games, per-game leaderboards, total leaderboard with weighted scoring, localStorage
persistence, TypeScript/Vite build, dev server on port 5192, and 100% test pass rate with no defects."*

## 11. Screenshots

- [`01-claude-team-proposal.png`](./assets/task-157/01-claude-team-proposal.png) — the two-role team as proposed.
- [`02-claude-run-passed.png`](./assets/task-157/02-claude-run-passed.png) — the team run, both stages passed.
- [`05-claude-arcade.png`](./assets/task-157/05-claude-arcade.png) — the arcade (fresh browser profile, so empty boards).

## 12. Undocumented interventions

1. **Restarted the API server** after the Developer killed it (§6). Unattended, this run would have
   stopped there.
2. **Configured `.isotopy/automation.json`** (`validation` + `ui`) — TASK-157 expects a human to.
3. **Stubbed `window.prompt`** in the browser to play the games; no product file was touched.
4. **Setup artefacts, not product defects:** the server ran from an agent shell (§1), whose
   30-minute limit later killed one server wrapper during the Cursor run; and three Vite servers the
   team left behind were stopped by PID after the dogfood.

No human edited the target.

## 13. Defects found, filed, not fixed here

| Task | Finding |
| --- | --- |
| `TASK-179` (P1) | An agent stopped every node process and took Isotopy's server down |
| `TASK-181` (P1) | A bare `npm.cmd` automation command fails on Windows (`%~dp0` under a quoted name) |
| `TASK-185` (P2) | Agents leave dev servers running and debris in the repo; nothing is committed |
| `TASK-186` (P2) | The Orchestrator reads the per-step budget as a deadline for the whole goal |
| `TASK-189` (P2) | Run view: stale after a restart; Preview tab and team card hidden; run title is the whole prompt |
| `TASK-190` (P3) | A killed attempt's spend disappears from the run's cost |

The Cursor run filed the rest (`TASK-180`, `182`, `183`, `184`, `187`, `188`).

## 14. Not done, deliberately

Schedules, the board poller and the unattended stretch — the inductive step, after `TASK-178`.
Deployment. A second feature on the same product.

## 15. Comparison — Claude Code vs Cursor on the same goal

| | Claude Code · haiku (Pro) | Cursor · auto (free allowance) |
| --- | --- | --- |
| Orchestrator's first move | `propose_team`, no questions | `delegate_milestone_planning` |
| Questions to the owner | 0 | 1 (which two games — with options) |
| Planning | none | milestone *Arcade MVP*, 3 features |
| Team | Developer + QA | PM scoping, Developer, Architect review, QA, Orchestrator closeout |
| Runs | 2 | 5 (orchestrate, plan, 1 delivery + 2 fix runs) |
| Outcome | **PASS** — two playable games, weighting verified | **Needs attention** — tested shell, no games |
| Tests the team wrote | 9 Playwright | 6 Vitest + 10 Playwright |
| Rigour | passed with a summing leaderboard | failed a feature on a README Node floor |
| Orchestrator stopped itself | yes | no — stuck on an invalid decision (`TASK-182`) |
| Spend | **$0.67** recorded (+ an unrecorded killed attempt) | **511k in / 70k out / 2.21M cached tokens**; Cursor reports no cost |
| Wall clock | 19 min, ~9.5 of them with the server dead | ~29 min until the loop stalled |

**Read honestly:** Cursor's team was the more careful one and Claude's the more productive one. The
outcome difference is mostly Isotopy's, not the engines': Cursor's fix loop could not converge
because the follow-up runs never delivered the fix to the Developer (`TASK-180`), and Claude's run
survived only because a human restarted the server its own Developer killed (`TASK-179`).

## 16. macOS audit — reasoned through, not executed

No Mac was used. `TASK-181` is Windows-only (`cmd /s /c` quoting); POSIX spawns without a shell.
`TASK-179`'s equivalent on macOS is `pkill node`, so the fix must state the rule, not one OS's
command.

## 17. Open questions this run raises

- Should an unattended Isotopy run as a supervised service that restarts itself, given that an agent
  can kill it (`TASK-179`) and nothing else will?
- Should a feature run commit its work, and who commits (`TASK-185`)? The inductive step needs history.
