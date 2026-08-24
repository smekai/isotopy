# Backlog

## TASK-169: Observe a real sleep/wake with a schedule pending, on both OSes
**Priority:** P2 | **Tags:** testing, infra, milestone-i
**Updated:** 2026-08-24 14:00

`TASK-061` closed with the machine-suspend behaviour **reasoned through and never observed**, and
`TASK-159` was written as the work where that gap finally bites — an unattended schedule is the
first feature whose whole point is surviving the hours nobody is watching.

`TASK-159` did not close it. What it delivered is the rule expressed as a test: the tick reads the
wall clock every time and never accumulates elapsed time, and a schedule ticked as if the machine
woke three days later fires exactly once and not again. That is the *logic* proven against a
simulated clock. It is not the same claim as the OS actually suspending.

**What is still unobserved, and why a simulated clock cannot answer it:** whether the interval
survives S3/modern standby at all, whether Node's timer fires late or not at all on resume, and
whether the process is still holding its SQLite handle afterwards. `.unref()` is on the timer, which
is right for shutdown and says nothing about wake.

**What to do:** put a machine to sleep with an enabled schedule whose window falls inside the sleep,
wake it, and record what actually happened — how long after resume the first tick ran, whether
exactly one run started, and whether `lastWindowAt` advanced once. Then the same on macOS, or record
plainly that no Mac was used.

**This needs a human at the machine**, which is why it is its own task rather than a line item
someone is expected to fake. A reasoned-through answer here is what `TASK-061` already produced, and
repeating it would be the same non-answer twice.

Evidence: a short record under `docs/dogfood/` or an entry in
[`docs/implementation-notes.md`](../docs/implementation-notes.md), naming the OS build and the
observed timings. If the timer does *not* survive, that is a finding and a follow-up, not a failure
of this task.

---

## TASK-168: Onboarding asks for a project and offers no way to add one
**Priority:** P2 | **Tags:** ui, setup, milestone-i
**Updated:** 2026-08-23 22:00

Observed in `TASK-142`'s dogfood by registering a real project through the UI for the first time in
a clean `ISOTOPY_USER_HOME`. Small, and all in the first sixty seconds a newcomer spends here.

**The Project panel names the need and cannot satisfy it.** It says "Home has no project folder —
every run works in its own scratch folder. Add a project to work on real code", and contains no
control that adds one. The control lives in `ProjectSwitcher` in the top bar, which is labelled with
the *current project's name* — "Home" — next to a separate "Project" button that opens the panel
that just told you to add one. Two adjacent controls, and the one that reads like the answer is the
wrong one.

**The folder picker has no path field.** Reaching `C:\Development\smekai\dogfood-focus-timer-142`
from `C:\` took four clicks. Anyone arriving with a path in hand — which is everyone registering a
project they already have — wants to paste it. `TASK-141` recorded the adjacent finding that a
newcomer meets a goal composer over a scratch workspace and is never told that registering a project
comes first; this is the same wound one layer in.

Cross-platform: a path field must accept both `C:\...` and `/Users/...` shapes and validate through
the existing `/fs` boundary rather than by pattern-matching a separator, and the picker's roots
differ per OS (drive letters versus `/`). The existing picker already lists roots per platform, so
the field joins that rather than replacing it.

---

## TASK-158: The adapter layer's unclaimed half, and the Orca comparison it came from
**Priority:** P3 | **Tags:** core, server, engine
**Updated:** 2026-08-21 00:00

**No milestone.** Held back from `TASK-153` when Milestone I was redefined as Induction
(`TASK-156`). `TASK-154` took the part an unattended run depends on; this is the rest. Pick it up
when a run actually hits one of these, not before.

Opened 2026-08-20 after comparing Isotopy's harness layer against
[stablyai/orca](https://github.com/stablyai/orca) at the user's request, and probing the CLIs
installed on this machine: `cursor-agent` (2026-08 build), `codex-cli 0.144.6`, `claude 2.1.215`.

| | Orca | Isotopy today |
|---|---|---|
| Agent definition | Declarative catalog — `src/shared/agent-session-option-catalog*.ts`, split per family, with `-types.ts` and per-agent `.test.ts` | Imperative argv built inline in three 300–400 line adapters |
| Capability shape | `CatalogOption { id, label, kind, apply }`; `apply` → `launchArgs`, plus `midSession` applicability | Nothing declared |
| Unknown model ids | `unknownModelOptions` — launch-safe options for opaque ids absent from the static catalog | `MODEL_FALLBACKS` maps to Auto; no launch-arg story |
| Detection | `agent-detection.ts`, `agent-kind.ts` — one place | `resolveXBinary()` written three times, near-identically |
| Trust / permissions | `agent-trust-presets.ts` — presets as data | Three hand-written `permissionArgs()` switches |
| Usage & limits | First-class subsystems: `usage/`, `rate-limits/`, `claude-usage/`, `codex-usage/` | `domain/rules/engine-limit.ts` plus per-protocol capture — empty for Cursor |
| Isolation | Git worktree per agent run | Agents run directly in `ctx.cwd` |
| Execution | PTY (`pty/`, `ghost-tty/`) | Plain pipes into headless JSON modes |

**The one pattern worth taking is the declarative catalog, and `TASK-154` takes it.**
`packages/core/src/engines.ts` already declares `ENGINES`, `EngineDefinition` and
`PERMISSION_MODES` exactly that way; it stops before capabilities and launch args, and that is
where the drift gets in.

**PTY execution is rejected, and recorded as rejected so it is not re-proposed.** Orca is a
terminal multiplexer: it renders agent output, it does not parse it. Isotopy drives `-p` / `exec`
JSON modes behind strict Zod codecs (`engines/protocol-validation.ts`), with billing-safety env
stripping, a real auto-review capability probe, and plan-limit detection with reset parsing. A PTY
would trade a validated protocol for screen-scraping. Isotopy is ahead here and stays ahead.

**What is left in this task:**

- **Setup parity.** `install()` is absent for Claude Code, `login()` is absent for Claude Code and
  Codex, and Cursor's `install()` is Windows-only. Three engines, three different Setup stories.
- **Shared binary resolution**, against Orca's `agent-detection.ts`. `resolveClaudeBinary`,
  `resolveCursorBinary` and `resolveCodexBinary` are the same function three times with different
  fallbacks; only Codex has the Windows shim-picking fix (`pickBinaryLine`).
- **Worktree isolation.** `cursor-agent` advertises `--worktree`, `--add-dir` and `--workspace`;
  git-worktree isolation is Orca's core primitive. Design it **with** `TASK-036`, the sandcastle
  spike, rather than around it — the spike asks the same question from the other side.

Cross-platform: the harness layer is where this bites hardest — binary resolution, `.cmd` shims,
stdin-versus-argv, and per-platform installers all differ by OS today.

---

## TASK-069: Spike — Aiki durable runtime on a comparison branch
**Priority:** P3 | **Tags:** server, engine, infra
**Updated:** 2026-08-07 11:40

**No milestone, deliberately.** Research cannot close a milestone, so this sits outside
F, G and H rather than diluting one of them. Pick it up when a runtime question forces it.

**Deprioritized to P3 on 2026-08-03:** OpenWorkflow landed under TASK-068 and then survived a real mid-flight process kill in the TASK-094 dogfood, resuming without re-running completed stages. The comparison this spike was written to force has largely been answered by that evidence, so it is no longer worth a branch's cost.

The standing second choice from [`docs/workflow-runtime-options.md`](../docs/workflow-runtime-options.md) §9 is **Aiki** — TypeScript, Apache-2.0, and the only candidate ADHD has a contributor on, so its gaps are ours to close. It is not the recommendation only because it requires **PostgreSQL 14+ today** (SQLite is "coming soon", i.e. we'd write it) and documents no fork-from-step (S2). This task builds the same durable runtime as TASK-068 but on Aiki, **on a separate branch**, to compare the two against ADHD's real shape before committing.

**Do it on a branch off TASK-068's work** so the two runtimes sit behind the same seam and can be measured head to head; the winner merges to `main`, the loser stays as a documented spike. (Note: the pre-1.0 "commit directly to main" norm is deliberately set aside here — a throwaway comparison branch is the point.)

**Scope:**
- Stand Aiki up against the same feature checklist (doc §3): durable start, crash recovery/resume, retries, durable approval gates, durable sleep (TASK-061 shape), cancellation, parallel branches, project concurrency (S5), semantic restart (S2).
- Confront its two hard gaps directly: **(a)** does its `database({ provider })` seam let us stand up SQLite via `node:sqlite` without a Postgres server (the storage constraint that ruled it out), and **(b)** can `restartRun(runId, stageId)` semantics be built without a native fork primitive? These are the two things that, if closed, make Aiki "directly competitive with OpenWorkflow, with the added advantage of influence over its direction" (§9).
- Run the doc's measured probe (a Developer → gate → Tester workflow, hard-killed at the gate, resumed in a fresh process, completed stage not re-run) on Aiki and record the result beside OpenWorkflow's.
- Write the comparison up as a dated decision-log entry (A8): integration cost, maturity/bus-factor (Aiki is alpha, 34★), and whether steering-the-dependency outweighs shipping-sooner.

**Deliverable:** a runnable Aiki branch behind the same runtime seam as TASK-068, a head-to-head write-up, and a go/no-go recommendation. If Aiki wins, its branch merges to `main`; otherwise TASK-068's OpenWorkflow branch is what merges.

**Cross-platform:** the deciding question **is** cross-platform — Aiki's Postgres-14+ requirement would mean bundling a database server invisibly on Windows *and* macOS, the packaging burden that eliminated it in the doc. The spike must confirm whether an embedded `node:sqlite` backend avoids that on both OSes, or Aiki fails the same platform bar as DBOS/Restate/Resonate. Tested on Windows; macOS packaging reasoned through.

---

## TASK-036: Spike — sandcastle as the implement-stage harness/sandbox layer
**Priority:** P3 | **Tags:** adapters, engine
**Updated:** 2026-08-07 11:40

**No milestone, deliberately.** Same reason as `TASK-069`. Its premise has also weakened:
the subprocess harness it proposed replacing now exists, is dogfooded, and was hardened
again in `TASK-117`.

Evaluate [mattpocock/sandcastle](https://github.com/mattpocock/sandcastle) as the execution layer behind the implementation stage instead of building the subprocess harness (TASK-006) from scratch. It's a TS library (`sandcastle.run()`) that runs a coding agent in an isolated sandbox and merges commits back: Docker/Podman/Vercel-Firecracker providers, git-worktree isolation, branch strategies, session capture/resume, typed structured-output extraction, lifecycle hooks — provider-agnostic (Claude Code, Codex, Cursor).

**Questions to answer:**
- Does its `HarnessAdapter`-shaped surface map cleanly onto our EngineAdapter interface? What do we still own (stage handoff, artifacts, gates, dashboard)?
- Wrap `sandcastle.run()` vs. build generic subprocess harness (TASK-006) — cost, control, and lock-in tradeoff.
- Session resume + structured output: do they cover our restart-single-stage and artifact-capture needs?
- Sandbox providers: does Vercel/Firecracker help our deploy-anywhere story or is it out of scope?
- Maturity/API stability and dependency weight.

**Deliverable:** short recommendation (adopt / borrow patterns / pass) + impact on TASK-006/TASK-021. Not a competitor — a build-on candidate; see docs/competitor-matrix.md §6.

---
