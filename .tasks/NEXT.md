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

## TASK-139: The Orchestrator's decision loop must not dead-end or spin
**Priority:** P1 | **Tags:** server, engine, testing, milestone-f
**Updated:** 2026-08-12 11:38

**Milestone F — Fixpoint.** A fixed point is where a system stops changing under its own
operation. The loop between a settled run and the next decision does not have one: it
either stops dead or repeats itself. Both were observed on 2026-08-12, in the `dogfood`
project, on one goal.

### What was observed

**Dead end.** The Orchestrator proposed a Developer and a QA Engineer, reasoned correctly
that the QA role should survive a blocking verdict, and gave it an `executionPolicy` it had
invented — the assignment showed `"standard"` once inside a JSON example and named none of
the four legal values. The initiative died on one string:

```text
✗ Orchestrator produced no usable decision — team.roles.1.executionPolicy: Invalid option: expected one of "standard"|"quality"|"delivery"|"closeout"
```

**Spin.** Orchestration `08908e68`, goal *"Lets update a snake game - make it harder with
every peace taken. And change the color of the screen togather with this"*. Runs `#10`
`470690c7`, `#11` `b0a47dbc`, `#12` `2e08dc1d`, `#13` `a6e989b3` — four executions of the
same composed pipeline `team-08908e68`, every one of them Developer `passed` / QA `FAIL`,
every one blocked on the identical, plainly stated cause:

| Run | QA's stated blocker |
| --- | --- |
| `#10` | "The in-app browser was unavailable, and no Playwright configuration/dependency exists" |
| `#11` | "I could not independently perform browser runtime verification because no running URL or Playwright `webServer` was provided" |
| `#12` | "no browser instance was available, and the repository has no Playwright `webServer` configuration" |
| `#13` | "Browser connection — unavailable; discovery returned zero browsers" |

Only on the fifth turn did the Orchestrator `ask_user`: *"Please connect an in-app or
extension browser under Settings → Computer use."* That was knowable from `#10`. The four
runs cost **3.44M input tokens, 29k output, 19.7 minutes of engine time** — and by `#12`
and `#13` the Developer was reporting *"No repository files were changed"* and *"What
changed: Nothing."*

### The three fixes

**1. A rejected decision must inform the next attempt.** The prompt gap that caused the
dead end is already closed — `orchestrate.md` documents the enum and its semantics, and
`orchestrate-assignment.spec.ts` fails if a future policy or tier goes undocumented. What
remains is that nothing recovers. `consume` writes `formatValidationIssues(parsed.issues)`
to `orchestration.decisionError` and clears it the moment a decision parses, and nothing
reads it but `OrchestratorPanel`.

*Decided with the user on 2026-08-12:* feed the error back into the context. Explicitly
*not* an automatic retry — a retry spends a turn and hides a real prompt bug behind it, and
what it buys collapses once the next attempt is informed anyway. Two things stand in the
way: `renderOrchestrationContext` has no slot for it, and **`run.task` is frozen at
start** — `buildTask` runs once inside `start`, and `restartRun` re-runs the stage against
the stored `run.task`, so writing the error in at composition time reaches a *new*
orchestration and not the restarted stage that needs it. Decide where the injection happens
on restart and record it in `docs/decisions.md`.

Note also that a decision is parsed and rejected independently in two places —
`interpretDecision` in `domain/rules/stage-context.ts` and `consume` in
`services/orchestration-service.ts` — building the same "produced no usable decision"
sentence from two sites, with only the second storing anything. Fold them or leave them,
but do not add a third.

**2. `start_run` must be able to target a stage.** This is what cost the 3.44M tokens. Read
the tasks the Orchestrator wrote across `#11`–`#13`: *"Complete runtime verification…"*,
*"Independently verify…"*, *"Re-run verification with an available browser: … do not change
implementation unless verification exposes a defect."* It was asking for a verification-only
run in prose, every time, because it has no way to say it in the decision. `launch` calls
`startComposedRun`, which always begins at the pipeline's first stage. The machinery for
starting partway already exists — `restartRun(runId, stageId)` seeds upstream outcomes and
outputs — but `start_run` cannot reach it.

Give the `start_run` decision an optional stage to begin from, validated against the
approved team's role ids exactly as `withRoleTiers` validates `roleTiers`, and document it
in `orchestrate.md` beside the other fields. An unknown id is rejected, not silently
ignored.

**3. An unmet environment precondition is not a quality verdict.** QA reported
`VERDICT: FAIL` four times, but the implementation was never what failed — the environment
was missing. `needs_attention` carries the same meaning as "the code is broken", so nothing
downstream can tell "a human must fix the code" from "a human must configure a browser".
Give the Orchestrator the rule it lacked: a blocker that no re-run can clear is an
`ask_user`, not a `start_run`. Whether that is a step-task rule in `review-run.md`, a
distinct stage outcome, or both is the implementer's call — but it must be stated somewhere
the model reads, because the observed loop is the Orchestrator behaving reasonably against
instructions that never covered this case.

**Also worth a guard:** nothing counts attempts. `orchestration.runIds` grows without
limit, and no code path caps how many runs one orchestration may spawn. Fix 3 addresses the
cause; consider whether a ceiling is still wanted as a backstop.

### Boundaries

**Not in scope:** loosening the decision schema. `.strict()` and the closed enums are what
stop an invented persona, a silently dropped field, or a stage id that escapes the run
directory, and `TASK-127` bought that deliberately. An invalid decision stays invalid — it
just stops being terminal. Also not in scope: making the browser available to QA. That is
`TASK-124`/`TASK-138` territory; this task is about the loop's behaviour when it is not.

**Tests.** In `packages/server/test/orchestration/` — an Orchestrator whose first decision
carries an invalid `executionPolicy` is prompted with the rejection message and composes on
its second attempt; a `start_run` naming a stage begins there and does not re-run the
stages before it; a `start_run` naming an unknown stage is rejected.

Cross-platform: n/a — prompt composition, decision schema and in-memory run state; no paths,
processes, binaries or shelled commands. The evidence above was gathered on Windows.

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
