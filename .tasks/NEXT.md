# Next

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

## TASK-116: README — top-level product schema (“How it works”)
**Priority:** P1 | **Tags:** ui, server, milestone-f
**Updated:** 2026-08-07 11:40

**Milestone F — Fixpoint.** Comprehension before exposure: the README still explains the
static pipelines and not the Orchestrator that now sits above them.

Add a “How it works” section to `README.md` with a mermaid diagram of the whole product flow: user → orchestrator conversation → team composition/approval → composed runs (personas + step-tasks + engines) → closeout artifacts → orchestrator decision loop → milestones/task board.

Update this section as part of the milestone so it reflects the orchestrator rather than only today’s static pipelines.

Cross-platform: n/a — docs only.

---

## TASK-128: Closing dogfood for Milestone F
**Priority:** P1 | **Tags:** testing, engine, ui, milestone-f
**Updated:** 2026-08-07 11:40

Milestones D and E both closed on a live dogfood rather than on tests, and F closes the
same way — but from a *clean* state, because F's bar is a first-time user.

Start from an empty `ADHD_USER_HOME`, install as the README instructs, register a fresh
project, and drive one goal end to end: build, evolve, and **see the result** — the files
it changed through `TASK-126`, and the product running through `TASK-138`. Record what a
newcomer would hit — every place the app assumes knowledge the person does not have. Fix
what is small; file what is not.

Record a release verdict for Milestone F.

Cross-platform: run on Windows; confirm every documented command is valid on macOS.

---
