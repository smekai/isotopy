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
model something an agent can reason about), `TASK-116` (README "How it works"), `TASK-137`
(one dialog with the Orchestrator, last before the dogfood), and `TASK-128` (the closing
dogfood). Already closed: `TASK-092` (project automation and preview deploy), `TASK-127`
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

## TASK-124: Orchestrator-brokered permission modes for the harnesses
**Priority:** P1 | **Tags:** core, server, engine, adapters, milestone-f
**Updated:** 2026-08-07 11:40

**Milestone F — Fixpoint.** Blast radius has to have an opinion before strangers point
agents at their own machines. `TASK-117` supplied the concrete argument: a Developer agent
started a dev server on port 5173 — ADHD's own UI port — and left it running, and nothing
in the system had a view on whether that was acceptable.

Every engine runs effectively unrestricted today — Claude `--dangerously-skip-permissions`, Codex `--dangerously-bypass-approvals-and-sandbox`, Cursor `--force` — and the one alternative, `acceptEdits`, degrades back to the same on Cursor and Codex, both of which log that they have no accept-edits-only headless mode.

Post-MVP, add a **controlled** mode per engine (Claude's `acceptEdits`/auto, Codex's `--sandbox workspace-write` with on-request approval, Cursor documented as degrading) and route the resulting approval requests to the Orchestrator, which already brokers questions (`TASK-120`). The Orchestrator decides on security and cost grounds and escalates to the user only when the blast radius is real: spending money, reaching the network, touching credentials, or writing outside the workspace.

The brokering policy is the point: **prefer the bounded option over the metered one** — a fixed-price host over pay-per-use credits, reversible over irreversible, and never enter credentials. That is what makes a controlled mode worth the stalls it costs.

Cross-platform: mode flags differ per CLI, not per OS; verify the Windows and macOS argument arrays through `runSubprocess` without shell-only commands.

---

## TASK-138: Run the built product and show it in an embedded browser
**Priority:** P1 | **Tags:** ui, server, engine, testing, milestone-f
**Updated:** 2026-08-10 18:20

**Milestone F, immediately after `TASK-124`** — decided with the user on 2026-08-10, having
first been split out of `TASK-126` into Milestone H the same day and then pulled back. The
reasoning for pulling it back: F's bar is *sees the thing that was built*, and `TASK-126`
delivered the weaker half of that — a run names its files. A demo of a product that builds
products should show the product running.

**The order is not negotiable.** `TASK-124` first. This task exists to start long-lived
processes on someone else's machine, which is precisely the blast radius `TASK-124` gives
the system an opinion about; building the capability before the policy that governs it is
backwards, and `TASK-117` is the standing evidence — a Developer agent started a dev server
on ADHD's own UI port and left it running, and nothing had a view on whether that was
acceptable.

**The ask.** When a project declares how to start itself, offer to run it — start the
product, wait for readiness, and show it inside ADHD. The surface is an **embedded
browser**, not an anchor, because the same surface is what lets Playwright and the engines'
own browser capabilities (Claude, Codex, Cursor) drive the running product and report what
they saw. Showing the user and letting an agent look are the same seam.

**What already exists.** `TASK-092` shipped `.adhd/automation.json`'s `ui` block —
`start` (an executable-plus-argument array with per-platform overrides), `healthUrl`,
`readyTimeoutMs` — stored, editable in Setup via `ProductStartEditor`, and read by nothing.
`config.ui` has exactly one reader in the whole repo, and it is that editor.

**What does not exist:**

- A long-lived process. `runSubprocess` is run-to-completion only — it resolves on exit.
  `killProcessTree` is the reusable piece; a handle-returning start is not.
- A readiness poller for `ui`. `DeploymentRunner.checkHealth` is the template, but it is
  `private` and typed to `DeploymentAutomation`, and `UiAutomation` has no
  `healthIntervalMs` — a poller must pick its own interval.
- Any embedding precedent. The UI's only external-link hit is the plain anchor in
  `EngineStatusCard`; there is no iframe anywhere, and dev servers commonly refuse framing.
  Decide the surface deliberately and fail visibly rather than into a blank box.

**Stop what was started.** Do not start anything the user did not ask to start, and stop it
when they are done looking. Server shutdown, project switch and run switch all have to
reach the kill.

**Absorbs `TASK-095`** (agent-native browser testing for QA) — the same capability from the
QA side, and the reason this is not two tasks. `TASK-095` stays in Milestone H only as the
QA policy question it also asks: when a native browser is unavailable, Playwright remains
the complete fallback and CI authority. Reject it if this task answers that too.

**Guard against the milestone's own rule.** F means *stop adding*. This is the one
capability admitted after that rule was written, and it is admitted because the demo cannot
route around it — not as licence for anything else.

Cross-platform: starting and killing a process differ per OS; go through `runSubprocess`
with executable-plus-argument arrays, never a shell string, and reuse `killProcessTree`'s
process-group kill on POSIX and `taskkill /T /F` on Windows.

---

## TASK-115: Per-role model presets, chosen by the Orchestrator
**Priority:** P2 | **Tags:** core, server, ui, engine, milestone-f
**Updated:** 2026-08-09 00:00

**Moved out of Milestone H by `TASK-129`.** It was parked as "build only if feedback asks
for it" because per-stage *model ids* meant asking a user, or an agent, to track ids that
turn over monthly. Presets removed that objection: a stage carrying `fast` or `deep` is
something both a person and the Orchestrator can reason about, and getting it wrong costs
a rung rather than a failed run.

**Most of the server work is already done.** `ModelTier` exists, and
`stage-execution.ts` resolves the run's tier **per stage** rather than at run start —
that seam was built for this task. What remains:

- a per-stage tier on the workflow input / stage state, falling back to the run's;
- the Orchestrator assigning one per role at team-composition time — a
  `team-composition.ts` schema field plus the prompt work to make the choice reasoned
  (cheap model doing the typing, expensive one deciding);
- the team-review UI showing and letting the user change each role's rung before approval;
- limit-park handling per stage: a rung that hits a plan limit must drop that stage, not
  the whole run.

Cross-platform: n/a — resolution and the effort flags already go through the adapters.

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

## TASK-137: One dialog with the Orchestrator, not two tabs
**Priority:** P1 | **Tags:** ui, milestone-f
**Updated:** 2026-08-10 12:41

**Last piece of work in Milestone F**, after `TASK-116` and immediately before the closing
dogfood `TASK-128` — the dogfood is where a first-time user meets the Orchestrator, so it
should meet the merged dialog rather than the two tabs.

An orchestration run opens on `Orchestrator` and puts `Chat` next to it, and the user has
to keep both in their head: the team proposal, the latest decision and the child runs live
on one tab, and the conversation those decisions are about lives on the other. The seam is
already visible in the product's own copy — `LatestDecision` tells the user to *"Answer in
the Chat tab to continue."* A panel that has to point at another tab to be usable is one
panel too many. The Orchestrator is who you talk to for most of an initiative; talking to
it should be one thread.

**The ask (from a user, which is what `TASK-134` said to wait for):** an orchestration run
has a single dialog. No `Orchestrator` tab.

**Fold into the thread.** Everything on `OrchestratorPanel` is either a message, a control
that belongs to a message, or run chrome:

- *Team proposal* — an inline card in the thread where the Orchestrator proposed it,
  carrying its own **Approve & start** / **Stop**. It is a turn in the conversation, not a
  standing panel; once approved it stays in the scrollback as what was agreed.
- *Latest decision* — a turn in the thread. An `ask_user` decision renders as the question
  it is, answered by the composer already sitting below it. The "Answer in the Chat tab"
  sentence is then deletable, which is the test that this worked.
- *Child runs* — each appears in the thread at the point the Orchestrator started it,
  linked, so the initiative reads chronologically instead of as a sidebar list. Decide
  whether the flat "Runs in this initiative" list still earns its place anywhere; if the
  rail already answers "what else is in this initiative", it does not.
- *Goal, status pill, stop reason, decision error, Stop* — run chrome. `RunStatusBar` and
  the pipeline row above the tabs are where a run already says what it is and how it is
  doing; the Orchestrator's goal and status are the same question asked about the
  initiative and belong with them, not in a scroll region.

**Keep the interleaving honest.** The thread is `buildTranscript(run)` over one run, and
orchestration state arrives from a different load (`useOrchestration`) that can land before
or after it — `RunTabs.comp.tsx` already pins that ordering hazard. The merged view needs a
defined order for orchestration turns against transcript turns, and must not jump or
duplicate when the second source arrives late.

**What falls out.** `RunTab` loses `"team"`; `tabsFor` loses its orchestration branch and
the effect that force-opens it; an orchestration run then has the same three tabs as any
other. `run-tab-team` disappears from the testid list. Update `docs/architecture-ui.md` —
"Two pipelines earn a fourth tab" becomes one pipeline (milestone planning keeps `Plan`;
this task does not touch it) — and `docs/decisions.md` gets the dated entry for why the
Orchestrator stopped being a tab. `RunTabs.comp.tsx` and `orchestrator-flow.e2e.ts` both
drive the tab today and both need rewriting against the single thread.

**Not in scope:** the `Plan` tab, the composer, and anything about *what* the Orchestrator
decides. This is where its output is shown, not how it thinks.

Cross-platform: n/a — pure UI, no paths, processes or shelling out.

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
