# Decision Log

Short, dated entries recording *why* a non-obvious choice was made — the home for
rationale that rule **A8** keeps out of code comments. **Strictly newest first.** An
entry is a decision, its context, and the alternative rejected; it is not a changelog.
When a later decision supersedes an earlier one, the two are **merged into the survivor**
rather than left as a pair to reconcile.

---

## 2026-08-03 — The agent-authored closeout is an external protocol (TASK-101, TASK-105)

**Context:** rule **A7** says a codec rejects a malformed record whole rather than
repairing fields — but it draws that line around *ADHD-owned* formats. The
`adhd-closeout` block is written by an LLM to a schema it was shown in prose, which puts
it on the same side of the line as the TaskPlanner and engine protocols. Two failures
proved it: the model reliably writes `"non-blocking"` where the enum demands
`non_blocking` (3 runs out of 3 in the dogfood), and *any* other schema slip answered
with `emptyCloseout(...)` — discarding the summary, delivered scope, decisions,
knowledge, every finding and every follow-up task draft of a run that cost real money.

**Decision:** `severity` parses through a normalizing step (trim, lowercase, fold hyphens
and spaces to underscores) before the enum, and the block as a whole is salvaged field by
field and, inside arrays, element by element. A field that fails drops to its empty
value, a malformed element drops alone, an unrecognised key is reported rather than
fatal, and every discarded piece is named with its path in `validationErrors` — the
channel `CloseoutPanel` renders. A follow-up task whose finding did not survive is
dropped too, naming both, because a task pointing at nothing is what the strict schema's
cross-check always rejected. An unrecognised severity (`critical`, `maybe`) still fails
its finding.

**The strict schema is unchanged and still exported.** `run-persistence.ts` validates the
*persisted* `closeout.json` with it, and that file is ADHD-owned, so A7 applies there in
full. One shape, two codecs: strict where ADHD wrote the record, salvaging where an agent
wrote it. A round-trip test holds the invariant that a salvaged report still satisfies
the strict schema, so nothing lands on disk that could not be read back.

**Rejected:** a scoped retry feeding `validationErrors` back to the agent. It costs a
second Product Manager call on every schema slip, would not have prevented the severity
case (the model had no way to know the other spelling), and still answers a second
failure with nothing. Also rejected: widening only the prompt — it already showed the
right shape when this fired.

---

## 2026-08-03 — Completing a needs-attention feature is an acceptance, not a status edit (TASK-102)

**Context:** `canFinalizeMilestone` requires every feature to be `completed`, so one
feature left `needs_attention` made a milestone unfinalizable from the dashboard.

**Decision:** the dashboard control is `POST /milestones/:id/features/:featureId/accept`,
a distinct domain action guarded by `canAcceptMilestoneFeature`, and it stamps
`acceptedAt` on the feature. A finalized milestone can therefore be read back to
distinguish features a run completed from features a human accepted over open findings.
Blocking findings do not prevent acceptance — the alternative strands a milestone on a
false-positive finding with no way out, which is the bug being fixed.

**Rejected:** exposing the existing `PATCH …/features/:featureId` as a status dropdown.
Smaller, and the endpoint already worked, but it leaves no record that a feature was
force-completed — which is the whole point of the control.

---

## 2026-07-31 — What the Milestone D dogfood proved, and what it did not (TASK-094)

**Context:** Milestone D was closed on a live Full Delivery run against a disposable
sample app rather than on tests alone — 3 runs, ~$6, Claude Code + sonnet, Windows.

**Two lessons that bind future work:**

**A restart test that does not confirm the run was non-terminal at the moment of the kill
is not a test.** The first two durable-resume attempts verified nothing: the run had
already reached a terminal state before the server was killed, so there was no
interruption to recover from. Only a *timed* kill — server stopped at a known instant
with a stage mid-flight — tests anything. Timed properly, it passed: completed stages
kept their original timestamps and were not re-run.

**Where an LLM fills a typed contract, a fixture-based test proves the parser and nothing
about what the model actually emits.** The component tests passed throughout while the
closeout defect reproduced 3 runs out of 3, because the fixtures were valid by
construction. Schema-shaped prompts need an example of **every** enum value.

**Not proven, and still not:** the TaskPlanner-backend path was deliberately skipped, so
it rests on `task-writer` component tests alone. macOS remains CI-only.

---

## 2026-07-31 — Milestone D ships without release and deploy automation (TASK-093, TASK-092)

**Context:** TASK-093 was written to render preview deployment URLs and QA screenshots
and traces in Artifacts. Both are produced by TASK-092's typed project automation
configuration, and TASK-092 was closed unmerged (PR #13) under a standing "no automation
for now" call.

**Decision:** Milestone D closes without release and deploy automation, and TASK-093's
Artifacts scope was cut to the closeout record — the one delivery artifact a run actually
produces today. Rendering a deploy-URL section that is always empty, or an evidence
gallery for files no configured stage writes, would be a UI promising a capability the
product does not have.

The `release` and `deploy` stages stay in the Full Delivery pipeline: their step-tasks end
with `VERDICT: SKIP` when no target is configured, so the seam degrades honestly and
TASK-092 stays a real follow-up rather than a rewrite. **Rejected:** removing the two
stages until automation lands, which would make TASK-092 a pipeline change instead of a
configuration one.

---

## 2026-07-31 — A quality FAIL presents as needs-attention, not as failure (TASK-093)

**Context:** a quality-policy stage reporting `VERDICT: FAIL` is recorded with stage
status `failed` so the run ends `needs_attention`, but the pipeline deliberately
continues past it to closeout. The UI painted that stage the same red as a crashed one,
so a review that found a blocking problem was indistinguishable from an engine that died.

**Decision:** the UI derives a presentation from the stage rather than reading its status
directly — `stagePresentation` in `run-utils.ts` maps `failed` + `verdict: FAIL` to an
amber `NEEDS ATTENTION`, and leaves a verdict-less `failed` stage red. The derivation is
presentational and pure, so it lives in the UI beside the other run helpers.

**Rejected:** adding `needs_attention` to `StageStatus` in `@adhd/core`. The persisted
status is what the durable workflow branches on, and widening it would force every
runtime consumer to handle a case that exists only so a colour can differ.

---

## 2026-07-29 — Milestones begin as an approved Product Manager proposal (TASK-088, TASK-091, TASK-096)

**Context:** a user can describe an outcome more easily than a complete delivery backlog.
Creating tasks during an unfinished conversation would turn guesses into durable project
work, while making each task its own milestone feature would stop one coherent delivery
run from grouping related changes and bugs.

**Decision:** milestone planning is a dedicated Product Manager conversation. Its
validated proposal is persisted as a draft, can be revised through chat or edited
directly, and creates or links tasks only after explicit approval. One feature is one
Full Delivery run and may group several tasks. Existing TaskPlanner work is reused;
missing work is created idempotently through an ADHD-owned adapter, with `.adhd/tasks` as
the fallback.

Product Manager also owns structured closeout. Only explicitly completed source tasks
move to Done, unresolved work is preserved, and cleanup is restricted to the run-owned
temporary root.

**Deferred:** changing TaskPlanner first. The Markdown integration stays behind an adapter
so a future official transactional API can replace it without changing milestone
behaviour.

---

## 2026-07-29 — Runtime schemas own every untrusted boundary (TASK-098, TASK-100 boundary rule)

**Context:** HTTP routes asserted generic request bodies, persisted runs trusted an object
after checking only `run.id`, and the three engine adapters cast JSONL before traversing
vendor records. Milestone planning and closeout converted unknown JSON through nested
`recordOf` / `stringsOf` / `findingsOf` helpers, so invalid nested entries were silently
removed and service code received a plausible but incorrect partial result.

**Decision:** focused Zod codecs own HTTP, settings, project-registry, TaskPlanner config,
persisted run/event/milestone, AI-output and engine JSONL boundaries. An ADHD-owned record
validates completely or is rejected with path-aware issues; pre-1.0 persisted shapes are
not migrated. External TaskPlanner and engine formats may carry unrelated fields or event
types, but every field ADHD consumes is validated. Engine codecs emit one shared
normalized update shape so adapters never traverse unknown vendor objects. Malformed
nonterminal engine lines are logged and skipped; a run still requires a valid terminal
event to succeed. Runtime value lists are exported `as const` and define their TypeScript
unions.

**Enforcement:** ESLint rejects typed `c.req.json<T>()` calls and casts directly around
`JSON.parse` in server source.

**Rejected:** partial recovery from malformed *owned* files, because it hides the failing
path and can produce a plausible but incorrect configuration; and one universal schema
module, because HTTP, persistence, TaskPlanner and each vendor protocol change
independently. (The agent-authored closeout block is deliberately on the *external* side
of this line — see 2026-08-03 above.)

---

## 2026-07-29 — Markdown formats are pure domain codecs (TASK-100)

**Context:** closeout and TaskPlanner services built Markdown inline while also reading
files, mutating boards, cleaning temporary paths and sequencing run work. Formatting
rules, line endings and TaskPlanner grammar had no single testable boundary.

**Decision:** focused codecs under `domain/markdown/` own server-side Markdown parsing and
rendering. They receive timestamps and typed values, normalize ADHD-owned documents to LF,
and preserve an existing TaskPlanner file's LF or CRLF style when editing it. Structural
labels are single-line; free-form bodies keep their Markdown. Services own I/O and
orchestration; repositories store already-rendered content without understanding its
format.

**Rejected:** a repository-level formatter, because persistence should not own
presentation semantics; and one universal Markdown builder, because task-board grammar,
agent prompts and closeout artifacts change for different reasons.

---

## 2026-07-29 — SQLite owns projection audit timestamps (TASK-099)

**Context:** mutable `runs` and `milestones` rows received `updated_at` from TypeScript on
every upsert and had no `created_at`. That made the repository responsible for database
bookkeeping and let writers disagree about timestamp format, or forget the update.

**Decision:** SQLite supplies `created_at` and `updated_at` with
`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`, matching JavaScript's millisecond UTC ISO format.
An `AFTER UPDATE` trigger advances `updated_at`; upserts write only identifiers and data.
Known legacy table schemas are rebuilt in one transaction, preserving rows and using the
previous `updated_at` as both initial audit timestamps.

Append-only `events` need no mutable audit timestamps, and `active_runs.started_at` stays a
domain value describing run admission rather than row creation. This database-schema
migration is deliberately separate from persisted JSON compatibility: pre-1.0 JSON shapes
remain strict.

---

## 2026-07-29 — Optional and `undefined` represent the same domain state

> Supersedes the 2026-07-22 adoption of `exactOptionalPropertyTypes`, which this entry
> reverses. The `noUncheckedIndexedAccess` half of that adoption remains active.

**Context:** `exactOptionalPropertyTypes` forced callers and constructors to distinguish a
missing property from a property whose value is `undefined`. ADHD assigns no different
domain meaning to those two JavaScript shapes, so the flag produced required
`T | undefined` fields and conditional object assembly without protecting a real
invariant.

**Decision:** `exactOptionalPropertyTypes` is **off**. A value that may be absent is
written `field?: T`; callers may omit it or supply `undefined`. `null` is reserved for
contracts needing an explicit cleared or removed state. `noUncheckedIndexedAccess` stays
**on** in `tsconfig.base.json`, and runtime schemas still validate untrusted input at the
boundary.

---

## 2026-07-28 — Full Delivery uses reusable personas and explicit stage policy (TASK-089, TASK-090)

**Context:** the comprehensive preset needs conditional design and deployment, continued QA
after a blocking review, suppression of unsafe release work, and a closeout even after
engine failure. One human role also performs more than one assignment: Product Manager
plans and closes; Software Architect designs and independently reviews.

**Decision:** personas remain stable identities while step-task Markdown defines each
assignment. Full Delivery therefore reuses Product Manager and Software Architect instead
of introducing Code Reviewer, Manual Tester, Project Steward or Engineering Manager
personas.

Workflow control is declared through `executionPolicy`: quality work may continue after
`VERDICT: FAIL`, delivery work is suppressed by any blocker, and closeout is the only paid
stage allowed after an engine or runtime failure. Cancellation starts no closeout agent.
Restart carries prior stage *outcomes* as well as handoff text, so blockers survive a
downstream retry.

**Rejected:** hardcoding stage ids in the workflow loop. That couples control semantics to
today's labels and makes a custom or renamed pipeline silently unsafe.

---

## 2026-07-28 — Persona Markdown is the source and ships as runtime assets

> Supersedes the 2026-07-22 decision that bundled personas through a generated
> `defaults.generated.ts`. The move *out of TypeScript template literals* stands; the
> generated-module transport does not.

**Context:** persona text originally lived in two shapes — hand-written template literals
inside `domain/skills/defaults.ts`, and a separately generated module for the Architect,
which is composed from `architecture.md`. Prose escaped inside a TS template literal diffs
badly and invites a stray backtick to break the build. The first fix generated one
`defaults.generated.ts`, which still duplicated every Markdown persona inside a template
literal — making persona-only reviews look far larger than their authored change.

**Decision:** persona *sources* are Markdown (`domain/skills/personas/<id>.md`, and the
`gen:` blocks of `architecture.md` for the Architect), and the server reads bundled
personas and step tasks **directly from Markdown at runtime**. The server build copies
`domain/skills/personas/` and `domain/skills/step-tasks/` into the matching `dist` path
with a platform-neutral Node script. `generate-skills.mjs` now emits only the two
Architect Markdown consumers. `defaults.generated.ts` no longer exists.

**Consequence:** missing or unsafe prompt ids resolve to no prompt; build, drift and
pipeline-reference checks guard the packaged assets.

**Rejected earlier, and why it no longer applies:** runtime Markdown reading was first
rejected because plain `tsc` does not copy `.md` into `dist/`, so a packaging failure would
surface as a persona-less run rather than a build error. The explicit copy step plus the
packaged-asset checks close exactly that gap.

---

## 2026-07-28 — The chat is a projection of the log (TASK-082)

**Context:** `buildTranscript` maps *every* stage log line into the conversation, so the
chat carried `⎿ Read(auth.ts)`, `Tool error: …` and `Developer online · …` alongside what
the agent actually said.

**Decision:** one derived ordering, three tabs over it. `buildTranscript(run)` feeds Logs;
`conversationOnly(items)` feeds Chat. The chat is never a second source — that is what
keeps a line from existing in one view and not the other for reasons nobody can
reconstruct.

**The filter is structural, not textual.** It drops `kind: "tool"` and nothing else.
Matching prose (`startsWith("cost ")`, `/online ·/`) was the obvious alternative and is the
one that rots the day an adapter rewords a string. TASK-083 went first precisely so the
chatter would already *be* tool-level. `conversationOnly` returns a narrowed
`Exclude<TranscriptItem, { kind: "tool" }>`, so `ChatPanel` cannot be handed a tool row at
all.

**The stage header keeps its place in the thread** — who is working, how their stage ended
and what it cost are the three things a person watching a run wants, not machinery.

**A stage-node click filters instead of opening a pane,** and deliberately does *not*
switch tabs: a component reports what happened, the parent decides what it means, and
yanking someone out of the chat mid-read is the opposite of that.

**No Reasoning tab.** It rendered hardcoded demo text regardless of what the run did. With
no server-side reasoning source the honest options were an always-empty tab or no tab, and
a tab promising something the system never captures is worse than its absence.

---

## 2026-07-28 — Engine usage is data, not prose (TASK-083)

**Context:** a run could not say what it cost. Adapters read `total_cost_usd` (or token
counts), formatted them into an `info` log line, and dropped the number — so the figure was
simultaneously *unavailable as data* and *noise in the conversation*, because `info` logs
render as agent prose.

**Decision:** an adapter that knows a number hands it up the seam. The loose fields on
`EngineRunResult` collapse to one named `StageUsage` imported from core, and the log lines
that formatted them are deleted.

**The run total is derived, not stored.** `runUsage(run)` sums the stages. A stored
`RunState.costUsd` would be a second source of truth that drifts the moment a stage is
restarted — and `restartRun` deliberately leaves `stage.usage` alone while clearing
`verdict`, `logs` and timestamps, because money spent on a failed attempt was still spent.

**Accumulation happens on the server; the event carries the total.** A stage runs several
times across a question loop, so emitting a delta would report only the last turn — and the
event must survive `replayEvents`, where a delta applied twice would double-count.
Accumulate once, at the single writer; the reducer assigns.

**`formatUsage` is the one place the engines' differences are expressed.** Claude Code
reports dollars, Codex only tokens, Cursor neither. A price table per model, or a UI
branching on engine id, either invents numbers or spreads that knowledge across call sites.
Nothing reported is not an error state.

**Engine chatter demoted to `run` level**, so TASK-082 could filter the chat structurally
instead of matching strings. Only fields proven by code that already read them are mapped —
Claude's documented token `usage` block is not asserted from documentation alone.

---

## 2026-07-27 — Two presets, a Project Manager, and fewer prose assertions (TASK-080)

**Context:** three presets shipped (`one-box`, `dev-test`, `gated-dev-test`), all variations
on "Developer, maybe a Tester", and the picker described the *mechanism* rather than the job.

**Decision — exactly two presets.** `pm-dev-test` (Project Manager → gate → Developer →
Tester) and `solo`. The Project Manager reuses the existing `intake` stage, promoting a
roster entry rather than inventing one. `solo` needed its own `AGENTS` entry because
`agentForStage` silently degrades an unknown id to `{ profession: stageId }`, which would
print raw ids in the log.

**The gate moved onto the Project Manager's handoff.** Retiring `gated-dev-test` would have
orphaned the approval gate, and approving a *recommendation* before any code is written is
the better shape for a tool whose name ends in "Human Directed".

**Retired ids are refused, not aliased.** A run stored against `dev-test` cannot restart;
`restartRun` checks up front and fails with a sentence naming the retired pipeline rather
than throwing `Unknown pipeline`. Legacy `localStorage` preferences naming a retired id are
dropped rather than adopted — migrating a preference the picker cannot display is worse than
ignoring it. Pre-1.0 with no external users, so refusing accurately is enough.

**Prose assertions are not tests.** `skill-generation.spec.ts` lost four of six cases that
asserted on English — that every persona's last word is `prompt.`, that the architect
persona contains `A1`…`A9` and `VERDICT: PASS`, and a verbatim check already covered by
`gen:skills --check`. The first *failed* on a perfectly good new persona, which is the
clearest evidence it tested the wrong thing. What remains is the drift check and one test
deriving skill ids from `DEMO_PIPELINES` — a stage naming a missing persona only logs a
warning, so nothing else would catch that typo.

---

## 2026-07-27 — An agent that asks parks on its own status, and resumes its session (TASK-079)

**Context:** the point of a chat is that the agent can answer back, but every adapter was
one-shot and no session id was captured anywhere. Two mechanisms were possible: re-run the
stage with the question and answer folded into a fresh prompt, or resume the CLI session.

**Decision: resume the session.** `EngineRunContext` gained `resumeSessionId` and
`EngineRunResult` gained `sessionId` — one `run()` method, not a second `resume()`; the
*flag* declares the capability and the *context* drives the behaviour, matching how `model`
and `permissionMode` already work. Re-running was rejected because a Project Manager's
investigation is the expensive part: paying for it twice per clarifying question, and losing
the model's working context each time, makes the feature not worth having.

**Verified against the installed CLIs, not the docs.** Two results worth keeping:
**`codex exec resume` does not accept `--sandbox`**, only
`--dangerously-bypass-approvals-and-sandbox`, so a resumed Codex turn under `acceptEdits`
runs on Codex's own default sandbox rather than `workspace-write`. And **Cursor is
`conversational: false`** — the CLI was not installed here and session-id emission could not
be confirmed; a flag asserted from documentation alone is exactly the silent failure this
work set out to avoid. Flip it when someone with `cursor-agent` verifies it.

**`asking` is its own status, not `awaiting`** — reusing the gate state would make "Approve"
mean two different things. (TASK-061 makes the same argument for `blocked`.)

**The question contract mirrors the verdict contract.** `parseStageQuestion` is
`parseStageVerdict` with a different keyword: last-line-first, CRLF-tolerant,
markdown-emphasis-tolerant. A persona that knows `VERDICT: PASS|FAIL` needs no new mental
model.

**Only an interactive stage on a conversational engine may ask,** bounded by
`MAX_QUESTION_TURNS = 6` — a persona that always ends with a question would otherwise loop
forever, and each loop is a durable park. A Developer that happens to print `QUESTION:` is
not interactive, so its output passes straight through.

**`admitRun` still holds the project slot while parked.** A question can wait hours, exactly
like a gate. Releasing the slot would let a second run start and write to the same
workspace — a worse failure than making the user answer or abort.

---

## 2026-07-27 — The transcript is derived; only the user's turns are stored (TASK-078)

**Context:** the obvious implementation of a conversation is a `messages` table the agents
write to as they speak — and it would duplicate everything the system already records. All
three adapters call `onLog(level, text)` where `info` is assistant prose, `run` a tool-use
summary and `warn` a tool error, so the chat/tool distinction already exists in the data.

**Decision:** the thread is a **derived view**. `buildTranscript(run)` maps stage logs onto
agent prose, tool rows and notices, and merges in `run.messages` — which holds **only what
the user typed**. One writer, one ordering, and no way for the transcript to disagree with
the log. The mapping is a `switch` over `LogLevel` closed by exhaustiveness, so a new level
is a compile error rather than a silently mis-rendered line.

**Rejected:** a `messages` array the projection also appends agent text to — two copies of
the same sentences, and a reconciliation problem the first time an adapter changes what it
logs.

**Ordering is timestamp-first with a collection sequence breaking ties,** because a fast
stage can emit several entries inside one millisecond and a stable thread matters more than
which is "really" first.

**A real ordering bug fell out of testing this.** `GET /runs/:id/events` replayed stored
events and *then* subscribed, with an `await` in between, so anything emitted during the
replay was lost. It now subscribes first, buffers, replays, and flushes. Duplicates across
the seam are safe: `applyEvent` dedupes logs by `ts`+`message` and messages by `id`.

---

## 2026-07-27 — The run rail routes on the hash, and rides a summary channel (TASK-077)

**Context:** the run list moved from an overlay to a persistent left rail, tripping two
absences `architecture-ui.md` §1 records as deliberate — the router, and the fact that no
transport pushes run-*list* changes.

**Decision — a hand-rolled hash router, not `react-router`.** One route pattern
(`#/runs/:id`) does not earn a fifth dependency. `route.ts` is a pure
`parseRoute`/`routeHash` pair over a discriminated union; `useRoute` is a `hashchange`
listener. Back/forward work because the hash *is* history.

**Why the hash and not a real path.** `/runs` is the API's, the UI and server share an
origin, and `vite.config.ts` proxies `/runs` to the server — so navigating to
`/runs/ab12cd34` would be proxied and answered with run JSON instead of the app. A path
router would need a dev-proxy bypass *and* an SPA fallback wherever the built UI is served.
Revisit if the API ever moves under a prefix.

**Decision — the rail's transport carries `RunSummary`, not `RunState`.** A project-scoped
SSE channel (`GET /runs/events`) emits a compact summary on every non-log event.
`RunState` carries `stages[].logs`, which is almost all of its bytes and grows for the life
of a run; re-sending it to paint a status dot would be absurd. `toRunSummary` lives in
`@adhd/core` so both sides reference one declaration, and the channel skips `stage.log`
because a log never changes what the rail draws.

**The project arrives as a query parameter, not the `X-ADHD-Project` header,** because
`EventSource` cannot set headers. `projectScope` falls back to `?project=`; the header stays
the rule for every other call.

**The snapshot still comes from `GET /runs`** — the stream carries changes only, so
`useRunList` fetches the snapshot and replays anything that arrived in the gap, the same
subscribe-then-fetch ordering `useRunEvents` uses.

---

## 2026-07-27 — Setup is a folder of sections over a shared style module (TASK-073)

**Context:** `SetupModal.tsx` was 1002 lines owning four unrelated settings surfaces. One
component per section collides with the 2026-07-26 entry below: if styles stay in a
component's own file, where do the builders *four* sections share go?

**Decision:** `components/setup/` — the first feature folder, under the `architecture-ui.md`
§2 rule (a feature owning four or more files no other feature imports). Section-specific
builders moved with their markup; the ~13 names used by two or more sections went to
`setup/setup-styles.ts`. That is **not** the sibling `SetupModal.styles.ts` rejected
before: this is a vocabulary shared across sibling components — `theme.ts` scoped to one
surface — not one component's presentation exiled from its own markup. Copying `optionCard`
into four files would trade an A6 violation for a worse one.

**The harness section split again, one level down,** along the same axis: its three stateful
blocks each own state *and* server calls (`EngineStatusCard`, `EngineConnection`,
`EngineModelPicker`). Nothing lands over ~300 lines.

**Two couplings survived as explicit props.** A successful install or login must refresh the
*model* list too — the CLI's roster is only readable once it exists — so `statusNonce` became
a `refreshKey` owned by `HarnessSection`; and `customModelDraft` became an effect on the
`model` prop rather than a callback threaded back up.

---

## 2026-07-27 — The UI scales are extracted, not designed (TASK-072)

**Context:** `theme.ts` tokenised colour only. Spacing, radii, type, icon sizes, z-index and
motion were inline literals across all 17 components — 19 distinct padding/gap values, 13
radii, 11 font sizes. `borderRadius: 10` next to `borderRadius: 9` carried no information
about whether the difference was deliberate.

**Decision:** the scales are an **extraction of current usage, not a redesign.** Values were
measured from the components, then near-duplicates snapped to one step each — **every snap
≤2px**, and the resulting scales live in `theme.ts`.

**`md` and `lg` stay 2px apart** in both `SPACE` (8/10) and `RADIUS` (8/10). Merging them
would be the tightest scale, but the two values are two *roles* — 8 the chip/small-card
radius, 10 the control radius — and collapsing them is a redesign, which this explicitly is
not.

**Elevation nests, the rest are flat.** Shadows are palette-tinted, so they became
`d.elevation.{sm,md,lg}` on `Dir`; only the two *untinted* shadows moved to a shared
`ELEVATION`.

**`theme.ts` owns motion; `index.css` keeps only `@keyframes`.** Utility classes carried
durations no TS file could see. **Rejected:** mirroring the literals in both files (nothing
enforces agreement), and exporting `"var(--adhd-fast)"` strings (one source, but token
values become opaque in TS and depend on the stylesheet loading).

**`borderStrong` replaces string surgery.** `App.tsx` built the dot grid with
`d.border.replace("0.12", "0.20")`, which silently no-ops for `sakura` (border alpha
`0.14`). Each palette now carries `borderStrong` explicitly. **Behaviour change:** sakura's
dot grid was being drawn at the plain border alpha and is now visibly stronger, as the other
palettes always were.

**One-off dimensions stay local** — a shared token used at exactly one call site is worse
than the literal it replaces. This asked for scales, not a dictionary.

---

## 2026-07-26 — SetupModal styles are named in-file, not in a sibling module

> Absorbs the 2026-07-22 entry that deferred this work. The deferral's reasoning —
> extracting ~108 style objects is a large, visually risky diff with no unit coverage, and
> folding it into the standards task would bury the standard under churn — is why it was a
> separate task, and it was then done here.

**Context:** TASK-063 lifted ~100 inline `style={{…}}` objects out of `SetupModal.tsx`. At
that volume a separate `SetupModal.styles.ts` is tempting.

**Decision:** the named constants and builders live in the component file, above the props
type, exactly as `StageFocusPanel.tsx` does it. A6 asks for *names*, not for a particular
file; a sibling styles module splits one component's markup from its presentation and makes
the pattern inconsistent with the reference case.

Repetition drove the naming: five option-card call sites collapse to one
`optionCard(selected, d, accent = d)` — the `accent` parameter exists because the Appearance
section colours each card from the theme it *offers*, not the theme in use — and six muted
descriptions to one `mutedCaption(d)`. Booleans a builder branches on are named at the top
of the component rather than inlined at the call site.

---

## 2026-07-24 — OpenWorkflow is the durable workflow runtime (TASK-068)

**Context:** `RunOrchestrator` was an in-memory `Map` firing a fire-and-forget run; gates
were heap promises, recovery marked interrupted runs failed, and retries and durable timers
did not exist — six of eleven capabilities absent or non-durable. The runtime survey
([`workflow-runtime-options.md`](workflow-runtime-options.md)) chose **OpenWorkflow**:
Apache-2.0, `node:sqlite`, no server.

**Decision:** the durable runtime is OpenWorkflow, embedded **in-process** in the single
runner — its `Worker` starts programmatically; there is no daemon and no CLI.
`RunOrchestrator` *is* the durable workflow: `workflow/pipeline-workflow.ts` is the run
loop, `workflow/stage-execution.ts` is the durable step, and durability owns
start/queueing, the loop, gates (`waitForSignal`/`sendSignal`), durable timers, retries,
recovery and cancellation. **The seam is the workflow, not one method** — this corrects the
older claim that a durable runtime replaces `executeStage()` alone (doc §4).

**Storage & single-writer rule.** OpenWorkflow's tables share the **one** `.adhd/runs.db`
(two `node:sqlite` connections) and are the source of truth for execution state. The
`RunState` snapshot and `events` table are a rebuildable read model with exactly one
writer — the workflow drives it; the API only reads it (cancellation aside). History travels
with the project folder like `.git`.

**ADHD-owned on top.** Semantic restart from a chosen stage is a fresh run seeded with
retained prior-stage outputs; one-active-run-per-project is a project-keyed `active_runs`
admission guard enforced below the API; immediate subprocess-tree kill on cancel stays in
`runSubprocess` (`cancelWorkflowRun` only marks durable state); declared parallel branches
fan out via `Promise.allSettled` over durable steps. Determinism cost: `loadSkill`,
`nowIso`, `randomUUID` and the engine call moved inside steps.

**Rejected:** Aiki — Postgres-only today, so it would need us to write its SQLite backend
*and* fork-from-step — stays the recorded second choice. Retries are wired but default to
`maximumAttempts: 1` to preserve fail-fast behaviour. **Behaviour change:** the API can no
longer start a second concurrent run in one project; it returns 400.

**Cross-platform:** durable execution and `node:sqlite` are OS-independent; the only
platform-sensitive surface (subprocess-tree kill) is unchanged. Tested on Windows,
**untested on macOS**.

---

## 2026-07-23 — SQLite is the sole run store, in a `repository/` module

**Context:** TASK-067 first landed `SqliteRunStore` behind the existing seam with the
flat-file JSON store kept as default and an `ADHD_RUN_STORE` selector. Run state is a
handful of rows per run, `node:sqlite` installs cleanly (unlike `better-sqlite3`), and
carrying two storage formats plus a selector is complexity with no live consumer.

**Decision:** SQLite is the **only** run store. `JsonRunStore` and the flat-file
`state.json` / `events.jsonl` format are retired, with **no migration path** — the project
has no active users, so the old format is dropped rather than imported. Persistence is
layered **services → repository → db**: one concrete `RunRepository` class coordinating a
`Database` + `RunsTable` / `EventsTable` and an on-disk handoff writer. No interface, no
factory, no barrel `index.ts`; folders named for the layer, not the backend. Relative
imports use `.ts` extensions (`rewriteRelativeImportExtensions` rewrites them to `.js` on
build).

**Consequence — the ExperimentalWarning.** `node:sqlite` now loads on every startup, so its
warning is no longer contained to an opt-in path, and a warning listener does not suppress
the default printer. The shipped `start` script uses
`node --disable-warning=ExperimentalWarning`. Rejected: `--no-warnings` (blanket-silences
everything) and letting it print on every boot (reads as unpolished).

**Rejected:** keeping JSON as the default with the two-backend selector. It hedged against a
`node:sqlite` problem that measurement had already ruled out, at the cost of two code paths
and a config surface no one selected.

---

## 2026-07-23 — Project preferences are project state, not browser state

**Context:** engine, model, permission mode, pipeline and disabled stages were keyed in
`localStorage`. They read as project settings — the Setup modal is titled with the project's
name — but lived in one browser, so a second browser or cleared site data silently reverted a
project to defaults while its folder, skills and credentials stayed put server-side.

**Decision:** the non-secret preferences move into the per-project section of
`~/.adhd/settings.json`, read and written through `/settings` and `PUT
/settings/preferences`. Secrets do not move: an API key stays write-only and never leaves
the server.

**Stored as a partial, resolved in three layers:** built-in defaults ← `defaults.preferences`
← `projects.<id>.preferences`. Storing the fully resolved set was rejected because it would
freeze a project against any future change to `defaults` the moment it touched one field.

**Validation splits by direction.** A read is tolerant — `settings.json` is hand-editable and
predates the preference block, so `normalizeProjectPreferences` falls back field by field and
migrates legacy model ids once, server-side, for every client. A write is the API contract:
`parsePreferencesUpdate` returns 400 for an unknown engine, permission mode or pipeline.

**Legacy `localStorage` values are adopted once, then deleted.** Ignoring them was simpler
and was rejected — it would silently reset every existing installation's engine and model.
`legacy-prefs.ts` is self-contained so it can be deleted once no installation predates this.

**Consequence:** the e2e suite now mutates durable server state, which a fresh browser
context used to discard for free. Playwright runs against its own `ADHD_USER_HOME`/
`ADHD_HOME` on its own ports (`reuseExistingServer: false`, since isolation is only real on
a server the config started), and every spec resets preferences in `beforeEach`.

---

## 2026-07-23 — The project owns the folder; a run cannot choose its own

**Context:** after projects landed, two folders competed. The composer still carried a
"Working directory" field sent as `workspaceDir`, while the project already had a root — so a
run listed under project `my-app` could execute the agent anywhere, and the API accepted an
arbitrary absolute path from the browser as the directory an autonomous agent would run in.

**Decision:** the working directory is **derived from the project, never sent**.
`resolveWorkspace(paths, runId)` returns the project root; `workspaceDir` is gone from
`StartRunOptions`, the `POST /runs` body and the UI. A project's root is fixed when it is
registered, and the answer to "I want to work elsewhere" is to add another project.

**The home project keeps a scratch workspace per run** at
`~/.adhd/home/runs/<id>/workspace`, preserving the zero-setup path and giving the live e2e
canary a folder it cannot damage. Refusing engine runs without a project was rejected as a
worse first five minutes.

**Consequence:** `ensureProjectDataDir` also runs at run start, so the self-ignoring
`.adhd/.gitignore` exists even for projects registered before it was introduced — an agent
writing into a real repository must not leave run artifacts in `git status`.

**Rejected:** validating a client-supplied `workspaceDir` against the project root. It keeps
the field, the second source of truth and the UI ambiguity, for a knob no one asked for once
a project *is* a folder.

---

## 2026-07-22 — A project owns its `.adhd/`; the home project is not the repo

**Context:** every path the server wrote was anchored to `REPO_ROOT` — the ADHD source
checkout. A run against `C:/Dev/my-app` wrote its state, events, handoffs and scratch
workspace into the tool's own `.adhd/`, so every project shared one history, one settings
file and one set of personas.

**Decision:** a project is a directory that owns its own `.adhd/`, like `.git`. `paths.ts`
exports a `ProjectPaths` value (`id`, `root`, `dataDir`) passed to the run store, the skills
loader and workspace resolution; `REPO_ROOT` survives only for loading the tool's own `.env`.
A user-level registry at `~/.adhd/projects.json` lists known projects and names the active
one; requests may override per call with `X-ADHD-Project`.

The fallback for "no project selected" is a **home project under `~/.adhd/home`**, *not*
`REPO_ROOT`. The task originally specified the repo, which would have reproduced the bug
being fixed for every unconfigured run. `ADHD_HOME` still overrides it, which is what gives
component tests an isolated root.

**Consequence:** the ~75 runs already in the repo's `.adhd/runs/` are no longer listed
anywhere — accepted deliberately rather than writing migration code, since
`RunState.projectId` is now required and those runs belong to no project. The files were left
on disk, not deleted.

**Rejected:** one global store filtered by a project column. It leaves history inside the
tool, so uninstalling ADHD or cloning the repo elsewhere loses or duplicates a user's run
history.

---

## 2026-07-22 — Credentials are user-level, layered defaults over per-project

**Context:** engine API keys were written to `<repo>/.adhd/settings.json`. Moving settings
into each project's `.adhd/` would put secrets inside the user's git working tree.

**Decision:** engine connection settings live in `~/.adhd/settings.json` (mode `0600`),
shaped as `defaults` plus a `projects` map keyed by project id. A project inherits the
user-level default until it overrides an engine, so a newly added project runs immediately
instead of demanding a re-entered key.

**An inherited entry is copied before being edited.** Aliasing it wrote a project's key back
into `defaults` and leaked it to every other project — which is what `projects.comp.ts` now
guards.

Each created `<project>/.adhd/` ships a self-ignoring `.gitignore` (`*`), written with `wx`
so a user who deletes it to commit their history keeps it deleted.

---

## 2026-07-22 — Skills are layered, never seeded to disk

**Context:** `loadSkill` used to write the bundled persona to `.adhd/skills/<id>.md` on first
read. Those files then silently shadowed improved bundled constants and had to be
regenerated by hand.

**Decision:** resolution is bundled default → user-level override (`~/.adhd/skills/<id>.md`)
→ project addendum (`<project>/.adhd/skills/<id>.project.md`, appended). A full project
replacement stays supported for power users, but the addendum is the default path, and
**nothing is written to disk on read**. Composition is a pure function; the service only
reads files.

**Consequence:** the seeding assertion was inverted — `skills.spec.ts` now proves `loadSkill`
leaves both data roots empty.

---

## 2026-07-22 — Architect standard: one source, two generated consumers

**Context:** the Architect standard must exist as both a Claude Code skill
(`.claude/skills/architect/SKILL.md`) and an ADHD persona. Keeping two hand-written copies in
sync fails the first time someone edits one.

**Decision:** a single canonical source, [`architecture.md`](./architecture.md), with named
`gen:` blocks; [`scripts/generate-skills.mjs`](../scripts/generate-skills.mjs) emits both
consumers, and `pnpm gen:skills --check` fails the build on drift.

**Rejected:** a documented "edit both files" rule — zero enforcement, drifts silently. The
shared *rules* are generated into both; the skill and persona framing differ deliberately
(one addresses this repo, the other runs in a stranger's), so the two outputs are assembled
from different block sets rather than being byte-identical.

---

## 2026-07-22 — Server pure logic goes to `packages/server/src/domain/`, not `@adhd/core`

**Context:** rule A3 wants pure domain logic out of the service layer, and the candidates
(prompt/handoff/verdict logic, bundled skill defaults) are pure — so `@adhd/core` looked like
a home.

**Decision:** they moved to `packages/server/src/domain/`. `@adhd/core` stays the *shared*
contract imported by the browser UI; prompt builders and persona text have no business in the
client bundle. A server-only domain layer is the right seam.

---

## 2026-07-22 — TypeScript pinned to 6.0.3, not 7.x

**Context:** rule A7 asks to run the latest TypeScript. Latest at the time was **7.0.2**.

**Decision:** pinned to **6.0.3**. TypeScript 7 crashes the lint gate:
`typescript-eslint@8.65` declares a peer range of `>=4.8.4 <6.1.0`, and its
`typescript-estree` throws `TypeError: Cannot read properties of undefined (reading 'Cjs')`
under TS 7. 6.0.3 is the newest release the whole toolchain is green on. Revisit when
typescript-eslint ships a TS 7 peer range.

**Consequence:** TS 6 dropped automatic `@types` inclusion, so each project declares
`"types"` explicitly (`["node"]` for the server, `["vite/client"]` for the UI).
