# In Progress

## TASK-142: Rerun the Milestone F dogfood with Cursor, on the pool that has headroom
**Priority:** P0 | **Tags:** testing, engine, ui, milestone-f
**Updated:** 2026-08-23 19:45

Repeat the clean newcomer focus-timer path with Cursor. Start from the baseline named below and
isolated `ISOTOPY_USER_HOME`/`ISOTOPY_HOME`; require product onboarding, user-approved team
composition, real execution, measured changed files, embedded Preview verification, and a clean
post-run Orchestrator stop.

**The quota precondition was met on 2026-08-23, differently than this task predicted.** It expected
a monthly reset on 2026-09-03. What actually happened is that the usage dashboard showed the limit
is **two pools, not one** — **Auto + Composer at 11% used, API at 100% used**, 23% total. There is
headroom, and it is only in one of them.

**No preset could reach that pool, which became `TASK-164`.** Every Cursor rung was a
`gpt-5.3-codex` variant, and the tier named `auto` passes no `--model` at all, inheriting
`~/.cursor/cli-config.json` — `gpt-5.3-codex` on this machine, in the exhausted pool. `TASK-164`
added an `economy` tier and moved Cursor's ladder onto Composer and Anthropic. It ships first.

**The run pins the model anyway: `engineModels: { cursor: "auto" }`, tier `economy` beneath it.**
`TASK-164` does not make tier-driven running safe here. Only Economy and Fast land in the free
pool; Balanced, Deep and Max are Anthropic models on the exhausted one. Per-stage tiers are
independent of the run's tier, and the orchestrate assignment explicitly tells the Orchestrator not
to put the whole team on one tier — so it will spread roles into pools that are spent. A pin makes
every per-stage tier inert, which is the cost-safety property wanted here.

**The cost is that this run cannot reproduce `TASK-141`'s per-role-tier evidence**, which that run
went out of its way to produce. That is a divergence to write into the record as a finding, not to
gloss. Waiting until 2026-09-03 to run on tiers against the API pool was considered and rejected:
it closes the milestone eleven days later for evidence about a pool the product owner is not
choosing to spend from.

**Match TASK-141, not TASK-128.** TASK-128's target and its literal goal string are both gone —
the target repo was deleted and the goal was never written into a task file. TASK-141 recreated
both, so *that* is the comparable run.

Restore its baseline from the bundle committed in this repository — **not** from any local
directory, which is how `4175c97` was lost:

```
git clone docs/dogfood/baseline/dogfood-focus-timer-87fe592.bundle <target>
cd <target> && pnpm install
```

That checks out `87fe5929f60f92b6f0c10ffc610229d34047f82b` exactly, with all 14 tracked files.
Confirm the SHA before starting, then type this goal verbatim:

> Evolve this focus timer into one I would actually use every day: let me set the focus and break
> lengths anywhere from 1 to 120 minutes, remember the timer's state across a page reload,
> alternate automatically between focus and break, and keep a history of completed focus sessions
> only. Keep the existing Start, Pause and Reset controls working, and make the timer's state
> announced accessibly.

Follow TASK-141's evidence record section-for-section so the two are diffable.

**Spend comes from the Cursor dashboard, before and after.** The adapter reports no cost and no
tokens — `autoReview` is `unsupported` and the usage capture is empty — so the fields TASK-128
omitted cannot come from Isotopy for this engine. Record the dashboard reading at both ends and say
where the number came from. Confirm the pin survived before starting: `GET /settings` must echo
`engineModels.cursor === "auto"`, because `normalizeProjectPreferences` drops ladder-member pins
when the stored file has no `modelTier`, and a silent drop hands the run back to per-stage tiers.

**Watch whether an exhausted pool parks or just fails.** `detectEngineLimit` matches
`/usage limit|rate limit/` for Cursor, while the adapter's own hint table matches `/quota exceeded/`
separately — so a failure phrased "quota exceeded" would not park on the durable timer this task
counts on, and would never reach the limit modal's tier escape either. Capture the raw text
verbatim whichever happens; it is a finding on its own.

Confirm Cursor install/login through Isotopy before spending a run — unlike Claude Code, the Cursor
adapter does report `loggedIn`. External authentication, quota, or service unavailability is
`SKIP`; a product defect is `FAIL`. Note that a mid-run subscription limit is **not** a `SKIP` on
its own: since TASK-061 the stage parks on a durable timer and resumes.

**Two known adapter defects will be live and get recorded, not fixed here** (`TASK-154`,
Milestone I): Cursor's `session_id` is parsed and dropped, so every follow-up turn starts cold; and
`resolvePermissionPlan("cursor", …)`'s result is discarded, so every permission mode runs `--force`.

On `PASS`, combine the result with TASK-128's Codex evidence and TASK-141's Claude evidence to make
the final Milestone F release decision and update TASK-125 accordingly.

Cross-platform: run live on Windows. Audit Cursor binary lookup, Node 22.5+, pnpm/POSIX
executable selection, path handling, and process cleanup for macOS, recording macOS as
reasoned-through and untested unless a live Mac is actually used.

---

