# Next

## TASK-156: Milestone I — Induction: a product the team carries on its own
**Priority:** P1 | **Tags:** core, server, ui, engine, testing, milestone-i
**Updated:** 2026-08-21 00:00

Induction proves a base case, then proves each step follows from the last. The base case is a
product built once with a human watching. The inductive step is the team building the next
increment without one. If the step holds it holds for every increment after — and that is the
claim this product has never tested.

**Opened 2026-08-21**, replacing *Milestone I — Isomorphic* (`TASK-153`, retired to
`REJECTED.md`). Its first task survives here unchanged; the rest went to `TASK-158`.

### Why the evidence base is not enough

F, G and H were all inward-facing — stabilise, rename, react to feedback — and `TASK-134` closed
H admitting the feedback it was gated on never arrived. What Isotopy has instead is three
dogfoods: `TASK-094` (Full Delivery), `TASK-128` (`SKIP`, Codex out of quota) and `TASK-141`
(`PASS` on Claude Code). Every one was **one feature, on a target that no longer exists** —
`TASK-142` exists because `TASK-128`'s target was deleted and had to be recreated from a bundle.

None of them can answer the question the product is actually selling: *fast first version — then
built for v2, v3, and everything after.* That second half is the wedge in
[`docs/product-brief.md`](../docs/product-brief.md), and it is the half that has never been
measured.

**And every increment still starts with a human clicking.** [`docs/architecture.md`](../docs/architecture.md)
says it plainly: one persisted Orchestrator supervises a project, and *it is an aggregate, not a
continuously running process*. There is no scheduled work anywhere in the codebase.

### The bar

A small real product, built by Isotopy, deployed, and then **carried forward by the team on a
schedule for a measured stretch, unattended** — with the evidence written down. The gap list that
falls out of that stretch is what MVP and public launch are scoped from.

### Scope, in order

1. **`TASK-154`** — the adapter capability catalog, Cursor session resume and permission modes,
   Claude `loggedIn`. First, and not for tidiness: Cursor discards every session id, so every
   follow-up turn starts cold and silently, and an unattended stretch on a cold-starting adapter
   measures nothing. Claude never reporting logged-out is how an unattended window burns with no
   output to show for it.
2. **`TASK-157`** — the dogfood product exists, and Isotopy built it.

Named candidates, deliberately unwritten until someone picks one up with evidence in hand — this
repo does not file speculative tasks:

- **A deploy target.** The app reachable at a URL, with `preview` configured in
  `.isotopy/automation.json` so Full Delivery deploys it without spending an engine turn. The host
  is an open decision: a new server, or a second Docker Compose project on the share.travel host,
  which already runs Compose behind Caddy. Decide it when the app exists, not now.
- **Scheduled work — the Orchestrator gets a heartbeat.** The trigger is
  `step.waitForSignal({ timeoutMs })` (`workflow/pipeline-workflow.ts`), the durable park
  `TASK-061` built for plan limits: it lives in OpenWorkflow's SQLite and survived a real
  mid-flight process kill in the `TASK-094` dogfood. **Not** `cron`, **not** `schtasks`, **not** a
  second process — each of those diverges by OS and puts the trigger outside the runtime that
  makes it durable.
- **The unattended stretch.** A measured window with the human out of the loop, recorded in
  `docs/dogfood/` in `TASK-141`'s sections so it is diffable against the attended runs.
- **The MVP gap list.** Written from that stretch. It closes the milestone and opens the launch.

**Isotopy variants — a build focused on Travel, another on Games, as forks of the core — are the
milestone after MVP, decided with the product owner on 2026-08-21.** A fork of a core that cannot
carry a product by itself forks the problem too. Recorded here so it is not lost, and not filed as
a task, because nothing about it is decidable yet.

Cross-platform: the usual Windows and macOS bar, and one gap in it becomes load-bearing.
`TASK-061` closed with the real sleep/wake check on both OSes **reasoned through and not
observed**. A scheduled wake-up makes that the difference between catching up and silently
skipping a window, so it gets tested rather than argued.

---

## TASK-157: The dogfood product — a minigame arcade whose leaderboard cannot stand still
**Priority:** P1 | **Tags:** testing, engine, ui, milestone-i
**Updated:** 2026-08-21 00:00

The base case of **Milestone I — Induction** (`TASK-156`): one real product, built by Isotopy,
with a human watching and writing down everything that went wrong.

### The product

A minigame arcade. Two or three small games, a leaderboard per game, and one **total leaderboard
where a record in a newer game is worth more than the same record in an older one.**

That weighting is the whole reason to build this rather than another to-do list. **Adding a game
changes every existing player's total score** — a recomputation across live data, a migration, and
a regression that shows up on the leaderboard rather than in a log. The product cannot be built
once and frozen, which is exactly what a base case for something that has to keep going needs.

Small on purpose. The point is not the arcade.

### Shape

- A human creates the private `smekai` repo once — license, README stub, nothing else — and
  **commits the baseline as a git bundle under `docs/dogfood/baseline/`**. Not optional:
  `TASK-142` records that restoring from a local directory is how baseline `4175c97` was lost.
- Register it as an Isotopy project and configure `.isotopy/automation.json` — `validation`, and
  the `ui` start command and readiness URL so the embedded Preview can show the built product
  (`TASK-138`). Deployment is a later task's, not this one's.
- Give the Orchestrator the goal, approve the composed team, let it build. **A human does not
  write the app.** A human having to fix it is a finding, and gets written down as one.
- Isolated `ISOTOPY_USER_HOME`/`ISOTOPY_HOME`, as `TASK-141` used, so the run cannot quietly
  depend on this machine's state.

### Evidence

`docs/dogfood/TASK-157-<engine>-<date>.md`, following
[`TASK-141`'s record](../docs/dogfood/TASK-141-claude-code-2026-08-17.md) **section for section**
so the two are diffable: team composition and whether it was edited, turns, changed files
*measured* rather than claimed, cost with tier and model, embedded Preview verification, and
whether the Orchestrator stopped itself.

**The gap list is the deliverable, not the arcade.** Every friction, defect and missing capability
goes on it — that is what the rest of the milestone is scoped from, and what a first-time user
would have hit.

Cross-platform: the arcade must build and run on Windows and macOS, and its automation commands
are arrays with a per-platform executable override, never shell strings
([`docs/project-automation.md`](../docs/project-automation.md)). Run live on Windows; record macOS
as reasoned-through and untested unless a Mac is actually used.

---

## TASK-154: An adapter declares what it can do, and Cursor stops lying about three of them
**Priority:** P1 | **Tags:** core, server, engine, milestone-i
**Updated:** 2026-08-21 00:00

The first task of **Milestone I — Induction** (`TASK-156`). The Orca comparison this scope was
drawn from, and the three adapter candidates it did not claim, are in `TASK-158` (Backlog); the
defects below were verified against the installed CLIs before either task was written.

**Ordered scope.** Step 1 is what makes 2–5 checkable rather than a list of one-off patches.

1. **Declare the capabilities.** In `packages/core/src/engines.ts`, beside `EngineDefinition` and
   `PERMISSION_MODES`, derived from one exported `as const` tuple per the runtime-validation rule
   in `AGENTS.md`: resume, effort, usage, cost, live model listing, auto-review, and per-mode
   permission support. `engines/types.ts` references the declaration rather than restating it, and
   a `never`-closed switch makes a new capability a compile error in every adapter (A7). This is
   Orca's `agent-session-option-catalog` pattern in the shape this codebase already uses.
2. **Cursor session resume.** Read `session_id` off `system.init` in `cursor-protocol.ts` — the
   schema is already `.passthrough()`, so the field is arriving and being dropped — return it as
   `sessionId`, and pass `--resume <id>` when `ctx.resumeSessionId` is set.
3. **Cursor permission modes.** Map `acceptEdits` → `--sandbox enabled` and `autoReview` →
   `--auto-review`; keep `--force` for `skip` only. Cursor stops discarding its
   `resolvePermissionPlan` result.
4. **Claude `loggedIn`.** A best-effort auth probe in `detect()`, following the shape Codex and
   Cursor already use: exit code plus text, `undefined` when it cannot tell, never a guess.
5. **Say what is still missing.** Cursor reports no cost or tokens. Declare that as a capability
   the adapter does *not* have, so Setup and the cost readout can say so rather than show a
   confident zero.

**Verify against the real CLI before implementing, and pin the version verified.** The
`--auto-review`, `--sandbox` and `--resume` flags above were read from the binary installed on this
machine on 2026-08-20; `docs/implementation-notes.md` currently documents the opposite in good
faith, which is exactly how this drift happened. Where a flag turns out to be absent or to behave
differently, the honest outcome is to **declare the gap in the catalog**, not to fake the
capability. This is the standing rule from the 2026-08-19 decision entry applied to CLIs instead of
skill paths: name the mechanism, do not infer it.

**Evidence to produce**, per `docs/testing.md`: a failing-first test per behaviour —
`engine-protocols.spec.ts` for the Cursor session id, per-adapter argv tests in the shape of Orca's
per-agent `.test.ts` files for the permission mapping, and a comp test proving a Cursor stage's
second turn resumes rather than restarts. Then `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm build`, `pnpm e2e`. Per A8, a dated `docs/decisions.md` entry (why the catalog is data, why
PTY was rejected) and a correction to the three now-stale Cursor claims in
`docs/implementation-notes.md` §"Engines — CLI-specific quirks".

Cross-platform: verify live on Windows; reason macOS through and record it as untested unless a Mac
is actually used. The hazards are known and documented: `cursor-agent` always resolves to a `.cmd`
shim on Windows so the prompt goes via stdin (`commandNeedsWindowsShell`), and a resume argument
must not regress that; binary resolution differs per platform; Cursor's `install()` is Windows-only
today.

---

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

**Scope finalised 2026-08-17. `TASK-142` is the only work left in this milestone.**

`TASK-128` closed `SKIP` — Codex passed, Cursor was out of quota. `TASK-141` then closed **`PASS`**
on Claude Code: a five-role team built the feature, independent verification caught a real
accessibility bug in its own work, the Orchestrator recovered with one partial retry and stopped
itself, and the built product was seen running in the embedded Preview. That is F's bar, met on a
second engine.

`TASK-142` reruns the same path on Cursor once its quota resets on 2026-09-03, and is expected to
be done **in September**. It carries `TASK-141`'s baseline and goal string so the two are
comparable. Nothing else is admitted here.

**The four defects `TASK-141` found went to Milestone H, not here** — decided with the user on
2026-08-17. `TASK-144` and `TASK-145` at P0, `TASK-146` and `TASK-147` at P2. `TASK-144` does
under-cut `TASK-126`'s bar for the second and later runs of an initiative, which is a real argument
for fixing it inside F; the user chose H anyway, so F closes on the evidence it has rather than
growing a tail. That is the "nothing else" rule being kept rather than bent.

Cross-platform: every task here is verified on Windows and reasoned through for macOS, and
`TASK-126`'s folder reveal and `TASK-124`'s per-CLI mode flags are where that bites.

---
