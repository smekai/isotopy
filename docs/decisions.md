# Decision Log

Short, dated entries recording *why* a non-obvious choice was made — the home for
rationale that rule **A8** keeps out of code comments. Newest first. An entry is
a decision, its context, and the alternative rejected; it is not a changelog.

---

## 2026-07-28 — The chat is a projection of the log (TASK-082)

**Context:** the agent-window epic made the chat the run's whole body, and
`buildTranscript` maps *every* stage log line into it. So the conversation
carried `⎿ Read(auth.ts)`, `Tool error: …` and `Developer online · Claude Code ·
haiku` alongside what the agent actually said, while Logs and Artifacts were
reachable only inside `StageFocusPanel` — a second pane below the chat that
opened when a stage node was clicked, with the workspace file browser three
clicks deep.

**Decision:** one derived ordering, three tabs over it. `buildTranscript(run)` is
unchanged and feeds Logs; `conversationOnly(items)` feeds Chat. The chat is never
a second source — that is what keeps a line from existing in one view and not the
other for reasons nobody can reconstruct.

**The filter is structural, not textual.** It drops `kind: "tool"` and nothing
else. Matching prose (`startsWith("cost ")`, `/online ·/`) was the obvious
alternative and is the one that rots: it silently stops working the day an
adapter rewords a string. TASK-083 went first precisely so the chatter would
already *be* tool-level, which made this filter one predicate.

**`conversationOnly` returns a narrowed type**, `Exclude<TranscriptItem, { kind:
"tool" }>`, so `ChatPanel` cannot be handed a tool row at all. The compiler found
this: with a plain `TranscriptItem[]` return, the row component still had to
handle a case that could never arrive.

**The stage header keeps its place in the thread.** Who is working, how their
stage ended, and what it cost are not machinery — they are the three things a
person watching a run actually wants, and they already had a home in the divider
row. Cost arrives there via `formatUsage(stage.usage)`; the run total sits in the
status bar, visible from every tab.

**A stage-node click filters instead of opening a pane.** The pipeline row reports
what was clicked (`focusedId` in `App`); `RunTabs` decides that this means
"narrow Logs and Artifacts to that stage". It deliberately does **not** switch
tabs — a component reports what happened, the parent decides what it means, and
yanking someone out of the chat mid-read is the opposite of that.

**No Reasoning tab.** It rendered `mock-content.ts` — hardcoded OAuth-demo text,
shown regardless of what the run did. There is no server-side reasoning source,
so the honest options were an always-empty tab or no tab; a tab that promises
something the system never captures is worse than its absence. The file is
deleted, which closes TASK-075.

## 2026-07-28 — Engine usage is data, not prose (TASK-083)

**Context:** a run could not say what it cost. `claude-code.ts` read
`total_cost_usd` off the CLI's result event, formatted `cost $0.0123 · 3 turns ·
41s` into an `info` log line, and dropped the number; `codex.ts` did the same
with token counts. Because `info` logs render as agent prose in the chat, the
figure was simultaneously *unavailable as data* and *noise in the conversation*.

**Decision:** an adapter that knows a number hands it up the seam. The three
loose fields on `EngineRunResult` (`costUsd`, `durationMs`, `numTurns`) collapse
to one named `StageUsage` imported from core, and the log lines that formatted
them are deleted.

**The run total is derived, not stored.** `runUsage(run)` sums the stages. A
stored `RunState.costUsd` would be a second source of truth that drifts the
moment a stage is restarted — and `restartRun` deliberately leaves `stage.usage`
alone while clearing `verdict`, `logs` and the timestamps, because money spent on
a failed attempt was still spent.

**Accumulation happens on the server; the event carries the total.**
`stageUsage()` folds each turn into `stage.usage` with `addUsage`, then emits the
*accumulated* figure rather than the delta. A stage runs several times across a
question loop, so an assignment would report only the last turn — but the event
must also survive `replayEvents`, and a delta applied twice would double-count.
Accumulate once, at the single writer; the reducer assigns.

**`formatUsage` is the one place the engines' differences are expressed.** Claude
Code reports dollars, Codex reports only tokens, Cursor reports neither. Every
alternative — a price table per model, or a UI that branches on engine id — either
invents numbers or spreads that knowledge across call sites. Dollars where an
engine gives them, tokens where it only counts those, nothing where it says
nothing, and nothing is not an error state.

**Engine chatter demoted to `run` level.** `Claude Code online · …`,
`${profession} online · …` and Cursor's `done in Ns` were `info`, which is the
level the transcript maps to agent prose. They are tool-level noise and now say
so, which lets TASK-082 filter the chat structurally instead of matching strings.

**Not asserted from documentation.** Claude's result event is documented to carry
a token `usage` block, but only `total_cost_usd` / `duration_ms` / `num_turns` are
proven by the code that already read them, so only those are mapped. Adding
speculative fields would have bought nothing — `formatUsage` prefers dollars
anyway — at the cost of an untested path.

## 2026-07-27 — Two presets, a Project Manager, and fewer prose assertions (TASK-080)

**Context:** three presets shipped (`one-box`, `dev-test`, `gated-dev-test`), all of
them variations on "Developer, maybe a Tester". The roster in `agents.ts` named six
professions that had never had a persona. The picker described the *mechanism*
rather than the job.

**Decision — exactly two presets.** `pm-dev-test` (Project Manager → gate →
Developer → Tester) and `solo` (one all-purpose box). The Project Manager reuses the
existing `intake` stage, so this promoted a roster entry rather than inventing one.
`solo` needed a new `AGENTS` entry: `agentForStage` silently degrades an unknown id
to `{ profession: stageId }`, which would have printed raw ids in the log.

**The gate moved onto the Project Manager's handoff.** Retiring `gated-dev-test`
would have orphaned the approval gate — the only preset exercising it — and
`GatesSection` derives its display from `DEMO_PIPELINES` + `gateAfter`. Approving a
*recommendation* before any code is written is also the better shape for a tool whose
name ends in "Human Directed". Reversible if it proves to be friction.

**Retired ids are refused, not aliased.** `getPipeline` reads `DEMO_PIPELINES`, so a
run stored against `dev-test` cannot restart. `restartRun` now checks up front and
fails with *"This run used the "dev-test" pipeline, which no longer exists — start a
new run instead"* rather than throwing `Unknown pipeline`. Legacy `localStorage`
preferences naming a retired id are likewise dropped rather than adopted — migrating
a preference the picker cannot display would be worse than ignoring it. Pre-1.0 with
no external users, so refusing accurately is enough; an alias map can come later if
anyone actually has runs worth restarting.

**A generator bug this surfaced.** `scripts/generate-skills.mjs` emitted unquoted
object keys, so `project-manager` — the first kebab-case persona id — produced a
syntactically invalid `defaults.generated.ts`. Keys are `JSON.stringify`d now.

**`skill-generation.spec.ts` lost four of its six tests.** They asserted on English
prose, not behaviour: that every persona's last word is `prompt.`, that the architect
persona contains the substrings `A1`…`A9`, that it contains `VERDICT: PASS`, and a
verbatim-bundling check already covered byte-for-byte by `gen:skills --check`. The
first of those actually *failed* on a perfectly good new persona, which is the
clearest possible evidence it was testing the wrong thing. What remains is the drift
check and one rewritten test that now derives the skill ids from `DEMO_PIPELINES` —
a stage naming a missing persona runs with no persona and only logs a warning, so
nothing else would catch that typo.

**`dev-test-pipeline.comp.ts` became `pm-dev-test-pipeline.comp.ts`.** The flow
contract should test the flow that ships. The eleven cases — ordering, shared
workspace, per-box persona, handoff quoting, `VERDICT: FAIL`, abort, restart-from-
stage — all survived; each gained a Project Manager anticipation and one
`approveIntake()` call, which is now a harness helper rather than eleven copies.

## 2026-07-27 — An agent that asks parks on its own status, and resumes its session (TASK-079)

**Context:** the whole point of a chat is that the agent can answer back. Every
adapter was one-shot — prompt in, `stdin.end()`, process exits — and no session id
was captured anywhere (`codex.ts` declared `thread_id` and never read it). Two
mechanisms were possible: re-run the stage with the question and answer folded into
a fresh prompt, or resume the CLI session.

**Decision: resume the session.** `EngineRunContext` gained `resumeSessionId` and
`EngineRunResult` gained `sessionId`; one `run()` method, not a second `resume()` —
the *flag* declares the capability and the *context* drives the behaviour, matching
how `model` and `permissionMode` already work. Re-running was rejected because a
Project Manager's investigation is the expensive part: paying for it twice per
clarifying question, and losing the model's working context each time, makes the
feature not worth having.

**Verified against the installed CLIs, not the docs.** `claude -r <id>` and
`codex exec resume <SESSION_ID> [PROMPT]` both exist and both accept the flags the
adapters already pass — with one exception worth recording: **`codex exec resume`
does not accept `--sandbox`**, only `--dangerously-bypass-approvals-and-sandbox`.
So a resumed Codex turn under `acceptEdits` runs on Codex's own default sandbox
rather than `workspace-write`. **Cursor is `conversational: false`** — the CLI is
not installed here and the session-id emission could not be confirmed, and a flag
asserted from documentation alone is exactly the silent failure this task set out
to avoid. Flip it when someone with `cursor-agent` verifies it.

**`asking` is its own status, not `awaiting`.** TASK-061 already argued this for
`blocked`: reusing the gate state would make "Approve" mean two different things.
`asking` is violet in `theme.ts` — GOLD stays reserved for human gates.

**The question contract mirrors the verdict contract.** `parseStageQuestion` is
`parseStageVerdict` with a different keyword: last-line-first, CRLF-tolerant,
markdown-emphasis-tolerant. A persona that already knows `VERDICT: PASS|FAIL` needs
no new mental model, and the parser's failure modes are ones we have already tested.

**Only an interactive stage on a conversational engine may ask.** Three conditions
in one predicate — `stageDef.interactive`, `isConversational(engine)`, and a turn
budget (`MAX_QUESTION_TURNS = 6`). The turn budget matters because a persona that
always ends with a question would otherwise loop forever, and each loop is a
durable park. A Developer that happens to print `QUESTION:` is not interactive, so
its output passes straight through.

**A turn is a durable step.** `runStageTurns` names each `stageId:turn:N`, so
OpenWorkflow replays completed turns rather than re-running them, and the park uses
the signal channel's payload — typed as `{ data: Output } | null` all along, never
used until now.

**`admitRun` still holds the project slot while parked.** A question can wait for
hours, exactly like a gate, and a gate already behaves this way. Releasing the slot
would let a second run start and write to the same workspace; that is a worse
failure than making the user answer or abort.

## 2026-07-27 — The transcript is derived; only the user's turns are stored (TASK-078)

**Context:** the run view became a conversation. The obvious implementation is a
`messages` table the agents write to as they speak — and it would have duplicated
everything the system already records. All three adapters call `onLog(level, text)`
where `info` is assistant prose, `run` is a tool-use summary and `warn` is a tool
error; the chat/tool distinction already exists in the data, flattened into
`LogLevel`.

**Decision:** the thread is a **derived view**. `buildTranscript(run)` maps stage
logs onto agent prose, tool rows and notices, and merges in `run.messages` — which
holds **only what the user typed**. One writer, one ordering, and no way for the
transcript to disagree with the log. The mapping is a `switch` over `LogLevel`
closed by exhaustiveness, so a new level is a compile error rather than a silently
mis-rendered line. Rejected: a `messages` array the projection also appends agent
text to — two copies of the same sentences, and a reconciliation problem the first
time an adapter changes what it logs.

**Ordering is timestamp-first with a collection sequence breaking ties.** Logs
inside a stage already carry increasing timestamps and stages run in order, so the
timestamp alone is nearly sufficient; the sequence number exists because a fast
stage can emit several entries inside the same millisecond, and a stable thread
matters more than which of them is "really" first.

**`RunMessage` has no `kind` field yet.** The plan called for
`"text" | "question" | "answer"`, but nothing can produce a question until the
engines can be resumed (TASK-079). Union members no code can construct are
speculative generality; 079 adds `kind` when it has something to put in it.

**The endpoint records on a live run rather than refusing.** The task text said
`POST /runs/:id/messages` should 409 "when nothing is waiting for input", which
today means *always* — a composer whose every send fails is precisely the
`SteerChat` mock this work deleted. So: 404 unknown run, 409 on a **terminal** run,
accept otherwise. **Nothing consumes the message until TASK-079** — that is stated
in `architecture-ui.md` rather than concealed behind a control that looks wired.

**A real ordering bug fell out of testing this.** `GET /runs/:id/events` replayed
stored events and *then* subscribed — with an `await` in between, so anything
emitted during the replay was lost. It now subscribes first, buffers, replays, and
flushes the buffer. Duplicates across the seam are safe: `applyEvent` dedupes logs
by `ts`+`message` and messages by `id`. This is the mirror of the ordering
`useRunEvents` has always had on the client.

## 2026-07-27 — The run rail routes on the hash, and rides a summary channel (TASK-077)

**Context:** the run list moved from an overlay (`HistoryDrawer`, one `fetchRuns()`
on mount, no selection state) to a persistent left rail. That trips two absences
`architecture-ui.md` §1 records as deliberate — the router, and the fact that no
transport pushes run-*list* changes. §1 requires an entry naming the row it
invalidates, so this is it: the **Router** row falls, on the trigger it predicted
("the need to deep-link a run").

**Decision — a hand-rolled hash router, not `react-router`.** The dependency table
is four entries and adding a fifth needs to earn it; one route pattern (`#/runs/:id`)
does not. `route.ts` is a pure `parseRoute`/`routeHash` pair over a two-member
discriminated union with a unit spec, and `useRoute` is a `hashchange` listener.
Back/forward work because the hash *is* history.

**Why the hash and not a real path.** `/runs` is the API's. The UI and server share
an origin, and `packages/ui/vite.config.ts` proxies `/runs` to the server — so a
browser navigation to `/runs/ab12cd34` would be proxied and answered with run JSON
instead of the app. A path router would need a dev-proxy bypass *and* an SPA
fallback wherever the built UI is served. The hash is invisible to both and costs
nothing. Revisit if the API ever moves under a prefix (`/api/*`).

**Decision — the rail's transport carries `RunSummary`, not `RunState`.** A new
project-scoped SSE channel (`GET /runs/events`) emits a compact summary on every
non-log event. Summaries exist because `RunState` carries `stages[].logs`, which is
almost all of its bytes and grows for the life of a run; re-sending it on every
status transition to paint a status dot would be absurd. `toRunSummary` lives in
`@adhd/core` so both sides reference one declaration. The channel deliberately
skips `stage.log` — a log never changes what the rail draws.

**The project arrives as a query parameter, not the `X-ADHD-Project` header.**
`EventSource` cannot set headers. `projectScope` now falls back to `?project=`;
the header stays the rule for every other call.

**The snapshot still comes from `GET /runs`.** The stream carries changes only, so
`useRunList` fetches the snapshot and replays anything that arrived in the gap —
the same subscribe-then-fetch ordering `useRunEvents` uses (§5), for the same
reason. A snapshot event on the channel would have duplicated an endpoint that
already exists and works under route interception in the e2e suite.

## 2026-07-27 — Setup is a folder of sections over a shared style module (TASK-073)

**Context:** `SetupModal.tsx` was 1002 lines owning four unrelated settings
surfaces. The obvious split is one component per `SetupSection`, but that
immediately collides with the 2026-07-26 entry below: if styles stay in a
component's own file, where do the builders that *four* sections share go?

**Decision:** `components/setup/` — the first feature folder, taken under the
`architecture-ui.md` §2 rule (a feature that owns four or more files no other
feature imports). Section-specific builders moved with their markup, exactly as
the 2026-07-26 entry requires; the ~13 names used by two or more sections
(`optionCard`, `radioDot`, `optionLabel`, `sectionTitle`, `mutedCaption`, …) went
to `setup/setup-styles.ts`. That is **not** the sibling `SetupModal.styles.ts`
rejected before: this module is a vocabulary shared across sibling components —
`theme.ts` scoped to one surface — not one component's presentation exiled from
its own markup. The alternative, copying `optionCard` into four files, trades an
A6 violation for a worse one.

**The harness section split again, one level down.** `HarnessSection` alone would
have been ~570 lines and still the largest file in `packages/ui`. Its three
stateful blocks each own state *and* server calls, which is the same axis the
task split on: `EngineStatusCard` (`fetchEngineStatus` / `installEngine` /
`loginEngine`), `EngineConnection` (`updateConnection`, the API-key form),
`EngineModelPicker` (`fetchEngineModels`, custom ID). Nothing lands over ~300
lines.

**Two couplings survived the split as explicit props.** A successful install or
login must refresh the *model* list too — the CLI's roster is only readable once
it exists — so the `statusNonce` counter became a `refreshKey` owned by
`HarnessSection` and passed to both children. And `customModelDraft`, which the
old component reset from inside `selectEngine`, is now an effect on the `model`
prop; the reset happens on engine switch and on selection exactly as before,
without a callback threaded back up.

**No behaviour changed.** Each section mounts only while selected, which deletes
the four `if (sec !== "harness") return;` guards from the effects — the old deps
already included `sec`, so the fetch timing is identical.

## 2026-07-27 — The UI scales are extracted, not designed (TASK-072)

**Context:** `theme.ts` tokenised colour only. Spacing, radii, type, icon sizes,
z-index and motion were inline literals across all 17 components — 19 distinct
padding/gap values, 13 radii, 11 font sizes, 7 icon sizes. `borderRadius: 10` next to
`borderRadius: 9` carried no information about whether the difference was deliberate,
so a restyle meant editing every component by hand.

**Decision:** the scales are an **extraction of current usage**, not a redesign.
Values were derived by measuring the components, then near-duplicates were **snapped
to one step each** and the snaps recorded here. Every snap is ≤2px:

| Dimension | Snapped |
| --- | --- |
| space | 1→2, 3→4, 5→6, 7→8, 9→10, 11→12, 14→16, 18→20, 28→24 |
| radius | 1→2, 3→4, 6→8, 9→10, 14→12 |
| font | 11.5→12, 15→14, 18→16 |
| icon | 11→12, 13→14, 15→16 |
| transition | 0.18s and 0.22s → `MOTION.base` (0.2s) |
| animation | `GateMarker`'s `adhd-pulse 1.4s` → `MOTION.pulse` (1.2s), matching the three other pulse sites |

**`md` and `lg` stay 2px apart** in both `SPACE` (8/10) and `RADIUS` (8/10). Merging
them would have been the tightest scale, but the two values are two *roles* — 8 is the
chip/small-card radius (12 sites), 10 the control radius (16 sites) — and collapsing
them would have been a redesign, which this task explicitly is not.

**Naming runs `xxs…xxxl` then `x4l`/`x5l`.** Tailwind's `2xl`/`3xl` is the familiar
convention but is not dot-accessible in TS; the chosen names stay monotonic and
readable at every step.

**Elevation nests, the rest are flat.** Shadows are palette-tinted, so `d.shadow` /
`shadowSm` / `shadowLg` became `d.elevation.{sm,md,lg}` on `Dir` rather than a shared
scale. Only the two *untinted* shadows — the `StageFocusPanel` and `TeamController`
top edges — moved to a shared `ELEVATION`.

**`theme.ts` owns motion; `index.css` keeps only `@keyframes`.** The two utility
classes (`.animate-spin`, `.animate-pulse`) carried durations that no TS file could
see, so they were deleted and their four call sites now use the inline `animation`
shorthand the other components already used. Rejected: mirroring the literals in both
files (nothing enforces agreement), and exporting `"var(--adhd-fast)"` strings from
`theme.ts` (one source, but token values become opaque in TS and depend on the
stylesheet loading).

**`borderStrong` replaces string surgery.** `App.tsx` built the dot-grid with
`d.border.replace("0.12", "0.20")`, which silently no-ops for `sakura` (border alpha
`0.14`). Each palette now carries `borderStrong` explicitly — indigo `0.20`, forest
`0.20`, sakura `0.22` (its base border is already `0.14` because pink reads lighter).
**Behaviour change:** sakura's dot grid was being drawn at the plain border alpha and
is now visibly stronger, as the other two palettes always were.

**One-off dimensions stay local.** The 50px top bar, the drawer widths (320/360), the
dialog widths (560/700) and the focus-panel sidebars got named constants in their own
component files, following the existing `PANEL_WIDTH` in `ProjectDrawer`. A shared
token used at exactly one call site is worse than the literal it replaces — the task
asked for scales, not a dictionary. Style builders likewise stayed in-file (**A6**,
consistent with the 2026-07-26 entry below).

**Verification:** lint, typecheck, 173 unit/component tests and build are green; the
app was driven headless across all three palettes with before/after screenshots of
every surface. Pixel diffs are 0.3–4.6% — the expected 1–2px reflow — except the log
tab at 6.8%, where every row shifts 1px from `marginBottom: 5→6`. The one failing e2e
spec (`project-drawer`, expecting a "Pipeline Stages" heading that does not exist)
fails identically on the unmodified baseline and is unrelated.

---

## 2026-07-24 — OpenWorkflow is the durable workflow runtime (TASK-068)

**Context:** `RunOrchestrator` was an in-memory `Map` firing `void simulateRun(...)`;
gates were heap promises, recovery marked interrupted runs failed, and retries and
durable timers did not exist (six of eleven capabilities absent or non-durable). The
runtime survey ([`workflow-runtime-options.md`](workflow-runtime-options.md)) chose
**OpenWorkflow** — Apache-2.0, `node:sqlite`, no server — and TASK-067 had already
landed the SQLite substrate.

**Decision:** the durable runtime is OpenWorkflow, embedded **in-process** in the
single runner (its `Worker` starts programmatically; there is no daemon and no CLI).
`RunOrchestrator` *is* the durable workflow: `workflow/pipeline-workflow.ts` is the
run loop, `workflow/stage-execution.ts` is the durable step (simulate vs. engine),
and durability owns start/queueing, the loop, gates (`waitForSignal`/`sendSignal`),
durable timers, retries (`RetryPolicy`), recovery and cancellation. This corrects the
standing claim (now in `architecture.md` and `implementation-notes.md`) that a durable
runtime replaces `executeStage()` alone — the seam is the class, not one method (doc §4).

**Storage & single-writer rule.** OpenWorkflow's tables share the **one**
`.adhd/runs.db` (two `node:sqlite` connections — its `BackendSqlite` plus our
`Database`) and are the source of truth for execution state. The `RunState` snapshot
and `events` table are a rebuildable read model with exactly one writer — the
workflow drives it; the API only reads it (cancellation aside). History travels with
the project folder like `.git`.

**ADHD-owned on top.** Semantic restart from a chosen stage (S2/G1) is a fresh run
seeded with retained prior-stage outputs; one-active-run-per-project (S5/G2) is a
project-keyed `active_runs` admission guard enforced below the API; immediate
subprocess-tree kill on cancel (G4) stays in `runSubprocess` (`cancelWorkflowRun`
only marks durable state); declared parallel branches (G5) fan out via
`Promise.allSettled` over durable steps. Determinism cost: `loadSkill`, `nowIso`,
`randomUUID` and the engine call moved inside steps.

**Alternative rejected:** Aiki (Postgres-only today; would need us to write its
SQLite backend *and* fork-from-step) stays the recorded second choice. Retries are
wired but default to `maximumAttempts: 1` to preserve today's fail-fast behaviour.
**Behaviour change:** the API can no longer start a second concurrent run in one
project (previously reachable) — it now returns 400.

**Cross-platform:** durable execution and `node:sqlite` are OS-independent; the only
platform-sensitive surface (subprocess-tree kill) is unchanged. Tested on Windows;
macOS reasoned through, **untested on macOS**.

---

## 2026-07-23 — SQLite is the sole run store, in a `repository/` module

**Context:** TASK-067 first landed `SqliteRunStore` behind the existing seam with
the flat-file JSON store kept as the default and an `ADHD_RUN_STORE=json|sqlite`
selector. On review the owner asked to go further: run state is a handful of rows
per run, `node:sqlite` installs cleanly (unlike `better-sqlite3`), and carrying two
storage formats plus a selector is complexity with no live consumer.

**Decision:** SQLite is the **only** run store. `JsonRunStore` and the flat-file
`state.json` / `events.jsonl` format are retired. **No migration path is kept** — the
project has no active users, so the flat-file format is simply dropped rather than
importing old data. The persistence code is layered **services → repository → db**:
a single concrete `RunRepository` class (`src/repository/`) coordinates a `Database`
connection + `RunsTable` / `EventsTable` (`src/db/`) and an on-disk handoff writer.
No interface, no factory, no `index.ts` barrel — one concrete class over a
data-access layer, folders named for the layer (`repository`, `db`) not the backend.
Relative imports use `.ts` extensions (matching `@adhd/core`;
`rewriteRelativeImportExtensions` rewrites them to `.js` on build).

**Consequence — the ExperimentalWarning.** With SQLite the only store, `node:sqlite`
loads on every startup, so its `ExperimentalWarning` is no longer contained to an
opt-in path. A warning listener does not suppress the default printer, so the
shipped `start` script uses `node --disable-warning=ExperimentalWarning`. Rejected:
`--no-warnings` (blanket-silences everything) and leaving it to print on every boot
(reads as unpolished for a shipped product).

**Rejected alternative:** keeping JSON as the default with the two-backend selector
(the original TASK-067 shape). It hedged against a `node:sqlite` problem that
measurement (M1/M2 in `workflow-storage-options.md`) had already ruled out, at the
cost of two code paths and a config surface no one selected.

---

## 2026-07-23 — Project preferences are project state, not browser state

**Context:** engine, model, permission mode, pipeline and disabled stages were
keyed `adhd.<projectId>.<name>` in `localStorage`. They read as project settings
in the UI — the Setup modal is titled with the project's name — but they lived in
one browser. Opening the app in a second browser, or clearing site data, silently
reverted a project to defaults while its folder, skills and credentials, all
server-side, stayed put.

**Decision:** the non-secret preferences move into the per-project section of
`~/.adhd/settings.json`, beside the engine connection, and are read and written
through `/settings` and `PUT /settings/preferences`. Secrets do not move: an API
key is still write-only and never leaves the server.

**Stored as a partial, resolved in three layers.** A project's block holds only
the fields that project actually set; a read resolves built-in defaults ←
`defaults.preferences` ← `projects.<id>.preferences`, exactly as `engines`
already did. Storing the fully resolved set was rejected because it would freeze
a project against any future change to `defaults` the moment it touched one
field.

**Validation splits by direction.** A read is tolerant — `settings.json` is
hand-editable and predates the preference block, so
`normalizeProjectPreferences` falls back field by field and migrates legacy model
ids (that migration used to run in the browser; it now runs once, server-side,
for every client). A write is the API contract — `parsePreferencesUpdate` returns
400 for an unknown engine, permission mode or pipeline rather than storing it.

**Legacy `localStorage` values are adopted once, then deleted.** `legacy-prefs.ts`
reads the old keys on a project's first load, PUTs them, and clears them.
Ignoring them was the simpler option and was rejected: it would have silently
reset every existing installation's engine and model. The module is self-contained
so it can be deleted once no installation predates this change.

**Consequence:** the e2e suite now mutates durable server state, which a fresh
browser context used to discard for free. Playwright therefore runs against its
own `ADHD_USER_HOME`/`ADHD_HOME` on its own ports (`reuseExistingServer: false`,
since isolation is only real on a server the config started), and every spec
resets preferences in `beforeEach` — without that, a pipeline chosen in
`dev-test-flow.spec.ts` leaked into the run `run-lifecycle.spec.ts` started.

---

## 2026-07-23 — The project owns the folder; a run cannot choose its own

**Context:** after projects landed, two folders competed. The composer still
carried a "Working directory" field (persisted per project, sent as
`workspaceDir` on `POST /runs`), while the project itself already had a root. A
run listed under project `my-app` could execute the agent anywhere, and the
precedence between the two was invisible in the UI. The API also accepted an
arbitrary absolute path from the browser as the directory an autonomous agent
would run in.

**Decision:** the working directory is **derived from the project, never sent**.
`resolveWorkspace(paths, runId)` returns the project root; `workspaceDir` is gone
from `StartRunOptions`, the `POST /runs` body and the UI. A project's root is
fixed when it is registered — there is no route or control that changes it, and
the answer to "I want to work elsewhere" is to add another project. The composer
states the folder as read-only context instead of offering a picker.

**The home project keeps a scratch workspace per run.** Home has no code of its
own, so `~/.adhd/home/runs/<id>/workspace` is created per run. This preserves the
zero-setup path (try the app before registering anything) and gives the live e2e
canary a folder it cannot damage — the alternative, refusing engine runs without
a project, was rejected as a worse first five minutes. Home therefore still obeys
"one project, one folder"; its folder is just `~/.adhd/home`.

**Consequence:** `ensureProjectDataDir` now also runs at run start, so the
self-ignoring `.adhd/.gitignore` exists even for projects registered before it
was introduced — an agent writing into a real repository must not leave run
artifacts in `git status`. Rerunning an old run no longer restores a directory;
it restores the pipeline and engine only. Runs recorded before this change keep
whatever `workspacePath` they had, which is why the UI still labels a scratch
workspace as such.

**Rejected:** validating a client-supplied `workspaceDir` against the project
root. It keeps the field, the second source of truth, and the UI ambiguity — for
a knob no one asked for once a project *is* a folder.

---

## 2026-07-22 — A project owns its `.adhd/`; the home project is not the repo

**Context:** every path the server wrote was anchored to `REPO_ROOT` — the ADHD
source checkout. A run against `C:/Dev/my-app` wrote its state, events, handoffs
and scratch workspace into `C:/Dev/smekai/adhd/.adhd/`, so a user's project
history lived inside the tool and every project shared one history, one settings
file and one set of personas.

**Decision:** a project is a directory that owns its own `.adhd/`, like `.git`.
`paths.ts` exports a `ProjectPaths` value (`id`, `root`, `dataDir`) that is
passed to the run store, the skills loader and workspace resolution; the
`REPO_ROOT` constant survives only for loading the tool's own `.env`. A
user-level registry at `~/.adhd/projects.json` lists known projects and names the
active one; requests may override it per call with an `X-ADHD-Project` header.

The fallback for "no project selected" is a **home project whose data lives in
`~/.adhd/home`**, *not* `REPO_ROOT`. The task originally specified the repo as
the fallback, which would have reproduced the bug being fixed for every
unconfigured run. `ADHD_HOME` still overrides the home project's data directory,
which is what gives component tests an isolated root.

**Consequence:** the ~75 runs already in the repo's `.adhd/runs/` are no longer
listed anywhere — accepted deliberately with the owner rather than writing
migration code, since `RunState.projectId` is now required and those runs belong
to no project. The files were left on disk, not deleted.

**Rejected:** keeping one global store and filtering by a project column. It
leaves history inside the tool, so uninstalling ADHD or cloning the repo
elsewhere loses or duplicates a user's run history.

## 2026-07-22 — Credentials are user-level, layered defaults over per-project

**Context:** engine API keys were written to `<repo>/.adhd/settings.json`. Moving
settings into each project's `.adhd/` would have put secrets inside the user's
git working tree.

**Decision:** engine connection settings live in `~/.adhd/settings.json` (mode
`0600`), shaped as `defaults` plus a `projects` map keyed by project id. A
project inherits the user-level default until it overrides an engine, so a newly
added project runs immediately instead of demanding a re-entered key. An
inherited entry is **copied** before being edited — aliasing it wrote a
project's key back into `defaults` and leaked it to every other project, which
is what `projects.comp.ts` now guards.

Each created `<project>/.adhd/` also ships a self-ignoring `.gitignore` (`*`),
written with `wx` so a user who deletes it to commit their history keeps it
deleted.

## 2026-07-22 — Skills are layered, never seeded to disk

**Context:** `loadSkill` used to write the bundled persona to
`.adhd/skills/<id>.md` on first read. During the TASK-053 follow-up those files
silently shadowed the improved bundled constants and had to be regenerated by
hand.

**Decision:** resolution is bundled default → user-level override
(`~/.adhd/skills/<id>.md`) → project addendum
(`<project>/.adhd/skills/<id>.project.md`, appended). A full project replacement
(`<id>.md`) stays supported for power users, but the addendum is the default
path, and **nothing is written to disk on read**. Composition is a pure function
(`domain/skills/compose.ts`); the service only reads files.

**Consequence:** the seeding assertion was inverted — `skills.spec.ts` now proves
`loadSkill` leaves both data roots empty.

## 2026-07-22 — All personas are markdown, bundled through one generated module

> Superseded on 2026-07-28 by *Persona Markdown ships as runtime assets* below.

**Context:** persona text lived in two shapes. `developer` and `tester` were
hand-written template literals inside `domain/skills/defaults.ts`; `architect`
was a separate generated module, `architect.generated.ts`, because it is composed
from `architecture.md`. Nothing but history explained why one persona sat
apart from the others, and prose escaped inside a TS template literal diffs
badly and invites a stray backtick to break the build.

**Decision:** persona *sources* are markdown —
`domain/skills/personas/<id>.md` for hand-written ones, the `gen:` blocks of
`architecture.md` for the Architect — and
[`scripts/generate-skills.mjs`](../scripts/generate-skills.mjs) emits a single
`defaults.generated.ts` exporting `DEFAULT_SKILLS`, plus the Claude Code
`SKILL.md`. Adding a persona is now dropping in a markdown file and running
`pnpm gen:skills`; `skill-generation.spec.ts` fails the build on drift.

**Rejected:** *reading the markdown at runtime.* The server builds with plain
`tsc`, which does not copy `.md` into `dist/`, so it would need a bespoke copy
step and would move the shipped source of truth outside the bundle — a packaging
failure would then surface as a persona-less run rather than a build error.

**Rejected:** *generating into the hand-written `defaults.ts`.* Partially
rewriting a file that also holds hand-authored content is exactly the fragility
the generator exists to avoid.

## 2026-07-28 — Persona Markdown ships as runtime assets

**Context:** `defaults.generated.ts` still duplicated every Markdown persona
inside a TypeScript template literal. That made persona-only reviews look much
larger than their authored change and blurred the distinction between source
and transport.

**Decision:** the server reads bundled personas and step tasks directly from
Markdown. The server build copies `domain/skills/personas/` and
`domain/skills/step-tasks/` into the matching `dist` path using a
platform-neutral Node script. `generate-skills.mjs` now generates only the two
Architect Markdown consumers from `architecture.md`.

**Consequence:** `defaults.generated.ts` and its exported maps no longer exist.
Missing or unsafe prompt ids resolve to no prompt, while build, drift, and
pipeline-reference checks guard the packaged assets.

## 2026-07-22 — Architect standard: one source, two generated consumers

> Output paths superseded the same day — see *All personas are markdown* above.
> The decision below still holds; only the emitted files were renamed.

**Context:** the Architect standard must exist as both a Claude Code skill
(`.claude/skills/architect/SKILL.md`) and an ADHD persona constant. Keeping two
hand-written copies in sync fails the first time someone edits one.

**Decision:** a single canonical source, [`architecture.md`](./architecture.md),
with named `gen:` blocks; the generator emits both consumers, and a drift test
fails the build (`pnpm gen:skills --check`).

**Rejected:** a documented "edit both files" rule — zero enforcement, drifts
silently. The shared *rules* are generated into both; the skill and persona
framing differ deliberately (one addresses this repo, the other runs in a
stranger's), so the two outputs are assembled from different block sets rather
than being byte-identical.

## 2026-07-22 — Server pure logic goes to `packages/server/src/domain/`, not `@adhd/core`

**Context:** rule A3 wants pure domain logic out of the service layer. The
candidates (`stage-context.ts` prompt/handoff/verdict logic, the bundled skill
defaults) are pure, so `@adhd/core` looked like a home.

**Decision:** they moved to a new `packages/server/src/domain/` folder.
`@adhd/core` stays the *shared* contract imported by the browser UI; prompt
builders and persona text have no business in the client bundle. A server-only
domain layer is the right seam.

## 2026-07-22 — TypeScript pinned to 6.0.3, not 7.x

**Context:** rule A7 asks to run the latest TypeScript. Latest at the time was
**7.0.2**.

**Decision:** pinned to **6.0.3**. TypeScript 7 crashes the lint gate:
`typescript-eslint@8.65` declares a peer range of `>=4.8.4 <6.1.0`, and its
`typescript-estree` throws `TypeError: Cannot read properties of undefined
(reading 'Cjs')` under TS 7. 6.0.3 is the newest release the whole toolchain
(lint + typecheck + build) is green on. Revisit when typescript-eslint ships a
TS 7 peer range.

**Consequence:** TS 6 dropped automatic `@types` inclusion, so each project now
declares `"types"` explicitly (`["node"]` for the server, `["vite/client"]` for
the UI). `@types/node` was bumped to v26 to match.

## 2026-07-22 — Adopted `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`

**Context:** both flags were parked in `architecture.md` as "once the codebase is
ready." Rule A7 pushes for them.

**Decision:** both are on in `tsconfig.base.json`. The two idioms adopted for the
fallout: **widen** an option/result bag field to `?: T | undefined` where
`undefined` is a legitimate in-memory value (the engine adapter interfaces), and
**omit** the key with a conditional spread — or reset with `delete` — where it
should simply be absent from persisted state (run/stage state). Explicit
`= undefined` assignment is now a type error, which is the point: persisted JSON
no longer carries `"model": undefined` noise.

## 2026-07-22 — SetupModal inline-style cleanup deferred

**Context:** rule A6 bans large inline `style={{…}}` blocks. `StageFocusPanel.tsx`
was cleaned to named constants/builders as the reference case. `SetupModal.tsx`
has ~108 inline styles.

**Decision:** deferred to a follow-up task. Extracting ~108 style objects is a
large, visually risky diff with no unit coverage; folding it into the standards
task would bury the standard under churn. All components did get named `XProps`
types (low risk, mechanical); only `StageFocusPanel` got the style extraction.

## 2026-07-26 — SetupModal styles named in-file, not in a sibling module

**Context:** TASK-063 lifted the 100 inline `style={{…}}` objects out of
`SetupModal.tsx`. At that volume a separate `SetupModal.styles.ts` is tempting.

**Decision:** the named constants and builders live in the component file, above
the props type, exactly as `StageFocusPanel.tsx` does it. A6 asks for *names*, not
for a particular file; a sibling styles module would split one component's markup
from its presentation across two files and make the pattern inconsistent with the
reference case. Repetition drove the naming: the five option-card call sites
collapse to one `optionCard(selected, d, accent = d)` builder — where the
`accent` parameter exists because the Appearance section colours each card from
the theme it *offers*, not the theme in use — and six muted descriptions to one
`mutedCaption(d)`. Booleans that a builder branches on are named at the top of the
component (`engineMissing`, `keyReady`, `creditsNoteShown`) rather than inlined as
expressions at the call site.
