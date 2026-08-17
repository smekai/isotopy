# Next

## TASK-142: Rerun the Milestone F dogfood with Cursor after quota reset
**Priority:** P0 | **Tags:** testing, engine, ui, milestone-f
**Updated:** 2026-08-17 12:30

Repeat the clean newcomer focus-timer path with Cursor after the account's monthly
usage limit resets on 2026-09-03, or earlier if the user makes Cursor capacity available.
Start from refreshed `main`, the baseline named below, and isolated
`ISOTOPY_USER_HOME`/`ISOTOPY_HOME`; require product onboarding, user-approved team composition,
real execution, measured changed files, embedded Preview verification, and a clean
post-run Orchestrator stop.

**Match TASK-141, not TASK-128.** TASK-128's target and its literal goal string are both gone —
the target repo was deleted and the goal was never written into a task file. TASK-141 recreated
both, so *that* is the comparable run. Reuse its baseline at
`C:\Development\smekai\dogfood-focus-timer` commit `87fe592` (re-scaffold from
[`docs/dogfood/TASK-141-claude-code-2026-08-17.md`](../docs/dogfood/TASK-141-claude-code-2026-08-17.md) §3
if it has been deleted), and type this goal verbatim:

> Evolve this focus timer into one I would actually use every day: let me set the focus and break
> lengths anywhere from 1 to 120 minutes, remember the timer's state across a page reload,
> alternate automatically between focus and break, and keep a history of completed focus sessions
> only. Keep the existing Start, Pause and Reset controls working, and make the timer's state
> announced accessibly.

Follow TASK-141's evidence record section-for-section so the two are diffable, and record Cursor's
tier, model and spend — the fields TASK-128 omitted, which is why its numbers are not comparable.

Confirm Cursor install/login through Isotopy before spending a run — unlike Claude Code, the Cursor
adapter does report `loggedIn`, so this check is available in-product. External authentication,
quota, or service unavailability is `SKIP`; a product defect is `FAIL`. Note that a mid-run
subscription limit is **not** a `SKIP` on its own: since TASK-061 the stage parks on a durable
timer and resumes. On `PASS`, combine the result with TASK-128's Codex evidence and TASK-141's
Claude evidence to make the final Milestone F release decision and update TASK-125 accordingly.

Cross-platform: run live on Windows. Audit Cursor binary lookup, Node 22.5+, pnpm/POSIX
executable selection, path handling, and process cleanup for macOS, recording macOS as
reasoned-through and untested unless a live Mac is actually used.

---

## TASK-125: Milestone F — Fixpoint: stabilise to a demoable MVP
**Priority:** P0 | **Tags:** core, server, ui, engine, infra, milestone-f
**Updated:** 2026-08-10 14:10

A fixed point is where a system stops changing under its own operation. That is the goal:
stop adding, and make what exists hold still and hold up.

**The bar:** someone who is not us installs it, points it at a folder, describes a goal —
and *sees the thing that was built*. Today the last step barely exists. A run ends and the
result is somewhere on disk, and you have to already know where.

**Scope, in order:** `TASK-126` (a finished run names what it changed), `TASK-124`
(permission modes and blast radius), `TASK-138` (run the built product and show it),
`TASK-115` (per-role presets, pulled out of Milestone H once `TASK-129` made a stage's
model something an agent can reason about), `TASK-116` (README "How it works"), `TASK-139`
(the Orchestrator's decision loop stops dead-ending and spinning), `TASK-137` (one dialog
with the Orchestrator, plus the harness/model question at the start and honest stage
labels — widened on 2026-08-12, last before the dogfood), and `TASK-128` (the closing
dogfood). Already
closed: `TASK-092` (project automation and preview deploy), `TASK-127`
(a stage must not pass on output nothing could use), and `TASK-129` (model presets rather
than ids the plan rejects).

**Why `TASK-138` is here, decided with the user on 2026-08-10:** the second half of
`TASK-126` — starting the product and putting it in front of the user — was split into
Milestone H that morning and pulled back into F the same day. `TASK-126` delivered the
weaker reading of F's bar: a run *names* what it built. Seeing it run is the reading a
first-time user will have, and the demo cannot route around it. It sits after `TASK-124`
because it starts long-lived processes on someone else's machine, and that is exactly what
`TASK-124` gives the system an opinion about.

That is the **only** capability admitted after the "nothing else" rule below was written,
and admitting it is not licence for a second.

Nothing else. Features nobody has asked for belong to **Milestone H — Harmonic**; the two
research spikes belong to no milestone at all. `TASK-137` is here because a user asked for
it and because F's bar is a first-time user meeting the Orchestrator — the one surface the
demo cannot route around.

**Where the closing dogfood stands, as of 2026-08-17.** `TASK-128` closed `SKIP` — Codex passed,
Cursor was out of quota. `TASK-141` then closed **`PASS`** on Claude Code: a five-role team built
the feature, independent verification caught a real accessibility bug in its own work, the
Orchestrator recovered with one partial retry and stopped itself, and the built product was seen
running in the embedded Preview. **Only `TASK-142` (Cursor, unblocked 2026-09-03) now stands
between this milestone and its release decision.** Four defects were filed rather than fixed
(`TASK-144`–`TASK-147`); none blocked the run, but `TASK-144` under-cuts `TASK-126`'s bar for the
second and later runs of an initiative and is worth closing before the release decision.

Cross-platform: every task here is verified on Windows and reasoned through for macOS, and
`TASK-126`'s folder reveal and `TASK-124`'s per-CLI mode flags are where that bites.

---
