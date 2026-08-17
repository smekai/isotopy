# Done

## TASK-145: A run must not mutate the host's global toolchain
**Priority:** P0 | **Tags:** engine, testing, milestone-h
**Updated:** 2026-08-17 22:30

In `TASK-141` the QA persona fell back to Playwright exactly as `TASK-138` told it to, and reached
that fallback with `npm install playwright` and `npx playwright install`. A browser installer prunes
builds it believes nothing references, so that deleted `chromium_headless_shell-1228` from the
user-level `ms-playwright` cache — the build this repo's own e2e suite is pinned to. The agent did
nothing it was told not to do; the product gave it nowhere else to put a browser.

**Isotopy now points relocatable tool caches at the project.** `PLAYWRIGHT_BROWSERS_PATH` is set to
`<project>/.isotopy/cache/ms-playwright` on **every** engine child process, at the single place
`adapter.run` is constructed — not only on the QA stage, because a Developer adding a browser test
prunes the shared cache exactly as readily as a Tester does. `engines/tool-cache.ts` is the only
file that names a tool, so a second relocatable cache is one line there and no adapter change. The
QA persona and the `verify-feature` step task carry the matching policy: prefer the repository's own
Playwright, and never override the variable.

**Per project, not per run**, decided with the user. The variable is both the download target and
the lookup path, so a per-run directory would re-download ~150 MB every run with no reliable
sweeper. A single Isotopy-wide cache would instead let two projects on different Playwright versions
prune each other. The requirement was never that runs be isolated from each other; it is that a run
cannot reach the machine.

**Verified, not assumed.** `playwright install --dry-run` reports its install location as
`C:\Users\...\AppData\Local\ms-playwright\...` unpinned and
`<pinned>\ms-playwright\...` with the variable set — the redirection is total. One test per engine
fails without the change. The stub-binary harness moved from `permission-modes.comp.ts` into
`test/support/engine-stub.ts` so both files share it, and the stub records only the one variable
under test rather than an environment carrying real provider keys.

`toolCacheDir` is **required** on `EngineRunContext`. It began optional, which made the
"no cache scoped" branch reachable only from hand-built test contexts — and left a future call site
free to opt out of the protection with nothing failing. The guarantee belongs in the type rather
than in a test describing a state nobody should be able to construct.

**Known limitation:** under Codex's `--sandbox workspace-write`, a *home* run's cache is a sibling
above its workspace and an install there may be refused. That is a failed install rather than a
damaged machine, which is the intended side of the trade; recorded rather than worked around.

`pnpm lint`, `pnpm typecheck`, `pnpm test` (850 passed), `pnpm build` and `pnpm gen:skills` all
green on Windows. macOS reasoned through — the shared cache is `~/Library/Caches/ms-playwright`
there and the same variable overrides it; all paths are `path.join` off `projectPath.dataDir` — and
not executed.

---

## TASK-144: A run must name files it edited that were already dirty when it started
**Priority:** P0 | **Tags:** server, testing, milestone-h
**Updated:** 2026-08-17 21:00

The change set's git path subtracted pre-existing dirt by comparing **status codes**, so a file
already ` M` when the run started was still ` M` when it ended and the run's own rewrite was
discarded as the user's. `TASK-141`'s run 3 existed only to edit `src/main.ts`, did edit it, and
reported "1 created" with no edits — the shape every run after the first in an initiative hits,
because those always start against a dirty tree.

**Fixed by comparing content.** `RunChangeCollector` records a `git hash-object` blob oid for each
file dirty at baseline and again, at capture, for the ones still dirty; `mergeGitChanges` now
subtracts only when the kind matches *and* the two oids do not disagree. Only the baseline-dirty
set is hashed — a clean file the run edits becomes ` M` and was always reported correctly, so
hashing the whole index would cost a full-repo pass per run and catch nothing more. Cost is one
extra git invocation per side, sized by the dirt rather than by the repository.

**Two corrections to the filed task, from reading the code.** The snapshot path compares
`(mtimeMs, size)` stamps rather than content — but it never had this bug, because a stamp moves
when the run writes the file, so only the git path needed fixing. And a missing oid *subtracts*
rather than claims: only two oids that positively disagree promote a file to the run's work, so a
baseline written before this shipped degrades to the old behaviour instead of attributing every
file the user had dirty to the agent. That is also why `RUN_CHANGE_BASELINE_VERSION` stays at `1`
— bumping the literal would fail an in-flight run's baseline validation, and that answer is
`undefined`, i.e. no change set at all.

**One unhashable path must not take the others with it**, found in PR review. A dirty submodule
reports as ` M sub` and `hash-object` answers `fatal: Unable to hash sub`, aborting the batch — and
because a missing oid subtracts, that silenced every edit in the run and restored the original bug
in full. Paths are now filtered to regular files before hashing, and the oids git did print are
paired positionally rather than read through the usual exit-code check, so a batch that still dies
partway keeps what it produced.

Four tests fail without the fix and pass with it: the rule-level regression in
`run-changes.spec.ts`, a tracked and an untracked dirty-then-rewritten file against the real git
binary in `run-change-collector.comp.ts`, and a dirty embedded repository alongside a rewritten
file in the same. The counterweight — "a file already dirty before the run started is not claimed
as the run's work" — is green in both states.

Decision recorded in [`docs/decisions.md`](../docs/decisions.md); the now-inaccurate `git status`
bullet in [`docs/implementation-notes.md`](../docs/implementation-notes.md) corrected.
`pnpm lint`, `pnpm typecheck`, `pnpm test` (843 passed) and `pnpm build` all green on Windows.
macOS reasoned through — `hash-object --stdin-paths`, forward-slash paths out of `status -z`, no
new path construction or process cleanup — and not executed.

---

## TASK-141: Run the Milestone F dogfood with Claude Code
**Priority:** P0 | **Tags:** testing, engine, ui, milestone-f
**Updated:** 2026-08-17 12:30

Closed the 2026-08-17 execution with release verdict **PASS**. Full evidence:
[`docs/dogfood/TASK-141-claude-code-2026-08-17.md`](../docs/dogfood/TASK-141-claude-code-2026-08-17.md).
**Milestone F remains open in TASK-125** — TASK-142's Cursor rerun is still required.

**Claude Code evidence.** From a recreated clean baseline (`87fe592`) and isolated
`ISOTOPY_USER_HOME`/`ISOTOPY_HOME`, the Orchestrator proposed a five-role team on its first turn
without asking anything, raising the Developer to the `deep` tier on its own reasoning and giving
both quality roles `quality` policy. Approved unedited. The team delivered configurable 1–120
minute focus/break lengths, reload persistence, automatic Focus/Break alternation, focus-only
history, preserved Start/Pause/Reset and an `aria-live` status that announces once per transition
rather than per tick. Target tests went 9 → 31, build green. Three runs, 35 minutes, **$6.69**.

**The run's best moment.** Independent verification caught a real accessibility bug in its own
team's work — `statusText()` derived "Ready" from `remaining === focusSeconds`, so pausing
immediately after Start announced "Ready" instead of "Paused". The tester reproduced it
deliberately before reporting; the run went `needs_attention` rather than dying; the Orchestrator
issued exactly one partial retry from `implementation` (skipping planning and design) quoting the
specific defect; the fix passed; the Orchestrator then **stopped itself** with a model-authored
reason. `blockedLaunchRefusal` never came near firing — the runs #10–#13 spin did not reproduce,
which is the clearest evidence yet that TASK-139 holds.

**Embedded Preview verified live.** Twelve interactive checks passed against the framed product,
including real one-minute Focus→Break→Focus transitions and a reload at the phase boundary. Two
TASK-138 behaviours confirmed that tests cannot show: the tester used the injected `## Environment`
block to start the product through Isotopy rather than running its own server, and Isotopy
restarted the product 0.4s after the run completed so the preview was never the previous build.

**Defects filed, not fixed here:** `TASK-144` (changed-files under-report on files already dirty at
run start — bites every run after the first in an initiative, so TASK-126's bar is systematically
under-met), `TASK-145` (the QA persona's global `npx playwright install` pruned the host's pinned
browser and would have broken `pnpm e2e`), `TASK-146` (three stale claims in the `run-app` skill),
`TASK-147` (post-run Orchestrator decision turns missing from surfaced cost).

**Newcomer findings:** there is no onboarding wizard and the first screen builds into a scratch
workspace; the default tier is Fast (`haiku`), not Balanced; and Claude Code's engine card shows
installation only — no login or quota state and no Login button, unlike Cursor and Codex — which
is why the quota probe had to be made out of band before spending.

Verified on Windows. macOS reasoned through against the process-group kill, executable selection,
persona delivery and path-casing paths, and **not executed**. Isolation held: `~/.isotopy` was
untouched throughout. No fresh clone was used, by the user's decision, so **Milestone G's
clean-clone exit condition remains unverified**.

---

## TASK-130: Milestone G — Gauge: rename ADHD to Isotopy
**Priority:** P1 | **Tags:** core, server, ui, infra, testing, milestone-g
**Updated:** 2026-08-14 00:00

A gauge transformation changes the representation and not the physics. This milestone made the product **Isotopy** without changing what it does.

**Clean break, decided with the user on 2026-08-07 and reconfirmed 2026-08-14:** no migration, dual parsing, aliases, or compatibility shims. Local history under `.adhd` is abandoned.

Completed 2026-08-14 across four tasks, one per surface, each landing green before the next started: `TASK-131` the brand contract and user-visible surfaces, `TASK-132` code identifiers (`@isotopy/*`, `ISOTOPY_*`, `X-Isotopy-Project`), `TASK-133` the model-facing protocol fences, and `TASK-143` the physical paths and repository identity. The repository slug and checkout directory were deliberately last so the earlier steps could move in controlled, verifiable increments.

Shipped at **0.10.4**. `docs/decisions.md` and `.tasks/DONE.md` keep their ADHD references as the dated historical record; no other ADHD identifier survives.

**Milestone exit — partially verified.** The renamed tree builds, passes lint, typecheck, 838 tests, e2e, and the identifier/filename audits, and launches on Windows with all state under `.isotopy`. The remaining exit conditions — a clean clone from the renamed repository URL and a real engine-backed run inside it — depend on the GitHub repository rename and the checkout rename, which only the user can perform. Both are documented in `TASK-143` and were closed out with the user on 2026-08-14 rather than held open.

Platform: verified on Windows. macOS/POSIX not exercised; the lowercase `.isotopy` path still wants a check on a case-sensitive filesystem.

---

## TASK-143: Final filesystem and repository cutover to Isotopy
**Priority:** P1 | **Tags:** server, ui, infra, testing, milestone-g
**Updated:** 2026-08-14 00:00

Completed 2026-08-14 at **0.10.4**. Changed the user and project state roots from `.adhd` to `.isotopy` through the two literals in `packages/server/src/paths.ts` that every other path helper derives from, plus the non-derived references (snapshot ignore set, `.gitignore`, `eslint.config.mjs`, `.env.example`, and the two UI strings that display the path). Renamed `adhd-icon.png` → `isotopy-icon.png` with its three consumers, and pointed the package name and `repository`/`homepage`/`bugs` URLs at `smekai/isotopy`. Renamed `.adhd` fixtures and all 14 `mkdtemp` prefixes in tests, ten documentation files, the `design/` mockup, and the hand-written agent skills; regenerated the bundled skills from their doc sources.

**Deleted three back-compat guards** — the `X-ADHD-Project` header test, the `ADHD_DEPLOY_URL` marker test, and the `adhd.*` localStorage e2e assertion. Each asserted that a retired name was *ignored* and was the only reason its string still existed in code; under the clean break they guarded a path that no longer exists.

**Kept as historical record:** `docs/decisions.md` and `.tasks/DONE.md`. Those entries describe what was true when written.

Verification on Windows: lint, typecheck, build, and `gen:skills` (no resulting diff) green; 838 tests passed against an 840 baseline measured on `main` — exactly the two deleted unit tests; e2e 68 passed / 4 skipped against 69/4 — the one deleted e2e test. Case-insensitive `git grep` and `git ls-files` audits return nothing outside the allowlisted historical files. Ran the dev stack: the server created `~/.isotopy/home`, a registered project got `<root>/.isotopy/` with its self-ignoring `.gitignore`, no `.adhd` was created anywhere, and the UI loaded `/isotopy-icon.png`. macOS/POSIX untested.

**Left to the user, by agreement:** the `smekai/adhd` → `smekai/isotopy` GitHub rename, the local checkout rename, `git remote set-url`, and the clean-clone cutover verification. None can be performed from inside the checkout without invalidating the working directory. The repository URLs shipped here resolve once the GitHub rename happens; GitHub redirects the old slug afterward.

**No migration:** the user-level `~/.adhd` is untouched and disposable. The repository-local `.adhd/` was deleted with the user's agreement once the new ignore lists stopped covering it. Isotopy starts with fresh state and asks for an engine key on first launch.

---

## TASK-133: Rename the model protocol surface to Isotopy
**Priority:** P1 | **Tags:** server, core, engine, testing, milestone-g
**Updated:** 2026-08-13 19:46

Rename model-facing fenced protocols as one producer/consumer contract:

- `adhd-orchestrator-decision` → `isotopy-orchestrator-decision`.
- `adhd-run-artifacts` → `isotopy-run-artifacts`.
- `adhd-milestone-plan` → `isotopy-milestone-plan`.
- Rename any other emitted or parsed fence discovered by the protocol inventory.

Update bundled step tasks, generated skills, examples, fixtures, schema extractors, and error messages in the same change. Add focused producer/consumer round-trip tests so a prompt/parser mismatch cannot report a successful run.

No dual parsing: old persisted model outputs stop being readable, which is accepted for this pre-release clean break.

Verify the full automated suite plus real runs on at least two available engines; each engine must emit the new fence and each extractor must accept it. Record engines and platform actually tested.

Cross-platform: n/a — protocol parsing is pure text logic and line handling must continue to accept both LF and CRLF.

### Plan

Completed 2026-08-13, including review correction: directly renamed all five active model-output contracts to `isotopy-closeout`, `isotopy-milestone-plan`, `isotopy-orchestrator-decision`, `isotopy-release`, and `isotopy-run-artifacts`. Parsers, prompts, bundled persona/step tasks, fixtures, errors, current documentation, and transcript filtering now use only direct Isotopy literals. Removed the temporary shared `model-protocol` module and all former-fence compatibility/rejection fixtures; there are no aliases, fallbacks, migration paths, or active old-protocol occurrences. Bumped all workspace packages to 0.10.3 for the follow-up commit.

Verification on Windows after simplification: frozen install, generated-skill freshness, lint, all TypeScript projects, 93 Vitest files / 840 tests, and recursive production build passed. The earlier free Playwright run passed 69 tests with 4 opt-in tiers skipped. Real Codex and Claude Code canaries each emitted `isotopy-orchestrator-decision` and its direct extractor accepted it; Cursor was attempted and skipped because its external monthly quota is exhausted until 2026-09-03. macOS/POSIX was not run locally; protocol parsing is platform-neutral and the existing Windows/macOS CI matrix remains authoritative.

---

## TASK-132: Rename the code and integration surface to Isotopy
**Priority:** P1 | **Tags:** core, server, ui, testing, milestone-g
**Updated:** 2026-08-13 18:23

Rename technical identifiers that code, configuration, and HTTP clients consume:

- `@adhd/core`, `@adhd/server`, and `@adhd/ui` → `@isotopy/*` across package manifests, imports, TypeScript paths, workspace filters, CI, and tests.
- `ADHD_*` environment variables → `ISOTOPY_*`, including home, ports, timeout, live-E2E, and per-engine path/argument overrides.
- `X-ADHD-Project` → `X-Isotopy-Project` in the server, UI network boundary, product-environment prompt, and test harness.
- Rename remaining code-owned service ids, test ids, CSS/keyframe identifiers, fixtures, and generated constants where the old product name is part of the contract.

This is a clean break: rename every reader and writer together, with no aliases or fallback reads. Leave physical filenames and directories for `TASK-143`, and leave model-output fences for `TASK-133`.

Verify typecheck, lint, unit/component tests, build, and Playwright from the existing checkout path.

Cross-platform: environment names are case-sensitive on POSIX and not on Windows. Update every producer and consumer atomically; npm scripts must remain shell-neutral and displayed commands must be correct for both PowerShell and bash.

### Plan

Completed 2026-08-13: Renamed workspace packages to `@isotopy/*`, all active configuration variables to `ISOTOPY_*`, the shared project header to `X-Isotopy-Project`, deployment/task-board/workflow/service/UI identifiers to Isotopy contracts, and removed the retired `adhd.*` localStorage adoption path. Updated current documentation and regenerated bundled skills; model fences remain for TASK-133 and physical `.adhd`/repository/icon paths remain for TASK-143.

Verification on Windows: frozen pnpm install passed; generated-skill check, lint, all TypeScript projects, 93 Vitest files / 832 tests, recursive production build, and free Playwright passed (69 passed, 4 intentionally skipped opt-in tiers). macOS/POSIX was not run locally; environment names are updated atomically, commands remain shell-neutral, CRLF parsing is covered, and the existing CI matrix retains Windows/macOS checks.

---

## TASK-131: Set the Isotopy brand contract and rename visible surfaces
**Priority:** P1 | **Tags:** ui, infra, milestone-g
**Updated:** 2026-08-13 11:28

Settle the product identity before changing technical contracts:

- Decide whether **Isotopy** expands to anything; if it does not, record that explicitly.
- Choose the tagline, exact casing, and short product description used everywhere else.
- Rename user-visible UI copy, browser/window title, README, current docs, `CLAUDE.md`, `AGENTS.md`, generated skills, image alt text, and other public-facing text.
- Preserve intentional historical references where rewriting history would be misleading, and maintain a small documented allowlist for the final audit.

Do **not** yet rename the GitHub repository, local checkout, `.adhd` state roots, or `packages/ui/public/adhd-icon.png`; those physical path changes belong to final cutover `TASK-143`. Do not update repository/homepage/bugs URLs before that cutover.

Acceptance: current user-facing surfaces say Isotopy consistently, generated files are regenerated from their sources, and the application remains buildable and runnable from the existing checkout.

Cross-platform: n/a — text and rendered assets only; any setup commands shown in docs must retain both PowerShell and bash variants.

### Plan

Completed 2026-08-13: Established Isotopy as the complete product name with no backronym, using “The last mile for your ideas — turning them into working businesses.” Updated current public docs, UI/browser branding, notifications, setup/preview/closeout copy, server-facing messages, repository instructions, personas, and generated skills; retained the abstract icon artwork. Deferred package scopes, CLI/state paths, environment variables, HTTP headers, protocol fences, persistence markers, repository URLs, checkout/repository folders, and adhd-icon.png to TASK-132/TASK-133/TASK-143.

Verification on Windows: lint passed; all TypeScript projects passed; 94 Vitest files / 838 tests passed; recursive production build passed; generated-skill check passed; Playwright passed 69 with 4 intentionally skipped tiers; visual browser smoke check confirmed the Isotopy title and wordmarks with no visible old wordmark. macOS/POSIX was not executed; this task changes text/UI only and preserves shell-neutral PowerShell/bash documentation.

---

## TASK-128: Closing dogfood for Milestone F
**Priority:** P1 | **Tags:** testing, engine, ui, milestone-f
**Updated:** 2026-08-13 12:35

Closed the 2026-08-13 execution with release verdict **SKIP**: the clean Codex path passed,
while Cursor could not begin its Orchestrator proposal because the external monthly usage
limit was exhausted. Milestone F remains open in TASK-125; TASK-141 and TASK-142 carry the
requested Claude Code and Cursor reruns.

**Codex evidence.** From clean target commit `4175c97` and isolated ADHD state, the user
approved a four-role team (Product Designer, Developer, QA Engineer, Product Manager).
The team implemented configurable 1–120 minute durations, reload persistence, automatic
Focus/Break alternation, focus-only history, preserved controls, accessible status, and a
DOM live-region regression. The embedded Preview passed real one-minute Focus→Break→Focus
transitions, boundary persistence, keyboard Start/Pause/Reset, focus-only history, and
meaningful labels/status. The final replay completed in 3m08s, all executed roles passed,
27 target tests and its production build passed, ADHD measured one created and two edited
files, and the Orchestrator stopped normally. No standalone screen-reader application ran.

**Product finding fixed and replayed.** A user answer creates a one-stage Orchestration run;
partial retry seeding incorrectly validated `fromStage` against that conversation instead
of the newest composed work run. The service now selects the newest non-Orchestration run,
with component regression coverage. A fresh live replay proved the valid partial retry and
clean stop.

**Cursor evidence.** ADHD detected Cursor `2026.08.04-aaa8809` as installed and logged in,
but its first clean Orchestrator turn exited with `ActionRequiredError` before proposing a
team or changing files. Cursor reported that its monthly cycle resets on 2026-09-03.

README now matches the package contract at Node 22.5+ and documents `pnpm.cmd` for Windows
execution-policy environments. Windows was tested; the documented macOS path was reviewed
for Node/pnpm commands, POSIX executable selection, path handling, and cleanup but was not
run live. Ports 4173, 5173, and 9477 were released after each harness.

---

## TASK-116: README — top-level product schema (“How it works”)
**Priority:** P1 | **Tags:** ui, server, milestone-f
**Updated:** 2026-08-12 12:40

**What shipped.** A `## How it works` section in `README.md`, directly after the opening
pitch — the place a first-time reader asks "yes, but how".

Two mermaid diagrams. The first is the product flow: you → Orchestrator conversation → team
proposal → your approval → composed run, stage by stage, each stage a persona plus a step
task plus the upstream handoffs, executed through a harness adapter → handoff and verdict →
changed files and closeout → the Orchestrator's review of the settled run → the decision
loop back to the top. The human gate and the mediated question hang off it as dotted side
paths, because that is what they are: a specialist never talks to the user directly. The
second names the four layers — Orchestrator, personas, workflow runtime, harness adapters —
so a reader has somewhere to put every file they open next.

Five short prose blocks under the first diagram carry what a diagram cannot: that an
approved team is compiled and then carried by the run because it exists in no constant,
that a blocking finding marks a run **needs attention** rather than killing it, and that
three blocked runs in a row stop the loop.

Both diagrams are parsed with mermaid before commit, not eyeballed.

**Also corrected two stale claims in `## Status`:** release and deploy were still described
as unautomated pending `TASK-092`, which shipped at 0.9.29; and the three built-in pipelines
were presented as the only way to start work, with no mention that they are now presets
beside the Orchestrator's per-goal composition.

**Revised on review, same PR.** The opening no longer calls the repo "research and planning
artifacts" — it says what the product is, and carries the positioning the founder asked for:
ADHD is the last mile between generated code and a working business, not a demo generator.
Prerequisites and Quick start moved up to directly under How it works, so `pnpm install` is
reachable without passing a market analysis; the market argument became a short `## Where
ADHD fits` below Status; Status itself now leads with current capability and keeps the
milestone history to one closing paragraph. The four-layer diagram's caption stopped
claiming purity: the milestone dashboard and the preset pipelines are named as the two
subsystems that predate the picture and sit beside it.

Version 0.9.38.

---

## TASK-139: The Orchestrator's decision loop must not dead-end or spin
**Priority:** P1 | **Tags:** server, engine, testing, milestone-f
**Updated:** 2026-08-12 17:20

**Closed at 0.9.37.** Two observed failures on 2026-08-12 in the `dogfood` project: an
invented `executionPolicy` killed an initiative on one string, and runs `#10`–`#13` re-ran
one composed pipeline four times against the same missing browser for 3.44M input tokens.

**1. A rejected decision informs the next attempt.** `InputExtras.task` overrides
`run.task` when `buildInput` assembles the workflow input, and `OrchestrationHooks.restartTask`
supplies it — `renderTaskAfterRejection` appends the rejection to the run's own task.
`run.task` stays frozen, so the record still says what the run began as. The same rejection
rides into `renderRunReviewContext`. No automatic retry: a rejection is terminal for the
turn and informative for the next one. `interpretDecision` and `consume` were left as the
two sites they were; the rule kept is that no third one builds that sentence.

**2. `start_run` may target a stage.** The decision gains an optional `fromStage`.
`seedFromSettledRun` (`domain/rules/run-seeding.ts`) validates it against the composed
pipeline — an unknown id, or a stage the settled run never ran, is rejected with path-aware
issues rather than silently started from the top or credited to a role that never worked —
and carries the settled run's outputs and outcomes into a **fresh** run that begins there. Decided with the user: a fresh seeded run rather than an in-place
`restartRun`, so the evidence that justified the decision survives and a cleanly completed
run can still be re-entered. `applySeededOutput` became `applySeededStage`, marking a
carried stage `skipped` with a log line naming its source — but only while it is still
`pending`, which is what leaves a restart's real upstream statuses alone. `SeededStart`
replaced the three loose seed fields on the workflow input and the run options.

**3. An unmet precondition is not a quality verdict.** `review-run.md` and `orchestrate.md`
now say that a blocker no re-run can clear — no browser, no credential, no tool, no running
service — is an `ask_user` naming what the user must do, said the first time it is read.
The backstop is `blockedLaunchRefusal` (`domain/rules/orchestration-loop.ts`): three
consecutive `start_run` decisions whose reviewed run ended `needs_attention` or `failed`,
with nothing asked of the user in between, and the third is refused with a stated reason on
`decisionError`. Derived from the turns already stored — no persisted counter. It counts
`start_run` alone, so an auto-running milestone's fourth feature is not capped.

**4. A parked initiative can be answered.** Raised in review, and load-bearing for fix 3: a
question from a lifecycle review reached the user as read-only text, because the reviewed
run was terminal and `POST /runs/:id/messages` refuses a finished run — so "ask instead of
re-running" had nowhere to land. `POST /orchestrations/:id/messages` answers the initiative:
it routes to an `asking` stage when one exists, and otherwise opens a fresh conversation
turn carrying the goal context, the approved team, prior run digests, the question and the
answer, without superseding the initiative. `answerableQuestion` is the one rule both
`ChatPanel` and `App.handleSend` read, so a finished run offers a composer exactly when the
Orchestrator is waiting, and the text goes where the composer implied.

**Refusals happen before a decision is accepted.** `refusalFor` runs at both acceptance
points — `consume` and `recordReview` — for all three reasons acting would fail: no approved
team, an invalid `fromStage`, the launch ceiling. A refusal records the reason and **no
turn**, because a recorded turn makes `hasTurnFor` discard the corrected decision of a
re-review and leaves the initiative unable to recover from its own refusal. Raised in review
on the PR, and it is the same dead end the task was written about.

**Guards:** four component tests in `orchestration.comp.ts` — the rejection is quoted back
on the restart and the second attempt composes; a `fromStage` run begins at QA with the
Developer's output carried and no second Developer turn; an unknown stage is refused with
no run launched; a fourth blocked run never starts. `orchestrate-assignment.spec.ts` now
sweeps the `start_run` schema's own field names, so a field added without documentation
fails.

Gates: lint, typecheck, 837 unit/component tests, build, 69 e2e, `gen:skills` — all green.
Server boot re-checked on the running app (`/health`, `/pipelines`). The loop itself is
covered by the component tests rather than a live run: every shipped pipeline drives a real
engine, so a live reproduction would have spent tokens to re-observe what is already
asserted. Decision recorded in `docs/decisions.md`; `docs/architecture.md` §2c gained the
three paragraphs.

Cross-platform: n/a — prompt composition, decision schema and in-memory run state; no paths,
processes, binaries or shelled commands. Verified on Windows; nothing added is
platform-conditional.

---

## TASK-137: One dialog, an honest label, and a choice at the start
**Priority:** P1 | **Tags:** ui, core, server, milestone-f
**Updated:** 2026-08-12 15:10

**Closed at 0.9.36.** Three complaints with one root: the product decided things silently
and then showed them in the wrong place. Widened from the original two-tabs task on
2026-08-12 with the user, who asked for all three at once because they land on the same
screens.

**1. One dialog.** `runThread` merges the orchestration's turns into
`conversationOnly(buildTranscript(run))` on one timestamp ordering. A `propose_team` turn
is an inline `TeamProposalCard` carrying **Approve & start**, read-only once approved;
child runs are linked where they were started, minus the thread's own run. Goal, status,
stop reason and decision error moved to `RunStatusBar`. `RunTab` lost `"team"`,
`OrchestratorPanel` was deleted, and *"Answer in the Chat tab to continue"* is gone from
the product — the test the task named for whether this worked.

Two calls that read as omissions: an `ask_user` decision gets **no** card, because it is
already a `run.messages` question with the composer beneath it and a card would print it
twice; and there is **one** Stop, `TeamController`'s existing `stop-initiative`, rather
than the second one the task text asked to put on the card.

**2. Engine and model asked at the start.** The premise in the report — that the
Orchestrator changes harnesses — was wrong: it proposes a per-role `modelTier` and nothing
else. The real gap was that neither was ever *asked*. `StartHarnessPicker` puts both on the
start screen, seeded from the project preference. Defaults are economical per engine
(`auto` for Cursor, `fast` elsewhere); switching harness re-defaults the model, and either
choice clears that engine's exact-model pin, since `run.model` outranks a tier at
execution. The `orchestrate` stage is pinned to `deep` so the economical default does not
put the Orchestrator itself on the weakest model. `TASK-115` stayed as shipped.

**3. Who is acting, and what they are doing.** `StageNode` read the persona from a table
keyed by **stage id**, which the Orchestrator invents freely — `{id:"design",
skill:"product-designer"}` rendered as *Software Architect*. Keyed off `skill` instead,
which `team-composition.ts` already validates against `PERSONA_IDS`. Labels became actions
(Scoping, Architecting, Implementing, Verifying, …), and `orchestrate.md` now says a label
names the work with an action-phrased example. Verified on the dogfood project's own
`verification` stage, which previously rendered its raw id as the profession. Labels
already on disk are not migrated; only the persona is corrected.

**Guards:** `pipelines.spec.ts` fails if a shipped stage names a persona with no `AGENTS`
entry or labels itself with a job title; `orchestrate-assignment.spec.ts` fails if the
assignment's example ever labels a role after its worker again; `run-thread.spec.ts` pins
the merge ordering, the no-duplicate-question rule and stability under a late second load.

Gates: lint, typecheck, 817 unit/component tests, build, 69 e2e, `gen:skills` — all green.
Decisions recorded in `docs/decisions.md` (three dated entries); `docs/architecture-ui.md`
rewritten for one fourth tab instead of two.

---

## TASK-115: Per-role model presets, chosen by the Orchestrator
**Priority:** P2 | **Tags:** core, server, ui, engine, milestone-f
**Updated:** 2026-08-11 22:00

A run picked one tier and every stage used it, so the Product Manager restating approved scope
reasoned as hard as the Architect choosing the design, and dropping a run to `fast` took the
Architect down with it. The preset now belongs to the **role**: the Orchestrator proposes one
per role, the user sees and can change each in the team-review card before approving, and a
stage resolves `stage.modelTier ?? run.modelTier` so the run's tier stays the default.

**Delivered:**

- Optional `modelTier` on `orchestratorRoleSchema` and `stageDefinitionSchema` (both
  `.strict()`, so this is what lets the value through at all), on the persisted stage schema,
  and seeded onto `StageState` in `createInitialRunState`.
- `selectModel` reads the stage's own tier, falling back to the run's. One call site.
- `roleTiers` on the approve body, merged by `withRoleTiers` over the proposed roles — an id
  matching no role is a validation issue, not a silent no-op.
- A per-role tier control on the team card, defaulting to the Orchestrator's choice or "Run
  default"; `LimitModal` now names the blocked stage's own rung rather than the run's.

**Scope decided with the user:** composed teams only — no rung is authored into `pm-dev-test`
or `full-delivery`. A role without one follows the run, as today.

**Limits.** A limit still parks the stage and waits for the reset, and a tier changes only when
the user asks in that dialog. Review caught that this was not enough on its own: a blocked role
pinned to `deep` would resume on `deep` and hit the same limit again, because the fallback
prefers the stage's preset over the run's. `resolveLimit` now writes the chosen tier to the
blocked stage as well as the run, so the user's choice reaches the stage they are unblocking.
For any pipeline where no stage carries a preset, this is identical to the old behaviour.

**The live check earned its place.** The first real Orchestrator turn failed: the model invented
a `rationale_tier` key and the strict schema rejected the whole decision. The prompt had said
"say why in the role's `rationale`", which read as an invitation to add a field. Reworded to say
a role carries exactly the keys shown and any other key rejects the decision. On the re-run the
Orchestrator proposed, for a rate-limiting goal with a real design fork: **Software Architect
`deep`** ("weigh token bucket vs sliding window"), **Developer run default** ("implements the
approved design"), **QA Engineer `balanced`**. That is the intended trade, and no test could
have found the prompt bug.

774 tests (+15), 67 e2e (+1), lint, typecheck, build, no skill drift. Verified on Windows.

Cross-platform: n/a — tier resolution and the effort flags already go through the adapters.

---

## TASK-138: Run the built product and show it in an embedded browser
**Priority:** P1 | **Tags:** ui, server, engine, testing, milestone-f
**Updated:** 2026-08-11 12:05

**Milestone F** — `TASK-126` delivered the weaker half of *sees the thing that was built*: a
run names its files. This delivers the rest. A project that declares a `ui` block in
`.adhd/automation.json` — stored since `TASK-092` and until now read by nothing but its own
Setup editor — gains a **Preview** tab that starts the product, waits for its health URL,
and frames it inside ADHD.

**The research that decided the design** (`docs/embedded-preview.md`): VS Code's Simple
Browser and Cursor's Preview both frame localhost in a plain `<iframe>` with no proxy, and it
works because dev servers do not set framing headers by default; Cursor 2.0, Codex and Claude
Code all drive a product over **CDP**, never through the frame. So the shared seam is the
**process and its URL**, not the rendering surface — one process, two consumers. The user
gets an iframe; the QA agent gets the same URL through a new `## Environment` block in its
stage prompt and drives it with its own browser capability.

**Absorbs `TASK-095`.** Its policy half is now written into the persona — where no browser
capability exists, Playwright is the complete fallback and the CI authority — so `TASK-095`
should be **rejected** rather than built.

**One requirement was changed with the user's approval, on 2026-08-11, before implementation.**
As written this task said *"Server shutdown, project switch and run switch all have to reach
the kill."* Asked directly, the user chose one process per project that **survives a run
switch**, because an initiative's child runs would otherwise each kill the preview the user
was watching — the case they raised themselves. A completed run that changed files restarts
it instead, so the preview is never the previous build. Shutdown and project switch still
reach the kill, and project switch is enforced **server-side** on `POST /projects/:id/activate`
rather than by the browser. The reasoning is in `docs/decisions.md`.

**Delivered:**

- `startSubprocess` returns a handle (`pid`, `kill`, `exited`); `runSubprocess` is now
  `startSubprocess(spec).exited`, so the Windows `.cmd` rewrite and the POSIX process group
  stay in one place. `timeoutMs` became optional — a product process has no lifetime bound.
- `ProductProcessService`: one process at a time, tagged with its project, idempotent start,
  readiness poll, one framing preflight, and a `stop` that waits for the process to actually
  be gone. `DeploymentRunner`'s poll loop was extracted to `utils/health-poll.ts` and both
  now share it.
- `GET/POST /automation/product{,/start,/stop}`; the first `SIGINT`/`SIGTERM` hook the server
  has ever had, which also finally calls `RunService.shutdown()` outside tests.
- `Preview` tab, `PreviewPanel`, `useProduct` (polls only while starting). A framing refusal
  names the header that refused, beside "Open in browser" — never a blank box.
- Persona, step task and QA skill moved off Playwright-only and off starting servers
  themselves, which is the `TASK-117` failure seen from the other side.

**Verified on Windows**, live and not only in tests: ready and framing-allowed; a product
that never answers reporting its own stderr rather than a bare timeout; `X-Frame-Options:
DENY` detected and named; a product *and its child process* both gone after Stop. 752 tests,
66 e2e, lint, typecheck, build, no skill drift. macOS reasoned through, untested — the kill
path is `killProcessTree`'s existing POSIX process-group branch. `Ctrl-C` could not be driven
from a script on Windows, so the shutdown hook is covered by test rather than by hand.

Cross-platform: starting and killing go through `startSubprocess`/`killProcessTree` with
executable-plus-argument arrays; `commandForPlatform` picks the `windows`/`posix` override.
The stage prompt describes the HTTP call rather than handing over a `curl` one-liner, which
would be wrong in PowerShell.

---

## TASK-124: Orchestrator-brokered permission modes for the harnesses
**Priority:** P1 | **Tags:** core, server, engine, adapters, milestone-f
**Updated:** 2026-08-10 21:05

**What shipped.** A third permission tier, `autoReview`, that delegates blast-radius
judgement to each CLI's **own** auto-review mode — Claude's `--permission-mode auto`,
Codex's `--approve-for-me` — and degrades to today's `skip` behaviour, with a stage-log
notice, on a build that has none. Support is a runtime `--help` probe of the installed
binary, memoised per binary-plus-subcommand and cleared on `detect()`/`install()`, because
the flag's existence is a property of the build rather than of the engine: Codex 0.144.6
rejects `--approve-for-me` while newer releases ship it.

`permissionPlan()` (`domain/rules/permission-plan.ts`) is the one place that turns mode
plus support into a strategy and decides whether to speak; it absorbed the two ad-hoc
caveat logs that lived in the Codex and Cursor adapters. The HTTP boundary now validates
`permissionMode` against the enum in all six run-start schemas, which removed the
coercion in `run-service.ts` that had been collapsing every unrecognised value to `skip`.

**Scope, renegotiated with the user.** The task as written asked to route approval
requests to the Orchestrator. That was rejected for Milestone F and the reasoning is in
`docs/decisions.md`: only Claude offers a live channel (`--permission-prompt-tool`, needing
bidirectional stream-json), `codex exec` has no approval channel at all, and
`runSubprocess` writes stdin once and closes it — a new park/resume state and a rewritten
subprocess seam inside the milestone whose rule is *stop adding*. Nothing here forecloses
building it later.

**Cursor is deliberately untouched.** Its Auto-review is real but selected by the
`approvalMode` key in `~/.cursor/cli-config.json`, not by a flag. Writing it would break
the standing rule that CLI config files are read, never written, and would persist past
the run; relocating `CURSOR_CONFIG_DIR` risks relocating stored auth and cannot be verified
without the CLI installed. Cursor reports `unsupported` as a constant and says so in the
stage log. A test asserts no `.cursor` file is written and no `CURSOR_CONFIG_DIR` reaches
the child.

**Not verified, and not claimed:** that `codex exec --approve-for-me` behaves as expected
on a newer CLI (0.144.6 is what is installed), and that Cursor's Auto-review would work if
adopted. The probe means an unverified flag is never passed to a CLI that does not
advertise it.

**Verification.** lint, typecheck, 722 tests, build, 62 e2e, `gen:skills` (no drift). The
two help parsers were additionally run against the real `claude --help`, `codex exec --help`
and `codex exec resume --help` on this machine: Claude reports `auto` available, Codex
reports unsupported on both subcommands, and a `--sandbox` control confirms `exec` and
`exec resume` genuinely carry different option sets — which is why each is probed
separately.

---

## TASK-126: Show the user what was built
**Priority:** P0 | **Tags:** ui, server, milestone-f
**Updated:** 2026-08-10 17:30

**What shipped.** A finished run names what it changed. The server measures it: a
snapshot of the project — path, size, modification time — is taken when a run starts and
again when it settles, and the difference is what was created, edited and deleted. When
the project root is a git repository, git answers instead and counts what the agent
**committed**, not only what is still dirty; a status-only reading of a repository where
the agent committed everything reports nothing at all. Both baselines are taken at start,
git wins at read time, and the whole thing degrades to the snapshot when any git call
fails. `.adhd` is excluded from both, or every run would report its own bookkeeping.

The UI stopped apologising. The finished-run footer that said *"This run has finished —
start a new run to say more"* now reads `2 created · 1 edited`, with **See what was
built** opening a fourth Artifacts view — **What changed** — that lists every file beside
its kind and reads it through the file-preview endpoint that already existed. That view is
preselected for a terminal run. Beside both sits **Open project folder**: `POST
/runs/:id/reveal` opens the run's folder in Explorer, Finder or the freedesktop opener
through `runSubprocess` with an argument array. The endpoint takes **no path** — it
resolves the folder from the run it is scoped to, so nothing client-supplied ever reaches
an OS shell.

**Two lifecycle facts fell out.** `runCompleted` became asynchronous and captures the
change set *before* it flips the run's status, because a client that polls until
`completed` starts its next run immediately and the project's single-run slot is released
on the far side of that flip. And the UI refetches the run once on `run.completed`: a
change set cannot reach an event-sourced projection any other way.

**Split in half, decided with the user.** "When the project declares how to start itself,
run it and show it" became `TASK-138` — doing it honestly means an embedded browser that
Playwright and the engines' own browser capabilities can drive, not a link to a dev server.
It left Milestone F for H on 2026-08-10 and was pulled back into F the same day, sequenced
after `TASK-124`, because F's bar is what a first-time user sees and this task delivered
only the weaker reading of it. `TASK-092`'s `ui` automation block waits there, still stored
and unconsumed.

**Rejected on the way:** engine tool logs (only Claude's adapter is known to emit
`Write`/`Edit` paths, so "every engine" would have been a claim nobody had checked) and an
agent-declared file list (the `adhd-run-artifacts` fence is optional, orchestration-only
and prose — it is the thing being replaced).

Gates green: lint, typecheck, 694 tests (26 new), build, 62 e2e. `revealFolder` driven
against a real folder on Windows. No live engine run — every shipped pipeline spends
tokens, and a new `FakeEngine.writes()` proves the whole wiring for free instead; the live
pass belongs to `TASK-128`. Decisions in `docs/decisions.md`; the git and snapshot quirks
in `docs/implementation-notes.md`. Version 0.9.30.

---

## TASK-092: Release management and preview deployment automation
**Priority:** P0 | **Tags:** server, adapters, setup, infra, milestone-f
**Updated:** 2026-08-10 12:30

**What shipped.** A project's own commands now live in `.adhd/automation.json` —
`validation`, `ui` (start command + readiness URL), `preview` and `production` — as
executable-plus-argument arrays with per-platform overrides, never shell strings. A
working directory that is absolute or climbs out of the project is refused when the
configuration is *saved*, not when the command runs.

The Setup screen's mock "Deploy Target" card became a real **Automation** section: start
command, validation commands, and a deploy target per environment, each editing the
command through one shared field set including the Windows executable override.

**The `deploy` box no longer starts an agent.** Any stage whose step task is
`deploy-preview` is executed by ADHD itself — no target configured ends `SKIP` without
spending an engine turn; a configured one runs the command, streams its output into the
stage log, reads back the last `ADHD_DEPLOY_URL=…` line it printed, health-checks the
resulting URL, and passes only if both the command and the check pass. Keying on the step
task rather than the pipeline id means an Orchestrator-composed team gets the same
behaviour. The quality gate was **not** re-implemented: the `delivery` execution policy
already suppresses `release` and `deploy` unless the run is whole.

The Release Manager's fenced `adhd-release` block became a `ReleaseConsumer` on the
`TASK-127` stage-output seam, so a handoff written as prose fails the stage instead of
passing something nothing downstream can read. Production sits outside Full Delivery and
milestone autorun, behind a browser confirmation *and* a literal `DEPLOY PRODUCTION`
string in the request body.

**Ported by hand from `feature/release-preview-automation`**, an unmerged branch 92
commits behind main. Its design survived; its layering did not — boundary parsing moved to
`schemas/`, pure deployment rules to `domain/rules/`, and the fabricated fallback manifest
was dropped in favour of the rejection seam that did not exist when it was written. While
fixing the 1000-line gate on `run-service.ts`, its two evidence writers joined the new
ones in `services/run-evidence.ts` — one place that knows the on-disk layout of a run.

Verified against the real server and UI: `/automation` proxied and answering, an escaping
`cwd` refused with a path-aware issue, the Vercel preset populating `npx` plus the
`npx.cmd` Windows override. Gates green: lint, typecheck, 645 tests (31 new), build,
59 e2e. Decisions in `docs/decisions.md`; the contract in `docs/project-automation.md`.
Version 0.9.29.

**Follow-on:** the `ui` block is stored and editable but nothing consumes it yet —
`TASK-126` is what turns it into "run the product and show it".

---

## TASK-129: Model rosters must not offer ids the user's plan rejects
**Priority:** P1 | **Tags:** core, engine, server, milestone-f
**Updated:** 2026-08-09 20:55

`TASK-117` hit this on the first Codex run: the shipped list offered `gpt-5-mini`, and a
ChatGPT-account login answered `400 — not supported when using Codex with a ChatGPT
account`. The failure landed mid-run, in a stage log, after the user had waited.

**What shipped.** The first pass made rosters honest — three layers per engine
(`live` CLI listing → `config` the engine's own config file → `static` bundled), merged
first-wins, cached, with unverified entries marked and an unoffered id refused at run
start. Driving the app then showed honesty was not enough: **Cursor's live roster is 194
entries**, and every id turns over monthly. So the surface changed.

**What a user picks is now a preset** — `auto · fast · balanced · deep · max`, one effort
ladder borrowed from the CLIs' own vocabulary — resolved to a concrete `(model, effort)`
pair per engine at stage-execution time. Effort is a real second axis: `--effort` on
Claude, `-c model_reasoning_effort` on Codex, baked into the id on Cursor. A preset that
cannot be satisfied degrades to Auto rather than failing, because an intent can be
substituted where an id cannot. Setup always shows what it resolved to. A preset is
engine-independent and survives switching harness; an exact id remains available as a
per-engine override behind a disclosure, still validated at run start and on limit
resolution. A stored id the ladder covers is adopted onto that preset on read.

Verified live on all three CLIs: `opus` promoted to `origin: "config"` from the real
`~/.claude/settings.json`, `gpt-5.6-sol` deduped to one `config` entry from the real
`config.toml`, cached roster read 47 ms against a 1.4 s re-probe, and the same **Deep**
preset resolving to `opus · effort high` on Claude and `gpt-5.3-codex-high` on Cursor.
`POST /runs` with `gpt-5-mini` answers 400 naming Setup, with no run created.

**Review follow-up.** Setup no longer claims a preset degraded when its roster request
failed. Limit recovery uses a tier-driven run's tier as the cutoff, so lower intents stay
available even when they resolve to the same model; pinned and legacy runs retain their
model-based fallback. Parser and resolver tests now assert stable format and selection
contracts instead of copying the current model catalogue.

Gates green: lint, typecheck, 614 tests, build, 59 e2e. Decisions in `docs/decisions.md`;
roster, effort and migration behaviour in `docs/implementation-notes.md`. Version 0.9.28.

**Follow-on:** `TASK-115` (per-role engine/model configuration) moved out of Milestone H
into Milestone F's scope — presets are its precondition, and the tier is already resolved
per stage, so a per-stage preset is the remaining work.

---

## TASK-127: A stage must not pass on output no consumer could use
**Priority:** P1 | **Tags:** server, core, testing, milestone-f
**Updated:** 2026-08-07 11:40

Found during `TASK-117`, filed rather than fixed there. A `milestone-planning` run on
Codex produced prose instead of a fenced `adhd-milestone-plan` block.
`MilestonePlanConsumer` recorded `milestone.approvalError` correctly — and then the stage
passed, the run completed, and the Orchestrator's review recorded artifacts describing
work as delivered. The user sees a green run over an empty milestone.

The orchestration path already gets this right: a decision that will not parse yields
`NEEDS_ATTENTION` in `domain/rules/stage-context.ts`. The consumer path has no equivalent.

**Scope:** give `StageOutputConsumer.consume` a way to report that the output was
unusable, and have `captureStageOutput` and the workflow turn that into
`NEEDS_ATTENTION` rather than `PASSED`. Audit every consumer — `closeout-consumer`,
`stage-output-consumer`, `milestone-plan-consumer`, and `OrchestrationService` — for the
same swallow. A green run over an empty result is the worst thing a new user can be shown.

Cross-platform: n/a — pure server logic.

---

## TASK-136: Server layering cleanup — placement, dead weight, and a task-board class
**Priority:** P2 | **Tags:** server, infra
**Updated:** 2026-08-07 00:00

Nine drifts from the project's own layering rule (`CLAUDE.md` "Server file placement", A3):

1. `TaskBoardAdapter` — `services/task-board-adapter.ts` is four free functions, each re-probing `<root>/.tasks/config.json` then `<dataDir>/tasks/config.json` on every call. Make it a class that resolves the board **location** once and still re-reads config and state markdown per call, since `.tasks/` is edited externally between calls and a stale `nextId` would collide IDs. Cache only a positive resolution.
2. `OrchestratorRequiredError` → `domain/orchestrator-required-error.ts`. No new `model/` folder; `schemas/` plus `@adhd/core` already are the model layer.
3. `packages/server/scripts/` — keep. `copy-skill-assets.mjs` copies the `.md` prompt assets `tsc` does not emit into `dist/`, using Node's fs API rather than shell `cp`.
4. `services/bundled-prompts.ts` folds into `services/skills.ts`. It cannot go to `domain/` (imports `node:fs`) or `utils/` (personas and step-tasks are ADHD concepts).
5. Delete `services/orchestration-options.ts`. `StartOrchestrationOptions` reduces to `InheritedRunOptions`; move it to `orchestration-service.ts`. Drop `OrchestrationDependencies`, `MilestoneServiceDependencies` and `RunServiceDependencies` in favour of positional constructor params — `MilestoneService`'s `() => RunService` thunk stays, it breaks the construction cycle.
6. `services/product-manager-closeout.ts` splits by owner into `run-closeout.ts` and `milestone-closeout.ts`. The PM closeout itself stays: it is the last stage of `FULL_DELIVERY_PIPELINE`, and the Orchestrator consumes its report rather than replacing it.
7. `services/skills.ts` stays in services — its pure half is already `composeSkill` in `domain/markdown/skill.ts`.
8. Flatten `services/milestone/` — `milestone-service.ts` moves up, `milestone-options.ts` is deleted.
9. `repository/handoff.ts` folds into `run-repository.ts`, its only importer.

Cross-platform: n/a — file moves and in-process refactors only; no process spawning, binary lookup, new path construction, or npm-script changes.

---

## TASK-108: Milestone E — Eigen: the Orchestrator
**Priority:** P1 | **Tags:** core, server, ui, engine, milestone-e
**Updated:** 2026-08-07 11:40

**Closed at 0.9.23.** Milestone E gave the product a top-level Orchestrator: an ordinary
persona whose turn ends in a typed decision rather than a `VERDICT:` line, and which
brokers questions between the other personas and the user. You describe a goal, it talks
it through, composes a team from the persona catalog for you to approve, launches the
composed run, and decides what happens next when that run settles.

Delivered by `TASK-109` (persona + conversational loop), `TASK-110` (dynamic workflow
composition), `TASK-120` (mandatory question mediation), `TASK-112` (post-run decision
loop), `TASK-114` (UI — chat, proposal, run timeline), `TASK-121` (the RunService split
the milestone was built on), and `TASK-117`, whose entry below carries the release verdict:
verified live on **Cursor (Auto)** and **Codex (gpt-5.6-luna)**, five defects found and
fixed on the way.

**Why it closes here.** The epic had been holding four tasks it had itself labelled
*post-MVP*, which is what a milestone must not do — a milestone is its scope. Its
deferred tail moved out: reusable teams (`TASK-111`), per-persona accumulated context
(`TASK-113`), per-role engine/model configuration (`TASK-115`) and the full Orchestrator
UI now belong to **Milestone H — Harmonic**, to be built if prospective users ask for
them. Milestones are named with mathematical terms from here; E is **Eigen**, the
characteristic direction.

**Known limits it ships with.** One run per project at a time and a per-project worker
concurrency of 1 — both inherited from `TASK-110`, both still standing. The design
question underneath them, whether the Orchestrator should run inside `PipelineWorkflow`
at all, was answered by shipping: it does, and nothing has yet argued otherwise.

---

## TASK-117: E2E verification for the orchestrator milestone
**Priority:** P1 | **Tags:** testing, adapters, engine, ui, milestone-c
**Updated:** 2026-08-07 10:15

**Verdict: Milestone E's orchestrator MVP ships at 0.9.23.** Driven from the internal
browser against two live harnesses — **Cursor (Auto)** and **Codex (gpt-5.6-luna)** —
across a throwaway smoke project per engine and a persistent dogfood repo
(`adhd-testbed/dogfood`, a Vite+TS focus timer the team built and then evolved).

Proven end to end: goal → orchestrator conversation → `propose_team` → **Approve & start**
→ composed run → post-run review → next decision. Cursor composed one Solo role for a
trivial page and a four-role team (PM → Developer → QA → PM closeout) for the evolve goal,
gated at planning, and stopped the initiative with a reasoned summary. QA verified the
evolved feature through its own Playwright run with screenshots. Codex closed the same
loop on its own (`propose_team` → approve → composed Solo run → `stop`) and also took the
branch Cursor never did — `delegate_milestone_planning`, which launched a planning run
that parked on a question and resumed on its session. Both engines produced parseable
decisions on the first turn, every time.

**Five defects found and fixed here:**

1. **An orchestrator question was dropped on any non-resumable engine.** `canAsk` required
   `isConversational`, so on Cursor an `ask_user` decision made the stage *pass* while the
   initiative moved to `awaiting_user` — pointing the user at a run that was already over.
   Asking is now a stage property; session resume only decides how the next turn is
   delivered (bare answer with a session, `buildContinuationPrompt` replaying the exchange
   without one). `conversational`/`isConversational` deleted. Verified live: Cursor parked,
   was answered from the Chat tab, and its next turn cited the answer.
2. **A stage hung indefinitely when an agent left a process behind.** A Developer smoke
   checking its work ran `pnpm dev`; the CLI exited but the dev server held the inherited
   stdout pipe, so `close` never fired and `runSubprocess` waited past the ten-minute
   timeout on a promise nothing would resolve. Now settles on `exit` with a flush grace.
3. **`killProcessTree` did not kill the tree on POSIX** — only the direct child. Children
   now get their own process group and the signal goes to the group.
4. **Codex offered models a ChatGPT account rejects.** `gpt-5`/`gpt-5-mini` 400 with "not
   supported when using Codex with a ChatGPT account"; retired to Auto via the legacy-alias
   path and replaced with `gpt-5.6-sol` / `gpt-5.6-luna`.
5. **Protocol blocks leaked into the user-facing chat** — a whole `propose_team` JSON blob
   rendered above the same question shown properly. `conversationOnly` strips machinery
   fences; the log still keeps them verbatim.

Plus a step-task rule — stop every process you start, never bind a default port — which the
next QA stage visibly obeyed (chose 4177, killed it before finishing).

**Filed, not fixed:** a stage whose output no consumer can parse still reports `passed`.
A Codex planning run produced prose instead of a plan block; `approvalError` was recorded
correctly, but the run read green over an empty milestone.

Coverage added: seeded orchestrator e2e (`e2e/orchestration/orchestrator-flow.e2e.ts`),
component tests for asking and continuing on a non-resumable engine, a subprocess-lifetime
spec, and transcript/preferences unit tests. Gates green: lint, typecheck, 548 tests,
build, 59 e2e. Decisions in `docs/decisions.md`; subprocess "why" in
`docs/implementation-notes.md`. Version 0.9.23.

---

## TASK-123: Stop controls for a live pipeline in the UI
**Priority:** P1 | **Tags:** ui
**Updated:** 2026-08-06 22:50

The server had both kill switches (`POST /runs/:id/abort`, `POST /orchestrations/:id/stop`); the UI hid them. `TeamController` now offers **Abort** for every non-terminal run status — derived from `isTerminalRunStatus`, so `pending` and `asking` are no longer dead ends — and a **Stop initiative** button whenever the attached run belongs to an orchestration that is not stopped, including after that run settles. Seven component tests in `packages/ui/test/run/TeamController.comp.tsx`; decision recorded in `docs/decisions.md`. Version 0.9.22.

---

## TASK-121: Rename the run service, split it, and write the placement rule down
**Priority:** P1 | **Tags:** server, core, infra
**Updated:** 2026-08-06 17:15

Renamed `RunOrchestrator` → `RunService`, split into exactly `RunStore` + `MilestoneService` + `RunService`, regrouped `schemas/` (was `domain/codecs/`), `domain/rules`, `services/consumers`, and `utils/`. Snapshots omit `stage.logs` (rehydrated from events); debounce removed. Placement/naming rules in architecture + CLAUDE + decisions; `structure.spec.ts` and persistence tests added. Version 0.9.18.

### Plan

Done: RunService split, log persistence fix, placement rules, schemas rename, structure tests, 0.9.18.

---

## TASK-122: Two bugs that stopped a real run on Windows
**Priority:** P0 | **Tags:** server, engine, infra
**Updated:** 2026-08-05 23:35

Found by driving the app after `TASK-114`. Both predate the Orchestrator; both block using it.

### 1. Cursor could never run on Windows

Every ADHD prompt is multi-line, and `cursor-agent` resolves to a `.cmd` shim, which cmd.exe
cannot carry a multi-line argument through — `runSubprocess` refused the spawn with *"Multi-line
argument cannot be passed through a Windows .cmd/.bat shim"*. `claude-code` already fell back to
stdin on that path and `codex` always reads stdin; only `cursor` still passed the prompt in argv.

**Fix:** `promptGoesInArgs` returns false for a shim binary. Verified against the real CLI that
`cursor-agent -p` with no positional prompt reads it from stdin.

### 2. `Worker tick failed: database is locked`, every tick of every run

`WorkflowRuntime` opened OpenWorkflow's `BackendSqlite` on **`runs.db`** — ADHD's own file. Two
connections, one file. `busy_timeout` is per-connection and OpenWorkflow's sets none, while
`claimWorkflowRun` opens `BEGIN IMMEDIATE`; `BackendSqliteOptions` offers no way to change that.

**Fix:** the durable runtime owns `workflow.db`. One writer per file. Old workflow tables are
left in `runs.db` (not dropped, not migrated) — decided with the user, no deployed installs.

### Verification

Real run, real Cursor CLI, scratch workspace: run `completed`, stage `passed`, a valid `ask_user`
decision recorded, **zero** lock errors in the server log. Gates: lint, typecheck, test (528),
build all green. New tests: `engine/prompt-delivery.comp.ts` (all three adapters carry a
multi-line prompt — fails on `cursor` without the fix) and one in `run/durable-runtime.comp.ts`
(the two databases are separate files).

Cross-platform: fix 1 is Windows-only behaviour reached through a platform-neutral check; fix 2
applies to both.

---

## TASK-114: Orchestrator UI (chat + proposal + run timeline)
**Priority:** P2 | **Tags:** ui, core, server
**Updated:** 2026-08-05 23:10

Chat-first UI entry point for orchestrator conversations, a team proposal/approval panel, and a
timeline of the orchestrated runs in one initiative. MVP slice of the milestone's UI scope; the
fuller surface (decision history, broker turns, a dedicated initiative page) stays post-MVP.

### Plan — done

- **Home leads with the Orchestrator.** `components/EmptyState.tsx` became
  `components/home/` — `HomeComposer` (mode switch + shared composer card), `PipelineHeader`
  (glyph strip, pipeline copy, dropdown), `home-styles.ts`. The fixed pipeline composer is one
  click behind `choose-pipeline` and otherwise unchanged.
- **The orchestrator surface is a tab on its own run**, not a route: `run/OrchestratorPanel`
  renders goal + status, the team awaiting approval with Approve/Stop, the latest decision, and
  the initiative's runs oldest-first. `RunTabs` adds it for an `orchestration` run and opens on
  it. Rationale and the rejected route alternative are in `docs/decisions.md` (2026-08-05).
- **Seams:** five calls added to `api.ts` (the only network module); `useOrchestration` mirrors
  `useMilestones` but keys on `orchestrationRefreshKey`, which folds stage statuses in because a
  decision is recorded when the `orchestrate` *stage* settles, not when the run does. No new SSE
  channel. Pure rules live in `src/orchestration.ts` and `run-list.ts`.
- **Tests:** `orchestration.spec.ts` (the Approve guard reads status *and* decision),
  `run-list.spec.ts` (+6), `RunTabs.comp.tsx` (+4 — the tab appears, opens, lists the timeline,
  reports approval). E2E updated for the new home via `e2e/support/composer.ts`; the full
  browser flow through a live orchestrator belongs to `TASK-117`.
- **Gates:** lint, typecheck, test (524), build, e2e (56 passed, 1 live-tier skipped) all green.

Cross-platform: browser UI over the existing cross-platform server API and run projections.

---

## TASK-112: Post-run decision loop (next phase routing)
**Priority:** P1 | **Tags:** core, server
**Updated:** 2026-08-05 17:20

After a run settles, its Orchestrator reviews it, collects its artifacts, and decides the next
phase. Closes Milestone E's loop: `start_run`, `delegate_milestone_planning`, and the new
`continue_milestone` now launch work instead of being recorded and ignored.

### Done

**The review.** A durable `orchestrator:review` step runs at the end of every non-orchestration
run's own `PipelineWorkflow`, before `run:completed`. It loads the Orchestrator persona and the
new `review-run` step task, and is fed the settled run's stage outputs, its Product Manager
closeout where one exists, and — for a milestone run — the remaining ready features and whether
`autoRunNext` permits continuing. The turn returns two independent fenced blocks,
`adhd-run-artifacts` and `adhd-orchestrator-decision`; each is read on its own, and a failed
review is never fatal to the run.

**Artifacts.** New `RunArtifacts` / `RunArtifactRecord` in `packages/core/src/run-artifacts.ts`,
with `CLOSEOUT_SHAPE` rebuilt as `{ ...RUN_ARTIFACTS_SHAPE, tasks, completedTaskIds,
unresolvedTaskIds, cleanup }` so the superset relation is structural. Persisted on `RunState`
and to `runs/<id>/artifacts/artifacts.{json,md}`. A composed `team-*` run, which produces no
closeout, now produces a durable record.

**Launching after the claim releases.** `recordReview` persists but never launches;
`settleCompletedRun` dispatches through the new `RunReviewer.settle` after `releaseRun`. This is
the run-completion seam TASK-120 rejected — it earns its place here because that is the only
point at which the per-project admission claim is free and the decision is known.

**Milestone chaining through the Orchestrator.** `completeMilestoneRun` keeps the feature
bookkeeping and no longer starts anything. `continue_milestone` does, gated on
`milestone.autoRunNext`, and its optional `featureId` lets the closeout's `nextRecommendation`
choose which feature runs next — the first code path to read that field.

**Reach.** `mediationArtifacts` now prefers a prior run's condensed artifacts over its raw stage
outputs, so a brokering prompt stops growing linearly with the orchestration. `CloseoutPanel`
falls back to `run.artifacts` through a shared `ArtifactReport`.

Gates: lint, typecheck, 510 tests, build, 54 e2e. `FakeEngine.anticipateRunReview()` absorbed the
trailing engine call across 17 component files without weakening AAAAA's declare-up-front rule.

---

## TASK-120: Mandatory Orchestrator question mediation
**Priority:** P1 | **Tags:** core, server, engine
**Updated:** 2026-08-05 15:40

Delivered mandatory project-level Orchestrator mediation. Specialist questions execute as durable mediation steps in the specialist's existing workflow, with automatic answers or durable user escalation and same-session routing. Broker decisions persist separately from lifecycle turns.

Ownership is established rather than demanded: a run with no active Orchestrator bootstraps one from its own task, `POST /orchestrations` supersedes the active record, and a restart adopts its run into the current Orchestrator. The first cut refused all three with `409`, which deadlocked a UI that has no orchestration surface and pinned each project to a single goal.

Added persisted stop/history fields, legacy reconciliation, `POST /orchestrations/:id/stop`, owned-run cancellation, and the missing `/orchestrations` dev-proxy prefix. No admission lanes, queue, secondary workflow, worker-concurrency change, or UI work was introduced.

Verification: lint, all TypeScript configurations, 479 tests, production build, and generated-skill drift check pass on Windows. Version bumped to 0.9.5; macOS verification remains the CI gate.

---

## TASK-110: Dynamic workflow composition from persona catalog
**Priority:** P1 | **Tags:** core, server, engine
**Updated:** 2026-08-05 12:30

An approved team is now a runnable pipeline. `POST /orchestrations/:id/approve` validates the
stored `propose_team` proposal against the catalogs, composes a `PipelineDefinition`, freezes it
onto the run, and starts it — the first point at which the Orchestrator flow runs end to end.

**Delivered:**

- `domain/team-composition.ts` — pure composition. Every `skill`/`stepTask` must be a catalog id,
  which is also what stops the Orchestrator composing itself (`orchestrator`/`orchestrate` are
  deliberately absent). Role ids must be unique and match `/^[a-z0-9-]+$/`; that guard is security,
  not tidiness, because `persistHandoff` joins a stage id straight into a path and composed ids come
  from the model. Every composed stage carries an explicit `executionPolicy`, so quality/delivery/
  closeout suppression applies to a composed run exactly as to `full-delivery`.
- `RunState.pipeline` — a run freezes its own definition when `findPipeline` cannot resolve the id.
  `pipelineForRun()` is what `buildInput` and `restartRun` resolve through, so a composed run
  resumes after a restart and can be restarted from a stage. Built-in runs persist unchanged.
- `core/pipelines.ts` definition types are now inferred from `pipelineDefinitionSchema` rather than
  hand-written, since the field is persisted and validated on load.
- `startRunWith` seam extracted from `startRun`; `startComposedRun` for a definition rather than an
  id. `OrchestrationService.approveTeam` records `approvedTeam`, `composedPipeline` and status
  `running` **after** the run starts, following the ordering rule `e5cbd89` set.

**Decisions:** the definition lives on the run rather than in an orchestration-owned registry — a
run is a historical record, and a later edit to a stored team must not change what a finished run
says it did. Recorded in `docs/decisions.md` with the rejected alternative.

**Planned and then dropped, with the reason recorded:** an `active_runs` lane change. Its premise —
that a parked Orchestrator conversation blocks the composed run — proved false: `propose_team`
completes the conversation run, since only `ask_user`/`escalate_to_user` park. Lanes would also not
have produced concurrency alone, because the durable runtime runs one worker per project. Both moved
to `TASK-120`, together with the design question they raise: whether the Orchestrator belongs inside
`PipelineWorkflow` at all, given it supervises runs and outlives any one of them.

**Not done here, by design:** no closeout stage is forced on a composed team — per-step data is the
`stageOutputs` and per-stage `handoff.md` a run already captures, which `TASK-112` consolidates.
`CloseoutConsumer` is untouched. No UI (`TASK-114`); reusable teams stay in `TASK-111`.

Gates: lint, typecheck, 467 tests (452 + 15 new), build, `gen:skills` (no drift) — all green. The
approve endpoint was smoke-tested against the built server. No UI change, so no e2e.

Cross-platform: n/a for branching — pure zod/JSON composition, no new subprocess, path building, or
shell command. The `/^[a-z0-9-]+$/` stage-id guard excludes `\`, `/`, `..` and drive letters, so one
guard covers both platforms. Tested on Windows; macOS is the same code with no branch, untested.

---

## TASK-109: Orchestrator persona + conversational loop
**Priority:** P1 | **Tags:** core, server, ui, engine
**Updated:** 2026-08-04 23:10

Shipped the Orchestrator as an ordinary persona whose turn ends in a typed decision, plus the
durable conversation that carries it. `POST /orchestrations` starts one; the user answers
through the existing `POST /runs/:id/messages`; the aggregate and its parked run survive a
restart.

**Delivered:**

- `core/orchestration.ts` — an eight-action discriminated union (`propose_team`,
  `delegate_milestone_planning`, `start_run`, `ask_user`, `stop`, and the three
  `TASK-120` reserves), the `Orchestration` aggregate, and `orchestrationStatusFor`.
- `StageDefinition.outputProtocol` (`verdict` | `decision`) and `maxTurns` — a stage now
  declares how its output is read, rather than the interpretation being keyed to a name.
  `ask_user` drives the durable park `QUESTION:` already drove, so the workflow needed no
  new machinery. A turn with no valid decision ends `needs_attention` with the reason.
- `orchestrator.md` persona, `orchestrate` step task, a pure persona/step-task catalog, and
  the internal `orchestration` pipeline.
- `orchestrations` table, repository, `OrchestrationService`, and `routes/orchestrations.ts`.
- `StageOutputConsumer` seam — `captureStageOutput` stops branching on `pipelineId`; the
  milestone-plan and closeout branches moved into their own consumers.

**Decisions:** the Orchestrator is a persona, not a new kind of actor; the orchestration is
its own aggregate rather than a `Milestone`, because it can *delegate* milestone planning.
Both recorded in `docs/decisions.md`.

**Found while validating:** a parked decision stage never reached its consumer —
`stage-execution` returned before capturing output when a stage asks. A decision stage now
records its decision on the way into a park, since the decision to ask *is* the turn's
product. Caught by the component test, fixed, covered.

**Not done here, by design:** `propose_team` is stored unapproved (`TASK-110` composes it),
`start_run` / `delegate_milestone_planning` are recorded but not launched (`TASK-112`), and
the three brokering actions are contract-only (`TASK-120`, created by this task).

Gates: lint, typecheck, 452 tests, build, `gen:skills` (no drift) — all green. Endpoint
smoke-tested against the built server. No UI change, so no e2e.

---

## TASK-119: Prune the docs folder to what still earns its place
**Priority:** P2 | **Tags:** infra
**Updated:** 2026-08-04 22:10

Cut `docs/` from 15 files to 9 (5469 → ~3400 lines) and corrected the stale content the
prune exposed.

**Deleted — settled research with no live reader:**

- `prototype-plan.md` — self-declared temporary; milestones A–D all shipped.
- `technology-comparison.md` — TS vs Python/Rust/Go, long since decided.
- `spike-beads-vs-ts-backlog.md` — `bd` rejected; the verdict already lives inline in
  `competitor-matrix.md` §2.
- `workflow-storage-options.md` — superseded by the SQLite entry in `decisions.md`.
- `model-and-harness-strategy.md` — its "Two agent kinds" section was a **verbatim
  duplicate** of `architecture.md` § Agent model, and the rest (LiteLLM, `.adhd/config.yaml`,
  harnesses marked "Planned") never shipped.
- `mvp-scope.md` — documented an `adhd run --task` CLI that does not exist.

**Preserved before deleting:** the measured embedded-DB comparison from
`workflow-storage-options.md` (`better-sqlite3` fails to install on Windows 11 + Node 24;
PGlite is single-connection; Postgres breaks "one install") moved into the 2026-07-23
`decisions.md` entry as a rejected-alternatives table.

**Corrected in `architecture.md`** — the § Agent model section described a product that was
never built. Rewritten to what ships: a stage is engine-backed iff it carries a `skill`;
engines are the `claude-code`/`cursor`/`codex` CLI roster, each bringing its own model and
auth; personas are layered Markdown; `executionPolicy` decides outcome propagation. Three
rows of the decisions table fixed (persistence is SQLite, not files; no CLI framework; no LLM
abstraction layer). This matters because the file generates the Architect skill.

**Link hygiene:** rewrote the README doc index (it had listed 7 docs and omitted `decisions`,
`implementation-notes`, `testing`, `e2e-test-plan`, `workflow-runtime-options`) and the
"Working with Claude and Cursor" section. Fixed four pre-existing broken links in
`workflow-runtime-options.md` left over from the earlier `architecture.md` merge
(`technical-architecture.md`, `architect-standards.md`, `code-quality.md`). Every relative
Markdown link in `docs/`, README, AGENTS and CLAUDE now resolves.

Gates: lint, typecheck, 430 tests, build all green; `gen:skills` reports no drift.

---

## TASK-118: AAAAA testing standard — a loadable skill, a conformance sweep, a green-CI merge gate
**Priority:** P2 | **Tags:** testing, infra
**Updated:** 2026-08-04 21:30

Made the [AAAAA approach](https://medium.com/bolt-labs/aaaaa-testing-96583245ae24) the
enforced standard rather than a paragraph in a doc. Delivered:

- **`write-tests` skill, generated.** `docs/testing.md` gained four `gen:` blocks;
  `scripts/generate-skills.mjs` was generalised from one hardcoded source to a list of
  `{ source, blocks, outputs }`, and now emits `.claude/skills/write-tests/SKILL.md` plus
  the shipped QA persona `tester.md`. Architect's two outputs are byte-identical. The
  transferable half was widened beyond phase banners to the article's actual thesis —
  logic belongs in the application, not the test — with atomic anticipations, generators
  over flag-driven factories, and duplication-as-a-boundary.
- **ESLint enforcement.** `if`/`for`/`while`/`try` inside a `test()`/`it()` callback is an
  error under `packages/*/test/**` and `packages/ui/e2e/**`, with `**/support/**` exempt.
  It found 7 violations, two of them in `e2e/` that a manual grep had missed.
- **Conformance sweep** across all behaviour tests: 7 server `*.comp.ts`, 9 UI
  `*.comp.tsx`, 8 Playwright specs. Multi-action tests were split; pure `*.spec.ts` files
  got the hard-rule fixes only. Suite went 414 → 430 tests with none lost.
- **Merge gate** documented in `docs/testing.md` (the four required check names, admin
  bypass, why "up to date" stays off) for the maintainer to apply in the GitHub UI.

**Revised after review.** The first sweep read "don't repeat yourself" as the governing
rule and invented a layer of one-line helpers to remove duplication — the exact instinct
the article opens by warning against. A second pass corrected it:

- **Twelve helpers deleted**, ten of them added by the first sweep, their bodies inlined.
  Four generators that had drifted into two copies were collapsed onto one, because a
  *generator* is what makes inlining affordable.
- **Render wrappers became props generators**, typed to each component's own exported
  props, so `render()` is visible as the Act and spies live on the generated props.
- **`throw` → `expect`/`assert`** in every helper, including the seven pre-existing sites
  in `harness.ts` that the pattern had been copied from. `assert` narrows, which is what
  lets an accessor return a non-optional value without a cast.
- **`anticipate*` reserved for external interactions**; helpers that drive the real system
  are Arrange and named for the state they produce. Helpers moved below the tests.
- **`fixture()` split** — it built six unrelated things and no test used all six. Shared
  setup moved to `beforeEach` (a `describe` group where only some tests share it), which
  also cut the e2e suite from 55.9s to 30.9s.
- **Tests grouped** into `milestone/`, `engine/`, `run/`; Playwright files renamed
  `*.e2e.ts` so `.spec.ts` means exactly one thing repo-wide.

Three decision-log entries record the generation split, the branch-protection choice, and
the shared-vs-inline line (including the rejected `support/domain/` layer).
`e2e/run/live-dev-test.e2e.ts` is the one documented exemption from one-action-per-test —
splitting it would buy six paid runs to learn what one already proves.

Cross-platform: n/a — docs, lint config, test structure, and a Node generator that
already normalises CRLF before comparing.

---

## TASK-107: One definition per shape — RunEvent union, schema dedupe, structured tool calls
**Priority:** P1 | **Tags:** core, server, ui, testing
**Updated:** 2026-08-03 22:40

The schemas were strict but the types were loose, and one shape was defined up to four times. Every shape now has a single definition in `@adhd/core`, with its TypeScript type inferred from the schema.

### Done

zod became core's one runtime dependency. Core shapes are transform-free so `z.infer` stays honest; agent-boundary normalisation stayed in the server.

- **RunEvent** is a real 15-arm discriminated union instead of a flat interface with nine optional fields. The server needed no changes — its emit sites were already correct — and the UI reducer became an exhaustive switch, shedding six guards for states the schema already proved impossible. Four specs asserting those defensive paths were deleted rather than repaired.
- **Closeout** collapsed from three schemas to one shape. This closed a live defect: the persisted-run codec was importing the agent-lenient schema, so ADHD's own records were validated against rules written for an LLM.
- **Milestone proposal** collapsed from three definitions to one, which made the fake-markdown-fence round trip in `updateMilestoneProposal` removable. PATCH /milestones/:id/proposal now returns a path-aware 400 and has the component tests it never had.
- **Tool calls** carry a structured `StageActivity` instead of being flattened to a string the UI re-classified by log level. The plan-limit wait, the resume line and "no skill found" are now visible in the chat.

Out of scope by decision: UI runtime SSE validation, the hand-rolled TOML and .env parsers, the regex-on-error-message routing.

Shipped across 0.8.15–0.8.19. 440 tests (from 403), 42 e2e green.

---

## TASK-061: Limit is over — pause the run on a plan limit instead of failing it
**Priority:** P2 | **Tags:** engine, server, ui | **Assignee:** Fedor
**Updated:** 2026-08-03 16:50

A subscription/plan limit used to kill the run: all three adapters pattern-matched it into a friendlier string that still reached `stageFailed`, and the reset time the CLI printed was logged and discarded. Recovery meant a human pressing Restart, which re-ran the whole stage.

**Done — a limit is now a wait, not a failure.** Adapters return a typed `limit` on `EngineRunResult`; `STAGE_OUTCOMES.LIMITED` carries it through `interpretEngineResult`; the workflow parks the stage on a durable `limit:<runId>:<stageId>` signal whose timeout is the time to the reset. Timeout fired = the reset passed, signal fired = the user chose. The park is OpenWorkflow's, so it survives a hard process kill — the "durable sleep (TASK-061)" case that runtime was chosen for.

**Reset parsing is a duration, never a wall clock.** The CLI prints its own local time plus a named zone (`resets 4:30pm (Europe/Tallinn)`). `domain/engine-limit.ts` asks ICU what time it is *in that zone* via `Intl.DateTimeFormat`, subtracts modulo 1440 minutes, and only then turns the duration into an absolute UTC instant. DST is ICU's problem, a reset earlier than now rolls to tomorrow, and Windows and macOS agree. Unknown zone → server clock; unparseable → a 30-minute fallback; everything clamped to 24h. Server logs name a duration (`waiting 3h 38m`); only the browser renders a clock time, in the reader's own zone.

**Decisions taken with Fedor:**
- **`blocked` is its own status** in `StageStatus` and `RunStatus`, never `awaiting` — one "Approve Gate" button must not mean two things. Non-terminal, so the SSE stream stays open across a multi-hour wait.
- **No retry budget.** A stage parks as often as it takes; only abort ends it. A budget would fail an overnight run for spanning two reset windows — exactly the case this exists for. The attempt count is shown in the popup instead, so a mis-detection is visible.
- **A parked run keeps its project's admission slot.** Admission is per project and a limit is account-wide, so a second run would hit the same wall; releasing invents a failure mode where re-admission is refused after a four-hour wait.
- **Connection switching goes through settings**, not the resolve endpoint — the connection is already read from `SettingsStore` on every turn, so the modal writes settings then resolves `retry-now`.
- **Running out of prepaid credit is deliberately not a limit** and still fails the run: waiting never clears it. `insufficient_quota`, `credit balance is too low` and `quota exceeded` stayed in each adapter's `ERROR_HINTS`.

**Mid-run switching needed no relaunch.** `stage-execution.ts` already re-reads `run.engine`, `run.model` and the connection from live `RunState` on every turn, so `POST /runs/:id/limit/:stageId/resolve` mutates the run and signals — finished stages are never re-run. Step names carry the attempt number, with attempt 0 byte-identical to the old names so a run parked across the upgrade does not re-run and re-pay for completed stages.

**UI — the app's first modal over a live run.** `LimitModal` states which harness hit the wall, the raw CLI line, the reset in local time, a ticking countdown, and each way out with its cost consequence. It meets the overlay rule `SetupModal` predates (`role="dialog"`, `aria-modal`, Escape, focus moved in and restored). Notification permission is requested at the moment of the first limit, never on load; Safari rejects that outside a user gesture, so the modal also offers an "Enable notifications" button. Models that bill usage credits are filtered out of the escape list — `Sonnet · 1M context` costs more, not less.

**Verified:** `lint`, `typecheck`, `test` (397 across 52 files), `build`, and `e2e` (42) all green. New coverage: `engine-limit.spec.ts` (21 parsing/selection cases including two zones that disagree with the runner's), `limit-pause.comp.ts` (parks instead of failing, still parked after a hard restart, resumes on its own when the timer expires, model switch without re-running finished stages, abort frees the project), `LimitModal.comp.tsx`, `limit.spec.ts`, and `run-limit.spec.ts` (seeded Playwright, zero tokens). Screenshotted in the running app.

**Not done:** the real sleep/wake check on both OSes, and the Chrome/Safari permission check over `http://localhost`, still need a human at a laptop — reasoned through and written up in `implementation-notes.md`, not observed.

---

## TASK-106: Consolidate the decision log
**Priority:** P2 | **Tags:** infra
**Updated:** 2026-08-03 15:50

`docs/decisions.md` was 1013 lines across 35 entries and is loaded as context constantly.

**Done — 323 lines, 16 entries.** The file is now **high-level direction only**: an entry earns its place if getting it wrong later would be expensive — where data lives, what owns a boundary, what the runtime is, what the product refuses to do. The header states that bar, the newest-first rule, the merge rule, and where the other three kinds of writing go instead (`implementation-notes.md` for *how* and for quirks, `architecture*.md` for structure, `DONE.md` for what a task did).

**Small decisions dropped, not summarized:** SetupModal style placement, the Setup feature folder, the UI scale extraction, SQLite audit-timestamp triggers, the two-preset revision, and the TypeScript pin. Each was an application of an existing rule or an operational detail, and each already had — or has now been given — a home in a doc that is read at the moment it matters rather than loaded as blanket context.

**Four superseded pairs merged into their survivor** before the cut, which is where most of the confusion lived — `exactOptionalPropertyTypes` adopted then removed (the two entries gave opposite instructions), personas-as-generated-module then Markdown assets, SetupModal deferred then done, and "validate untrusted data once" written twice under two titles.

**Related decisions merged by subject** rather than left as one entry per task: the chat projection, the derived transcript and engine usage became "the run view is derived from the log"; the project folder, project data, preferences and credentials became "a project owns its folder, its data, and its settings"; the quality-FAIL presentation and feature acceptance became "a blocking quality finding is not a crash".

**Nothing load-bearing was deleted without a home.** Two facts existed nowhere else and were moved to `implementation-notes.md` first: the TypeScript 6.0.3 pin with the `typescript-eslint` peer-range crash that forces it, and `codex exec resume` rejecting `--sandbox`. The rest were already recorded elsewhere and verified so — the `ExperimentalWarning` launch flag and `EventSource` header limitation in `implementation-notes.md`, Cursor's unverified `conversational: false` and `borderStrong` in `architecture-ui.md`.

**Four cross-references orphaned by the merges were repaired,** not left dangling: three in `architecture-ui.md` (SetupModal styles, the summary channel, the scale snapping) and one in `implementation-notes.md` (a 07-22 date that is now 07-23). In each case the reasoning was inlined where it was already being explained, so the pointer was removable rather than needing a replacement target. Older `DONE.md` entries still cite removed decision dates and were **left alone** — they are a record of what was true when written, and the repo rule is not to edit tasks you are not working on.

Also corrected the stale "simulate vs. engine" description of `stage-execution.ts`, matching the same fix in `architecture.md` under TASK-104, and removed a duplicated `.env`-loader bullet found in `implementation-notes.md` while relocating.

---

## TASK-104: README and docs coherence after Milestone D
**Priority:** P2 | **Tags:** infra, setup
**Updated:** 2026-08-03 15:40

**Done:**

- `README.md` no longer reads as if 0.8.7 were the current release — "Milestone D shipped at 0.8.7" is stated as history, with the current version pointed at `package.json`. The Status section gained the TASK-102 accept-findings control.
- `README.md`'s document table called `architecture.md` the "Aiki runtime"; it is OpenWorkflow. The separate Aiki mention in the competitor list is correct and was left alone.
- `AGENTS.md` carried `Current: 0.8.6` against a real 0.8.9. Replaced with a pointer to `package.json` rather than a fresh number — a hand-copied version in a file the versioning rule bumps *every commit* is a drift generator, so the fix is to stop keeping one.

**Two more found while sweeping, both in the hand-written `validate-code` skill** (only `architect/SKILL.md` is generated, so this one drifts silently):

- A4 still said `RunOrchestrator.executeStage()` is the workflow seam — the framing `workflow-runtime-options.md` §4 exists specifically to correct. Now points at `pipeline-workflow.ts` / `stage-execution.ts`.
- A7 said `exactOptionalPropertyTypes` is on "and stays on", and told reviewers to avoid `= undefined`. It was removed on 2026-07-29 for the opposite reason: ADHD treats absent and `undefined` as the same state. A reviewer following the skill would have rejected correct code.

Also dropped the stale "simulate vs. engine" description of `stage-execution.ts` from `architecture.md` — there is no simulate path, which is the same claim that made the `run-app` skill wrong in TASK-103. That text is inside a `gen:` block, so `pnpm gen:skills` was re-run and `architect/SKILL.md` is regenerated in this commit. `pnpm gen:skills --check` is clean.

---

## TASK-103: The run-app skill describes a version of the app that no longer exists
**Priority:** P3 | **Tags:** infra, setup
**Updated:** 2026-08-03 15:30

`.claude/skills/run-app` listed retired pipeline ids as the smoke-check output and a `data-testid` roster predating the run tabs and the milestone dashboard. It cost real time during the TASK-094 dogfood.

**Done:** pipeline ids corrected to `full-delivery` / `pm-dev-test` / `solo`, with the note that `milestone-planning` is `internal` and deliberately absent from `GET /pipelines`. Added the milestone endpoint roster (plan, revise, proposal, approve, start-next, accept, finalize, autorun), the `/milestones` proxy prefix, `PUT /settings/preferences`, the gate/answer/restart endpoints, and the e2e ports and temp `ADHD_USER_HOME`. Dropdown labels corrected to the pipelines' real names, and the run tabs and milestone route added to the selector notes.

**Two corrections beyond the filed scope, both wrong-in-a-way-that-costs-time:** the skill claimed `sequential` mock runs were unaffected by the sandbox gotcha — there is no mock pipeline at all any more, so *every* run spends tokens and `pnpm test` is the engine-free path. And a subscription session limit is documented as a hard failure pointing at TASK-061, so a future run does not read it as a new bug.

**Scope call on "generate it from the docs":** not done, deliberately. The drift-prone part was the duplicated `data-testid` roster, and that is now a pointer to [`architecture-ui.md`](../docs/architecture-ui.md) §9 rather than a copy. The rest of the skill is operational knowledge — ports, the sandbox exit code, the `--bare` auth gotcha — that exists in no doc, so generating it would mean inventing a source of truth to generate from.

---

## TASK-105: A schema slip must not discard the whole closeout record
**Priority:** P1 | **Tags:** server, testing
**Updated:** 2026-08-03 15:20

The gap TASK-101 deliberately left open: `severity` was normalized, but every *other* schema failure still answered with `emptyCloseout(...)`, so one bad follow-up task priority — or one key the agent invented — discarded the summary, delivered scope, decisions, knowledge, findings and task drafts of a run that cost real money.

**Done:** `parseProductManagerCloseout` now salvages the agent-authored block field by field and, inside arrays, element by element. A field that fails drops to its empty value, a malformed array element drops alone, an unrecognised key is reported rather than fatal, and every discarded piece is named with its path in `validationErrors` — the channel `CloseoutPanel` already renders. A follow-up task whose finding did not survive is dropped too, naming both.

The strict `productManagerCloseoutSchema` is unchanged and still governs the persisted `closeout.json` through `run-persistence.ts`, which is ADHD-owned and stays strict under **A7**. A round-trip test holds the invariant that a salvaged report still satisfies the strict schema, so nothing lands on disk that cannot be read back.

**Decision (docs/decisions.md, 2026-08-03):** salvage rather than the scoped retry the TASK-101 entry priced — a retry costs a second Product Manager call on every slip and still answers a second failure with nothing. One shape, two codecs: strict where ADHD wrote the record, salvaging where an agent wrote it.

**Caught in PR review (Copilot, PR #17):** the first cut salvaged arrays of *objects* element-wise but still ran the five string arrays (`deliveredScope`, `decisions`, `knowledge`, `completedTaskIds`, `unresolvedTaskIds`) through an all-or-nothing `uniqueStrings`, so one bad element discarded the whole array — the exact behaviour the task exists to remove, left in half the fields. Fixed with a `salvageStrings` helper (element-wise, then dedupe); the strict schema keeps `uniqueStrings`.

Covered by **three** codec tests, not one per branch: a whole-closeout parse including the hyphenated severity, one salvage case exercising every field kind at once (string array, object array, unknown key, orphaned task, strict-schema round trip), and the block-level fallbacks. An earlier eight-test version asserted the same parser from eight angles and still missed the string-array bug — coverage per behaviour, not per assertion.

---

## TASK-101: One hyphen in a closeout severity discards every finding
**Priority:** P1 | **Tags:** server, engine, testing
**Updated:** 2026-08-03 10:55

The closeout agent wrote `"severity": "non-blocking"` where the schema demanded
`"non_blocking"`, and `parseProductManagerCloseout` answered any schema failure with
`emptyCloseout(...)` — discarding every finding, follow-up task draft and task
classification. Reproduced 3 runs out of 3 in the TASK-094 dogfood.

**Done:** `severity` now parses through a normalizing step (trim, lowercase, `-`/space →
`_`) before the enum, so the spelling the model reliably writes lands correctly; every
other field stays strict and an unrecognised severity still rejects the record whole.
The step-task example shows both enum values and names them in prose. Covered by unit
tests on the codec and a `product-manager-closeout` test asserting the hyphenated
severity still produces follow-up tasks in the backlog.

**Decision (docs/decisions.md, 2026-08-03):** the `adhd-closeout` block is
agent-authored, so it sits on the external-protocol side of rule A7 rather than the
ADHD-owned side. The scoped closeout *retry* was deliberately not built — it would not
have prevented this defect and costs a second PM call on every slip. The all-or-nothing
`emptyCloseout` fallback for *other* schema failures remains an open gap.

---

## TASK-102: A needs-attention feature can never be resolved from the dashboard
**Priority:** P1 | **Tags:** ui, core, milestone-d
**Updated:** 2026-08-03 10:55

A feature left `needs_attention` blocked `canFinalizeMilestone` forever, and the
dashboard rendered that status with no control to change it — the TASK-094 dogfood had
to PATCH the feature by hand to finish the milestone.

**Done:** `POST /milestones/:id/features/:featureId/accept`, guarded by the new
`canAcceptMilestoneFeature` predicate in core, completes the feature and stamps
`acceptedAt` so a finalized milestone distinguishes what a run completed from what a
human accepted over open findings. The card shows an "Accept findings & complete" button
only on a needs-attention feature and an "Accepted …" line once stamped. Covered by a
component test, a server component test through a restart, and an e2e that walks
accept → progress → Finalize enabled in a real browser.

**Decision (docs/decisions.md, 2026-07-31 — "A blocking quality finding is not a crash"):** acceptance is a distinct domain action
with an audit trail, not a status dropdown over the existing PATCH. Blocking findings do
not prevent acceptance — that restriction strands a milestone on a false positive, which
is the bug being fixed.

---

## TASK-094: Dogfood Full Delivery and close Milestone D at 0.8.7
**Priority:** P1 | **Tags:** testing, infra, milestone-d
**Updated:** 2026-07-31 20:10

Run the deterministic suites and a live Full Delivery dogfood, then close Milestone D.

### Done — 2026-07-31

**Deterministic:** all six gates green at 0.8.7 — lint, typecheck, build, 340 tests, e2e 35 passed / 1 skipped, `gen:skills --check`. Docs updated across `architecture.md`, `architecture-ui.md`, `decisions.md`, `e2e-test-plan.md` and `README.md`.

**Live dogfood** — a real Full Delivery milestone on a disposable sample app (`c:\tmp\adhd-sample-app`, Node built-ins only), Claude Code + sonnet, 3 runs, ~$6, Windows.

Verified end to end:

- **Planning → approval → tasks.** The Product Manager produced a 2-feature proposal with 7 acceptance criteria each, and added cross-platform criteria unprompted. Approval wrote `TASK-001`/`TASK-002` through the built-in `.adhd/tasks` backend.
- **Dashboard against real data** — rail entry with progress, feature cards, criteria, task chips, run history.
- **Autorun** — the toggle persisted server-side across a reload, and after feature 1 ended `needs_attention` the next feature **started on its own**.
- **The PM gate** parked the run and released it on approval.
- **Conditional stages** — `architecture` returned `VERDICT: SKIP` on a trivial feature; `deploy` skipped on both runs with no automation configured, as TASK-092's deferral intends.
- **A genuine quality FAIL.** QA drove Playwright against the running app and found two real defects (an unscoped CSS rule inflating the checkbox hit area, and focus lost on re-enable). Release and deploy were suppressed, closeout still ran, and the run ended `needs_attention` — the TASK-089 semantics, on real evidence.
- **Needs-attention rendering** — `stagePresentation` showed the failed quality stage as amber NEEDS ATTENTION rather than red FAILED, in the pipeline row and the logs.
- **Durable resume — passed on a controlled kill.** The server was killed at 16:31:08 UTC with `implementation` mid-flight and restarted 37s later. `intake` and `product-design` kept their original timestamps and were **not** re-run; `implementation` restarted and the pipeline ran through to completion with no interrupt markers. Two earlier attempts did not test anything — the run had already gone terminal both times — and that is why the third was timed deliberately.
- **Finalize** — correctly refused at 1/2 in both the UI and the API (`400 Milestone has 1 unfinished feature`), enabled at 2/2, and wrote `summary.json` + `summary.md`.

**Defects found, filed, not fixed here:** TASK-101 (a `non-blocking` hyphen discards every closeout finding — reproduced 3/3 runs), TASK-102 (no UI path to resolve a needs-attention feature, so the dogfood had to PATCH the API by hand to finalize), TASK-103 (stale `run-app` skill).

**A live sighting of TASK-061:** a Claude subscription session limit killed `architecture` and `closeout` four seconds apart, logging `resets 4:10pm (Europe/Tallinn)` and then discarding it. Exactly the failure that task was written to fix.

**Not done, deliberately:** the second dogfood — one real ADHD feature through the TaskPlanner backend — was **not run**. The TaskPlanner path is covered by `task-writer` component tests only; it has never been exercised live. macOS is CI-only; every live check above is Windows.

---

## TASK-087: Epic — Milestone D: Full Delivery Loop
**Priority:** P0 | **Tags:** core, server, ui, engine, infra, testing, milestone-d
**Updated:** 2026-07-31 12:10

Ship and dogfood the reusable Full Delivery milestone workflow, then close the milestone.

### Done — closed at 0.8.7 on 2026-07-31

**Shipped:** TASK-088 (milestone domain, persistence, APIs, autorun), TASK-089 (quality semantics and durable closeout), TASK-090 (Full Delivery pipeline and persona team), TASK-091 (Product Manager closeout, task writers, safe cleanup), TASK-096 (conversational milestone planning), TASK-051 (QA application lifecycle and Playwright evidence), TASK-093 (milestone dashboard, autorun controls, delivery artifacts).

**Deferred, not delivered — say so plainly:**

- **TASK-092** — release management and preview deployment automation. Cut from the MVP under the standing "no automation for now" call; PR #13 was closed unmerged. The `release` and `deploy` stages remain in the pipeline and report `VERDICT: SKIP` when nothing is configured, so the seam degrades honestly. This is also why TASK-093 presents neither deploy URLs nor QA screenshot/trace evidence. Rationale in `docs/decisions.md` 2026-07-31.
- **TASK-095** (agent-native browser testing) and **TASK-097** (dynamic workflow composition) were always post-MVP and stay in BACKLOG.
- **TASK-094's live dogfood ran on 2026-07-31 and passed** (see its DONE entry). A real Full Delivery milestone on a disposable sample app proved planning, approval, task writing, the dashboard, autorun chaining, the PM gate, conditional `SKIP`, a genuine quality `FAIL` with release/deploy suppression, needs-attention rendering, durable resume across a real process kill, and finalize with a written summary. **Its second half — one real ADHD feature through the TaskPlanner backend — was deliberately not run**, so that path rests on component tests alone. The dogfood also surfaced TASK-101, TASK-102 and TASK-103, none of which block the milestone.

TASK-061, TASK-069 and TASK-036 are independent future work and were not touched.

---

## TASK-093: Milestone dashboard, autorun controls, and delivery artifacts
**Priority:** P1 | **Tags:** ui, core, testing, milestone-d
**Updated:** 2026-07-31 12:10

Add the main-screen milestone view with feature progress, run history, findings, and Auto-run next feature. Render skipped and needs-attention states, created-task links, and closeout documents in Artifacts.

### Done

Every server capability already existed, so this added **no endpoints** — it is UI plus pure predicates.

- **Core** — `canStartNextFeature`, `canFinalizeMilestone`, `milestoneFindings` and a named `MilestoneProgress` in `milestones.ts`. `canStartNextFeature` deliberately mirrors the guards `RunOrchestrator.startNextMilestoneRun` throws on, so the button is dead rather than the request rejected.
- **Route** — `Route` gained `{ kind: "milestone" }` at `#/milestones/:id`, a sibling of `#/runs/:id`. The boot auto-attach now bails on any non-home route, so it can no longer yank a user off a milestone onto a running run.
- **Rail** — a MILESTONES group above Runs, hidden entirely when the project has none, so an unchanged project sees an unchanged rail.
- **Dashboard** — `MilestoneDashboard` + `MilestoneFeatureCard`: progress bar, Auto-run next feature, Start next feature, Finalize milestone, and per-feature acceptance criteria, task ids, run history and findings.
- **`useMilestones`** — milestones have no SSE channel, so the hook refetches on `milestoneRefreshKey(runs)`, derived from the summary stream the rail already consumes. Autorun uses the repo's optimistic-write / server-authoritative-read pattern.
- **Needs-attention rendering** — `stagePresentation` maps a `failed` stage carrying `VERDICT: FAIL` to amber NEEDS ATTENTION, leaving a verdict-less failure red. A blocking review no longer looks like a crash.
- **Closeout in Artifacts** — a third `CloseoutPanel` view, shown only when `run.closeout` exists: summary, delivered scope, decisions, knowledge, findings, **created-task links**, completed/unresolved source tasks, cleanup, and validation errors.

**Scope cut, with reason:** QA screenshots/traces and preview-deployment results were dropped — both are produced by TASK-092's automation, which is deferred, so there was nothing truthful to render.

**A real defect the tests caught:** the autorun checkbox was a controlled input awaiting a round trip, so it visibly refused to move. The free-tier e2e failed on it; the fix is the optimistic-write pattern, now pinned by two component tests as well.

**Tests:** +36 — `packages/core/test/milestones.spec.ts`, `MilestoneDashboard.comp.tsx`, `useMilestones.comp.tsx`, `CloseoutPanel.comp.tsx`, extensions to `route.spec.ts` / `run-list.spec.ts` / `run-utils.spec.ts`, and a free-tier `e2e/milestone-dashboard.spec.ts` that seeds a milestone through the API (no engine, no run).

**Docs:** `architecture.md`, `architecture-ui.md`, `e2e-test-plan.md`, and two `decisions.md` entries.

---

## TASK-051: QA Engineer application lifecycle and Playwright evidence
**Priority:** P1 | **Tags:** ui, server, engine, testing, milestone-d
**Updated:** 2026-07-30 11:31

Keep QA as the same ordinary agent-backed workflow step as Product Manager, Developer, and the other personas. Do not add QA-specific runtime parsing, persistence, APIs, artifact handling, or project automation configuration.

For interactive UI work, QA uses Playwright only in the MVP. It inspects the repository, uses its existing scripts and Playwright configuration, decides whether durable E2E coverage is needed, authors and runs scenarios headlessly, and reports commands, results, screenshots, traces, and coverage gaps in its normal stage handoff.

Always tear down browser and application processes started by QA. A QA failure continues to Product Manager closeout while blocking release and deploy work through the existing stage verdict semantics. Agent-native browser support remains deferred to post-MVP TASK-095.

Cross-platform: prefer repository-owned commands and Playwright `webServer`; avoid shell-only command assumptions; keep generated tests portable across Windows and macOS; report any platform-only checks that were not run.

### Plan

Kept QA as an ordinary agent-backed stage and limited MVP browser verification to Playwright. Updated the QA persona, verification assignment, and repository QA skill to discover existing project commands, use Playwright headlessly, report evidence in the normal handoff, and clean up started processes. Explicitly deferred agent-native browser support to TASK-095 and added a prompt-contract test. No QA-specific runtime, parser, persistence, API, artifact UI, or automation configuration was introduced. Verified lint, typecheck, production build, skill drift, and 292 tests on Windows.

---

## TASK-099: Make SQLite timestamps database-managed
**Priority:** P1 | **Tags:** server, infra, testing
**Updated:** 2026-07-29 18:56

Standardize persisted SQLite records with `created_at` and `updated_at` columns. Set both timestamps on insert through SQLite defaults, and make `updated_at` advance automatically on updates using supported SQLite schema behavior (evaluate an `AFTER UPDATE` trigger because SQLite has no MySQL-style column-level `ON UPDATE` clause). Migrate existing tables and rows safely, remove redundant application-supplied update timestamps, and keep one documented UTC timestamp format.

Add tests for insert defaults, automatic update behavior, migration/restart compatibility, and unchanged timestamps on reads. The schema and trigger behavior must work consistently on Windows and macOS; validate Windows directly and macOS through CI.

### Plan

Delivered SQLite-managed `created_at` and `updated_at` for mutable run and milestone projections. UTC ISO defaults handle inserts, `AFTER UPDATE` triggers advance updates, and repositories no longer supply audit timestamps. Known legacy tables rebuild transactionally with rows preserved and prior `updated_at` backfilled into both columns. Added low-level and repository restart/migration coverage plus architecture documentation; set a 15-second Node integration-test budget after hosted Windows exposed the former 5-second default as too low. Verified lint, typecheck, build, 291 tests, and skill drift on Windows; macOS tests pass in CI.

---

## TASK-098: Standardize strict runtime schemas at every untrusted boundary
**Priority:** P0 | **Tags:** core, server, testing
**Updated:** 2026-07-29 18:33

Replace recurrent hand-written Record<string, unknown>, stringOf/findingsOf-style mappings with a shared runtime-schema approach at HTTP, engine, database, settings, and persisted-file boundaries. Domain and service layers must receive validated, strongly typed values only. Reject malformed nested data with precise errors instead of silently dropping fields, and document where validation ownership lives.

Cross-platform: n/a — pure TypeScript validation and architecture.

### Plan

Delivered strict, path-aware schemas for HTTP/configuration inputs, persisted runs/events, and Claude/Codex/Cursor JSONL. Pre-1.0 persisted shapes are rejected rather than migrated; all engine codecs normalize into one shared protocol update consumed by thin adapters. Added lint enforcement and architecture/versioning guidance. Verified lint, typecheck, 287 tests, build, skill drift, and 31 Playwright scenarios on Windows; macOS verification is delegated to CI.

---

## TASK-100: Extract server Markdown into a pure domain layer
**Priority:** P1 | **Tags:** server, testing, adapters
**Updated:** 2026-07-29 13:19

Move server-side Markdown parsing and rendering into focused pure modules under `packages/server/src/domain/markdown/`. Keep services responsible for orchestration and filesystem I/O, keep repositories format-agnostic, normalize generated document structure, and preserve TaskPlanner grammar, idempotency markers, unrelated content, and the existing file line-ending style.

Cover stage prompts and handoffs, skill composition, milestone-planning context, TaskPlanner task/work-log Markdown, closeout and cleanup artifacts, milestone summaries, and prior-closeout context. Add exact-output unit coverage and retain service integration coverage.

**Cross-platform:** Parse both LF and CRLF, preserve the dominant line ending when editing existing TaskPlanner files, generate ADHD-owned artifacts with LF, validate directly on Windows, and run macOS CI.

---

## TASK-091: Product Manager closeout, task writers, and safe cleanup
**Priority:** P0 | **Tags:** server, infra, testing, milestone-d
**Updated:** 2026-07-29 10:09

Run the Product Manager again in closeout mode with the same delivery context. Validate and persist closeout JSON/Markdown plus milestone decisions, knowledge, problems, and cleanup reports. Create idempotent follow-up tasks through TaskPlanner or the built-in writer, link their source, transition selected tasks, and remove only allow-listed run-owned temporary resources.

Cross-platform: use Node path/OS helpers and existing process-tree termination on Windows and POSIX.

---

## TASK-096: Conversational Product Manager milestone planning
**Priority:** P0 | **Tags:** core, server, ui, testing, milestone-d
**Updated:** 2026-07-29 10:09

Add a dedicated Product Manager planning conversation that reads the repository and open work, produces a validated editable milestone proposal, reuses matching tasks, drafts missing work, and activates the milestone plus idempotently created tasks after explicit approval.

Cross-platform: pure TypeScript domain, server, and browser UI. Use Node path helpers for project files and validate on Windows plus macOS CI.

---

## TASK-088: Milestone domain, persistence, APIs, and autorun
**Priority:** P0 | **Tags:** core, server, ui, milestone-d
**Updated:** 2026-07-29 10:09

Add persisted Milestone and MilestoneFeature models, run/task links, progress and statuses; milestone CRUD/start-next/finalize APIs; and server-side Auto-run next. Autorun preserves the Product Manager approval gate and stops on runtime failure, cancellation, unanswered interaction, or an empty backlog.

Cross-platform: pure domain/API/UI with SQLite persistence.

---

## TASK-090: Full Delivery pipeline and revised persona team
**Priority:** P0 | **Tags:** core, server, engine, milestone-d
**Updated:** 2026-07-28 22:40

Added the Full Delivery preset while preserving Single Agent and Product Manager + Developer + QA. Its nine assignments reuse Product Manager for intake/closeout, Software Architect for design/review, and QA Engineer for all verification; Product Designer, Developer, Release Manager, and SRE remain distinct. Six bundled step tasks define conditional design, review, release, preview deployment, and closeout contracts.

Cross-platform: every new assignment requires Windows/macOS reasoning and accurate platform evidence. Validated on Windows; macOS validation is delegated to the PR CI matrix.

Verified: lint, typecheck, build, 242 unit/component tests, 31 Playwright tests with one paid live canary skipped, and skill drift.

---

## TASK-089: Continue quality evidence and always close Full Delivery runs
**Priority:** P0 | **Tags:** core, server, engine, testing, milestone-d
**Updated:** 2026-07-28 22:40

Added explicit standard/quality/delivery/closeout execution policies. Blocking review or QA verdicts continue through safe evidence and Product Manager closeout while suppressing release/deploy. Runtime failures run only closeout; cancellation starts no paid closeout. Restart now carries upstream outcomes so an earlier blocker survives a downstream retry.

Cross-platform: pure durable workflow/domain logic; subprocess behaviour is unchanged. Validated on Windows; macOS validation is delegated to the PR CI matrix.

Verified: focused Full Delivery happy/finding/runtime/restart/cancellation scenarios plus the complete lint, typecheck, build, 242-test, Playwright, and skill-drift suites.

---

## TASK-086: Stabilization — classify blocking verdicts as needs attention
**Priority:** P0 | **Tags:** core, server, ui, testing, infra
**Updated:** 2026-07-28 18:16

Done. A clean `VERDICT: FAIL` now leaves its stage failed but closes the run as terminal `needs_attention`; engine/runtime failures remain `failed`.

- `needs_attention` flows through workflow outcomes, persisted run state, events, summaries, restart/resume, and terminal detection;
- the UI renders `NEEDS ATTENTION` with an amber warning treatment in the run rail, status bar, and project drawer;
- persisted needs-attention runs remain terminal after server restart;
- the prepared TASK-084 GitHub Actions workflow is included with Linux lint/typecheck/build/tests/E2E and Windows/macOS typecheck/tests;
- stale Playwright expectations were aligned with Product Manager and QA Engineer naming so CI starts green.

Cross-platform: pure TypeScript status logic. Validated on Windows. macOS validation is configured in CI and remains untested locally.

Verified: lint, typecheck, build, 237 unit/component tests, 30 Playwright tests (1 paid live test intentionally skipped), and `gen:skills --check`.

---

## TASK-085: Support VERDICT: SKIP as a stage outcome
**Priority:** P0 | **Tags:** core, server, testing
**Updated:** 2026-07-28 17:32

Done. Added `VERDICT: SKIP` as a first-class verdict and non-blocking stage outcome.

- parser accepts bare, Markdown-wrapped, case-insensitive, and CRLF SKIP verdicts;
- skipped stages retain verdict, output, handoff, completion time, and a neutral UI treatment;
- a skipped gated stage bypasses approval and downstream stages continue;
- PASS, FAIL, cancellation, and no-verdict behaviour remain unchanged.

Cross-platform: pure TypeScript logic; validated on Windows with CRLF coverage and platform-neutral behaviour.

Verified: lint, typecheck, 233 tests, build, and `gen:skills --check`.

---

## TASK-082: Run-level tabs — Chat, Logs, Artifacts
**Priority:** P1 | **Tags:** ui
**Updated:** 2026-07-28 00:00

The agent-window epic left the run with one body — the chat — and put Logs and Artifacts inside `StageFocusPanel`, a *second pane below the chat* that only opened when a stage node was clicked. The workspace file browser (the "solution folder") was three clicks deep. And the chat rendered every stage log line, so `⎿ Read(auth.ts)`, `Tool error: …` and engine chatter sat in the conversation.

### Done summary
- **`components/run/` — the second feature folder**, taken under the same `architecture-ui.md` §2 rule as `setup/`. `RunTabs` is chrome — tab strip, body switch, and the only owner of which tab is open; plus `ChatPanel` (moved), `LogsPanel`, `ArtifactsPanel`, and `run-styles.ts` for the vocabulary two or more of them share.
- **The chat is a projection of the log, not a second source.** `buildTranscript(run)` is unchanged and feeds Logs; the new pure `conversationOnly(items)` feeds Chat. The filter is **structural** — it drops `kind: "tool"` and nothing else — which only works because TASK-083 demoted engine chatter to the `run` log level first. No prose matching anywhere.
- **`conversationOnly` returns a narrowed type** (`Exclude<TranscriptItem, { kind: "tool" }>`), so `ChatPanel` cannot be handed a tool row. The compiler found this: with a plain `TranscriptItem[]` return, the row component still had to handle a case that could never arrive (**A7**).
- **The stage header row keeps who is working, how it ended, and what it cost** — `formatUsage(stage.usage)` beside the profession and status. The run total sits in the status bar, visible from every tab.
- **A stage-node click filters instead of opening a pane.** `App` still owns `focusedId`; `RunTabs` narrows Logs and Artifacts to that stage and offers "show all". It deliberately does **not** switch tabs — the parent reports what happened, the tab decides what it means (§3 convention 4).
- **Artifacts lists every stage's handoff**, not the focused one's, and the workspace browser is now one click ("Solution folder") rather than a toggle inside a tab inside a panel.
- **Deleted:** `StageFocusPanel.tsx` (586 lines — the package's largest component), the old `components/ChatPanel.tsx`, `mock-content.ts`, and the now-unused `ELEVATION.panelUp`. **No Reasoning tab** — it rendered hardcoded OAuth-demo fixtures regardless of the run, and there is no server-side reasoning source, so the honest options were an always-empty tab or none. **Closes TASK-075.**
- **Tests: +10.** `transcript.spec.ts` gains a `conversationOnly` block (4) proving the split both ways — machinery absent from chat, present in the log; `RunTabs.comp.tsx` (6) drives the tabs rendered, including that Artifacts shows each stage's own handoff. Uses `fireEvent` rather than adding `@testing-library/user-event`, so no new dependency.
- **Mutation-checked:** making the filter a no-op fails exactly four tests, all of them the ones asserting the split.
- **e2e rewritten, and the seeded fixture made faithful** — it declared the "Developer online" line at `info`, a level the server no longer emits for it. Now `run`, with real `info` prose and per-stage `usage`, so the fixture matches what a real run produces. `dev-test-flow` grew from 3 to 6 run-view cases (chat contents, log contents, cost total, artifacts, solution folder); `live-dev-test` reaches the badges via the Logs tab.
- **Verified:** lint, typecheck, **229 tests**, build, `gen:skills`, **Playwright 30 passed, 1 skipped**. Driven in a real browser across all four surfaces with screenshots — chat carries prose and verdicts only, logs carry the machinery with timestamps and badges, artifacts list both handoffs, and the solution folder lists the workspace. Docs: dated `decisions.md` entry; `architecture-ui.md` §2/§3/§5/§6/§7/§9 and gaps #2 and #4. Versions 0.7.2.

---

## TASK-084: GitHub Actions CI — build, tests, and required PR checks
**Priority:** P1 | **Tags:** infra, testing, setup
**Updated:** 2026-07-28 13:25

Add a GitHub Actions workflow that runs lint, typecheck, build, unit tests, and Playwright e2e on every pull request and push to `main`. Configure branch protection so PRs cannot merge until all CI jobs are green.

**Cross-platform:** n/a — CI configuration, runs on ubuntu runners.

### Done summary
- Added [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) with two parallel jobs on `ubuntu-latest`: **`checks`** (lint → typecheck → build → vitest) and **`e2e`** (Playwright chromium, free/seeded tier only).
- Triggers on every `pull_request` and `push` to `main`; concurrency cancels in-flight runs for the same ref.
- **Branch protection:** `gh api` returned 403 — private repos need **GitHub Pro** (or public visibility) for required-status-check rules. After the workflow has run once on a PR, enable manually: **Settings → Branches → Add rule** on `main` → require status checks **`CI / checks`** and **`CI / e2e`**, require branches up to date before merging.
- **Verified locally:** lint, typecheck, build, 229 unit tests pass. Versions 0.7.2.

---

## TASK-083: Structured engine usage — cost and tokens on the run
**Priority:** P1 | **Tags:** core, server, engine
**Updated:** 2026-07-28 00:00

A run could not say what it cost. `claude-code.ts` read `total_cost_usd` off the CLI's result event, formatted it into a log line, and threw the number away; `codex.ts` did the same with token counts. Nothing reached `RunState`. The same lines were also chat noise, because `info`-level logs render as agent prose.

### Done summary
- **`StageUsage` in core** — `costUsd`, `tokensIn`/`tokensOut`/`cachedTokensIn`, `durationMs`, `turns`; `StageState.usage`; a `stage.usage` event on both the union and `RUN_EVENT_TYPES`. Three pure helpers: `addUsage` (fold one turn in), `runUsage` (the run's total, **derived** — a stored total drifts the moment a stage restarts), `formatUsage` (the display rule).
- **`EngineRunResult.usage` replaces three loose fields** (`costUsd`, `durationMs`, `numTurns`). One named shape imported from core, both sides of the seam.
- **`formatUsage` is where the engines' differences live.** Claude Code reports dollars, Codex only tokens, Cursor neither — so no caller branches on engine id, and "nothing" is a legitimate answer rather than an error state. Sub-cent spend keeps four decimals (`$0.0042`), the rest two (`$0.14`).
- **Accumulation on the server, totals on the wire.** `stageUsage()` folds each turn in with `addUsage` and emits the *accumulated* figure, so the UI reducer assigns. A delta would double-count under `replayEvents`; an assignment would report only the last turn of a question loop. `restartRun` deliberately leaves `usage` alone while clearing `verdict`/`logs`/timestamps — money spent on a failed attempt was still spent.
- **Engine chatter demoted `info` → `run`** in all three adapters and in `stage-execution.ts`. `Claude Code online · …`, `${profession} online · …` and Cursor's `done in Ns` are tool-level noise and now say so — which is what lets TASK-082 filter the chat structurally instead of matching strings.
- **The running total shows in `RunStatusBar`** (`data-testid="run-cost"`), so it is visible from every tab.
- **Tests: +12.** `core/test/usage.spec.ts` (8) covers the fold, the derived total, and every branch of the format rule; `server/test/run-usage.comp.ts` (5) covers the stage figure, the **question-loop accumulation**, the run total, an engine that reports nothing, and survival across a server restart. `FakeEngine`'s `reports()`/`asks()` gained an optional usage argument.
- **Mutation-checked:** replacing `addUsage(stage.usage, usage)` with a plain assignment fails exactly one test — the accumulation one — and nothing else.
- **Verified:** lint, typecheck, **219 tests**, build, `gen:skills`, **Playwright 27 passed, 1 skipped**. Docs: dated `decisions.md` entry; `architecture-ui.md` testid roster gains `run-cost`. Versions 0.7.1.

**Not done here:** Claude's result event is documented to carry a token `usage` block, but only the three fields the existing code already read are mapped — asserting a shape from documentation is the failure mode TASK-079 recorded. No price table converts Codex tokens to dollars; inventing a number is worse than showing tokens.

---

## TASK-081: Update ADHD app icon to Smekai graphite family
**Priority:** P2 | **Tags:** ui, setup
**Updated:** 2026-07-28 12:40

Replace the legacy comic-burst favicon and `adhd-icon.png` with the approved graphite ADHD icon from `smekai/.github/brand/identity/`.

**Cross-platform:** n/a — static image assets only.

### Done summary

Rasterized `smek_ai_icon_graphite_adhd@2x.png` into `adhd-icon.png` (128), `favicon-32.png`, `favicon.ico`, and `favicon.svg`. Committed on worktree branch `chore/update-adhd-graphite-icon` (`a65165b`), based on `origin/main`.

---

## TASK-076: Epic — the agent window and conversational runs
**Priority:** P1 | **Tags:** ui, server, core, engine
**Updated:** 2026-07-27 00:00

Umbrella for TASK-077…080. A run was a *canvas you watch* — one prompt, a horizontal pipeline walk, a flat log, history in a drawer that fetched once on mount, and an approval gate as the only human-in-the-loop mechanism. This epic turned it into a **conversation you take part in**.

### Done summary

Closed as an epic: the four children delivered the shape, and this task validated
it end to end and closed the one verification gap they left.

- **The target shape is present, bullet by bullet.** Header mark + `ProjectSwitcher` untouched (`App.tsx`); persistent left rail with live status and "New run" (`RunRail`/`RunCard`, fed by the project-scoped `/runs/events` channel); one thread per run (`ChatPanel` over the derived `buildTranscript`, carrying stage boundaries, agent prose, tool rows, notices, questions and user turns in one order); the durable question loop (`runStageTurns` parks on `answer:<runId>:<stageId>`, `POST /runs/:id/messages` signals it, the stage resumes on `resumeSessionId` rather than re-running); and exactly two presets in `DEMO_PIPELINES` — `pm-dev-test` and `solo`.
- **`asking` is a run status as well as a stage status.** Worth recording because the UI depends on it: `ChatPanel` keys its placeholder and focus off `run.status === "asking"`, and `stageAsking`/`stageAnswered` set both, on the server and in the client reducer. A stage-only status would have left the composer silently inert.
- **The gap the children left was verification, not behaviour.** The question loop is the epic's central promise and had **no browser-level test** — the server proves the park and the resume in `run-questions.comp.ts`, but the UI contract TASK-079 claimed (violet question block, "Answer the question…" placeholder, composer focus, `ASKING` in the rail, the answer reaching the endpoint) was hand-verified once and unguarded since.
- **`e2e/run-question.spec.ts`** — four seeded cases in the `dev-test-flow` style: route interception, a `RunState` typed against core so a model change breaks typecheck, zero tokens. Reuses the existing testid roster; no new testid.
- **Both behavioural claims were mutation-checked**, per the rule the previous commit set: forcing `asking` to `false` fails only the composer case, and dropping `question: true` from `transcript.ts` fails only the question-block case. A test that cannot fail is not a test.
- **Verified:** lint, typecheck, **207 tests**, build, `gen:skills --check`, **Playwright 27 passed, 1 skipped** (the live tier). Docs: `architecture-ui.md` §9 — the seeded tier now names `run-question`, and the testid roster gains `chat-question`, which TASK-079 added without recording. Versions **0.7.0** — the epic that made a run a conversation is what the minor bump marks.

**Not fixed here:** no gap in the §10 table closes — the epic's own out-of-scope list owns them. `mock-content.ts` is still imported by `StageFocusPanel` (**TASK-075**), voice stays decorative, the theme stays light-only, Cursor stays `conversational: false` until someone with the CLI verifies its session-id emission (gap #10), and an unprompted message with nothing asking is still only recorded (gap #9). `StageFocusPanel` remains the largest component. The `pm-dev-test` flow still has not been driven against a real CLI end to end — the live tier is the only thing that would prove it, and it costs money.

---

## TASK-080: Project Manager agent and the two-preset pipeline set
**Priority:** P1 | **Tags:** core, server
**Updated:** 2026-07-27 00:00

Three presets shipped, all variations on "Developer, maybe a Tester", and the picker described the mechanism rather than the job. Six of the eight roster professions in `agents.ts` had a label and nothing else.

### Done summary
- **Two presets, and the roster gained its first promotion.** `pm-dev-test` (Project Manager → gate → Developer → Tester) and `solo` (one all-purpose box). The Project Manager reuses the existing `intake` stage, so no roster change was needed; `solo` got an honest `AGENTS` entry because `agentForStage` silently degrades an unknown id to `{ profession: stageId }` and would have printed raw ids in the log.
- **`personas/project-manager.md`** — interrogate the need one `QUESTION:` at a time, read the repository before recommending, survey what already exists, recommend **one** solution with the decisive trade-off, and emit a spec structured as Problem / Recommendation / Considered and rejected / Scope / Done when / Risks. The persona is told outright that its handoff *is* the Developer's prompt. **`personas/solo.md`** carries the same question contract plus the `VERDICT:` one.
- **The gate moved onto the PM's handoff.** Retiring `gated-dev-test` would have orphaned the approval gate — the only preset exercising it, and what `GatesSection` reads. Approving a recommendation before code is written is also the better shape for "Human Directed".
- **Retired ids refuse accurately instead of throwing.** `restartRun` now says *"This run used the "dev-test" pipeline, which no longer exists — start a new run instead"*. Legacy `localStorage` preferences naming a retired id are dropped rather than adopted — migrating a preference the picker cannot show would be worse than ignoring it.
- **`EmptyState` reads `DEMO_PIPELINES`** instead of a hardcoded array that duplicated every id and label.
- **Generator bug found and fixed:** `generate-skills.mjs` emitted unquoted object keys, so `project-manager` — the first kebab-case persona id — produced a syntactically invalid `defaults.generated.ts`.
- **`skill-generation.spec.ts` lost four of six tests.** They asserted on English prose: that every persona ends with the word `prompt.`, that the architect persona contains the substrings `A1`…`A9`, that it contains `VERDICT: PASS`, and a verbatim check already covered byte-for-byte by `gen:skills --check`. The first *failed on a perfectly correct new persona*, which is the clearest evidence it tested the wrong thing. What remains: the drift check, and one rewritten test that derives skill ids from `DEMO_PIPELINES` — a stage naming a missing persona only logs a warning, so nothing else would catch it. `docs/testing.md` now states the rule: if you cannot name the bug a test would catch, it is not a test.
- **`dev-test-pipeline.comp.ts` → `pm-dev-test-pipeline.comp.ts`.** The flow contract now tests the flow that ships. All eleven cases survived — ordering, shared workspace, per-box persona, handoff quoting, `VERDICT: FAIL`, abort, restart-from-stage — each gaining a Project Manager anticipation and one `approveIntake()` call, now a harness helper rather than eleven copies.
- **Verified:** lint, typecheck, **237 tests**, build, `gen:skills --check`, **Playwright 23 passed, 1 skipped**. Picker confirmed in a real browser: exactly two options with their new descriptions. Docs: dated `decisions.md` entry, `testing.md` updated. Versions 0.6.20.

**Not fixed here:** no alias map for retired pipeline ids — refusing accurately is enough pre-1.0, and an alias can be added if anyone turns out to have runs worth restarting. The `pm-dev-test` flow has not been run against a real CLI end to end; the live tier (`ADHD_E2E_LIVE=1`) is still the only thing that would prove that, and it costs money.

---

## TASK-079: Conversational engines — session capture, resume, and question mode
**Priority:** P1 | **Tags:** engine, adapters, server, core
**Updated:** 2026-07-27 00:00

Every adapter was one-shot — prompt in, `stdin.end()`, process exits — and no session id was captured anywhere; `codex.ts` declared `thread_id` and never read it. So an agent could narrate but never ask, and the composer TASK-078 shipped had nothing to talk to.

### Done summary
- **Resume, not re-run.** `EngineRunContext.resumeSessionId` + `EngineRunResult.sessionId`, one `run()` method — the flag declares the capability, the context drives the behaviour, exactly as `model` and `permissionMode` already do. Re-running was rejected: a PM's investigation is the expensive part, and paying for it again per clarifying question makes the feature not worth having (A8 → `decisions.md`).
- **Verified against the installed CLIs, not their docs.** `claude -r <id>` and `codex exec resume <SESSION_ID> [PROMPT]` both confirmed by `--help`. One finding worth the record: **`codex exec resume` does not accept `--sandbox`**, only the bypass flag, so a resumed Codex turn under `acceptEdits` falls back to Codex's own default sandbox. **Cursor is `conversational: false`** — `cursor-agent` is not installed here and its session-id emission could not be confirmed; a capability asserted from documentation is the silent failure this task existed to avoid. Logged as gap #10.
- **`asking` is its own status.** Distinct from `awaiting` for the reason TASK-061 gives for `blocked` — reusing the gate state would make "Approve" mean two things. Violet in `theme.ts`; GOLD stays gates-only. `stage.asking` / `stage.answered` added to **both** the union and `RUN_EVENT_TYPES`, and handled in `applyEvent`, `markCancelled` and `markInterrupted`.
- **The question contract mirrors the verdict contract.** `parseStageQuestion` is `parseStageVerdict` with a different keyword — last-line-first, CRLF-tolerant, markdown-tolerant. A persona that knows `VERDICT:` needs no new mental model.
- **Three conditions gate a question:** `stageDef.interactive`, `isConversational(engine)`, and `MAX_QUESTION_TURNS = 6`. The budget matters because each loop is a durable park; a Developer that happens to print `QUESTION:` is not interactive and passes straight through.
- **Each turn is a durable step** (`stageId:turn:N`), parked on `answer:<runId>:<stageId>` — the first use of the signal channel's payload, which `waitForSignal` has been typed to carry all along. `POST /runs/:id/messages` sends it when a stage is asking, and records the answer as the user's turn.
- **UI:** the question renders as a violet-ruled block, the composer takes focus and changes its placeholder, and the rail shows `ASKING`.
- **Tests:** +15. `run-questions.comp.ts` (6) proves the park, the resume (`resumeSessionId` asserted on the second call, with the answer as its whole prompt), the transcript, non-interactive pass-through, abort, and **survival across a hard restart**; 9 unit cases cover the parser and the `canAsk` split. `FakeEngine` gained `.asks(question, sessionId)` and a `resumeSessionId` anticipation.
- **Verified:** lint, typecheck, **237 tests**, build, `gen:skills --check`, **Playwright 23 passed, 1 skipped**. Tested on **Windows**; the macOS branch is the same code path — every spawn goes through `runSubprocess`, session ids come from stdout JSON only, and no CLI session directory is ever read.

**Not fixed here:** Cursor stays non-conversational until someone with the CLI verifies it. `admitRun` still holds the project slot while parked — deliberate: releasing it would let a second run write to the same workspace, which is worse than making the user answer or abort. A message sent while *nothing* is asking is still only recorded.

---

## TASK-078: Run chat — one transcript per run, and a message endpoint
**Priority:** P1 | **Tags:** core, server, ui
**Updated:** 2026-07-27 00:00

A run was something you watched: a pipeline canvas, a stage panel you had to click open, and a flat log. `SteerChat.tsx` was the shape of the missing feature and faked its agent reply after 700 ms with no endpoint behind it.

### Done summary
- **The transcript is derived, not stored twice.** `transcript.ts` — `buildTranscript(run)` maps stage logs onto agent prose (`info`), tool rows (`run`/`warn`) and notices (`pass`/`fail`/`error`) through a `switch` closed by exhaustiveness, and merges in `run.messages`, which holds **only the user's turns**. The adapters already streamed all of it; a second copy would have been a reconciliation problem the first time one changed what it logs (A8 → `decisions.md`).
- **`ChatPanel` is the body of a run** — thread plus composer, Enter to send, Shift+Enter for a newline, and an honest "this run has finished" in place of a box you cannot use. `StageFocusPanel` became an opt-in inspector: it no longer auto-opens, and it owns its own tab state.
- **`RunMessage` + `run.message`** in `@adhd/core`, added to **both** the `RunEventType` union and `RUN_EVENT_TYPES`; `RunEvent` carries a named `chatMessage?: RunMessage`, not a `payload: unknown` (A7). `applyEvent` appends and dedupes by id.
- **`POST /runs/:id/messages`** — 404 unknown, 400 empty, 409 on a *terminal* run, 201 otherwise.
- **Found and fixed a real ordering bug.** `GET /runs/:id/events` replayed stored events and *then* subscribed, with an `await` between — anything emitted during the replay was lost. It now subscribes, buffers, replays, then flushes. The client-side dedupe makes the overlap safe. A test drove this out; it was not a test artefact.
- **Old rows on disk are repaired on load.** `messages` is required on `RunState`, so `parsePersistedRun` backfills `[]` — the one place `unknown` is confined. A persistence test writes a pre-078 run and asserts it loads with an empty transcript.
- **`App` shed three pieces of state**, applying the threshold `architecture-ui.md` §6 already stated: `focusTab` and `tabChosenByUser` moved into their only reader, and `pinned` disappeared with the auto-open. ~14 `useState` → ~9. `useFollowScroll` extracts the follow-scroll logic both panels need; `logLevelColor` moves the level→colour map into `theme.ts` instead of a second copy.
- **Deleted:** `SteerChat.tsx` and the `steer` tab.
- **Tests:** +19. `transcript.spec.ts` (9) covers the merge — interleaving, two stages in order, same-millisecond stability, key uniqueness; `run-messages.comp.ts` (6) covers the route, the event, and restart survival; 3 reducer cases; 1 migration case; 1 e2e asserting both boxes in one thread and no composer on a finished run.
- **Verified:** lint, typecheck, **222 tests**, build, `gen:skills --check`, **Playwright 23 passed, 1 skipped**. Driven in a real browser: divider → prose → tool rows → user bubble → notice → next box, composer live. Docs: `architecture-ui.md` §2/§3/§5/§6/§9, gaps #6 and a new #9, plus a dated `decisions.md` entry. Versions 0.6.18.

**Two deviations, both recorded in `decisions.md`:** `RunMessage` has no `kind` field — nothing can produce a question until TASK-079, and union members no code can construct are speculative generality. And the endpoint records on a live run instead of always 409-ing as the task text said; a composer whose every send fails is the mock this task deleted.

**Not fixed here:** **nothing consumes a posted message yet** — TASK-079 is what gives an asking stage something to resume from. Logged as gap #9 rather than hidden behind a control that looks wired. `StageFocusPanel` is still ~570 lines.

---

## TASK-077: Agent-window shell — left run rail and a routed run view
**Priority:** P1 | **Tags:** ui, server
**Updated:** 2026-07-27 00:00

The run list was an overlay (`HistoryDrawer`) that fetched once on mount, never refetched, and had no selection state — so the only way to see a run's status change was to close it and open it again. The app had one screen and no router, which meant a run could not be linked, bookmarked, or reached with the back button.

### Done summary
- **A persistent left rail replaces the drawer.** `RunRail.tsx` (~130 lines) + `RunCard.tsx` (~215) — 280px, `<nav aria-label="Runs">` over a `<ul>` of real `<button>`s with `aria-current` on the open one. Resume / Restart / Rerun moved onto the card as siblings of the open button, not children, so no `<button>` nests inside another. `HistoryDrawer.tsx` is deleted; testids renamed `history-*` → `run-*`.
- **A hand-rolled hash router, and no fifth dependency.** `route.ts` is a pure `parseRoute`/`routeHash` pair over a two-member discriminated union; `useRoute` is a `hashchange` listener. `activeRunId` is now `routeRunId(route)` rather than state, so back/forward work and `#/runs/:id` is linkable. **The hash is load-bearing:** `/runs` belongs to the API and is proxied by `vite.config.ts`, so a path router would have been answered with run JSON instead of the app (A8 → `decisions.md`).
- **A project-scoped SSE channel makes the rail live.** `GET /runs/events` emits a compact `RunSummary` on every non-log event. `toRunSummary` lives in `@adhd/core` so both sides share one declaration, and it deliberately drops `stages[].logs` — the bulk of a `RunState`, and worthless for painting a status dot. `ListenerRegistry<T>` extracts what the per-run and per-project subscriptions had in common, collapsing `subscribe` to one line.
- **`EventSource` cannot set headers**, so `projectScope` gained a `?project=` fallback; the `X-ADHD-Project` header stays the rule everywhere else.
- **Snapshot still comes from `GET /runs`.** `useRunList` subscribes first, fetches second, and replays what arrived in the gap — the ordering `useRunEvents` already uses, and the reason `mergeSummaries` exists.
- **Boot auto-attach is guarded.** An `attachedProject` ref fires it once per project, so it cannot yank the user back to a running run after they deliberately clicked "New run".
- **Tests:** +30. `route.spec.ts` (13), `run-list.spec.ts` (9) and `useRunList.comp.tsx` (8) are new; `run-stream.comp.ts` (4) covers the channel end to end — push on transition, no logs in the payload, project scoping, and the query-parameter path. `deferred.ts` extracts what the two stream fakes share.
- **Verified:** lint, typecheck, **203 tests** (4 consecutive clean runs), build, `gen:skills --check`, and the **full Playwright suite (22 passed, 1 skipped)**. Also driven in a real browser: deep link → correct run, card click → navigation, "New run" → composer, browser Back → previous run, exactly one `aria-current`. Docs: `architecture-ui.md` §1/§2/§3/§5/§8/§9 and gap #5, plus a dated `decisions.md` entry. Versions 0.6.17.

**Not fixed here:** the main pane is still `RunStatusBar` + `PipelineRow` + `StageFocusPanel` — TASK-078 replaces it with the transcript.

---

## TASK-073: Split `SetupModal.tsx` into per-section components
**Priority:** P3 | **Tags:** ui
**Updated:** 2026-07-27 00:00

`SetupModal.tsx` was **1002 lines** with roughly 50 style builders in one file — the largest module in `packages/ui` and the one place where A2's single-responsibility rule was visibly broken: it owned four unrelated settings surfaces (`harness | gates | appearance | deploy`), each with its own state, server calls and styling.

### Done summary
- **`components/setup/` — nine files replace the one**, and the first feature folder in the package (taken under the `architecture-ui.md` §2 rule: a feature owning ≥4 files no other feature imports). `SetupModal.tsx` (151) is chrome only — backdrop, nav rail, section switching, close — plus `AppearanceSection` (58), `GatesSection` (52), `DeploySection` (56), `HarnessSection` (105).
- **The harness section split again along the same axis.** Left whole it would have been ~570 lines and still the package's largest file; its three blocks each own state *and* server calls, so each became a component: `EngineStatusCard` (322 — status fetch, install, login, copy-command), `EngineConnection` (206 — modes + API-key form), `EngineModelPicker` (149 — model roster, custom ID).
- **Shared style vocabulary in `setup/setup-styles.ts`** — the ~13 names two or more sections use (`optionCard`, `radioDot`, `optionLabel`, `sectionTitle`, `mutedCaption`, …). Section-specific builders moved with their markup, as [`decisions.md`](../docs/decisions.md) 2026-07-26 requires; the shared module is a vocabulary across siblings, not the rejected `SetupModal.styles.ts`, and the 2026-07-27 entry records why the distinction holds.
- **Two couplings became explicit props** rather than surviving as shared mutable state: `statusNonce` → a `refreshKey` owned by `HarnessSection` and passed to both the status card and the model picker (an install/login must refresh the CLI's model roster), and `customModelDraft`'s reset → an effect on the `model` prop instead of a reach-in from `selectEngine`.
- **No behaviour or DOM change.** Each section now mounts only while selected, which deletes the four `if (sec !== "harness") return;` guards — the old effect deps already included `sec`, so fetch timing is identical.
- **Verified:** lint, typecheck, 173 tests, build and the **full Playwright suite (22 passed)** green. The `project-drawer` spec that failed on the TASK-072 baseline was a stale assertion on `"Pipeline Stages"` — UI deleted with skip-steps and present only in `design/` — corrected to `"Human Gates"`, the section its "Edit in Setup" link actually opens. Docs: `architecture-ui.md` §2/§3/§7 and gap #4 updated; versions 0.6.16.

---

## TASK-072: Extend `theme.ts` with spacing, radius, type and elevation scales
**Priority:** P2 | **Tags:** ui
**Updated:** 2026-07-27 00:00

[`theme.ts`](../packages/ui/src/theme.ts) tokenised **colour only** — three `Dir` palettes, `SPEC_COLOR` per stage, `STATUS_COLORS`, `RUN_PILL`, `SANS`/`MONO`, `GOLD`. Every other visual dimension was a magic number inline in the component: paddings, radii, font sizes, icon sizes, the 50px top bar, `z-index` values, and the durations in `index.css`. A consistent restyle meant editing all 17 components by hand while eyeballing whether `borderRadius: 10` here and `9` there was intentional. This was the prerequisite for any UI beautification work.

### Done summary
- **Nine scales in `theme.ts`**, extracted from measured usage, not designed: `SPACE` (2→40, 10 steps), `RADIUS` (2→20 plus `round`), `FONT` (9→16 plus `display`), `WEIGHT`, `ICON` (10/12/14/16), `Z` (dropdown/popover/overlay/overlayNested), `MOTION` + `EASE`, `ELEVATION`, and a `focusRing(soft)` helper for the repeated `0 0 0 3px` ring.
- **Near-duplicates snapped to one step**, every snap ≤2px and all of them tabulated in [`decisions.md`](../docs/decisions.md) 2026-07-27. `SPACE.md`/`lg` (8/10) and `RADIUS.md`/`lg` (8/10) were deliberately **kept apart** — chip radius vs control radius are two roles, and merging them would have been a redesign.
- **`Dir` gained `elevation: { sm, md, lg }`** (replacing the three flat shadow fields — shadows are palette-tinted, so they belong on the palette) **and `borderStrong`**, which ends the `d.border.replace("0.12","0.20")` string surgery. Sakura's dot grid was being drawn at the plain border alpha because the replace silently no-opped; it is now as strong as the other two palettes.
- **`index.css` keeps only the six `@keyframes`.** The `.animate-spin` / `.animate-pulse` utility classes carried durations no TS file could see; they are deleted and their four call sites use the inline `animation` shorthand with a `MOTION` token, making `theme.ts` the single source for timing.
- **All 19 files migrated** — `App.tsx`, `inline-md.tsx` and the 17 components, including the 1002-line `SetupModal`. Style builders stayed in each component's own file (**A6**); one-off structural dimensions (top-bar height, drawer/dialog widths, sidebar widths) became named local constants rather than shared tokens, since a token per call site is worse than the literal.
- **Verified:** lint, typecheck, 173 tests and build green; driven headless across all three palettes with before/after screenshots of every surface — diffs are the expected 1–2px reflow. One e2e spec (`project-drawer`) fails identically on the unmodified baseline and is unrelated.

---

## TASK-074: Add a component-test layer for the UI
**Priority:** P2 | **Tags:** ui, testing
**Updated:** 2026-07-27 00:00

The root `vitest.config.ts` included `packages/*/test/**/*.{comp,spec}.ts` with `environment: "node"` — the glob could not match `.tsx` and the environment could not render, so everything above two pure-helper specs was covered only by Playwright. `applyEvent` — nine event types, a log-dedupe branch, and the subscribe-buffer-replay ordering around it — had no direct test at all.

### Done summary
- **Two vitest projects from one root config.** `node` keeps `packages/*/test/**/*.{comp,spec}.ts`; the new `ui` project takes `packages/ui/test/**/*.comp.tsx` under `jsdom`. **The extension picks the environment** — that is the whole convention, and it means a pure UI check stays a `.spec.ts` in the fast node project. `pnpm vitest run --project ui` runs one at a time.
- **Extracted `applyEvent` to [`src/run-events.ts`](../packages/ui/src/run-events.ts)** — A9 wants pure helpers apart from stateful modules, and keeping the reducer out of the hook is what lets it be tested with no DOM. `useRunEvents.ts` now also reuses `isTerminalRunStatus` from `@adhd/core` instead of its own copy of the terminal-status array. (`App.tsx:25` still has the same duplicate; left alone, out of scope.)
- **28 new tests.** `run-events.spec.ts` (18, node) covers all nine event types, the `failed`/`cancelled`/default status mapping, the dedupe on `ts` + `message`, an event naming an unknown stage, and that the input run is never mutated. `useRunEvents.comp.tsx` (10, jsdom) drives the ordering that no e2e test can observe: an event arriving *before* the snapshot is replayed onto it, an overlapping log is absorbed, `run.completed` and an already-terminal snapshot both close the stream, a resubscribe-key bump opens a second subscription, unmount unsubscribes.
- **Substitutes the network boundary only.** `vi.mock("../src/api")` — the repo's first, chosen over a fake `fetch`/`EventSource` harness for a much smaller diff. AAAAA forbids logic in a test body, so the deferred promises, SSE-callback capture and `act()` wrapping live in `test/support/fake-run-stream.ts`, with fixtures in `test/support/run-fixtures.ts`.
- **Deps placed by consumer:** `jsdom` at the root (vitest lives there), `@testing-library/react` + `@testing-library/dom` in `packages/ui` (React lives there). No `jest-dom` — the repo has no custom matchers.
- Docs updated: `testing.md` gained a **Component (render)** layer row, the environment-by-extension rule and the api.ts-substitution rule; `architecture-ui.md` §2/§5/§9 and known-gap #3.

**Verified:** `pnpm test` 173/173 across both projects, `pnpm lint` and `pnpm typecheck` clean. Confirmed the split is real by running each project alone (`ui` picks up only the one `.comp.tsx`), and confirmed the layer can fail by breaking the dedupe guard — both the spec and the hook test caught it independently, then reverted.

**Not fixed here:** `pnpm e2e` has one failing spec, `project-drawer.spec.ts:39` ("the drawer summarises the engine and pipeline and links into Setup"). Verified pre-existing — it fails identically with this task's only `src` change stashed. Needs its own task.

---

## TASK-071: Document the UI architecture and review `packages/ui`
**Priority:** P2 | **Tags:** ui, infra
**Updated:** 2026-07-27 00:00

`packages/ui` was ~5.4k lines with no dedicated documentation — UI context was split across A9's six-line frontend clause, a five-bullet layout section, four notes in `implementation-notes.md`, and two styling entries in `decisions.md`. Every UI task re-derived the same context from `App.tsx`, `api.ts` and `theme.ts`.

### Done summary
- **New [`docs/architecture-ui.md`](../docs/architecture-ui.md)** — ten sections: the stack and its four deliberate absences (each with the trigger that would reverse it), module map, component conventions, the `api.ts` network seam, the run data flow end to end, the four-tier state-ownership model, the design system, accessibility, testing layers, known gaps. Descriptive throughout, with binding paragraphs marked **Rule**.
- **Wired into the generated standard.** A9's frontend bullet in the `gen:shared` block now points at it, so the pointer reaches both `.claude/skills/architect/SKILL.md` and the shipped Architect persona via `pnpm gen:skills`. Also cross-linked from the `### packages/ui` section and the `README.md` doc index.
- **Fixed the stale `## Local dashboard architecture` block** — it claimed the SPA served on 9477 and listed a `/tasks` REST surface that never existed. Replaced with the real port split, the seven proxied route groups, the actual endpoint roster, and the `X-ADHD-Project` header.
- **Review findings raised as tasks:** TASK-072 (no spacing/radius/type/z-index scales — the prerequisite for any beautification), TASK-074 (no component tests at all; the vitest glob cannot match `.tsx`), TASK-075 (`mock-content.ts` fixtures still rendering in `StageFocusPanel`), TASK-073 (`SetupModal.tsx` at 1002 lines). Three further gaps — overlay accessibility, hand-mirrored response types, light-only theme — are recorded in §10 without tasks.

**Verified:** `pnpm gen:skills` regenerated both artifacts; `pnpm test` 145/145 including the drift test; `pnpm lint` and `pnpm typecheck` clean. No `packages/ui/src` changes.

---

## TASK-063: Extract SetupModal inline styles to named constants (Architect rule A6)
**Priority:** P3 | **Tags:** ui
**Updated:** 2026-07-26 23:20

Follow-up from TASK-052, deferred there as a visually risky diff with no unit coverage. `SetupModal.tsx` carried the last 100 inline `style={{…}}` objects in the codebase.

### Done summary
- **100 → 0 inline style literals.** All lifted to module-level `CSSProperties` constants (static) and small named builders (theme-/state-dependent), above the props type, matching the `StageFocusPanel.tsx` reference.
- **Repetition collapsed, which was the real A6 win:** the five option-card call sites became one `optionCard(selected, d, accent = d)` — the `accent` parameter exists because the Appearance section colours each card from the theme it *offers*, not the one in use; `engineCard` spreads it and adds the disabled/opacity variation. Six muted descriptions became `mutedCaption(d)`, three body notes `mutedBody(d)`, and the two install/login buttons `primaryAction(busy, d)`.
- **Named the booleans the builders branch on** — `engineMissing`, `keyFormOpen`, `keyReady`, `creditsNoteShown` — instead of repeating truthiness expressions at call sites.
- **Palette literals named:** `OK_GREEN` / `OK_TINT` / `ERROR_RED` / `ERROR_BORDER` / `ERROR_TINT` / `SCRIM` / `WHITE`. The inline deploy-target array became `DEPLOY_TARGETS: DeployTarget[]` (A6 covers config blobs too).
- **Zero behaviour change, proven not asserted:** 12 screenshots (4 sections × 3 themes) captured before and after against the running app are **byte-identical**.
- Gates: lint + typecheck + 145 tests + build + `gen:skills --check` green. E2E 21 passed / 1 skipped / **1 pre-existing failure** — `project-drawer.spec.ts:30` expects the text "Pipeline Stages", which exists nowhere in the source; confirmed failing identically on unmodified `HEAD`. Left for a separate task.
- `docs/decisions.md` records why the styles stayed in the component file rather than a sibling `SetupModal.styles.ts` (A8). Versions 0.6.12.
- **Cross-platform:** n/a — pure UI, no paths, no platform branches.

---

## TASK-070: Simplify the durable runtime (post-TASK-068 review)
**Priority:** P2 | **Tags:** server, core, ui, engine
**Updated:** 2026-07-24 22:00

Follow-up simplification of TASK-068 (PR #2), cutting flexibility not needed yet.

### Done summary
- **Renamed** `owRunId` → `openWorkflowRunId` (the map, `bindOpenWorkflowRun`, `TERMINAL_OPENWORKFLOW_STATUSES`, `PersistedRun.openWorkflowRunId`).
- **Removed parallel execution** — `PipelineGroup.mode` dropped; `runGroup` runs stages sequentially; `workflow-parallel.spec.ts` deleted.
- **Removed the simulation engine entirely** — deleted `runSimulatedStage`, `SEQUENTIAL_PIPELINE`, `LIFECYCLE_STAGES`, `SimulationOptions`/`simOptions`/`PersistedSimOptions`, `randomBetween`/`sleep`; `runStageWork` is engine-only. Added `GATED_DEV_TEST_PIPELINE` (Developer → gate → Tester) so durable gates stay shipped and tested via the FakeEngine. Default pipeline is now `dev-test`.
- **Removed disabled-stages ("skip steps") end-to-end** — gone from core (`RunState`/`NewRunInput`/`createInitialRunState`, `ProjectPreferences`), `preferences.ts`, orchestrator, workflow, routes, and the UI (SetupModal "Pipeline" toggle section, App/EmptyState/ProjectDrawer/StageFocusPanel/run-utils/legacy-prefs).
- **Trimmed try/catch** — removed the defensive catches added in TASK-068 (`workflow-runtime` cancel/runStatus, admission `admitRun`/`releaseRun`, `loadEvents`); handling now lives in the orchestrator (`reconcileOnLoad` wraps `runStatus`, `abortRun` `.catch`es the fire-and-forget cancel). Kept the tested corrupt-DB degrade + best-effort persistence.
- **Merged the three architecture docs** — `architect-standards.md` + `code-quality.md` + `technical-architecture.md` → one `docs/architecture.md`; `gen:skills` repointed to it (`STANDARDS` path + reference strings), `--check` green; links swept in the active docs (the two dated decision records keep their historical names).
- **Tests** — rewrote the simulation-dependent component tests onto engine-backed pipelines + the scripted `FakeEngine` (`runs.comp.ts`; `durable-runtime.comp.ts` M6/M7 now park on `gated-dev-test`; `persistence.comp.ts`; `projects.comp.ts`), plus `preferences.spec.ts` / `settings.comp.ts` / `legacy-prefs.spec.ts` / core `pipelines.spec.ts` / ui `run-utils.spec.ts`. Deleted `run-lifecycle.spec.ts` — it needed a run that completes without a CLI (only simulation could do that); its run-view coverage is in `dev-test-flow.spec.ts` (seeded route-interception) and its semantics in the component tests. Fixed the e2e picker selectors ("Full team" → "Developer + Tester").
- **Gates:** 139 tests + lint + typecheck + build + `gen:skills --check` green. Versions 0.6.9.
- **Cross-platform:** no new spawn/path/env code; the subprocess-tree-kill surface is unchanged. Tested on Windows; macOS reasoned through — **untested on macOS**.

---

## TASK-068: Durable workflow runtime on OpenWorkflow (SQLite)
**Priority:** P1 | **Tags:** server, engine, infra, milestone-c
**Updated:** 2026-07-24 15:00

Executed the TASK-066 recommendation: `RunOrchestrator` is now a durable workflow on **OpenWorkflow** (Apache-2.0, v0.9.2, `node:sqlite`, zero deps), embedded **in-process** in the single runner. The seam is the class, not one method (doc §4): the orchestrator hosts the runtime and is the single writer of the read model; the old in-memory `Map` + `void simulateRun` + heap `gateWaiters` + mark-everything-failed recovery are gone.

### Done summary
- **New `workflow/` layer.** `WorkflowRuntime` (per-project OpenWorkflow client + in-process `Worker` + `BackendSqlite`) + `WorkflowRuntimeRegistry`; `pipeline-workflow.ts` (the ported `runStages` loop as `defineWorkflow`, walking `pipeline.groups`); `stage-execution.ts` (the durable step = old `executeStage()` — skill load, engine run, verdict parse, handoff, projection); `types.ts` (`PipelineWorkflowInput`, `RunProjection`, `WorkflowDeps`). `RunOrchestrator implements RunProjection` and keeps its public API (`startRun`/`approveGate`/`abortRun`/`restartRun`/`getRun`/`listRuns`/`subscribe`/`init`/`shutdown`) — so the whole component suite kept passing unchanged.
- **Phase 0 proved it embeds** (M5–M8 reproduced in-repo, then deleted): the worker starts programmatically (no CLI/daemon), a gate parked at a hard kill resumes in a fresh process, the completed stage is not re-run, and OpenWorkflow's `BackendSqlite` coexists with our `Database` on **one** `.adhd/runs.db` (two `node:sqlite` connections). Its tables are the source of truth; `RunState` + `events` are a rebuildable read model — never a second writer.
- **Capabilities.** Gates → `step.waitForSignal` / `client.sendSignal` (`approveGate` optimistically projects the approval, then signals). Retries → `RetryPolicy` (default `maximumAttempts: 1` to preserve fail-fast). Recovery → the worker auto-resumes non-terminal runs on `init` (only a run with no durable run behind it, or an OpenWorkflow-failed one, settles to failed). Cancellation (**G4**) → `cancelWorkflowRun` + immediate `killProcessTree`, unchanged engine seam. Restart (**G1**) → a fresh run seeded with retained prior-stage outputs, stable logical `runId`. Admission (**G2**) → `active_runs(project_id PK)` guard below the API. Parallel (**G5**) → `Promise.allSettled` over durable steps. SSE now replays persisted history on connect.
- **Determinism refactor:** `loadSkill`, `nowIso`, `randomUUID`, `Math.random` and the engine call moved inside durable steps.
- **Behaviour change (S5):** one active run per project — a second `POST /runs` in a project now returns 400; `projects.comp.ts` numbering test serialised to match.
- **Tests:** added `durable-runtime.comp.ts` (M6/M7 gate-survives-restart + no re-run; G2/S5) and `workflow-parallel.spec.ts` (G5 fan-in + per-branch failure). **148 tests + lint + typecheck + build + e2e (25 passed, 1 live-engine skipped) + `gen:skills --check` all green.**
- **Docs:** corrected the "durable runtime replaces `executeStage()` alone" claim in `architecture.md` (skill regenerated), `implementation-notes.md`, `architecture.md`; re-pointed Aiki→OpenWorkflow in `architecture.md`, `mvp-scope.md`, `product-brief.md`; dated `decisions.md` entry. Aiki stays the recorded second choice (TASK-069). Versions 0.6.8.
- **Cross-platform:** durable execution and `node:sqlite` are OS-independent; the only platform-sensitive surface (subprocess-tree kill — `taskkill /T` vs `SIGTERM`→`SIGKILL`) is unchanged. Tested on Windows; macOS reasoned through — **untested on macOS**.

---

## TASK-067: SQLite run repository — the sole run store, layered `repository/` over `db/`
**Priority:** P1 | **Tags:** server, infra, core
**Updated:** 2026-07-24 09:50

Storage slice of the TASK-066 decision / TASK-039. SQLite is the only run store, one `runs.db` per project. Landed in three review rounds; final shape is a layered persistence stack.

### Done summary
- **Layered `services → repository → db`.** New top-level `src/db/` — `Database` (connection: lazy open, WAL, `busy_timeout`, schema, checkpoint+close on settle; the only place `node:sqlite` is imported) + `RunsTable` (upsert / all) + `EventsTable` (append), string-in/string-out. New top-level `src/repository/` — a single concrete `RunRepository` class coordinating the db tables + the on-disk handoff writer (`handoff.ts`), owning the `PersistedRun` types and `parsePersistedRun`. No interface, no factory, no `index.ts` barrel; folders named for the layer, not the backend.
- **JSON store + importer retired.** No active users, so the flat-file format is dropped outright (no migration). `ADHD_RUN_STORE` selector gone; the orchestrator news up `new RunRepository(paths)` per project.
- **`.ts` imports across the whole server package** (~120 specifiers, src + test) matching `@adhd/core`; `rewriteRelativeImportExtensions` rewrites them to `.js` in `dist/` (verified — `node dist/index.js` resolves). No barrel files.
- **No `unknown` in business logic** — confined to the `parsePersistedRun`/`isPersistedRun` guard; `node:sqlite`'s typed rows are narrowed, not cast.
- `ExperimentalWarning` suppressed on the `start` script via `--disable-warning=ExperimentalWarning`. Root `engines.node` `>=22.5`; versions 0.6.7.
- Tests: `run-repository.spec.ts` (contract), `run-database.spec.ts` (corrupt-DB degrade + WAL concurrency / G6), `persistence.comp.ts` (restart round-trip; crash reconcile seeded via the DB). 144 tests + lint + typecheck + build + `gen:skills --check` green.
- Standard revised (A2 = layer a seam over its data-access layer, folders named for the layer, prefer direct imports over barrels; A7 no-`unknown` + `.ts` imports) and the architect skill regenerated; `docs/decisions.md` + `docs/implementation-notes.md` record the "why".
- **Cross-platform:** `node:sqlite` and the DB path (`path.join` + `ProjectPaths`) OS-independent; WAL sidecars covered by `.adhd/.gitignore`; `--disable-warning` + the `.ts`→`.js` rewrite identical on both OSes. Tested on Windows; macOS reasoned through — **untested on macOS**.

---

## TASK-066: Inestigation of Workflow options
**Priority:** P0 | **Tags:** worklow | **Assignee:** Fedor
**Updated:** 2026-07-23 09:38

Workflow Runtime Options Decision Document Summary Create branch codex/workflow-runtime-options from committed HEAD da46ce9 in an isolated worktree, excluding the uncommitted TASK-065 changes. Add exactly one file: docs/workflow-runtime-options.md. Do not modify TaskPlanner, changelog, versions, code, or existing docs. Research is dated 2026-07-23 and uses official sources. Document Content Define the agreed semantics:The manually started runner continues after the UI closes; OS login autostart is deferred. Restart/checkpoint granularity is a named workflow stage, not an instruction inside an agent process. “Copy workflow” duplicates a reusable definition only. Components are selected and the definition is frozen when a run starts. One active workflow is allowed per project; different projects may run concurrently. Declared parallel branches may share the project folder, with conflict avoidance owned by the workflow author.  Map every requested capability to current implementation and plans: start, recovery, retries, definition copying, artifacts, durable user/external waits, optional stages, project concurrency, cancellation, and parallel execution. Reference the relevant completed tasks (TASK-003/005/014/043–046/055/058–060), open work (TASK-039/051/061/065), and roadmap commitments. Correct the existing architectural claim that only executeStage() must change: durable execution must own starting/queuing, the orchestration loop, gates/waits, retries, fan-out/fan-in, recovery, cancellation, and execution history. Compare three primary options:Evolve the current TypeScript/file-backed state machine. Adopt Aiki. Adopt DBOS TypeScript.  Provide two matrices:Capability coverage: native, ADHD-owned, custom work, or unsupported/undocumented. Operational fit: maturity, license, PostgreSQL/runtime requirements, Windows/macOS packaging, integration cost, source-of-truth implications, versioning, and lock-in.  Add a compact competitor section covering Cline, OpenHands, Devin, Cursor Cloud Agents, and GitHub Copilot agents. Highlight that session persistence, checkpoints, approvals, and isolated parallel agents are becoming baseline, while semantic failed-stage restart and durable external waits remain differentiators. Recommendation Recorded in the Document Recommend DBOS as the leading implementation-spike and default candidate because bundled PostgreSQL is acceptable and DBOS has the strongest match for recovery, retries, signals, durable sleep, cancellation, step forking, parallel work, and project-keyed queue concurrency. Keep workflow definitions, definition copying, enabled-component snapshots, artifact manifests, code, and generated files ADHD-owned. If DBOS is adopted, make its database authoritative for execution state; retain project-local state.json/events only as an idempotent history projection/export, avoiding two independently advancing state machines. Require a feasibility spike before adoption to prove:Invisible PostgreSQL installation, startup, upgrade, backup, and removal on Windows and macOS. Recovery after killing the server during a stage and during a durable wait. User signals and limit polling with persisted timers. One active run per project with concurrent runs across projects. Immediate subprocess-tree termination despite DBOS cancellation occurring at step boundaries. Declared parallel branches and project-local history projection.  If the packaging or project-portability gates fail, recommend the custom engine as the fallback. Keep Aiki on the watch list because it is alpha, has the same PostgreSQL burden, and lacks documented semantic stage-reset advantages. Note Restate as screened out due to missing official Windows binaries. Validation and Assumptions Verify every changing framework/competitor fact against an official source and include inline links plus the research date. Review the Markdown rendering, tables, relative repository links, and terminology. Run a whitespace/error check on the new file and confirm the branch worktree contains exactly that one changed file. No public APIs, schemas, or runtime behavior change in this branch; all interface names in the document are conceptual recommendations only.

### Scope extension — 2026-07-23 (reopened)

The first pass shipped `docs/workflow-runtime-options.md` recommending **DBOS**, gated on bundling
PostgreSQL invisibly (gate **G1**). Two owner inputs reopened it:

1. **Postgres is disproportionate to the data.** Run state is a handful of rows per run; requiring a
   Postgres server on every Windows/macOS machine to hold it is rejected. Want a file-backed store —
   SQLite or equivalent — that a workflow engine actually supports.
2. **The owner is an Aiki contributor**, so Aiki's capability gaps — the entire basis for keeping it
   on the watch list — are changeable upstream.

**Added scope:**
- Split the storage comparison into its own file, `docs/workflow-storage-options.md` (embedded DB
  candidates + an engine × storage support matrix + the tie-in to TASK-039).
- Widen the engine survey beyond the original three — the field includes TanStack Workflow, Reflow
  and Resonate, none of which were considered.
- Revise `docs/workflow-runtime-options.md`: DBOS TypeScript is **Postgres-only** (`pg` is its sole
  DB driver; SQLite exists only in the Python port), so the DBOS recommendation and gate G1 are
  superseded. Re-rank the options against an embedded-database constraint.

### Done

Two documents on branch **`codex/workflow-runtime-options`** (commits `f773dee`, `b0e2c29`);
`git diff main HEAD --stat` shows exactly those two files, 793 insertions, no code or schema.

**`docs/workflow-storage-options.md` (new).** SQLite via Node's built-in **`node:sqlite`**, behind
the `RunStore` seam TASK-059 already built. Measured on Windows 11 / Node v24.12.0 rather than
cited: **`better-sqlite3` fails to install here** — no prebuild, `node-gyp` demands Visual Studio
C++ — while `node:sqlite` works (1000 inserts, transactions, WAL). PGlite rejected (*"single
user/connection"*, single-process, alpha); `embedded-postgres` rejected (zonky binaries their own
project calls *"intended for testing purposes"*). Includes the engine × storage matrix, which is the
document's point: **the storage choice decides the engine choice.** TASK-039's named candidate
should change from `better-sqlite3` to `node:sqlite`; its interface half is already done.

**`docs/workflow-runtime-options.md` (revised).** §1–§4 and §8 stand unchanged; §5, §7 and §9 are
revised with a dated revision note so the superseded DBOS reasoning stays legible.

- **DBOS TypeScript is Postgres-only** — `pg` is the sole DB driver in its `package.json`. The SQLite
  support widely attributed to DBOS is in the **Python** port, where it is the default. Gate G1
  (bundle Postgres invisibly) is obsolete, and DBOS is blocked pending TS parity.
- **Survey widened** past the three the task named: OpenWorkflow, Reflow, TanStack Workflow, Vercel
  Workflow SDK, Resonate. **Resonate screened out — no Windows binaries** (darwin/linux only), the
  same failure that eliminated Restate; that criterion is now called out as a first-class filter.
- **Recommendation: OpenWorkflow** (Apache-2.0, 1279★). Installs as **1 package, ~2 s, zero
  dependencies, no native module, no server**; its SQLite adapter calls `require("node:sqlite")`.
  Measured running ADHD's exact shape — Developer → durable gate → Tester — **surviving a hard
  process kill at the gate, resuming in a fresh process, and not re-running the completed stage.**
  Gives durable gates (`waitForSignal`/`sendSignal`), durable sleep (TASK-061), retries,
  cancellation, parallel steps and lease-based recovery.
- **Honest trade recorded:** OpenWorkflow has no fork-from-step (**S2**) and no per-key concurrency
  (**S5**) — the two things DBOS did natively. Both become ADHD-owned; note `restartRun()` already
  implements S2 semantics against our own state model.
- **Recovered by this change:** execution history stays a per-project file inside `.adhd/`, so it
  travels with the folder like `.git`. Postgres would have moved it to a machine-level database and
  broken the local-first differentiator §8 identifies as hardest for cloud competitors to copy.
- **Aiki is the standing second choice**, on contributor leverage rather than features — its gaps
  (SQLite provider, fork-from-step) are ours to close, but closing them only reaches where
  OpenWorkflow already is. Revisit immediately if its SQLite backend lands.

**Validated:** 19 relative links resolve across both docs, 10 tables well-formed, no trailing
whitespace or tabs, LF endings, trailing newlines, cross-links resolve both ways. Every changing
framework fact carries an inline official-source link dated 2026-07-23; gaps are labelled
unverified rather than asserted.

**Not done (deliberate):** `architecture.md`, `implementation-notes.md` and `architecture.md`
still carry the `executeStage()`-is-the-whole-seam claim that §4 corrects. They should be amended
when a runtime decision is executed, not in a research branch.

---

## TASK-065: Move project preferences server-side, out of localStorage
**Priority:** P2 | **Tags:** ui, server, setup
**Updated:** 2026-07-23 12:40

Engine, model, permission mode, pipeline and disabled stages read as project settings but lived in one browser (`adhd.<projectId>.<name>` in `localStorage`), so a second browser — or cleared site data — silently reverted a project to defaults while its folder, skills and credentials stayed durable server-side.

**They now live in `~/.adhd/settings.json`,** in the same per-project section as the engine connection, behind `GET /settings` and a new `PUT /settings/preferences`. Secrets did not move: an API key is still write-only and never echoed back.

**Stored as a partial, resolved in three layers** — built-in defaults ← `defaults.preferences` ← `projects.<id>.preferences` — so a project that sets one field is not frozen against later changes to the defaults. Validation splits by direction: `normalizeProjectPreferences` is tolerant on read (hand-editable file, falls back field by field, migrates `LEGACY_MODEL_ALIASES` — that migration used to run in the browser), `parsePreferencesUpdate` 400s on an unknown engine, permission mode or pipeline on write.

**The UI reads and writes through one hook.** `useSettings` (a `SettingsController`, modelled on `useProjects`) is owned by `App` and passed to `EmptyState`, `SetupModal` and `ProjectDrawer` — replacing `src/settings.ts` and the two components' own `fetchSettings` calls. Updates are optimistic, then reconciled with the server's response. `legacy-prefs.ts` adopts whatever the old keys still hold, once per project, then deletes them.

**E2E had to be isolated:** preferences are now durable state that a fresh browser context no longer discards, so Playwright runs against its own `ADHD_USER_HOME`/`ADHD_HOME` and ports (`reuseExistingServer: false`), and every spec resets preferences in `beforeEach` — without that, the pipeline `dev-test-flow.spec.ts` picks changed the run `run-lifecycle.spec.ts` started. Verified with two real browsers against a running app: what one sets, the other sees.

Also fixed on the way: a UTF-8 BOM in the `package.json` files broke `vite build`'s PostCSS config search, so `pnpm build` had been failing before this change.

### Plan (done)

1. core — `ProjectPreferences`, `defaultProjectPreferences`, `mergeProjectPreferences`, `modelForEngine`, `DEFAULT_ENGINE_ID`, `DEFAULT_PIPELINE_ID`; `SettingsView.preferences`.
2. server — `domain/preferences.ts`, `SettingsStore.getPreferences`/`updatePreferences`, `PUT /settings/preferences`.
3. ui — `hooks/useSettings.ts`, `legacy-prefs.ts`, `api.updatePreferences`; `src/settings.ts` deleted.
4. tests — `settings.comp.ts` (10), `preferences.spec.ts` (14), `legacy-prefs.spec.ts` (9); e2e rewritten against `/settings` with `e2e/support/preferences.ts`.
5. docs — decision-log entry, e2e plan, implementation notes, architecture storage table.

---

## TASK-064: The project owns the folder — retire the per-run working directory
**Priority:** P1 | **Tags:** core, server, ui
**Updated:** 2026-07-23 11:10

After TASK-059 two folders competed: the project's root, and the composer's "Working directory" box (kept per project in localStorage, sent as `workspaceDir` on `POST /runs`). A run listed under `my-app` could execute the agent anywhere, and the browser could name any absolute path as an autonomous agent's cwd.

**One folder per project, derived not requested.** `resolveWorkspace(paths, runId)` now takes no directory: a registered project runs in its own root; the **home** project — which owns no code — gets `~/.adhd/home/runs/<id>/workspace` per run, keeping the zero-setup path and giving the live e2e canary a folder it cannot damage. `workspaceDir` is gone from `StartRunOptions`, the `POST /runs` body, `api.ts` and `settings.ts`; a client that still sends one is ignored (covered by a comp test). A project's root is fixed at registration — no route and no control changes it.

**Artifacts stay per-run and git-ignored.** `ensureProjectDataDir` also runs at run start, so `<root>/.adhd/.gitignore` (`*`) exists even for projects registered before it, or whose `.adhd/` was deleted.

**New `ProjectDrawer`** (left, mirroring `HistoryDrawer`; header **Project** button, X or Escape to close) is where the setup went: folder + lock note + the git-ignored data folder; the open run's pipeline·engine·model, working folder and artifacts folder; engine/permissions/connection and pipeline summaries for new runs, each deep-linking into Setup via a new `SetupSection` union on `SetupModal`. The composer replaced its input and Browse button with a read-only folder chip that opens the drawer.

**Small consolidations on the way:** `Project` gained `dataDir`, derived on read (`withDataDir`) so `projects.json` keeps only what the user chose; `projectPaths` takes a `ProjectLocation` instead of a whole `Project`; permission-mode labels moved into `@adhd/core` (`PERMISSION_MODES`, `permissionModeLabel`) so the drawer and Setup share one source; `isScratchWorkspace` was corrected — it matched `/.adhd/runs/`, which never matches the home project's real scratch path.

**Verified:** `lint`, `typecheck`, `test` (115, +7), `build`, `e2e` (23 + live skipped), `gen:skills --check` all green. Against the running app: a `POST /runs` carrying `"workspaceDir":"C:/Windows"` still ran in the project root, a real Claude Code run used the project folder as cwd and left `git status` clean, and a home run landed in `~/.adhd/home/runs/<id>/workspace`. Rationale in `docs/decisions.md`; layout in `docs/architecture.md`. Version 0.6.1 → 0.6.2.

**Follow-up:** engine/model/permission/pipeline preferences are project-scoped but still live in `localStorage`; moving them server-side (so they survive a browser change) is a separate task.

---

## TASK-059: Projects — scope runs, settings and skills to a project
**Priority:** P1 | **Tags:** core, server, ui, infra
**Updated:** 2026-07-22 22:45

All five phases shipped. **A project is a directory that owns its own `.adhd/`**, like `.git`, so history sits beside the code it belongs to instead of inside the ADHD checkout.

**Storage relocated (the load-bearing change).** `paths.ts` now exports a `ProjectPaths` value (`id`, `root`, `dataDir`) that callers receive; `REPO_ROOT` survives only for loading the tool's own `.env`. `run-store.ts` became a `RunStore` interface + `JsonRunStore` class bound to a project (the TASK-039 seam, done once — TASK-039 now only adds an adapter). `RunState.projectId` is required; the orchestrator takes `{ registry, createRunStore, settings }`, keeps a store and a run-number counter per project, and filters `listRuns` by project.

**Registry + API.** `Project`/`ProjectsView` in `@adhd/core`; `ProjectRegistry` over `~/.adhd/projects.json`; `GET/POST /projects`, `POST /projects/:id/activate`, `DELETE /projects/:id` (unregisters only — never deletes files). Each request resolves its project from an `X-ADHD-Project` header, falling back to the registry's active one. Project ids are `<slug>-<sha1(normalized root)>`, case-folded on Windows only.

**No migration (owner decision).** Instead of adopting orphaned runs, the fallback is a **home project** at `~/.adhd/home` — deliberately *not* `REPO_ROOT`, which would reproduce the bug being fixed. The ~75 legacy runs in the repo are no longer listed; files left on disk.

**Credentials never enter a project folder.** `~/.adhd/settings.json` (mode `0600`) holds `defaults` + per-project overrides, so a new project inherits an existing key instead of demanding a new one. Created `<project>/.adhd/` ships a self-ignoring `.gitignore` (`*`).

**Skills layered, not replaced.** bundled default → user-level override → project addendum (`<id>.project.md`) appended; full replacement still supported. Seeding to disk was **removed** — it was the exact mechanism that shadowed improved defaults during the TASK-053 follow-up.

**UI.** Real header dropdown (`ProjectSwitcher` + `useProjects`), reusing `FolderPicker` to add a project; every localStorage preference is now keyed `adhd.<projectId>.<name>`.

**Follow-up in the same pass (owner request):** stripped every explanatory comment from the new source per rule **A1** — renaming where the comment described *what* (`registry.remove` → `unregister`, `detachedCopyOfResolvedEntry`, `foldCaseWhereFilesystemIsInsensitive`, `clearRunViewForProjectSwitch`) and relocating the *why* into `docs/implementation-notes.md` and `docs/decisions.md` per **A8**. Added the [`validate-code`](../.claude/skills/validate-code/SKILL.md) skill — the review counterpart to `architect`: the A1–A9 checklist plus the gate order. Unified the personas: text now lives in `domain/skills/personas/*.md` (Architect still composed from `architecture.md`), and `scripts/generate-skills.mjs` emits one `defaults.generated.ts`, replacing the split between a hand-written `defaults.ts` and a separate `architect.generated.ts`; `skill-generation.spec.ts` guards the drift.

**Verified:** `lint`/`typecheck`/`test` (109, +45)/`build`/`e2e` (19) all green, plus `pnpm gen:skills --check`. Against the running app: two projects each showed only their own history, runs wrote into their own `.adhd/runs/`, nothing new landed in the ADHD repo, an API key set on one project stayed out of both project folders and off the other project, and a `developer.project.md` addendum appeared in the persona while the bundled base still supplied the text. Rationale in `docs/decisions.md`; layout in `docs/architecture.md`. Version 0.5.0 → 0.6.0.

---

## TASK-052: Architect skill — codify the code standards, then clean the codebase to them
**Priority:** P1 | **Tags:** core, ui, server, infra
**Updated:** 2026-07-22 12:40

Produced a staff-level **Architect standard** — nine rules (A1–A9), stated transferably with per-tier (BE/FE/Mobile) shapes — and cleaned the codebase to it.

**One source, two consumers.** [`docs/architecture.md`](../docs/architecture.md) is the canonical text; [`scripts/generate-architect-skill.mjs`](../scripts/generate-architect-skill.mjs) (`pnpm gen:skills`) emits both `.claude/skills/architect/SKILL.md` and `packages/server/src/domain/skills/architect.generated.ts` (`ARCHITECT_SKILL`, added to `DEFAULT_SKILLS`, seeds `.adhd/skills/architect.md` via the existing loader). Drift, rule-id coverage, and seeding are guarded by `architect-skill.spec.ts`. `architecture.md` stays descriptive and links to the two new prescriptive docs; rationale lives in [`docs/decisions.md`](../docs/decisions.md) (rule A8).

**Cleanup traceable to the rules:** server pure logic moved to `packages/server/src/domain/` (A3); all 12 UI components got named `XProps` types and `StageFocusPanel.tsx` got named style constants/builders (A6); comments compensating for bad names removed (A1). **TypeScript 6.0.3** (7.x crashes the lint gate — see decisions log) with `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` on (A7). SetupModal's ~108 inline styles deferred to TASK-063.

**Verified:** `pnpm lint`, `typecheck`, `build`, `test` (64), and `pnpm --filter @adhd/ui e2e` (14) all green; `pnpm gen:skills` leaves a clean tree.

---

## TASK-062: Component tests (AAAAA) for the server + testing-layer policy
**Priority:** P1 | **Tags:** testing, server, infra
**Updated:** 2026-07-21 19:30

Made component tests the primary test level and introduced the repo's first test runner (Vitest). **60 tests in ~1.5s**, no browser, no CLI, no spend.

**Layer policy** (`docs/testing.md`): comp (`packages/server/test/*.comp.ts`) is the default; `*.spec.ts` is narrowed to complicated pure functions; Playwright keeps only what needs a browser; the live test is demoted to a "does the real CLI still integrate" canary. **AAAAA** structure throughout — Arrange → Anticipate → Act → Assert — with the two hard rules enforced: one action per test, no branching in a test body (all polling lives in `test/support/harness.ts`).

**Three seams added:** `ADHD_HOME` lazy accessors in `paths.ts` (a real feature, not just a test hook — also documented in `.env.example`); `setEngineAdapter`/`resetEngineAdapters` on the engine registry; `createApp({ orchestrator })` with `createRunRoutes`/`createPipelineRoutes` factories, deleting the module-level singleton. Plus `settleWrites()` + `RunOrchestrator.shutdown()` so a caller knows when the disk has caught up.

**26 comp tests** over three suites. `dev-test-pipeline.comp.ts` proves for free what the live test used to buy with money: the Tester's prompt quotes the Developer's report under a handoff heading, both boxes share one workspace, `VERDICT: FAIL` on exit 0 fails the run, a failing Developer stops the run before the Tester is called. **34 unit specs** for `parseStageVerdict` (backwards scan, markdown wrapping, CRLF), `run-utils`, `pipelines`.

**Two product bugs found by writing the tests:**
- Aborting during persona resolution left no `AbortController` registered, so the CLI was spawned anyway and ran to completion for an already-cancelled run. Fixed by registering the handle before the first await plus a cancelled check.
- `simulateStage` floored its per-line delay at 300ms, silently overriding any caller asking for faster timings. The floor was dead code for the 2–8s defaults and only ever bit when the option was used deliberately. Removing it took the suite from 14s to 1.4s.

**Verified:** mutation-tested — reintroducing the stale-`stageOutputs` bug and the ignored-`FAIL`-verdict bug each turns the suite red (the first exposed a gap, which added a test); real `.adhd/runs` untouched and zero leftover temp dirs after a run; 5 consecutive green runs; `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm e2e` (14 passed, live skipped) all green.

**Cross-platform:** temp roots via `os.tmpdir()` + `mkdtemp`; `dispose()` drains queued writes before `fs.rm`, which also retries and tolerates failure (Windows `EBUSY`); scripts are `vitest run` only. The comp suite never reaches `subprocess.ts`, so it has no platform branch to diverge on. Run on **Windows**; **untested on macOS**.

**Known gap:** the abort-during-persona-resolution window is a genuine race and is not deterministically reproducible in a test — the adjacent case (abort before the stage is entered) is covered. Engine *adapter* output parsing also remains untested, since the fake adapter substitutes for it; noted as the next gap in `docs/architecture.md`.

---

## TASK-050: Test phase — extend Playwright e2e to the Developer+Tester flow
**Priority:** P1 | **Tags:** testing, ui
**Updated:** 2026-07-21 18:00

Extended the existing Playwright suite from 8 free-tier tests to 16 free/seeded tests plus one opt-in live smoke, covering the two-box Developer→Tester flow. 27s, zero engine spend.

**Done:**
- **Regression check** — the picker tests never asserted a two-entry list, so TASK-043 did not break them. Two *other* assertions were stale and failing: the `SOON` pill (all three harnesses now ship) and Cursor's model roster (`agent models` returns 170+ live entries; default is now Auto `""`). Both repaired and made resilient to roster churn. Picker test now asserts all three pipelines.
- **New free tier** — `e2e/run-lifecycle.spec.ts`: composer start → run view, Abort → CANCELLED, run → COMPLETED with per-stage statuses, gate AWAITING → Approve Gate, Resume from a cancelled run, history re-attach. All on the simulated `sequential` pipeline, driven through the API with `minDurationMs`/`maxDurationMs`/`failProbability: 0` so runs finish in seconds. This promotes what used to be the manual live tier.
- **New seeded tier** — `e2e/dev-test-flow.spec.ts`: picker/composer copy for `dev-test`, plus a fabricated `RunState` served by route interception to assert Developer/Tester nodes, `DEVELOPER`/`TESTER` persona badges, the Tester's `PASS` verdict, and each box's own `handoff.md`. The fixture sets `result` to the Tester's text so the TASK-047 bug fails the test — verified by reintroducing it.
- **Live smoke** — `e2e/live-dev-test.spec.ts`, skipped unless `ADHD_E2E_LIVE=1`. Proves only what the cheap tiers cannot: the boxes chain, and the Tester sees the Developer's file in the shared workspace. Not executed (needs an unsandboxed server + real spend).
- **Test affordances** — `data-testid` on the run status word (stage nodes render the same words), stage nodes, stage profession/persona, and the artifact preview.
- **Config** — `workers: 1` + `fullyParallel: false` (one shared server and run store); root `pnpm e2e`; `tsconfig.e2e.json` so the Node-side files typecheck without leaking `process` into `src/`.
- **Docs** — `docs/e2e-test-plan.md` rewritten around the three tiers (`handoff.md`, third pipeline); run-app skill's `/pipelines` line and e2e commands corrected in both `.claude/` and `.agents/` copies; CI note updated in `docs/architecture.md`.

---

## TASK-060: Restart vs Resume — full-pipeline restart from History
**Priority:** P2 | **Tags:** ui
**Updated:** 2026-07-21 18:00

History has a single **Restart** button that resumes from the *failed* stage (`restartStageId`), so a two-box run that failed in the Tester restarts at the Tester and never re-runs the Developer. The label promises "start over"; the behaviour is "resume". Reported after restarting run #32 and seeing it begin at Test.

Split the two meanings into separate actions (owner decision):
- **Resume** — continue from the failed stage. Current behaviour, keeps expensive engine work from being redone.
- **Restart** — re-run every enabled stage from the first one.

**Work:**
- `run-utils.ts` — rename `restartStageId` to `resumeStageId` (it never meant "restart"), and add `firstEnabledStageId(run)` returning the first stage not in `disabledStages`.
- `HistoryDrawer.tsx` — render both buttons for failed/cancelled runs, alongside the existing `Rerun`.
- `TeamController.tsx` — the footer action targets the resume stage, so its label becomes **Resume from X**; leaving it as "Restart from X" would contradict the new vocabulary.
- Both actions stay limited to failed/cancelled runs: `RunOrchestrator.restartRun` rejects anything else, and re-running a *completed* run in place would destroy its artifacts. **Rerun** remains the path for completed runs.

**Not a bug, worth recording:** run #32 also had `disabledStages: ["implementation"]`, set through the API during TASK-057 verification, which is why its Developer was skipped. That is unreachable from the UI — `App.tsx` only sends `disabledStages` for simulated pipelines. Even after this change run #32 restarts at the Tester, because the Developer is disabled *in that run*; **Rerun** is the way to get a fresh run with both boxes.

**Done.** `resumeStageId` (renamed from `restartStageId` — it never meant restart) + new `firstEnabledStageId`. History renders **Resume** and **Restart** for failed/cancelled runs; Resume is hidden when both targets are the same stage, so the pair never shows two buttons that do the same thing. `TeamController`'s footer became **Resume from X** so the vocabulary is consistent.

**Verified** with simulated runs (zero engine spend): a run aborted mid-stage-2 offers both buttons; **Restart re-ran stage 1 even though it had already passed** (previously it began at stage 2); **Resume** left stage 1 `passed` and continued at stage 2. A run that failed on its first stage shows Restart only; completed runs show Rerun only.

Typecheck + lint + build green; e2e unchanged at 6 passed / 2 failed (pre-existing stale Cursor specs, TASK-050).

---

## TASK-057: Honour the Tester's VERDICT — a FAIL verdict must fail the stage
**Priority:** P1 | **Tags:** server, engine, ui
**Updated:** 2026-07-21 17:10

Done. A verification box's own verdict now decides its stage status; a failed verification can no longer present as a green run.

- `services/stage-context.ts` — `parseStageVerdict()`, pure. Scans **backwards** for a line that is *only* a verdict. Both halves matter: the persona text itself contains the literal strings `VERDICT: PASS` and `VERDICT: FAIL`, and a report may discuss one mid-prose, so a first-match-anywhere search reads the wrong outcome. Accepts the markdown wrapping real runs produce (bare, `` `backticked` ``, `**bold**`), is case-insensitive, and strips `\r` so CRLF output from a Windows CLI still matches.
- `core/runs.ts` — `StageVerdict` type and `StageState.verdict?`, so the verdict is persisted and reachable by the UI. Core stays pure (type only; the parser lives in the server).
- `run-orchestrator.ts` — after a successful engine outcome the verdict is read, recorded on the stage, and logged (`pass`/`fail` level). `FAIL` marks the stage failed and returns `"failed"`, so the existing loop fails the run and `restartRun` offers "Restart from Tester". The handoff artifact is still written first, so a failing run keeps its evidence.
- **No verdict → unchanged behaviour**, keeping this self-describing with no new `StageDefinition` field. `restartRun` also clears a stale `verdict` alongside the stage's recorded output.
- `StageFocusPanel.tsx` — PASS/FAIL badge beside the persona badge.

**Verified.** Parser: 13 synthetic cases including the two decisive ones (a mid-prose "I would return VERDICT: FAIL…" must not beat the real trailing `PASS`; an echoed persona block must not beat a real trailing `FAIL`). Then against **real data** — all 14 tester handoffs on disk parsed, and **0 of 12 developer handoffs** returned a verdict, confirming the Developer is untouched. (The one tester returning `undefined` is the TASK-048 marker-probe run, which deliberately had no verdict contract.)

End-to-end, reproducing the evidence case: `dev-test` with `disabledStages: ["implementation"]` on an empty workspace → run **failed**, `Tester=failed [FAIL]`, log line `✗ Tester reported VERDICT: FAIL`, FAIL badge in the header, "Restart from Tester" offered. Previously identical conditions produced a green `completed` run. A normal `dev-test` run still completes with `Developer=passed verdict=undefined` and `Tester=passed verdict=PASS`.

Typecheck + lint + build green. `pnpm --filter @adhd/ui e2e` unchanged at 6 passed / 2 failed (pre-existing stale Cursor-model specs, TASK-050).

---

## TASK-058: Rerun from History — prefill the composer from a past run
**Priority:** P2 | **Tags:** ui
**Updated:** 2026-07-21 16:25

Done. History could only *Restart* a failed run from its failed stage; a completed run offered no way to run the same task again.

- `HistoryDrawer.tsx` — **Rerun** button on every card that has a task, beside `Restart`. Tooltips now distinguish them: Restart *resumes this run from where it stopped*, Rerun *loads the task and settings into the composer to edit before starting*.
- `App.tsx` — `handleRerun()` restores the run configuration to settings (`savePipelineId`, `saveWorkspaceDir`, `saveEngine`, `saveEngineModel`), closes the drawer, clears the active run, and hands over the task text. Pipeline/workspace/engine come back through the settings EmptyState already reads, so only the task needed a new prop (`initialTask`).
- **Remount via `key`** — `EmptyState` seeds state with `useState(loadX)`, which only runs on mount, so a prefill arriving while it was mounted would have been silently ignored.
- `run-utils.ts` — `isScratchWorkspace()`, separator-agnostic (normalises Windows backslashes to `/`). **A scratch path must not be reused:** `.adhd/runs/<oldId>/workspace` belongs to the run that created it, so reusing it would write the new run into the previous run's folder. Those rerun with a blank directory and get their own scratch.
- **Removed the stale `Artifacts` button** — hardcoded `disabled` with the tooltip *"Artifacts are not stored yet"*, untrue since TASK-055. Clicking the card opens the run, where Artifacts live.
- Added `data-testid` hooks (`history-card` + `data-run-id`, `history-rerun`) — the cards were not addressable from a test; TASK-050 will want them.

**Verified** with two simulated runs (zero engine spend): a run with an explicit working directory restored task, pipeline, directory and `Engine: Codex · gpt-5-mini`; a scratch-workspace run restored task, pipeline and `Engine: Claude Code · haiku` with the **directory left blank**. Both closed the drawer and stopped at the composer without starting.

Typecheck + lint + build green. `pnpm --filter @adhd/ui e2e` unchanged at 6 passed / 2 failed (the pre-existing stale Cursor-model specs, TASK-050).

---

## TASK-056: Folder browser — choose where the project lives
**Priority:** P2 | **Tags:** server, ui
**Updated:** 2026-07-21 15:20

Done. The project location is now picked, not typed from memory.

- `services/directory-browser.ts` (new) — `listDirectories()` returns **directory names only**, never file names or contents, so the endpoint cannot be used to read anything off the machine. No path → roots (home dir, plus drive letters on Windows, `/` elsewhere). Hidden dirs filtered; `ENOENT`/`EACCES`/`ENOTDIR` mapped to readable messages (with `cause` preserved).
- `routes/fs.ts` (new, mounted in `app.ts`) — `GET /fs/dirs?path=&entry=`. **`entry` descends into a child and the join happens server-side** via `joinDirectory`, so the client never constructs a `\` vs `/` path. My first attempt concatenated client-side; this replaced it.
- `vite.config.ts` — added `/fs` to `API_PROXY_PATHS` (the file's own comment says to keep it in sync with `app.ts`).
- `components/FolderPicker.tsx` (new) — modal with Up navigation, breadcrumb, folder list, Select/Cancel, Esc to close; follows the `SetupModal` overlay idiom.
- `EmptyState.tsx` — **Browse…** button beside the workspace input. On first run (nothing saved) the control is accent-highlighted with the line *"Pick a project folder — otherwise the run works in a temporary scratch workspace"*, so the scratch fallback is a visible choice rather than a silent default.

**Verified.** API: roots list, `C:/Development` listing, server-side `entry` join into `C:\Development\smekai`, missing dir → 400 with a readable message. UI: first-run hint shown, picker opens, roots listed, navigation works, selection fills the input, hint disappears, value persists across reload.

**Pre-existing e2e failures — not caused by this work.** `pnpm --filter @adhd/ui e2e` reports 6 passed / 2 failed (Setup → AI Harness Cursor model options). Confirmed by stashing all changes and re-running on clean `HEAD`: the same 2 fail. The specs are stale against `CURSOR_MODEL_OPTIONS` (5 entries, test expects 4) and `DEFAULT_CURSOR_MODEL` (`""`, test expects `"auto"`). Belongs to **TASK-050**, which already lists repairing stale specs.

Typecheck + lint + build green.

---

## TASK-055: Show what the run produced — workspace files in Artifacts + auto-switch
**Priority:** P1 | **Tags:** server, ui
**Updated:** 2026-07-21 14:45

Done. A run's produced files are now visible in the app instead of only in a log line.

- `services/workspace-files.ts` (new) — `listWorkspaceFiles` walks the run workspace skipping `node_modules`/`.git`/`dist`/etc, capped at depth 8 and 500 entries; `readWorkspaceFile` previews up to 256 KB and reports `truncated` beyond that. Paths are returned POSIX-style so the UI has one shape on both platforms.
- **`resolveInsideWorkspace` is the single security gate.** It rejects absolute paths, checks the *lexical* path before touching disk (so a traversal to a non-existent file is rejected as traversal, not reported as "not found"), then re-checks after `realpath` so a symlink inside the workspace cannot point out.
- `routes/runs.ts` — `GET /runs/:id/files` and `GET /runs/:id/files/content?path=`; traversal returns 400, missing file 404. Thin HTTP mapping only.
- `api.ts` — `fetchRunFiles` / `fetchRunFileContent` (the sole HTTP module).
- `StageFocusPanel.tsx` — `Workflow | Files` switcher in Artifacts. *Workflow* keeps the per-stage `handoff.md`; *Files* lists the workspace with a preview pane, reusing the existing two-pane layout. Re-lists on run completion so newly written files appear.
- `App.tsx` — on terminal run status the panel switches to Artifacts, **unless the user picked a tab during that run** (`tabChosenByUser` ref, reset by `attachRun` so one manual click doesn't disable it forever).

**Verified.** Traversal: `../../../../Windows/win.ini`, an absolute path, and `sub/../../../../etc/passwd` all rejected 400; legitimate reads work. End-to-end with a real `dev-test` run of "write a backup script": auto-switched to Artifacts, switcher present, Workflow showed `handoff.md`, Files listed `backup.js` (2.2 KB) and previewed its full contents.

Typecheck + lint + build green.

---

## TASK-054: Live log auto-scroll (stick-to-bottom)
**Priority:** P2 | **Tags:** ui
**Updated:** 2026-07-21 14:10

Done. The Live Log now follows new entries without hijacking the user.

- `StageFocusPanel.tsx` — `scrollRef` on the tab-content scroll container plus an effect on `stage.logs.length` that pins to the bottom. `followRef` tracks whether the user is within `FOLLOW_THRESHOLD_PX` (40px) of the bottom; scrolling up parks the view and stops the follow, returning to the bottom resumes it. Opening a different stage or tab starts following again.
- Added `data-testid="stage-scroll"` to the container — the pane was otherwise unaddressable from a test, and TASK-050 will want it too.

**Verified against a real streaming run** (the simulated pipeline emits only 4 lines per stage, which never overflows a real pane):
- *following* — `scrollHeight` grew 91→249 while distance-from-bottom stayed 0.
- *parked* — scrolled to top, log grew 385→448, scroll position stayed at 0.
- *resume* — returning to the bottom re-pinned.

Note for future tests: an artificially tiny pane makes this untestable — with a 70px pane the whole scroll range (21px) is inside the 40px threshold, so "scrolled to top" *is* "at the bottom". Use a realistic pane height (260px+). An earlier FAIL was this test artefact, not a code defect.

Typecheck + lint green.

---

## TASK-053: Fix DEP0190 — unescaped args passed with shell:true
**Priority:** P1 | **Tags:** server, engine
**Updated:** 2026-07-21 13:40

Done. Warning gone — and it was hiding two real defects.

- `engines/subprocess.ts` — `shell:true` + args array replaced by `resolveSpawnTarget()`: normal executables get the argv array untouched; Windows `.cmd`/`.bat` shims run as one explicitly quoted command line through `cmd.exe /d /s /c` with `windowsVerbatimArguments`. `quoteWindowsArg()` applies the C-runtime backslash/quote rules; the outer quote pair is what `/s` strips, which is the documented way to keep our quoting intact.
- `engines/claude-code.ts` — bespoke `claudeVersion()` `execFile` replaced by the existing `probeCommand(binary, ["--version"])`, deleting duplicated shim/timeout/tree-kill logic.
- Exported `commandNeedsWindowsShell()` so adapters can ask which channel is safe.

**Defect #1 (the reason for the warning) — command injection.** Quoting now neutralises cmd metacharacters: `a & echo PWNED & b | c > d` arrives as a single intact argument instead of executing.

**Defect #2, found only by testing — silent truncation.** `cmd.exe` ends a command at a line break, so a multi-line persona passed as `--append-system-prompt` was **silently cut at the first newline** (`"# Role: Tester\n\nUse…"` → `"# Role: Tester"`). No amount of quoting fixes this. Two changes:
- `runSubprocess` now **rejects** a multi-line argument on the shim path with a clear message rather than truncating it.
- The Claude adapter picks the safe channel per binary: native `--append-system-prompt` for a real `.exe`, and the existing `withPersonaPrompt()` stdin folding (already used by Cursor/Codex) when resolved to a `.cmd` shim.

Known, documented limitation: `%VAR%` still expands inside quotes on the shim path — it can substitute an env value but cannot introduce a command. Not faked with `^`, which does not escape inside quotes.

**Verified:** purpose-built `.cmd` shim echoing its argv — spaces, embedded quotes, metacharacters, trailing backslashes all round-trip exactly; multi-line rejected loudly; persona intact via the stdin fallback. Zero `DEP0190` in a full server session. Real `dev-test` run (`75fff084`) passed both boxes with `VERDICT: PASS`. Typecheck + lint green.

---

## TASK-049: Code-quality assessment + refactor of the Dev+Test subsystem
**Priority:** P3 | **Tags:** core, server
**Updated:** 2026-07-20 14:20

Done. Behavior-preserving quality pass over the Developer→Tester subsystem; assessment recorded in `docs/architecture.md` (new "Subsystem review" section).

Refactors applied:
- **`resolveStageInputs()` extracted** — `executeEngineStage` inlined persona resolution + prompt building; it is now stage lifecycle only, as the plan required.
- **`stage-prompt.ts` → `stage-context.ts`** — the module had grown to own cross-box context in *both* directions (prompt in, handoff out); the name now matches.
- **`engineLabel()` + `UNKNOWN_ENGINE_LABEL`** — removed duplicated agent/engine-label computation and a bare string literal.
- **Documented `run.result`** — it holds only the last stage's output (the reason the UI needed a fallback); per-box consumers must read `stageOutputs`.

Hygiene: no `console.*` in the new modules (the one added to `run-store.ts` matches three pre-existing ones there; structured logging stays TASK-022), no hardcoded paths or secrets, core stays pure.

Verified: typecheck + lint + build green, and a **fresh real run post-refactor** (`51d6ebd4`) reproduced TASK-048 exactly — both boxes passed, personas resolved, both handoffs written, `stageOutputs` populated, `VERDICT: PASS`.

---

## TASK-048: Verify the two-box Developer→Tester flow end-to-end
**Priority:** P2 | **Tags:** testing
**Updated:** 2026-07-20 14:05

Done — verified with **real Claude Code runs** (haiku, unsandboxed server per the run-app gotcha).

- `GET /pipelines` exposes `dev-test`; three runs completed with both boxes `passed`.
- Artifacts on disk: `.adhd/runs/<id>/implementation/handoff.md` + `test/handoff.md`; `state.json` has `stageOutputs` for both stages and the persisted `skill` per stage.
- Shared workspace confirmed — Developer wrote `sum.js`/`mul.js`/`div.js`, Tester verified the same directory.
- Persona contracts held: Developer emitted its "how to verify" handoff; Tester emitted `What I tested / Results / Findings` and `VERDICT: PASS`.
- **Decisive probe** (temporarily swapped `tester.md` for a minimal marker persona, then restored): the Tester replied `PERSONA_LOADED: yes` and `UPSTREAM_SEEN: Created div.js with a CommonJS` — proving (a) an edited skill is picked up by the **already-running** server with no rebuild/restart, and (b) the Developer's handoff text reaches the Tester's prompt verbatim.

Typecheck + lint + build green.

**Finding (persona tuning, not a defect):** with haiku the Tester verified via inline `node -e` checks instead of writing a test file, and ignored an instruction appended *after* "Do not restate this prompt". Put must-follow output rules **before** that closing line, or use a stronger model. Tracked for a future persona-tuning pass.

---

## TASK-047: UI — surface per-box persona + render handoff in run view
**Priority:** P2 | **Tags:** ui
**Updated:** 2026-07-20 13:52

Done. Persona + per-box handoff are visible in the run view.

- **Bug fix (found while implementing):** the Artifacts tab showed `run.result` — the *last* stage's output — for **every** stage on an engine run. With two boxes, opening the Developer showed the Tester's result. It now renders that stage's own `stageOutputs[stage.id]` as `handoff.md`; runs recorded before `stageOutputs` existed fall back to `run.result` (they only ever had one box).
- `core/runs.ts`: `StageState.skill?: string`, copied from the stage definition in `createInitialRunState` — persists which persona actually ran (provenance, and the UI needs it).
- `StageFocusPanel`: persona badge in the header, tooltipped with the source path `.adhd/skills/<skill>.md`.

The `dev-test` pipeline needed no picker work — it comes through `DEMO_PIPELINES`. Typecheck + lint green.

---

## TASK-046: Orchestrator — engine-per-skill-stage + shared workspace + StageExecutor seam
**Priority:** P1 | **Tags:** server, engine
**Updated:** 2026-07-20 13:45

Done. Both boxes now run a real harness on the plain-TS FSM.

- `core/pipelines.ts`: `pipelineUsesEngine()` — engine-backed is derived from the stage model (any stage with a `skill`) instead of a hardcoded pipeline id, so new engine pipelines work without touching the orchestrator. Replaces the `ONE_BOX_PIPELINE.id` check in `startRun` for both engine validation and workspace setup.
- **`executeStage()` — the StageExecutor seam.** One place decides how a stage runs (real harness when the stage has a persona and the run has an engine, else simulation). Swapping in an Aiki executor means reimplementing this method only — adapters and the surrounding stage lifecycle are untouched.
- `executeEngineStage`: resolves the stage persona → `appendSystemPrompt`; builds the prompt via `buildStagePrompt` with upstream reports; a missing skill file degrades to no persona + a warning rather than failing the run.
- `upstreamFor()` / `captureStageOutput()`: per-stage output → `run.stageOutputs` (durable in state.json) + `handoff.md` artifact.
- Shared workspace: one `run.workspacePath` for the whole run, so the Tester sees the Developer's code.
- **Fix:** `restartRun` now also drops the recorded output of every stage it resets — a re-run stage has produced nothing yet, and a downstream box must not read a stale handoff.

Probed: `sequential` simulated, `one-box`/`dev-test` engine-backed, dev-test stages resolve Developer:developer → Tester:tester. Typecheck + lint green. Real engine run is TASK-048.

---

## TASK-045: Prompt composition + context handoff + appendSystemPrompt
**Priority:** P1 | **Tags:** server, adapters
**Updated:** 2026-07-20 13:30

Done. The persona + upstream-context plumbing (wired into the run loop by TASK-046).

- `engines/types.ts`: `EngineRunContext.appendSystemPrompt?: string`.
- `engines/persona.ts`: `withPersonaPrompt(ctx)` — engine-agnostic fallback that folds the persona into the head of the prompt; no-op without a persona (returns the same object).
- Adapters: **Claude** passes `--append-system-prompt` natively (persona stays in the system role); **Cursor** and **Codex** have no such flag, so they use `withPersonaPrompt` for both the positional-arg and stdin prompt paths.
- `services/stage-prompt.ts` (renamed to `stage-context.ts` by TASK-049): `buildStagePrompt(task, upstream)` — pure; returns the task verbatim when there is no upstream output (single-box runs unchanged), otherwise adds a handoff block. Wording tells the model the reports are *intent* and the workspace is the source of truth.
- `services/run-store.ts`: `writeHandoff(runId, stageId, content)` → `.adhd/runs/<id>/<stageId>/handoff.md`, best-effort (the same text is already durable in `state.json`).

Probed: no/blank upstream → task unchanged, handoff block renders, persona folds, no-persona is a no-op. Typecheck + lint green.

---

## TASK-044: Skills layer — markdown persona loader + author developer/tester skills
**Priority:** P1 | **Tags:** server
**Updated:** 2026-07-20 13:20

Done. Editable markdown personas, read at run time.

- `services/skill-defaults.ts` — bundled persona text as pure constants (no I/O). Since `.adhd/` is **gitignored**, these constants are the shipped source of truth, not the on-disk files.
- `services/skills.ts` — `loadSkill(id)` prefers `.adhd/skills/<id>.md` with an **mtime-checked cache** (edits apply on the next run), falls back to the bundled default, and **seeds the file on first use** (`wx` flag, never clobbers) so the override is discoverable rather than invisible. Unknown skill → `undefined` (stage runs without a persona rather than failing the run).
- Personas authored: **developer** (multitool: inspect → smallest correct change → verify own work → structured handoff report) and **tester** (trust nothing → run it → write missing tests → `VERDICT: PASS/FAIL`).

Verified by probe: fallback+seed, disk read, unknown→undefined, **edit picked up on next load**, re-seed after delete, tester loads. Typecheck + lint green.

---

## TASK-043: Dev+Test flow — per-stage skill + context model + DEV_TEST_PIPELINE
**Priority:** P1 | **Tags:** core
**Updated:** 2026-07-20 13:10

Done. Foundational `@adhd/core` model for the two-box Developer→Tester flow.

- `pipelines.ts`: `StageDefinition.skill?: string` added (a stage with a skill is engine-backed). New `DEV_TEST_PIPELINE` (`dev-test`) with Developer→Tester stages, registered in `DEMO_PIPELINES` so the UI picker surfaces it. `ONE_BOX_PIPELINE` stage now carries `skill: "developer"`.
- `runs.ts`: `RunState.stageOutputs?: Record<string, string>` (per-box memory; `result` only held the last), initialized `{}` in `createInitialRunState`.
- `agents.ts`: `test` profession renamed "QA Engineer" → "Tester".

Typecheck + lint green.

---

## TASK-035: Spike — beads (bd) vs. TS-native task-graph backlog
**Priority:** P2 | **Tags:** core, server
**Updated:** 2026-07-20 12:20

Spike complete. **Recommendation: borrow the model, stay TS/git-native** — do not take a Go/Dolt runtime dependency.

Measured `@beads/bd@1.1.0` on Windows: 145 MB native binary (+140 MB `node_modules`), embedded Dolt as source of truth (gitignored), synced through a separate `refs/dolt/data` channel — breaks our "one install" promise and conflicts with the git-native-artifact model. `bd init` is also invasive (writes AGENTS.md, CLAUDE.md, .claude/, .codex/, git hooks). The dependency graph + `bd ready` intake queue is genuinely valuable and worth reimplementing in ~1 day in `TaskManager`.

Absorb three ideas into `.adhd/tasks/`: (1) `dependsOn` dependency edges, (2) `ready` detection as the pipeline intake queue (task is `ready` iff all deps `done`), (3) closed-task compaction (v0.2, optional). Keep sequential `TASK-xxx` IDs and markdown+index.json; skip hash IDs, Dolt, and the parallel sync channel.

Deliverable: [docs/spike-beads-vs-ts-backlog.md](../docs/spike-beads-vs-ts-backlog.md). Competitor matrix §2 updated with the decision. Follow-up worth filing: add `dependsOn` + `ready` queue to TaskManager and wire `ready` into the intake stage.

---

## TASK-042: Unified model discovery across harnesses
**Priority:** P1 | **Tags:** core, server, adapters, setup
**Updated:** 2026-07-20 11:55

Done: Fixed the "Model metadata for `gpt-5-codex` not found" / 400 *"not supported when using Codex with a ChatGPT account"* failure and replaced the static-snapshot model rail with a real discovery rail. Root cause was that nothing ever asked for a model list — `packages/core/src/engines.ts` hardcoded three arrays behind `modelOptionsFor()` which `SetupModal.tsx` imported straight from core in the browser, and `DEFAULT_CODEX_MODEL = "gpt-5-codex"` was passed as `--model`, overriding the CLI's own working default (`model = "gpt-5.6-sol"` in `~/.codex/config.toml`).

**Core:** added `AUTO_MODEL_ID = ""` / `AUTO_MODEL_OPTION` ("Auto — use the CLI's own configured default", i.e. no `--model` flag at all) as the first option on every engine and the new default for Codex and Cursor (Claude keeps `sonnet`); added the `EngineModelList { options, source: "cli" | "config" | "static", note? }` contract; dropped `gpt-5-codex`/`o4-mini` from the Codex snapshot; generalised `LEGACY_MODEL_ALIASES` to `Record<EngineId, Record<string,string>>` so a stored `gpt-5-codex` self-heals to Auto on read (`loadEngineModel` now distinguishes a missing key from a stored `""`).

**Server:** optional `listModels()` on `EngineAdapter`; `cursorAdapter.listModels()` shells `agent models` and parses the `<id> - <Label>` lines (190 real models, `source: "cli"`); `codexAdapter.listModels()` reads the top-level `model = "…"` key from `~/.codex/config.toml` (`source: "config"`) since the Codex CLI has no `models` subcommand; claude-code has none and falls back to static. New `GET /engines/:id/models` never 500s — a missing capability or a throwing probe degrades to the static list with a `note`. The duplicated per-adapter `probe()` helper moved into `subprocess.ts` as `probeCommand()`.

**UI:** `fetchEngineModels()` in `api.ts`; the Setup picker now renders the server-resolved roster (seeded with the static list so it never flashes empty, re-fetched on harness switch and after install/login), shows a provenance caption ("from the CLI" / "from the CLI's config" / "built-in list" + note), and has a "Custom ID…" text input so an unlisted model can never block a run.

**Cross-platform:** `agent models` goes through `runSubprocess` (Windows `.cmd` shim + tree-kill); binary lookup reuses each adapter's existing `resolve*Binary()` (`where`/`which`); the Codex config path is `path.join(os.homedir(), ".codex", "config.toml")`; all CLI output split on `/\r?\n/`. Developed and tested on Windows 11 — the POSIX branches are the same code paths but **untested on macOS**.

**Verified:** workspace typecheck + lint clean; `/engines/{codex,cursor,claude-code}/models` return `config` (surfacing `gpt-5.6-sol`), `cli` (190 models), and `static` respectively; headless Playwright pass over Setup → AI Harness confirms per-harness rosters, Auto preselected for Codex/Cursor, the provenance caption, and the custom-ID input; a real `one-box` Codex run with Auto completed (`passed`, no `--model` sent) — the original failure is gone.

---

## TASK-038: Codex CLI engine adapter
**Priority:** P2 | **Tags:** adapters, milestone-c
**Updated:** 2026-07-20 00:00

Done: Added `packages/server/src/engines/codex.ts` — a real `codexAdapter` on the `EngineAdapter` contract, built on `runSubprocess` (TASK-006). Runs OpenAI's Codex CLI non-interactively: `codex exec --json --skip-git-repo-check [--sandbox workspace-write | --dangerously-bypass-approvals-and-sandbox] [--model] -`, prompt fed via stdin (`-`, dodges the Windows arg-length limit). Parses the thread-item JSON stream (`thread.started`, `turn.started/completed/failed`, `item.started/completed` with item types `agent_message`/`command_execution`/`file_change`/`mcp_tool_call`/`web_search`/`error`) into `ctx.onLog`; captures the last `agent_message` text as `result` and `turn.completed.usage` tokens for the log (Codex reports tokens, not USD, so `costUsd` is unset; `durationMs` from the harness wall-clock). Permission mapping: `skip` → full bypass, `acceptEdits` → workspace-write sandbox (no exact accept-edits-only mode — logs a note). Binary resolution: `ADHD_CODEX_PATH` → PATH via `where`/`which`, preferring the `.cmd`/`.exe` shim on win32 over the extensionless npm shell shim. `detect()` probes `--version` then `codex login status` (exit 0 = logged in) for the Setup status card; not-installed surfaces the cross-platform `npm install -g @openai/codex` install command + docs URL. One-click `install()` runs `npm install -g @openai/codex` (`npm.cmd` on win32) through the harness and re-resolves the binary on success — Setup's install button + post-install hint are now data-driven (`INSTALLERS` map) so both Cursor and Codex render an "Install … CLI" button, not just Cursor. Subscription mode strips `OPENAI_API_KEY` from the child env; api-key mode injects the stored key (Codex `exec` prefers it over a cached login). Core: `codex.available = true` (SOON badge gone — it's `!available`-driven), subscription/api-key connections, `CODEX_MODEL_OPTIONS` (gpt-5-codex default) wired through the engine-aware `modelOptionsFor()`/`defaultModelFor()` (TASK-037), registered in `registry.ts`. Cross-platform: all spawning goes through `runSubprocess` (win32 `.cmd` shell rule + process-tree kill); `where`/`which` + `.cmd`/`.exe` binary branch; npm install hint works on both OSes. Developed/tested on Windows. Verified: full-workspace typecheck + lint clean; end-to-end smoke test (fake `codex` `.cmd` emitting a synthetic `exec --json` stream driven through the real adapter + subprocess harness) → `success`, captured result text, exit 0, streamed command/message/token logs; `detect()` with no CLI returns the install hint + command + docs URL. Verified against a real installed CLI (`@openai/codex` 0.144.6, Windows): `npm install -g` succeeds (14s), `detect()` picks `codex.cmd` over the extensionless npm shim, reads the version, and parses `Logged in using ChatGPT` / `loggedIn: true` from `codex login status`. Only a live `codex exec` run is still untested (skipped to avoid spend + repo edits without sign-off) — when run, true up `CODEX_MODEL_OPTIONS` against your account.

---

## TASK-041: Longer engine log messages + basic markdown rendering in log view
**Priority:** P2 | **Tags:** ui, server, adapters
**Updated:** 2026-07-19 21:25

Done: Raised the run-log message cap from 300 to 1000 chars and deduplicated the copy-pasted text helpers into a new shared module `packages/server/src/engines/log-text.ts` (`MAX_LOG_MESSAGE_LENGTH = 1000`, `truncate()`, `firstLine()`). Both adapters (`cursor.ts`, `claude-code.ts`) now import from it; their local copies and inline first-line `split(/\r?\n/)` patterns are gone, and the explicit `truncate(x, 500)` error paths use the shared 1000 cap. UI: new `packages/ui/src/inline-md.tsx` — a dependency-free regex tokenizer `renderInlineMarkdown()` that renders `**bold**`, `*italic*`/`_italic_`, `~~strikethrough~~`, and `` `code` `` as React elements (no `dangerouslySetInnerHTML`; React escaping keeps it XSS-safe; underscore italics require non-word neighbours so snake_case stays plain; code spans shield their contents; bold/strike render nested inline styles). Wired into StageFocusPanel's Live Log and Reasoning tabs. Verified: typecheck + lint clean; 14-case tokenizer test; 8/8 free-tier Playwright e2e; live one-box haiku run — a ~1300-char assistant reply reached the UI as a single 1000-char log entry (ellipsis at the cap) with bold/italic/strike/code rendered as styling (screenshot-checked via a throwaway Playwright spec, since removed).

---

## TASK-037: Cursor CLI engine adapter
**Priority:** P2 | **Tags:** adapters, milestone-c
**Updated:** 2026-07-18 20:00

Done: Added `packages/server/src/engines/cursor.ts` — a real `cursorAdapter` on the `EngineAdapter` contract, built on `runSubprocess` (TASK-006). Targets Cursor's native Windows CLI (binary `agent`, older installs `cursor-agent`) in headless mode: `-p --output-format stream-json --force [--trust] [--model]`, prompt as positional arg, stream-json events (system/init, assistant text, tool_call started, result) mapped to `ctx.onLog`; result event has no cost/turns fields so only `durationMs` is captured. Binary resolution: `ADHD_CURSOR_PATH` → PATH (`cursor-agent`, `agent`) → `~/.local/bin`; failure message lists everything tried + the PowerShell install one-liner. `detect()` probes `--version` and best-effort `status` (auth state shown in the Setup status card — message now renders even when installed). Subscription mode strips `CURSOR_API_KEY` from the child env; api-key mode injects the stored key. Experimentation knobs for the Windows/base-subscription environment: `ADHD_CURSOR_ARGS`, `ADHD_CURSOR_PROMPT_VIA=stdin`, `ADHD_CURSOR_TRUST=0` (documented in `.env.example`). Core: `cursor.available = true` (SOON badge gone), subscription/api-key connections, `CURSOR_MODEL_OPTIONS` (auto default), engine-aware `modelOptionsFor()`/`defaultModelFor()` helpers used by SetupModal (TASK-038 reuses); per-engine model persistence (`adhd.engineModel.<engineId>` with legacy-key migration). Verified: typecheck + lint clean; live server — `/engines/cursor/status` returns the tried-list hint, settings round-trip + invalid-mode rejection, pre-flight api-key guard, one-box cursor run fails fast with the install hint; 8/8 Playwright e2e incl. new Cursor model/connection-swap test. Live run against an installed CLI still pending (CLI not yet installed on this machine — install, `agent login`, Re-check, then true up `CURSOR_MODEL_OPTIONS` against `agent models`).

---

## TASK-006: First harness adapter (generic subprocess)
**Priority:** P1 | **Tags:** milestone-c, adapters
**Updated:** 2026-07-17 18:45

Done: Added `packages/server/src/engines/subprocess.ts` — a generic `runSubprocess(spec)` harness that runs any CLI command in a worktree (cwd), streaming stdout/stderr line-by-line via `onLine`, with a hard `timeoutMs`, `AbortSignal` support, and cross-platform process-tree kill (`taskkill /T` on Windows, SIGTERM→SIGKILL on POSIX). It never rejects — spawn errors, non-zero exit, timeout, and abort are all reported in the resolved `SubprocessResult` (success/exitCode/timedOut/aborted/stdout/stderrTail/durationMs/errorMessage). This is the reusable core the concrete engine adapters build on. Refactored `claude-code.ts` onto it: `killProcessTree` and the whole spawn/timeout/abort/stderr/line-buffering block moved into the primitive; the adapter now just resolves its binary, builds Claude args + env, and parses stream-json off each line (`handleClaudeEvent`). Cursor/Codex (TASK-037/038) reuse this. Verified: 15 direct `runSubprocess` checks (success, full-stdout capture, per-line streaming, non-zero exit + stderr tail, stdin delivery/EOF, timeout kill <5s, abort kill <5s, ENOENT bad command) all pass; a fake-CLI end-to-end one-box run through the server drove the refactored Claude adapter to `completed` with stream-json logs, `result`, and cost/turns captured — no real CLI or spend; `pnpm typecheck` + `pnpm lint` clean.

---

## TASK-005: File-backed workflow engine (state.json + events.jsonl)
**Priority:** P1 | **Tags:** milestone-b
**Updated:** 2026-07-17 18:25

Done: Run state was entirely in-memory (lost on restart). Added file-backed persistence under `.adhd/runs/<id>/` — new `packages/server/src/services/run-store.ts` writes an atomically-rewritten `state.json` snapshot (tmp+rename, serialized per run) and an append-only `events.jsonl` (serialized, ENOENT-healing). The orchestrator persists from `emit()` — immediate on transitions, debounced (150ms) for log spam — plus an initial snapshot in `startRun`. New `orchestrator.init()` (awaited in `index.ts` before `serve`) reloads runs on boot, restores `nextRunNumber`, and reconciles interrupted (non-terminal) runs to `failed`. Verified end-to-end: runs survive restart with full stages/logs; a run killed at a gate reloads as "failed — Interrupted by server restart" (running/awaiting stages → failed, pending left pending); run numbering restored (next run = #2); restart-from-stage re-runs and re-persists; happy path persists as `completed` (64 events, 8 stages, 3 gate approvals); typecheck + lint clean. The "real subprocess stages" half already shipped for the one-box pipeline (TASK-018/019/020); mock pipelines stay simulations by design. Follow-up TASK-039 makes the store pluggable (JSON default + a real DB adapter).

---

## TASK-034: Design the `smek.ai` brand icon (comic "SMEK" burst)
**Priority:** P2 | **Tags:** setup, ui
**Updated:** 2026-07-16 17:50

Done: Chose Concept A (yellow burst on blue) over B (blue burst / red accents — third primary). Hand-built master SVGs in `brand/smek/master/` — `smek-burst.svg` (hero + SMEK wordmark) and `smek-mark.svg` (bare burst for tiny sizes), plus B&W twins. Exports in `brand/smek/exports/` (512 avatar, 128 extension, 32/16 + favicon.ico). ADHD UI favicon wired via `packages/ui/public/favicon.*`. Docs in `brand/smek/README.md`. **Manual follow-up:** upload `brand/smek/exports/org-avatar.png` at github.com/organizations/smekai/settings/profile (no org-avatar REST API; browser session not logged in). No separate smek.ai site repo yet — favicon assets ready for when it lands.

---

## TASK-033: Migrate repos to the `smekai` GitHub org (fix all references)
**Priority:** P2 | **Tags:** setup, infra
**Updated:** 2026-07-16 16:38

Done (adhd repo only — `taskplanner` migrated in a parallel stream): repos already transferred `refined` → `smekai` org, so this covered references + local remote. Repointed the two generated `refined/taskplanner` links to `smekai/taskplanner` in `CLAUDE.md` and `.cursorrules`; added `repository`/`homepage`/`bugs` (→ `smekai/adhd`) to root `package.json`; set local `origin` to `https://github.com/smekai/adhd.git`. No `.github/`, `CNAME`/Pages, or VS Code `publisher` in this repo, so those ticket items were N/A here. Publisher/author/personal-profile identities left as `refined` per decision. Durability caveat: `CLAUDE.md`/`.cursorrules` are generated from TaskPlanner's `aiInstructions.ts` template (still hardcodes `refined/taskplanner`); a future init/sync would re-inject `refined` until the parallel taskplanner-template fix ships.

---

## TASK-032: Code quality
**Priority:** P1 | **Tags:** code, qualtiy, beauty | **Assignee:** Fedor
**Updated:** 2026-07-15 22:53

Done: ESLint 10 flat config at root (`eslint.config.mjs`: JS + typescript-eslint recommended, react-hooks for UI; `pnpm lint`/`lint:fix`) — clean. Code segregated by role: `@adhd/core` split into domain modules (`agents/engines/pipelines/runs/settings.ts`, barrel `index.ts`); server split into bootstrap-only `index.ts` → `app.ts` (composition) → `routes/` (controllers: health, pipelines, engines, settings, runs) → `services/run-orchestrator.ts` (ex mock-orchestrator) → pure helpers in `utils.ts`. All hosts/ports/timeouts moved to env-driven `config.ts` (reads root `.env`; `ADHD_HOST/ADHD_PORT/ADHD_CORS_ORIGINS/ADHD_ENGINE_TIMEOUT_MS/ADHD_UI_PORT/ADHD_SERVER_URL`) + `.env.example`; Vite proxy and Playwright baseURL env-driven too. Core relative imports use `.ts` extensions with `rewriteRelativeImportExtensions` (needed for Node type-stripping of source-served core). Conventions + next-steps recommendations in `docs/architecture.md`. Verified: lint/typecheck/build green, UI bundle byte-identical, live smoke of all routes incl. SSE, gate approve, abort, and `ADHD_PORT` override.

---

## TASK-031: UI: EmptyState pipeline dropdown
**Priority:** P2 | **Tags:** ui
**Updated:** 2026-07-15 13:40

Done: new `PipelineDropdown.tsx` replaces the segmented pill tabs in EmptyState — visible trigger (selected label + rotating chevron, accent ring when open), menu with label + description rows ("Full team — 8 simulated stages…", "Single agent — Real engine — Claude Code"), check mark + accent on the selected row, hover via state, closes on outside-click and Escape, `role=listbox/option` for a11y. `adhd.pipelineId` persistence and one-box branching untouched. E2E updated + extended (dropdown open/close, selection, persistence) — 7/7 green.

---

## TASK-030: UI: SetupModal Connection flow + api.ts + Vite proxy
**Priority:** P1 | **Tags:** ui, setup
**Updated:** 2026-07-15 13:40

Done: mock "API Keys" section replaced by a functional "Connection" section — connection-mode radio cards from `ENGINE_CONNECTIONS` (PUT on select), API key save/remove (Enter submits; input cleared on success), "KEY CONFIGURED ✓" chip from `apiKeyConfigured`, inline error line; fake GitHub Client ID input dropped. AI Harness section gained an Engine-status card (green Installed · version + binary path, red Not-detected + install instructions, Re-check button re-fetching `GET /engines/:id/status`). `api.ts`: `fetchSettings`/`updateEngineConnection`/`fetchEngineStatus`; Vite proxy now forwards `/settings` + `/engines`. Verified live: mode roundtrip, key never echoed, invalid-key run surfaces the mapped message.

---

## TASK-029: UI: model alias migration + catalog-driven model select
**Priority:** P1 | **Tags:** ui
**Updated:** 2026-07-15 13:40

Done: `loadEngineModel()` migrates stored legacy full IDs (`claude-sonnet-4-6` etc.) to standard-context CLI aliases via `LEGACY_MODEL_ALIASES`, writes the alias back, and defaults to `sonnet` — this fixes the reported "API Error: Usage credits required for 1M context" on subscription plans (verified live: one-box run with `sonnet` completed on subscription; previously failed). SetupModal model select renders from `CLAUDE_MODEL_OPTIONS` (Opus/Sonnet/Haiku + advanced `sonnet[1m]` with a gold usage-credits warning; unknown stored values render as "(custom)"). E2E migration test added.

---

## TASK-028: Adapter: friendly error mapping (1M credits, invalid key, /login, low balance)
**Priority:** P2 | **Tags:** adapters, engine
**Updated:** 2026-07-15 12:50

Done: `ERROR_HINTS` in the claude-code adapter map known failure signatures (case-insensitive, matched against the final result event and stderr tail) to actionable guidance: 1M-context usage credits → switch model in Setup → AI Harness; invalid API key / authentication_error → Setup → Connection; not logged in → `claude /login` or API key; low credit balance → top up or subscription. Also handles error results that arrive as `is_error` on a "success" result event. The raw error line is logged at `warn` before the friendly message replaces `errorMessage`.

---

## TASK-026: Server: connection-aware spawn env + orchestrator wiring
**Priority:** P1 | **Tags:** server, adapters, engine
**Updated:** 2026-07-15 12:40

Done: `EngineRunContext` carries `connection` (from `engines/types.ts`, re-used by the settings store). claude-code spawn now uses `buildChildEnv()` — strips `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` from the inherited env (subscription mode = CLI login; stray server-env keys no longer silently switch billing to API) and injects the stored key only in api-key mode. Orchestrator: `startRun` fails fast (400) when the selected mode `requiresApiKey` but none is stored; `executeEngineStage` reads `getEngineConnection(run.engine)` fresh per stage.

---

## TASK-027: Server: engine detection — adapter.detect() + status route
**Priority:** P1 | **Tags:** server, adapters
**Updated:** 2026-07-15 12:30

Done: `EngineAdapter` gained optional `detect()`; claude-code implements it — resets the binary cache (so Re-check picks up fresh installs), resolves with `source` (`env`/`path`/`ide-extension`), validates `ADHD_CLAUDE_PATH` exists up front, and runs `claude --version` via async `execFile` (10s timeout, `.cmd/.bat` shell rule mirrored from spawn). Route `GET /engines/:engineId/status` returns `EngineStatus`; engines without `detect` report "not implemented yet" (new `findEngineAdapter` in registry). Install hint extracted to `INSTALL_HINT`.

---

## TASK-025: Server: settings store (.adhd/settings.json) + settings routes
**Priority:** P1 | **Tags:** server
**Updated:** 2026-07-15 12:20

Done: new `packages/server/src/settings.ts` — JSON store at `<repo>/.adhd/settings.json` (gitignored; mode 0600 best-effort) with per-engine `{ connectionMode, apiKey? }`, atomic tmp+rename writes, lazy reads. `getEngineConnection` (defaults to subscription), `getSettingsView` (booleans only — key never serialized to the UI), `updateEngineConnection` (string sets, `null` clears, absent keeps). Routes in `index.ts`: `GET /settings`, `PUT /settings/engines/:engineId` (400 on unknown engine or mode not in `ENGINE_CONNECTIONS`). `REPO_ROOT` exported from `paths.ts`.

---

## TASK-024: Core: model alias catalog, connection definitions, settings/status types
**Priority:** P1 | **Tags:** core
**Updated:** 2026-07-15 12:10

Done: added to `packages/core/src/index.ts` — `EngineModelOption` + `CLAUDE_MODEL_OPTIONS` (CLI aliases `opus`/`sonnet`/`haiku` plus `sonnet[1m]` flagged `requiresUsageCredits`), `DEFAULT_CLAUDE_MODEL = "sonnet"`, `LEGACY_MODEL_ALIASES` (old full model IDs → aliases), `EngineConnectionDefinition` + `ENGINE_CONNECTIONS` (claude-code: `subscription` default / `api-key`; cursor & codex empty for later), `DEFAULT_CONNECTION_MODE`, `EngineConnectionSettingsView`/`SettingsView` (booleans only — the key never leaves the server), and `EngineStatus` for CLI detection.

---

## TASK-023: Adopt TASK-020 verification assets — test plan, run skill, free-tier E2E
**Priority:** P1 | **Tags:** testing, infra
**Updated:** 2026-07-14 16:20

Fold the throwaway TASK-020 verification work into the project: test plan doc, project run skill, free-tier Playwright suite (live tier stays manual/documented).

Done: (1) `docs/e2e-test-plan.md` — the TASK-020 checklist split into a free tier (automated) and a manual live tier (real one-box run, abort path, known non-bugs). (2) `.claude/skills/run-app/SKILL.md` — dev command, ports 9477/5173, `/health`-via-proxy readiness check, stop/port-cleanup, the sandboxed-spawn 0xC0000142 gotcha for engine runs, headless-Chromium driving notes (selector gotchas), and curl recipes for engine runs without the UI. (3) Free-tier E2E in `packages/ui`: `@playwright/test` devDependency, `playwright.config.ts` (webServer auto-starts `pnpm dev` from the repo root, waits on the proxied `/health`), `e2e/ui-smoke.spec.ts` with 5 tests — picker + disabled start, single-agent mode, Setup/AI Harness contents, persistence across reload (pipeline, model, permission mode), history drawer. `pnpm --filter @adhd/ui e2e`: 5/5 passed in ~8s, no engine spend; typecheck clean; playwright artifacts gitignored.

---

## TASK-008: Design the conversational pipeline workspace (Figma-agentic)
**Priority:** P1 | **Tags:** design, ux, ui, figma, design-system, voice
**Updated:** 2026-07-14 15:17

Design the ADHD desktop workspace as a UI + speaking interface for directing an AI development team; pipeline canvas as hero, conversational + voice steering at stage and pipeline scope. Brief in [docs/design-desktop-shell.md](../docs/design-desktop-shell.md); prompt in [docs/figma-agent-prompt.md](../docs/figma-agent-prompt.md).

Done: delivered end-to-end (commit bed7fac "first design"). Figma Agent prompt written (`docs/figma-agent-prompt.md`); generated design lives in Figma ("Design System for ADHD App") with its interactive code export committed under `design/Design System for ADHD App/` — a working prototype covering all primary screens (pipeline canvas, focused stage with artifacts/log/reasoning/steer tabs, pipeline-level steering, setup, gate approve/reject, run history, empty state) and voice states (idle/listening/transcribing/speaking). Deltas from the original deliverable list: the 3 options manifest as 3 accent directions (Indigo/Sakura/Forest) within one system rather than 3 separate designs; design tokens live as code (`Dir` palettes) rather than Figma styles/variables; engineer handoff happened as a direct port — `packages/ui/src/theme.ts` and the component set (PipelineRow, StageFocusPanel, VoiceControls, SteerChat, TeamController, HistoryDrawer, SetupModal, EmptyState) mirror the export and are wired to the live SSE backend.

---

## TASK-004: Pipeline chart UI (live agent statuses)
**Priority:** P0 | **Tags:** prototype, ui
**Updated:** 2026-07-14 15:17

Hand-rolled SVG pipeline chart, log panel, sequential vs parallel demo toggle.

Done: delivered by the prototype dashboard and the TASK-014..020 milestone-c work, verified live in the TASK-020 UI pass. The pipeline chart renders live stage statuses with gate markers (`PipelineRow`/`StageNode`/`GateMarker` — implemented as DOM/flexbox rather than SVG); the log panel streams live stage logs in `StageFocusPanel`. The "sequential vs parallel demo toggle" became the pipeline picker ("Full team · mock" / "Single agent") from TASK-017; no parallel demo group was built (`PipelineGroup.mode` supports `"parallel"` in core but no pipeline uses it yet — a future task if ever needed).

---

## TASK-020: End-to-end verification of the one-box Claude run
**Priority:** P0 | **Tags:** testing, milestone-c
**Updated:** 2026-07-14 15:15

Server-level verification complete: happy path (haiku created hello.txt in the scratch workspace, live SSE logs, result + cost captured on run.completed), custom workspaceDir run (file landed there; nonexistent dir → 400), abort mid-run (claude process tree killed, no orphans, stage skipped), `engine: cursor` → 400 not implemented, sequential mock pipeline regression (8 stages, gates, approve — untouched).

Done: visual UI pass completed with headless Chromium (Playwright) against `pnpm dev` — 18/18 checks passed, zero console errors, screenshots reviewed. Verified: pipeline picker (Full team · mock / Single agent) with persisted selection; Setup → AI Harness (Claude Code selected, Cursor/Codex marked SOON, model + permission mode persist across page reload via localStorage); live one-box run with `claude-haiku-4-5` in a custom workspaceDir — engine pill `⬡ Claude Code · claude-haiku-4-5` in the status bar, live log streamed into the focus panel, run COMPLETED, stage PASSED, `result.md` artifact listed with preview, and `hello-ui.txt` written to the workspace; History drawer lists the completed run and re-attaches on click. TaskPlanner sidebar reload confirmed by driving the extension's own activation path (ConfigManager + TaskStore) against `.tasks/`: config loads, 22 tasks visible across states, zero parse warnings. Note: spawning `claude.exe` from a sandboxed shell fails with 0xC0000142 — the dev server must run in a normal user shell.

---

## TASK-003: Mock orchestrator with SSE events
**Priority:** P0 | **Tags:** prototype, server
**Updated:** 2026-07-14 12:45

`POST /runs`, fake agents with sleep/log, `GET /runs/:id/events` SSE stream.

Done: implementation landed with the prototype dashboard (commit 5f63631, extended by TASK-014/015) in `packages/server` — `MockOrchestrator` simulates profession agents with randomized sleep + timed log lines per stage; Hono routes `POST /runs`, `GET /runs`, `GET /runs/:id`, gate approve/abort/restart, and `GET /runs/:id/events` SSE. Verified end-to-end this pass: started a `sequential` run, approved the requirements/design/release gates, captured 49 typed SSE events (stage.started/log/awaiting/approved/completed, run.completed); stream closes cleanly on terminal status.

---

## TASK-002: Scaffold pnpm monorepo (server, ui, core)
**Priority:** P0 | **Tags:** infra, prototype
**Updated:** 2026-07-14 09:33

Set up `packages/core`, `packages/server` (Node + Hono), `packages/ui` (React + Vite).

---

## TASK-001: Rebrand to ADHD (docs + repo)
**Priority:** P0 | **Tags:** docs, branding
**Updated:** 2026-07-14 12:23

Rename project to ADHD (Artificial Development, Human Directed). Update docs, CLI name, and `.adhd/` paths.

Done: bulk rebrand landed earlier (commits 5f63631, a51b87e — docs, `@adhd/*` packages, `adhd` CLI examples, `.adhd/` paths, GitHub repo/remote). This pass fixed the last leftovers: repo layout tree root in `docs/architecture.md` (`artificial-developer/` → `adhd/`) and added the "formerly Artificial Developer" historical note to the README intro.

---

## TASK-019: Result display — result.md artifact, engine pill, result on run.completed
**Priority:** P0 | **Tags:** ui, milestone-c
**Updated:** 2026-07-13 21:40

`useRunEvents` copies `result` from the final `run.completed` event. StageFocusPanel: engine runs show `run.result` as a `result.md` artifact and no canned mock content (live log already streams adapter output). RunStatusBar: `⬡ Claude Code · <model>` pill when the run has an engine.

---

## TASK-018: SetupModal — wire engine radios, model, permission mode; SOON badges
**Priority:** P0 | **Tags:** ui, milestone-c
**Updated:** 2026-07-13 21:40

Drive the AI Harness radios from `ENGINES` (adds Codex); persist engine + model via settings; Cursor/Codex rendered disabled with a mono "SOON" pill. New Permission mode control: "Never block (recommended)" vs "Accept edits only (may stall on shell commands)".

---

## TASK-017: EmptyState — pipeline picker + working-directory field
**Priority:** P0 | **Tags:** ui, milestone-c
**Updated:** 2026-07-13 21:40

Segmented control "Full team · mock" / "Single agent" above the task input (persisted). Single-agent mode: ghost pipeline shows one Developer node, optional Working directory input (empty = scratch workspace per run), caption showing the configured engine · model.

---

## TASK-016: UI settings persistence — engine, model, permission mode, pipeline, workspace dir
**Priority:** P0 | **Tags:** ui, milestone-c
**Updated:** 2026-07-13 21:40

Extended `packages/ui/src/settings.ts` (same localStorage try/catch pattern as disabledStages): `adhd.engine`, `adhd.engineModel`, `adhd.permissionMode` (default `skip`), `adhd.pipelineId` (default `sequential`), `adhd.workspaceDir`. Extended api.ts `StartRunOptions`.

---

## TASK-015: POST /runs — engine/model/workspaceDir/permissionMode passthrough + validation
**Priority:** P0 | **Tags:** server, milestone-c
**Updated:** 2026-07-13 21:40

Extended the `POST /runs` body and passed the new fields to the orchestrator; validation errors surface through the existing 400 path (verified: unknown engine, unimplemented engine, nonexistent workspaceDir). No SSE changes (keepAlive ping already present).

---

## TASK-014: Orchestrator — executeEngineStage branch, abort wiring, result event
**Priority:** P0 | **Tags:** server, milestone-c
**Updated:** 2026-07-13 21:40

`startRun` branches for `one-box`: validates engine, resolves workspace, stores engine/model/workspacePath on the run. `runStages` dispatches `executeEngineStage` (real adapter) vs `simulateStage` (mock, untouched). AbortController per run wired into `abortRun`; final `run.completed` event carries `result`.

---

## TASK-013: Claude Code engine adapter (headless stream-json)
**Priority:** P0 | **Tags:** server, adapters, engine, milestone-c
**Updated:** 2026-07-13 21:40

Spawns `claude -p --output-format stream-json --verbose` (prompt via stdin; binary resolved ADHD_CLAUDE_PATH → where/which claude → IDE extension bundle fallback → actionable error). Parses NDJSON into live stage logs (init/assistant text/tool_use/result summary), captures final result + cost/turns, maps exit codes to failure, abort = process-tree kill (taskkill /T /F on win32, verified no orphans), timeout via ADHD_ENGINE_TIMEOUT_MS (default 10 min). Supersedes the Claude Code half of TASK-007.

---

## TASK-012: EngineAdapter contract + registry
**Priority:** P0 | **Tags:** server, adapters, milestone-c
**Updated:** 2026-07-13 21:40

`packages/server/src/engines/types.ts`: `EngineAdapter { id, run(ctx) }` with `EngineRunContext` (prompt, cwd, model, permissionMode, timeoutMs, AbortSignal, onLog callback → stage.log) and `EngineRunResult`. `registry.ts`: map seeded with claude-code; `cursor`/`codex` throw "not implemented yet"; unknown ids rejected. Streaming evolution of the HarnessAdapter contract in docs/mvp-scope.md.

---

## TASK-011: Run workspace resolution — scratch dir per run or validated user directory
**Priority:** P0 | **Tags:** server, milestone-c
**Updated:** 2026-07-13 21:40

`packages/server/src/paths.ts`: repo root anchored via `import.meta.url` (server dev cwd is `packages/server`); `resolveWorkspace(runId, workspaceDir?)` creates `.adhd/runs/<runId>/workspace` or validates a user-supplied directory (must exist and be a directory, else 400). `.adhd/` added to .gitignore.

---

## TASK-010: Core types — one-box pipeline, engines, permission mode
**Priority:** P0 | **Tags:** core, milestone-c
**Updated:** 2026-07-13 21:40

Added `ONE_BOX_PIPELINE` (id `one-box`, single `implementation`/Developer stage) to `DEMO_PIPELINES`; `EngineId`, `ENGINES` metadata (label/description/available), `EnginePermissionMode` (`skip` default — never blocks | `acceptEdits`); extended `RunState` with optional `engine/model/result/workspacePath` and `RunEvent` with `result`.

---

## TASK-009: Fix .tasks/config.json states shape (TaskPlanner extension unresponsive)
**Priority:** P0 | **Tags:** infra, setup
**Updated:** 2026-07-13 21:40

The `states` array in `.tasks/config.json` contained plain strings, but the TaskPlanner extension expects `{name, fileName, order}` objects — every `path.join(tasksDir, state.fileName)` threw on `undefined`, so no tasks loaded and the extension appeared dead for this repo. Rewrote the config to the canonical shape, deduped the stray migration-appended `Rejected` object, dropped the nonstandard `settings` key. Companion hardening task in the taskplanner repo: TASK-036 (validate/normalize config, log failures to the "TaskPlanner" output channel). Reload the VS Code window to confirm the sidebar lists tasks again.

---
