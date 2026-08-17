# TASK-141 — Milestone F dogfood, Claude Code

**Verdict: PASS** · **Date:** 2026-08-17 · **Platform:** Windows 11 Home 10.0.26200

Repeats the TASK-128 clean-newcomer focus-timer path with Claude Code, so Milestone F has a
second engine's evidence beside the Codex run. **This task does not close Milestone F** —
TASK-142's Cursor rerun remains required.

The headline: from a clean baseline the team scoped, designed, built, reviewed and independently
verified the feature; verification caught a **real accessibility bug in its own work**, the run
went `needs_attention` instead of dying, the Orchestrator issued one precise partial retry, the
fix passed, and the Orchestrator stopped itself. Total spend **$6.69**, wall clock **~35 min**.

## 1. Setup

| | |
| --- | --- |
| Isotopy | 0.10.4, commit `ef96a1b` (existing checkout, `git pull` only — **no fresh clone**) |
| Node / pnpm | v24.12.0 / 10.26.0 (manifest floor `>=22.5`) |
| Claude Code CLI | 2.1.215, `C:\Users\novik\AppData\Local\Microsoft\WinGet\Links\claude.exe`, resolved via PATH (`source: "path"`) |
| Connection | Claude subscription (`connectionMode: "subscription"`, no API key) |
| Preferences | `engine: claude-code`, `modelTier: balanced`, `permissionMode: skip`, **no exact-model pin** |
| Resolved models | team roles → `claude-sonnet-5`; `orchestrate` stage → deep tier; Developer → deep tier (the Orchestrator's own choice) |
| Isolation | `ISOTOPY_USER_HOME=C:\tmp\isotopy-dogfood-141\user`, `ISOTOPY_HOME=C:\tmp\isotopy-dogfood-141\home` |
| Target | `C:\Development\smekai\dogfood-focus-timer`, baseline commit `87fe592` |
| Project id | `dogfood-focus-timer-697c765a` |
| Ports | 9477 server · 5173 UI · 5180 target product |

**Model resolution.** `balanced` was chosen over an exact-model pin deliberately: `selectModel`
gives `run.model` outright precedence, so pinning `engineModels` would have made every per-role
tier inert — and per-role tiers are required evidence here.

**Pre-flight quota probe.** Isotopy cannot report Claude Code login state (`detect()` never sets
`loggedIn`; there is no `install()`/`login()` for this engine), so the check was made out of band
by mirroring the adapter's own invocation. Result: exit 0, `rate_limit_info.status: "allowed"`,
five-hour window resetting 15:10 local. Recorded: `overageStatus: "rejected"`
(`org_level_disabled`) — a five-hour limit would have had no overage cushion.

**Green baseline before spending:** lint, typecheck, **838 tests passed**, build, `gen:skills`
with no resulting diff, **e2e 68 passed / 4 skipped** — exactly the 0.10.4 figures TASK-143
recorded.

## 2. The goal, verbatim

> Evolve this focus timer into one I would actually use every day: let me set the focus and break
> lengths anywhere from 1 to 120 minutes, remember the timer's state across a page reload,
> alternate automatically between focus and break, and keep a history of completed focus sessions
> only. Keep the existing Start, Pause and Reset controls working, and make the timer's state
> announced accessibly.

**This is a reconstruction, not TASK-128's literal string** — see §15.

## 3. The baseline the run started from

TASK-128's target (`adhd-testbed/dogfood` at `4175c97`) no longer exists on disk, and the
focus-timer spec was never written into a task file. The baseline was therefore recreated: a
minimal Vite + TypeScript + Vitest focus timer that builds, runs and tests green, missing exactly
the four things the goal asks for.

Present at `87fe592`: a hard-coded 25-minute countdown (`FOCUS_SECONDS` a module constant, not a
parameter), Start/Pause/Reset, mm:ss display, a plain status line, **9 passing tests**, a working
production build. Absent: configurable lengths, reload persistence, Focus/Break alternation,
session history — and the status line was a plain `<p>` with **no** `role="status"`/`aria-live`,
the accessibility gap TASK-128's team closed.

**The baseline is preserved in this repository, not only on the machine that ran it.** The target
lives at `C:\Development\smekai\dogfood-focus-timer` and its git repository has **no remote**, so
the commit would be unreachable the moment that directory is deleted — which is precisely the
reproducibility gap that lost TASK-128's `4175c97` and forced this recreation. The prose above
describes behaviour and could not rebuild the exact 14-file tree.

A complete bundle is therefore committed alongside this record:

- **Artifact:** [`baseline/dogfood-focus-timer-87fe592.bundle`](baseline/dogfood-focus-timer-87fe592.bundle)
- **Full SHA:** `87fe5929f60f92b6f0c10ffc610229d34047f82b`
- **Restore:** `git clone docs/dogfood/baseline/dogfood-focus-timer-87fe592.bundle <target>` —
  verified to check out that exact SHA with all 14 tracked files, then `pnpm install`.

TASK-142 points at this artifact rather than at a local path.

## 4. Onboarding — what a newcomer meets

- **There is no onboarding wizard.** The first screen is a goal composer over a *scratch
  workspace* ("this run gets its own folder"). A newcomer who types their goal here builds in a
  temp folder, not their project; that registering a project comes first is knowledge the screen
  does not supply.
- **The default model tier is Fast (`haiku · effort low`)**, not Balanced. A newcomer running a
  real feature on the default gets the weakest model, and nothing on the screen suggests otherwise.
- **Claude Code's engine card shows installation only** — "Installed · 2.1.215" and the resolved
  path. No login or quota state, and no Login button (Cursor and Codex have both). A newcomer
  cannot tell from Isotopy whether their plan will accept a run. This is the gap that forced the
  out-of-band probe in §1.
- Setup is otherwise clear: engine radio → status → Connection (each mode explained) → Model tier
  with a resolved `→ haiku · effort low` line → Permissions with "Never block (recommended)".

Screenshots: `01-first-launch.png`, `02-setup-ai-harness.png`.

## 5. Team, as proposed and as approved

The Orchestrator proposed **"Daily Focus Timer"** on its first turn, **asked no questions**, and
was approved unedited — no `roleTiers` overrides were sent, so these tiers are the model's own.

| Role id | Label | Persona | Step task | Tier | Policy | Gate | Interactive |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `planning` | Scoping | `project-manager` | `plan-feature` | run default | standard | no | no |
| `design` | Designing the interaction | `product-designer` | `design-experience` | run default | standard | no | no |
| `implementation` | Implementing | `developer` | `implement-feature` | **deep** | standard | no | no |
| `review` | Reviewing | `software-architect` | `review-implementation` | run default | **quality** | no | no |
| `verification` | Verifying | `tester` | `verify-feature` | run default | **quality** | no | no |

The Orchestrator raised the Developer to `deep` on its own reasoning — "the
persistence-plus-state-machine interaction is the subtle, correctness-critical core of this run" —
while leaving everyone else on the run default "to respect the user's choice and cost", and gave
both quality roles `quality` policy so they still run after a blocker. That is TASK-115's per-role
presets and TASK-127's policy model being used as intended, unprompted.

Screenshot: `03-team-proposal.png`.

## 6. Runs

| # | id | Pipeline | Status | Duration | Cost |
| --- | --- | --- | --- | --- | --- |
| 1 | `7c077542` | `orchestration` | completed | 46s | $0.35 |
| 2 | `6a79fbad` | `team-85c282d9` | **needs_attention** | 814s | $3.42 |
| 3 | `d744497c` | `team-85c282d9` | completed | 791s | $2.92 |

**Grand total $6.69**, against a $20 / 2h budget. Wall clock 08:36:32 → 09:11:16 UTC (~35 min).

Per stage:

| Run | Stage | Status | Cost | Verdict |
| --- | --- | --- | --- | --- |
| 2 | planning | passed | $0.388 | — |
| 2 | design | passed | $0.311 | PASS |
| 2 | implementation | passed | $1.128 | — |
| 2 | review | passed | $0.382 | PASS |
| 2 | verification | **failed** | $1.208 | **FAIL** |
| 3 | planning | **skipped** | $0.000 | — |
| 3 | design | **skipped** | $0.000 | — |
| 3 | implementation | passed | $1.334 | — |
| 3 | review | passed | $0.284 | PASS |
| 3 | verification | passed | $1.305 | PASS |

**The defect verification found, in its own team's work.** `statusText()` in `src/main.ts` derived
"Ready" vs "Paused" by comparing `remaining === focusSeconds`. Pausing immediately after Start —
before any tick — therefore announced "Ready" instead of "Paused", breaking the accessibility
requirement on the most ordinary interaction there is. The tester reproduced it deliberately
before reporting, with a dedicated repro script, rather than reporting a flaky assertion.

**The Orchestrator's response** (turn 2, `start_run`, `fromStage: implementation`):

> Verification found a concrete, reproducible defect in src/main.ts's statusText() logic that
> directly breaks the accessible-announcement requirement on a routine interaction (Start then
> Pause). This is a bug fix within already-approved scope and design, not a scoping or design gap,
> so scoping and design don't need to run again.

Run 3 skipped `planning` and `design` accordingly and fixed the logic to
`hasStarted ? "Paused" : "Ready"`, adding `test/status-text.spec.ts` covering the whole
Ready/Focusing/Paused/Break/Break-paused matrix.

## 7. What the team built — per capability

| Capability | Verified | How |
| --- | --- | --- |
| Configurable focus/break lengths, 1–120 min | yes | Live inputs clamp 500→120, 0→1, −5→1; disabled while running |
| State survives a page reload | yes | Reload at the focus/break boundary preserved phase, clock and history |
| Automatic Focus → Break → Focus | yes | Real one-minute phases driven end to end in a live browser |
| History of completed **focus** sessions only | yes | One entry after one focus; still one after a completed break |
| Start / Pause / Reset still work | yes | Driven by keyboard only (focus + Enter) |
| Accessible state announcement | yes | `aria-live="polite"`, `aria-atomic="true"`; announces once per transition, not per tick |

Target app: **9 tests → 31 tests**, all passing; production build green.

## 8. Embedded Preview checks

`GET /automation/product` reported `state: "ready"`, `url: http://localhost:5180/`,
`framing.allowed: true`. The Preview tab framed the running product inside Isotopy with Stop and
Restart controls — an iframe whose document is genuinely the product (`#clock` read through the
frame boundary). Screenshot `08-embedded-preview.png`.

Twelve interactive checks were driven against the live product; **all twelve passed** (an initial
FAIL was my own assertion bug — `#phase` has `text-transform: uppercase`, so `innerText()` returns
"BREAK" where `textContent` returns "Break"; re-confirmed with a dedicated script).

Two TASK-138 behaviours confirmed live, neither of which the plan predicted seeing:

- **The `## Environment` block was actually used.** The tester started the product *itself* via
  `POST /automation/product/start` with the project header, then drove the URL Isotopy gave it —
  it did not start its own server. That is exactly the seam TASK-138 designed.
- **Isotopy restarted the product after the run.** Run 3 completed at 09:11:16.308; the product
  process restarted at 09:11:16.711 (`runCompleted` → `refreshFor()`), so the preview was never
  the previous build.

The tester also recorded that no native browser tool was available and fell back to Playwright —
the policy TASK-138 wrote into the persona, working as designed. See §13 for its side effect.

## 9. Measured changed files

**Run 2 — exact agreement.** Isotopy reported `source: "git"`, **2 created / 6 edited**; `git
status --porcelain` at the same moment reported the same eight paths. `changes.json` and
`changes.md` were both written under `.isotopy/runs/6a79fbad/changes/`. The UI showed
"See what was built" and "Open project folder".

**Run 3 — under-reported.** Isotopy reported **1 created** (`test/status-text.spec.ts`) and no
edits. But run 3's whole purpose was editing `src/main.ts`, which it did (`git diff` confirms
`statusText` rewritten). The file was already `M` in run 3's recorded baseline `dirty` list, so
the collector treated it as pre-existing and omitted it. See §13.

Final target diff against `87fe592`: 6 files changed, 431 insertions, 31 deletions, plus 3 new
untracked files.

## 10. Orchestrator stop

The Orchestrator **stopped itself** — no user stop was issued. `status: "stopped"`,
`stoppedAt: 2026-08-17T09:11:16.319Z`, three turns total (`propose_team`, `start_run`, `stop`), no
`decisionError` at any point. Its own reason:

> All five roles completed with a clean PASS and zero blocking or non-blocking findings. […] This
> run additionally caught and fixed a real accessibility regression (false 'Ready' announcement
> after Pause) and pinned it with tests and a regression-guard proof. Nothing in the findings
> points to remaining work the same team should do.

All three runs terminal; product stopped; ports 9477, 5173 and 5180 released; `~/.isotopy`
untouched (`projects: []`), all state under the isolated root.

## 11. Screenshots

**Provenance note on 01 and 02.** These two were originally captured *after* the project was
registered and preferences were set, so they showed a registered project and a `Balanced` tier —
not the empty-home state §4 describes. They have been **re-captured against a pristine, empty
`ISOTOPY_USER_HOME`** (`C:\tmp\isotopy-firstlaunch`) after the run, reproducing the same first-launch
condition; `GET /projects` returned `home` only, with no registered projects, at capture time. The
§4 findings were originally read from the live DOM before registration and are unchanged — the
screenshots now actually evidence them. Screenshots 03–09 are from the run itself, untouched.

| # | File | Shows |
| --- | --- | --- |
| 01 | `01-first-launch.png` | First launch on an empty user home — Home only, "No runs yet.", scratch-workspace chip, **Fast** default (re-captured, see above) |
| 02 | `02-setup-ai-harness.png` | Setup → AI Harness on an empty user home: installed, no login state, connection modes (re-captured, see above) |
| 03 | `03-team-proposal.png` | The five-role proposal with per-role tier dropdowns, before approval |
| 04 | `04-needs-attention-run.png` | Run 2 parked at `needs_attention` after the QA FAIL |
| 05 | `05-preview-controls.png` | Keyboard-driven Start/Pause/Reset in the live product |
| 06 | `06-preview-break-phase.png` | Auto-transition into Break, one focus-only history entry |
| 07 | `07-preview-second-focus.png` | Break auto-continuing back into Focus, history unchanged |
| 08 | `08-embedded-preview.png` | The built product framed inside Isotopy's Preview tab |
| 09 | `09-final-run-artifacts.png` | Final run view — stages, cost, "1 created" |

## 12. Undocumented interventions

1. **Repaired the Playwright browser cache** after the run broke it (§13.2), by running
   `npx playwright install chromium --only-shell` in `packages/ui`. This repaired damage the run
   caused; it did not nudge the run, which had already finished.
2. **Started `pnpm dev` from the agent shell** rather than the user's terminal. The plan assigned
   this to the user because a sandboxed shell makes the spawned `claude.exe` die with 0xC0000142;
   the pre-flight probe proved that gotcha did not apply in this session, and no spawn failure
   occurred.
3. **Re-captured screenshots 01 and 02 after the run**, against a fresh empty `ISOTOPY_USER_HOME`,
   because the originals were taken after project registration and did not show the state §4
   describes. Raised in review of PR #52. No run state was touched; see the provenance note in §11.

Nothing else. No stage was nudged, no answer was typed on the product's behalf (it asked nothing),
no run was manually restarted, and the Orchestrator was never stopped by hand.

## 13. Defects found, filed, not fixed here

**13.1 — `RunChangeCollector` omits further edits to a file already dirty at run start.**
*Isotopy defect.* Run 3 edited `src/main.ts` and reported only the one new test file. Because
`src/main.ts` was in the baseline's `dirty` list, the git-status comparison sees the same ` M`
before and after and concludes nothing changed. This bites precisely in the Orchestrator's
multi-run case — every run after the first in an initiative starts dirty — so TASK-126's bar ("a
finished run names what it changed") is systematically under-met from run 2 onward. Content
hashing, or diffing blob contents rather than status codes, would close it.

**13.2 — The QA persona's global Playwright install broke the host's pinned browser.** *Policy
defect.* Having no native browser tool, the tester ran `npm install playwright@1.62.1` and
`npx playwright install`, which pruned `chromium_headless_shell-1228` — the build the repo's own
`@playwright/test@1.61.1` e2e suite depends on. `pnpm e2e` would have failed on this machine until
repaired. A run should not mutate shared, user-level toolchain state; the persona should prefer
the project's own Playwright or an isolated browser path.

**13.3 — Post-run Orchestrator decision turns are not reflected in surfaced cost.** *Minor.* Run 1
still reports $0.35 after three turns (`propose_team`, `start_run`, `stop`). The two settle-time
decisions appear in no run's cost, so the displayed total understates real spend by an unknown
amount.

**13.4 — `.claude/skills/run-app/SKILL.md` is stale in three ways.** *Pre-existing, found in
pre-flight.* Its proxy list omits `/orchestrations` and `/automation` (both in
`packages/ui/vite.config.ts` and mounted in `app.ts`); it documents no Preview endpoints; and its
claim that a subscription session limit is "a hard failure, not a pause" was made obsolete by
TASK-061, which parks the stage on a durable timer. TASK-103 records this class of staleness
costing real time in the TASK-094 dogfood. Not fixed here because the run had to start from an
unmodified `main`.

**Not a defect:** the intermittent `Invoke-RestMethod` failures during polling were a PowerShell
5.1 connection-pooling artifact in my own harness — single calls always succeeded and a Node
poller had no failures. Recorded so a future rerun does not chase it.

## 14. Not done, deliberately

- **No fresh clone**, by the user's decision — so Milestone G's outstanding clean-clone exit
  condition (`.tasks/DONE.md:33`) is **still unverified** after this task.
- No standalone screen-reader application was run; the live region was verified in the DOM
  (`aria-live`, `aria-atomic`, announce-once-per-transition), as TASK-128 also did.
- macOS was reasoned through against the code paths in §16 and **not executed**; no Mac was used.
- The run-app skill staleness (§13.4) was filed, not fixed.
- No gate was exercised: the Orchestrator proposed `gateAfter: false` for every role, so the
  approval gate path is untested by this run.

## 15. Comparison with TASK-128 (Codex)

| Dimension | Codex, 2026-08-13 | Claude Code, this run |
| --- | --- | --- |
| Baseline | `adhd-testbed/dogfood` @ `4175c97` (now gone) | recreated, `87fe592` |
| Team | 4 roles (Designer, Developer, QA, PM) | 5 roles (PM, Designer, Developer, Architect, QA) |
| Per-role tiers | not recorded | Developer raised to `deep` by the Orchestrator |
| Questions asked | not recorded | **none** — proposed a team on turn 1 |
| Runs | 1 + a replay after a product fix | 3 (orchestration, needs_attention, fix) |
| Defect found by QA | a DOM live-region regression | a false "Ready" announcement after Pause |
| Isotopy defect found | partial-retry seeding validated `fromStage` against the conversation | changed-files under-report on dirty files (§13.1) |
| Changed files | 1 created, 2 edited | 2 created, 6 edited (run 2) |
| Target tests | 27 passing | 9 → 31 passing |
| Duration | 3m08s final replay | 35 min end to end |
| Spend | not recorded | $6.69 |
| Stop | normal | self-authored `stop` decision |

The two runs are comparable in shape and outcome, not in numbers: this baseline is a recreation,
this goal is a reconstruction, and Codex's engine settings and spend were never recorded.

## 16. macOS audit — reasoned through, not executed

No Mac was used. The paths that would differ:

| Concern | Where | What differs |
| --- | --- | --- |
| Node floor | root `package.json` `engines.node` `>=22.5` | `AbortSignal.any` (`product-process-service.ts`, `utils/health-poll.ts`) needs ≥22; Windows ran 24.12.0, so the floor is the manifest's claim, not what was exercised |
| pnpm / executable selection | `engines/subprocess.ts:99`, `domain/rules/deployment.ts:11` | `commandNeedsWindowsShell` is `win32 && /\.(cmd\|bat)$/` — always false on macOS, so the `windows` override in `automation.json` is skipped and bare `pnpm` must be on the **server process's** PATH; a `~/.zshrc` corepack shim is not inherited by a GUI-launched process |
| Persona delivery | `claude-code.ts:216` | The prompt-folding fallback is Windows-only; macOS always passes `--append-system-prompt`, a different and untested path |
| Claude binary lookup | `claude-code.ts:88` | `which` not `where`; extension binary is `claude`, no `.exe` |
| Path handling | `domain/rules/projects.ts:8` | `normalizeProjectRoot` lower-cases only on win32 — right on a case-sensitive volume, wrong on the case-insensitive APFS default. TASK-130 already flags the lowercase `.isotopy` path |
| Process cleanup | `engines/subprocess.ts:47,63,170` | macOS spawns `detached: true` and kills the process group; Windows uses `taskkill /T /F`. **The behaviour most worth a live Mac** — a leaked `vite` would hold 5180 and the next product start would "succeed" against a stale process |
| Limit reset parsing | `domain/rules/engine-limit.ts` | `Intl.DateTimeFormat` with the CLI's named zone; ICU data differs by platform |

## 17. Open questions this run was asked to answer

**`docs/decisions.md:144` — did a real need for a runs overview appear?** No. Three runs in one
initiative sat legibly in the left rail, each labelled with its status
(`COMPLETED` / `NEEDS ATTENTION` / `COMPLETED`) and its own action buttons. Nothing in this run
argued for a panel. The rail was sufficient at this scale; the question stays open for larger
initiatives.

**`docs/decisions.md:38-70` and TASK-139 — did the decision loop spin or dead-end?** No, and this
is the clearest evidence yet that TASK-139 holds. Exactly **one** `start_run` followed the
`needs_attention` run; it was a *partial* retry from `implementation`, carrying the specific
rejection into the task text; and the Orchestrator then stopped itself. `blockedLaunchRefusal`
never came near firing (its ceiling is three consecutive blocked launches). The runs #10–#13
pattern — one pipeline re-run four times for 3.44M input tokens — did not reproduce.
