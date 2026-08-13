# Next

## TASK-141: Run the Milestone F dogfood with Claude Code
**Priority:** P0 | **Tags:** testing, engine, ui, milestone-f
**Updated:** 2026-08-13 12:35

Repeat TASK-128's clean newcomer focus-timer path with Claude Code after the user's plan
limit is available, expected on 2026-08-14. Start from refreshed `main`, a clean target at
the agreed dogfood baseline, and isolated `ADHD_USER_HOME`/`ADHD_HOME`; require product
onboarding, user-approved team composition, real execution, measured changed files,
embedded Preview verification, and a clean post-run Orchestrator stop. Preserve the exact
TASK-128 goal and evidence protocol so the result is comparable with Codex and Cursor.

External authentication, quota, or service unavailability is `SKIP`; a product defect is
`FAIL`. Record questions, decisions, team roles and tiers, usage, screenshots, Preview
checks, and every undocumented intervention. Do not close Milestone F from this task alone;
TASK-142's Cursor rerun remains required.

Cross-platform: run live on Windows. Audit Node 22.5+, pnpm/POSIX executable selection,
path handling, and process cleanup for macOS, recording macOS as reasoned-through and
untested unless a live Mac is actually used.

---

## TASK-142: Rerun the Milestone F dogfood with Cursor after quota reset
**Priority:** P0 | **Tags:** testing, engine, ui, milestone-f
**Updated:** 2026-08-13 12:35

Repeat TASK-128's clean newcomer focus-timer path with Cursor after the account's monthly
usage limit resets on 2026-09-03, or earlier if the user makes Cursor capacity available.
Start from refreshed `main`, a clean target at the agreed dogfood baseline, and isolated
`ADHD_USER_HOME`/`ADHD_HOME`; require product onboarding, user-approved team composition,
real execution, measured changed files, embedded Preview verification, and a clean
post-run Orchestrator stop. Preserve the exact TASK-128 goal and evidence protocol.

Confirm Cursor install/login through ADHD before spending a run. External authentication,
quota, or service unavailability is `SKIP`; a product defect is `FAIL`. On `PASS`, combine
the result with TASK-128's Codex evidence and TASK-141's Claude evidence to make the final
Milestone F release decision and update TASK-125 accordingly.

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

Cross-platform: every task here is verified on Windows and reasoned through for macOS, and
`TASK-126`'s folder reveal and `TASK-124`'s per-CLI mode flags are where that bites.

---
