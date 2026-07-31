# UI Architecture

> The frontend tier in full — the one file to load before working on
> [`packages/ui`](../packages/ui). [`architecture.md`](./architecture.md) states the
> nine universal rules (**A1**–**A9**) and the system design; this document is
> **A9's frontend clause expanded**, and it is both *descriptive* (the shape that
> exists today, so nothing has to be re-derived from source) and *prescriptive*
> (paragraphs marked **Rule** are binding on new code). Rationale for a specific
> choice belongs in [`decisions.md`](./decisions.md); the "why" behind non-obvious
> code belongs in [`implementation-notes.md`](./implementation-notes.md) `## UI`.
> **Known gaps** at the end records what is *not* yet true.

---

## 1. Stack, and what is deliberately absent

React 19 + Vite 6, TypeScript strict. The full dependency list is four entries:

| Dependency | Role |
| --- | --- |
| `react` / `react-dom` | ^19.1.0 |
| `lucide-react` | The only icon set. Do not add a second. |
| `@adhd/core` | Shared types **and** pure logic, consumed as TypeScript *source* |

That is the entire runtime surface. The absences are decisions, not omissions —
each is listed with the trigger that would reverse it, so nobody re-litigates them
by accident and nobody defends them past their usefulness.

| Absent | Why it is fine today | What would change it |
| --- | --- | --- |
| ~~**Router**~~ | **Fell to TASK-077**, on the trigger it predicted. There is a router now — a hand-rolled one: [`route.ts`](../packages/ui/src/route.ts) (pure, unit-tested) plus [`useRoute`](../packages/ui/src/hooks/useRoute.ts), a `hashchange` listener. **Hash, not path**, because `/runs` belongs to the API and is proxied — see [`decisions.md`](./decisions.md) 2026-07-27. | A second route pattern with nesting, or route-level data loading, would justify `react-router`. TASK-093 added `#/milestones/:id` as a *sibling* of `#/runs/:id` — two flat patterns over one union, still not nesting. |
| **State library** | State is either server state (three hooks) or one screen's view state. | State shared between siblings that are not both children of `App`. |
| **CSS framework** | Theme switching is runtime, driven by a JS token object. | See §7 — the token gap is the real problem, not the absence of Tailwind. |
| **Data-fetching library** | Every read is one call and one owner; SSE carries updates, so there is no cache to invalidate. | Refetch-on-focus, retries, or two components needing the same request. |
| **Codegen for API types** | Types are *imported* from `@adhd/core`, which is stronger than generation — client and server reference one declaration. | Nothing. Keep it. |

**Rule.** Adding a dependency to `packages/ui` needs a dated entry in
[`decisions.md`](./decisions.md) naming which row above it invalidates.

`vite.config.ts` reads the repo-root `.env` via `loadEnv` so the UI and server agree
on ports, and proxies `/pipelines /projects /runs /milestones /health /settings
/engines /fs` to the server. **That proxy list must stay in sync with the routes
mounted in `packages/server/src/app.ts`** — a new server route is invisible to the
dev UI until it is added there.

---

## 2. Module map

`src/` is flat by design: one nesting level for `components/` and `hooks/`, no
barrel `index.ts` anywhere (**A2**), named exports only.

| Module | Role |
| --- | --- |
| [`main.tsx`](../packages/ui/src/main.tsx) | Bootstrap: `createRoot` + `StrictMode` + `ThemeProvider`. Nothing else ever goes here. |
| [`App.tsx`](../packages/ui/src/App.tsx) | The single composition root — top bar, run rail, run view vs. composer, every overlay. See §6 for what it may own. |
| [`api.ts`](../packages/ui/src/api.ts) | **The only module that touches the network.** §4. |
| [`route.ts`](../packages/ui/src/route.ts) | Pure hash routing — `parseRoute` / `routeHash` over a `Route` union of home, `#/runs/:id` and `#/milestones/:id`. Unit-tested. |
| [`run-list.ts`](../packages/ui/src/run-list.ts) | Pure rail helpers — `mergeSummary` (replace-or-prepend by id), `firstActiveRunId`, `runsForFeature`, `milestoneRefreshKey`. Unit-tested. |
| [`transcript.ts`](../packages/ui/src/transcript.ts) | Pure `buildTranscript(run)` — stage logs + `run.messages` → one ordered thread. Unit-tested. |
| [`theme.ts`](../packages/ui/src/theme.ts) | Design tokens: palettes and status colours. Pure data + pure lookups. §7. |
| [`ThemeContext.tsx`](../packages/ui/src/ThemeContext.tsx) | The app's only React context — the selected palette, persisted to `localStorage`. |
| [`index.css`](../packages/ui/src/index.css) | The only stylesheet: reset, body font, `@keyframes adhd-*`, scrollbar. |
| [`run-utils.ts`](../packages/ui/src/run-utils.ts) | Pure run helpers (`isScratchWorkspace`, `childPath`, `resumeStageId`, `stagePresentation`). Unit-tested. |
| [`run-events.ts`](../packages/ui/src/run-events.ts) | `applyEvent` — the pure reducer that advances `RunState`. Kept out of the hook so it needs no DOM to test. §5. |
| [`inline-md.tsx`](../packages/ui/src/inline-md.tsx) | Pure inline-markdown tokeniser → `ReactNode[]`. Unit-testable, no state. |
| [`legacy-prefs.ts`](../packages/ui/src/legacy-prefs.ts) | One-shot migration of pre-TASK-065 `localStorage` preferences to the server. Deletable once no user can still hold them. |
| `hooks/` | `useProjects`, `useSettings`, `useRunEvents`, `useRunList`, `useMilestones`, `useRoute`, `useFollowScroll`, `useElapsed`. §5, §6. |
| `components/` | 15 flat component files, plus two feature folders — `setup/` and `run/`. §3. |
| `test/` | Vitest unit specs. Never inside `src/` — `src/` is what ships, and a colocated spec lands in `dist/`. |
| `e2e/` | Playwright. Its own runner, own config, own ports. §9. |

**Rule.** `components/` stays flat until a *feature* owns four or more files that no
other feature imports; then it gets a folder named for the feature, not for the file
kind. Do not create `components/ui/`, `components/common/`, or a barrel.
`components/setup/` is the only feature folder so far (TASK-073) and the pattern to
copy: the entry component keeps the feature's name and public types, its siblings are
named for what they own, and the builders shared by two or more of them — and only
those — sit in one `setup-styles.ts` beside them.

---

## 3. Component conventions

Every component in this codebase follows the same five conventions. New ones match
them without exception.

1. **Named export, named props interface.** `export function X`, with
   `export interface XProps` declared directly above it (**A6** — no anonymous
   inline prop objects).
2. **The theme arrives as a prop, not from context.** Every visual component takes
   `d: Dir`. Only `App` calls `useTheme()`. This is what keeps components renderable
   in isolation — a component test needs no provider, just a `Dir`.
3. **Styles are named constants or builders, in the component's own file.**
   Static styles become module-level constants (`const SPLIT_PANE: CSSProperties`);
   theme- or state-dependent ones become small builders
   (`function panelStyle(d: Dir): CSSProperties`).
   [`EngineStatusCard.tsx`](../packages/ui/src/components/setup/EngineStatusCard.tsx) is
   the reference. They live **in-file**: [`decisions.md`](./decisions.md) 2026-07-26
   ruled that A6 asks for *names*, not for a particular file, and that a sibling
   `*.styles.ts` would split one component's markup from its presentation. The one
   exception is a *shared* vocabulary inside a feature folder — builders two or more
   siblings use, which would otherwise be copied (`setup/setup-styles.ts`,
   `run/run-styles.ts`).
4. **Callbacks are `onX`; the parent owns the decision.** A component reports what
   happened (`onNodeClick`), it does not decide what it means.
5. **Presentational unless it has a reason not to.** A component that only renders
   its props is the default. Container behaviour — fetching, subscribing, deriving —
   belongs in a hook the component calls, or in `App`.

The split as it stands:

- **Pure presentational:** `StageNode`, `StatusIcon`, `GateMarker`, `Waveform`,
  `RunStatusBar`, `PipelineRow`, `TeamController`, `RunRail`, `RunCard`,
  `MilestoneDashboard`, `MilestoneFeatureCard`, and inside `run/` — `CloseoutPanel`.
- **Local-state presentational:** `PipelineDropdown`, `EmptyState`, `VoiceControls`,
  and inside `run/` — `ChatPanel`, `LogsPanel` — own open/draft state, no I/O.
- **Container:** `ProjectSwitcher`, `FolderPicker`, `ProjectDrawer`,
  `run/ArtifactsPanel`, and inside `setup/` — `EngineStatusCard`,
  `EngineConnection`, `EngineModelPicker` — call `api.ts` themselves. `SetupModal`
  and `RunTabs` are chrome: they switch between surfaces and own nothing else.

`RunRail` is worth noting as the pattern for new surfaces: it fetches nothing. The
list, its loading state and its live updates all arrive as props from `useRunList`,
which is what lets the rail be exercised without a network at all.

**Rule.** A component file that passes ~300 lines is a signal, not a limit — look for
the axis it is splitting along and split there. `SetupModal.tsx` was the standing
counter-example at 1002 lines; TASK-073 split it along the `SetupSection` union it
already carried, and then split the harness section again along the same axis — one
component per block that owns its own state and server calls. That is the worked
example of the rule: nine files replace the one, the largest of them
(`EngineStatusCard`, 322 lines — half of it style builders) is one responsibility
and stays whole. TASK-082 applied the same treatment to the 586-line
`StageFocusPanel`, which is gone: `components/run/` replaces it with one file per
run view. Nothing in `packages/ui` is over ~330 lines now.

---

## 4. The network seam

**Rule.** [`api.ts`](../packages/ui/src/api.ts) is the only module in `packages/ui`
that may call `fetch` or construct an `EventSource`. Components and hooks import
functions from it. A `fetch` anywhere else is a review failure (**A2** — depend on
the seam, not the transport).

What that seam guarantees:

- **`API_BASE = ""`.** Everything is same-origin; the Vite proxy handles dev. No
  component ever knows a host or port.
- **Project scoping is automatic.** A module-level `activeProjectId`, kept current by
  `useProjects` via `setActiveProjectId`, is stamped onto every request as
  `X-ADHD-Project`. Callers never pass a project id. The server still falls back to
  its own active project, so the browser copy is never the sole source of truth.
- **Errors are `Error`s.** `requestJson` unwraps a `{ error }` body into a thrown
  `Error` with the server's message. Callers `catch` and surface a string; they never
  inspect status codes.
- **Types are shared, not mirrored.** `RunState`, `RunEvent`, `Project`,
  `SettingsView`, `StageStatus`, `EngineId` and the rest are imported from
  `@adhd/core`. A handful of response shapes are declared in `api.ts` itself
  (`DirectoryListing`, `WorkspaceFile`, `EngineActionResult`, `AddProjectResult`) —
  these are hand-mirrored from the Hono handlers and **can drift**. Prefer moving a
  shape into `@adhd/core` when both sides need it.

`@adhd/core` is consumed as TypeScript **source** (a Vite alias plus a tsconfig
`paths` entry), not as built output — so a core change is visible to the UI without
a build step. It follows that **core must stay browser-safe**: no `node:` imports,
ever.

---

## 5. Data flow: a run, end to end

This is the section most expensive to re-derive from source. It is the one to read
before touching anything run-related.

```
useProjects ──ready──▶ useRunList(projectId) ──▶ RunRail
                          │                           │
             fetchRuns() + /runs/events SSE     onOpen(runId)
                          │                           │
             first non-terminal run ──▶ replace(#/runs/:id) ◀┘
                                                              │
EmptyState ──onStart──▶ App.handleStart ──▶ startRun() ────────┤
                                                              ▼
                                              useRoute() ──▶ routeRunId
                                                              │
                                                              ▼
                                                    useRunEvents(runId)
                                                              │
                  ┌───────────────────────────────────────────┤
                  ▼                                           ▼
        subscribeRunEvents (SSE)                        fetchRun (snapshot)
        events buffered while !ready                           │
                  └────────── replay buffer ───────────────────┘
                                    │
                                    ▼
                        applyEvent(run, event) ──▶ setRun
                                    │
                       run.completed / terminal ──▶ source.close()
```

**A run's body is three tabs over one derived ordering.** `buildTranscript(run)`
merges the agents' narration (stage logs, mapped by level onto prose / tool rows /
notices) with `run.messages`, which holds only the user's own turns. `LogsPanel`
shows all of it; `ChatPanel` shows `conversationOnly()` of it — the same ordering
minus `tool` items, which is where tool calls, tool errors and engine chatter all
land. **The chat is a projection of the log, never a second source.** `RunTabs`
owns which tab is open, so `App` does not; a stage-node click sets `focusedId`,
which filters Logs and Artifacts rather than opening a pane.

**A message posted from the composer either answers a question or is just
recorded.** `POST /runs/:id/messages` appends to `run.messages` and emits
`run.message`. If a stage is `asking`, the same call releases the durable park and
the stage resumes its CLI session with that text as the prompt (TASK-079). If not,
the message is stored and shown, and nothing reads it — that is still true for
ordinary mid-run steering.

**`asking` is not `awaiting`.** `awaiting` is a human *gate* (gold, "Approve");
`asking` is a human *answer* (violet, the composer). They are separate statuses so
neither control has to mean two things.

**There are two independent SSE channels**, and they answer different questions.
`/runs/:id/events` carries one run in full detail and closes when that run ends;
`/runs/events` carries a compact `RunSummary` for *every* run in the project on each
non-log event, and stays open for the life of the page. The rail reads the second,
the run view reads the first. Never widen the summary channel into a second copy of
`RunState` — the reason it exists is that logs must not ride it
([`decisions.md`](./decisions.md) 2026-07-27).

**Milestones have no channel of their own, and do not need one.** Every server-side
milestone mutation — a feature reaching `completed` or `needs_attention`, autorun
chaining the next run — is a side effect of a milestone run reaching a terminal
status, which the summary channel already carries. `useMilestones` therefore refetches
on `milestoneRefreshKey(runs)`: a string built from the id and status of the runs that
carry a `milestoneId`, sorted, so it changes exactly when a refetch would see
something new and stays stable under a rail reorder. **Rule:** do not add a third SSE
channel for milestones without first showing that this derivation misses an update.

Refetching on a key rather than on the project alone has three consequences, all
load-bearing and all found in review:

- A **project switch** must clear `milestones`/`ready` first, or the rail shows the
  previous project's milestones while the new fetch is in flight — which is why
  `useMilestones` tracks `loadedProject`. A **refresh of the same project** must *not*
  clear them, or the rail blanks on every run status change. This is the one place
  `useMilestones` deviates from `useRunList`, which resets unconditionally because its
  effect has no refresh key.
- `reload()` **never throws.** It reports a refresh failure through `error`, so a
  `startNext` whose run *was* created successfully still returns that run for `App` to
  navigate to. A throwing reload would report a start failure for a run that is
  already going, and strand the user on the dashboard.
- Mutations clear `error` **up front**, never after their reload — otherwise a
  successful start would wipe the refresh error the reload just recorded.

The seven things that are load-bearing:

1. **Nothing project-scoped loads until `projects.ready`.** `useRunList` is inert
   until then, and re-subscribes on every project switch.
   A test asserting on the project name must wait for the list — the switcher shows a
   placeholder for the first tick.
2. **The SSE subscription opens *before* the snapshot fetch.** Events arriving in the
   gap are buffered and replayed onto the snapshot once it lands, so nothing is lost.
   The log dedupe in `applyEvent` (matching `ts` + `message`) absorbs the overlap.
   `useRunList` does the same dance for the same reason, with `mergeSummaries` as its
   replay.
3. **`applyEvent` is a pure reducer** — `structuredClone`, mutate the clone, return
   it. It is the single place run state advances, and it lives in its own module
   ([`run-events.ts`](../packages/ui/src/run-events.ts)) rather than inside the hook
   precisely so it stays testable without a DOM; `run-events.spec.ts` covers all nine
   event types plus the dedupe.
4. **The stream is closed explicitly** on `run.completed`, and on a terminal status in
   the snapshot. Without that, `EventSource` reconnects forever once the server closes
   it.
5. **Re-attaching is a key bump.** `useRunEvents(runId, resubscribeKey)` — `App`
   increments `resubKey` in `attachRun` to force a fresh subscription when the same
   run id is re-opened (open from the rail, restart-here). It matters most when the
   route does *not* change: restarting the run you are already looking at.
6. **The URL owns which run is open.** `activeRunId` is `routeRunId(route)`, not
   state. Opening a run is a navigation, so back/forward work and a run is linkable.
7. **The boot auto-attach fires once per project.** If the route is home and the
   project has a non-terminal run, `App` *replaces* the route with it — guarded by an
   `attachedProject` ref so it cannot yank the user back to a run after they have
   deliberately clicked "New run".

**Rule.** Run state is never mutated outside `applyEvent`. A mutation that needs to
happen in response to a user action goes to the server and comes back as an event —
that is what keeps one writer and one ordering.

---

## 6. State ownership

Four tiers. Put state in the **lowest** one that works.

| Tier | Holds | Examples |
| --- | --- | --- |
| **Server** | Anything that must survive reload or be shared across clients | Engine, model, permission mode, pipeline, project list (TASK-065 moved preferences here from `localStorage`) |
| **Hook** | Server state plus its lifecycle, reusable | `useProjects`, `useSettings`, `useRunEvents` |
| **`App`** | Cross-cutting view state that two or more children need | `focusedId` (the pipeline row sets it, `RunTabs` filters on it), overlay flags, `starting`/`sending`. (`activeRunId` is the URL now; the focused tab lives in `RunTabs`.) |
| **Component** | State no one else can observe | Dropdown open, textarea draft, file selection |

The hooks each return a single named controller interface — `ProjectsController`,
`SettingsController` — rather than a tuple or a loose object. **Rule:** a hook's
return type is a named exported interface (**A6**).

Two patterns worth copying:

- **Optimistic write, server-authoritative read** (`useSettings.push`): merge the
  update locally with `mergeProjectPreferences` for instant feedback, `PUT`, apply the
  server's response, and `reload()` on failure. The server's view always wins.
- **Whole-view replacement** (`useProjects.apply`): every mutation returns a fresh
  `ProjectsView` that is applied wholesale. No partial patching of a list.

`App` holds ~9 `useState` plus one `useRef`, down from ~14 — TASK-077 and TASK-078
applied the threshold below rather than restating it. **When a piece of `App` state
is read by exactly one subtree, it belongs in that subtree.** Three moved out on
that rule: `activeRunId` became the URL (`routeRunId(route)`), the focused tab moved
into `RunTabs` — the only reader — and `pinned` stopped existing when the panel
stopped auto-opening. The remaining `useRef`,
`attachedProject`, is the honest edge case: it makes the boot auto-attach fire once
per project, which a `useState` cannot express without an extra render.

---

## 7. The design system

### What is tokenised today

All of it lives in [`theme.ts`](../packages/ui/src/theme.ts) as pure data:

| Token set | Shape | Used for |
| --- | --- | --- |
| `DIRS: Record<DirId, Dir>` | Three palettes — `indigo` (default), `sakura`, `forest` | Chrome. Each `Dir` has accent (×5), `bg`/`surface`/`surface2`, `border`, text (×3), shadow (×3), `runBorder`. |
| `SPEC_COLOR` | `{ main, soft, gradient }` per stage id | Stage identity — `intake`, `requirements`, `design`, `implementation`, `review`, `test`, `release`, `deploy`. Independent of the palette. |
| `STATUS_COLORS` / `statusClr` | `{ text, bg, dot }` per `StageStatus` | Stage status. Semantic, not decorative — do not repaint per palette. |
| `RUN_PILL` / `runDot` | per `RunStatus` | Run status. `runDot` is palette-aware; `RUN_PILL` is not. |
| `GOLD` / `GOLD_SOFT` | two constants | Human gates, exclusively. Gold means "a human must act". |
| `SANS` / `MONO` | Nunito / JetBrains Mono | Loaded from Google Fonts in `index.html`. |

Each `Dir` also carries `border` / `borderStrong` (the emphasis border, used for the
dot-grid background) and `elevation: { sm, md, lg }` — the shadows are palette-tinted,
which is why they live on the palette rather than in the shared scale below.

The palette is selected in Setup → Appearance and persisted by `ThemeContext` under
`localStorage["adhd.direction"]`.

### The non-colour scales

Beside the palettes, `theme.ts` exports the scales every component styles against
(TASK-072). They were **extracted** from what the components already used, not
designed — see [`decisions.md`](decisions.md) 2026-07-27 for the values that were
snapped together and why.

| Scale | Steps | Used for |
| --- | --- | --- |
| `SPACE` | `xxs` 2 → `x5l` 40 (10 steps) | padding, gap, margin. Composite paddings read `` `${SPACE.sm}px ${SPACE.xl}px` ``. |
| `RADIUS` | `xs` 2 → `pill` 20, plus `round: "50%"` | `borderRadius`. `md` (8) is the chip radius, `lg` (10) the control radius. |
| `FONT` | `xxs` 9 → `xxl` 16, plus `display` 26 | `fontSize`. |
| `WEIGHT` | `medium` 500 → `heavy` 800 | `fontWeight`. |
| `ICON` | `xs` 10, `sm` 12, `md` 14, `lg` 16 | the lucide `size` prop. |
| `Z` | `dropdown` 30, `popover` 40, `overlay` 50, `overlayNested` 60 | `zIndex`. `overlayNested` is for a surface opened *from* an overlay — the `FolderPicker` over `SetupModal`. |
| `MOTION` / `EASE` | `instant`…`slow`; `spin`/`pulse`/`ring`/`shimmer` | every `transition` and `animation` duration. |
| `ELEVATION` | `barUp` | the one *untinted* shadow (`TeamController`'s top edge). Tinted shadows are `d.elevation.*`. |
| `focusRing(soft)` | — | the repeated `0 0 0 3px <accentSoft>` ring. |

`index.css` holds only the six `@keyframes adhd-*` — **no durations**. A component
applies one with the `animation` shorthand and a `MOTION` token, so `theme.ts` is the
single source for timing.

**Two rules when styling.** A one-off structural dimension (the 50px top bar, a drawer
width, a dialog width) gets a named `const` in *its own component* — a shared token
per call site would be worse than the literal. And style builders stay in the
component's file (**A6**); only the scales, and a feature folder's own shared
vocabulary (§3), are shared.

Two further constraints on any visual work:

- **The theme is light-only.** No `Dir` defines dark values and nothing reads
  `prefers-color-scheme`. Dark mode is a new palette *shape*, not a new palette.
- **`design/` is a prototype, not a source.** [`design/README.md`](../design/README.md)
  is explicit: where the two disagree, `packages/ui` is authoritative. Do not port
  from it without deciding the change on its own merits.

---

## 8. Accessibility and interaction

The baseline that already exists, and is the pattern to copy:

- **Dropdowns are listboxes.** `PipelineDropdown` and `ProjectSwitcher` both set
  `aria-haspopup="listbox"` / `aria-expanded` on the trigger, `role="listbox"` on the
  menu, and `role="option"` + `aria-selected` on each item.
- **Escape closes transient surfaces** — `PipelineDropdown`, `ProjectSwitcher`,
  `FolderPicker`, `ProjectDrawer` each register a `document` `keydown` listener and
  remove it on unmount.
- **Enter submits** where a single-line input is the whole form (`EmptyState`,
  API-key and custom-model fields in `SetupModal`).
- **Icon-only buttons carry `aria-label`** (`ProjectDrawer`'s close button).

**Rule** for new overlays: `role="dialog"` + `aria-modal="true"`, Escape to close,
focus moved in on open and restored on close, and no focusable content behind the
overlay. `SetupModal` meets none of this today (Known gaps). The run list is no
longer an overlay at all — TASK-077 made it a persistent `<nav aria-label="Runs">`
of real `<button>`s, with `aria-current` marking the open run.

**Rule** for interactive elements: use a real `<button>`. Do not attach `onClick` to
a `<div>` — it costs keyboard and screen-reader access for nothing.

---

## 9. Testing the UI

Layers, and what each is for — see [`testing.md`](./testing.md) for the repo-wide
version and [`e2e-test-plan.md`](./e2e-test-plan.md) for the browser tiers.

| Layer | Runner | Location | Catches |
| --- | --- | --- | --- |
| Unit spec | Vitest `node` (`pnpm test`) | `packages/ui/test/*.spec.ts` | Pure functions — `run-utils`, `legacy-prefs`, `run-events`, `route`, `run-list`, `transcript` |
| Component | Vitest `jsdom` (`pnpm test`) | `packages/ui/test/*.comp.tsx` | Hooks and components, rendered, with `api.ts` mocked — `useRunEvents`, `useRunList`, `useMilestones`, `RunTabs`, `MilestoneDashboard`, `MilestonePlanPanel`, `CloseoutPanel` |
| E2E | Playwright (`pnpm e2e`) | `packages/ui/e2e/` | Real server, real browser |

The root [`vitest.config.ts`](../vitest.config.ts) declares two projects: **`node`**
takes `packages/*/test/**/*.{comp,spec}.ts`, and **`ui`** takes
`packages/ui/test/**/*.comp.tsx` under `jsdom`. **The extension picks the
environment** — a UI check that must render is a `.comp.tsx`; a UI check over a pure
function stays a `.spec.ts` and runs in `node` with the rest of the suite. Run one at
a time with `pnpm vitest run --project ui`.

**Rule.** A component test substitutes the network boundary and nothing else:
`vi.mock("../src/api")`, with the deferred-promise and SSE-callback plumbing in
`test/support/` rather than in a test body (`deferred.ts` holds what the two stream
fakes share). `useRunEvents.comp.tsx` is the reference —
it drives the subscribe-buffer-replay ordering from §5 directly, which no e2e test can
observe. Because `react-hooks/rules-of-hooks` is an **error** across `packages/ui/**`,
hooks are exercised through `renderHook`, never called in a test body.

The Playwright suite runs in three tiers, deliberately: **free** (`ui-smoke`,
`project-switcher`, `project-drawer` — no engine spend), **seeded**
(`dev-test-flow` and `run-question` — a fabricated `RunState` injected by route
interception, so per-stage rendering and the parked-question UI are asserted at
zero cost), and **live** (`live-dev-test`, skipped
unless `ADHD_E2E_LIVE=1`, described in-file as "a canary, not a proof"). It runs
against an isolated `ADHD_USER_HOME` under `os.tmpdir()` on its own ports
(9499 / 5199) — **a test must never touch the real `~/.adhd`**. Because preferences
are server state, every spec calls `resetPreferences(page)` in `beforeEach`.

**Rule.** Selectors are role- and text-based by default. Add a `data-testid` only
when a stable hook is genuinely needed — a status string, a dynamic stage node, a
list card. The current roster:

`open-project` · `workspace-chip` · `folder-picker` · `project-switcher` ·
`project-drawer` · `project-root` · `run-status` · `run-cost` ·
`run-tab-<chat|logs|artifacts>` · `stage-node-<stageId>` · `stage-profession` ·
`stage-persona` · `stage-verdict` · `stage-scroll` · `artifact-preview` ·
`artifact-view-<workflow|closeout|files>` · `artifact-files` · `run-card` ·
`run-resume` · `run-restart` · `run-rerun` · `chat-thread` · `chat-composer` ·
`chat-question` · `plan-milestone` · `milestone-plan-editor` ·
`approve-milestone-plan` · `milestone-card` · `milestone-dashboard` ·
`milestone-progress` · `milestone-autorun` · `milestone-start-next` ·
`milestone-finalize` · `milestone-feature` · `milestone-feature-run` ·
`closeout-panel` · `closeout-created-task` · `closeout-validation-errors`

`milestone-card` and `milestone-feature` also carry `data-milestone-id` /
`data-feature-id`, which is what the e2e suite locates on: the e2e home is durable,
so seeded milestones survive between runs and a name filter can match two.

---

## 10. Known gaps

Reviewed 2026-07-27 (TASK-071). Each is stated with its target, so the gap is
actionable rather than merely noted.

| # | Gap | Target | Task |
| --- | --- | --- | --- |
| 1 | ~~**No non-colour tokens.**~~ **Closed by TASK-072** — `SPACE`/`RADIUS`/`FONT`/`WEIGHT`/`ICON`/`Z`/`MOTION`/`EASE`/`ELEVATION` are in `theme.ts` (§7) and all 19 files are migrated. Nothing enforces their use, so a new literal can still creep in. | Prefer a token in review; a lint rule if drift appears. | — |
| 2 | ~~**Fixture data ships.**~~ **Closed by TASK-082** — `mock-content.ts` is deleted and there is no Reasoning tab. The server captures no reasoning trace, so a tab for it could only ever have shown fiction; if a real source lands, it earns a tab then. | — | — |
| 3 | ~~**No component tests.**~~ **Closed by TASK-074** — a `jsdom` vitest project takes `*.comp.tsx`, `applyEvent` is covered by `run-events.spec.ts`, and `useRunEvents.comp.tsx` drives the subscribe-buffer-replay ordering. Only that hook is covered so far; the components still have none. | Extend the layer to presentational components as they change. | — |
| 4 | ~~**`SetupModal.tsx` is 1002 lines.**~~ **Closed by TASK-073** — `components/setup/` holds one component per `SetupSection`, the harness section split again into `EngineStatusCard` / `EngineConnection` / `EngineModelPicker`, and the modal is chrome only. **TASK-082 did the same to `StageFocusPanel` (586)**, which `components/run/` replaces. | — | — |
| 5 | **`SetupModal` is not an accessible overlay** — no `role="dialog"`, no `aria-modal`, no Escape, no focus management, while four smaller surfaces do handle Escape. (`HistoryDrawer` shared this and was deleted by TASK-077.) | The §8 overlay rule applied. | — |
| 6 | **Non-functional mock surfaces.** `VoiceControls` (`cycleVS` just advances `idle → listening → transcribing → speaking` on click) and `Waveform` are visual placeholders. (`SteerChat` was the third and was deleted by TASK-078, replaced by `ChatPanel` over a real endpoint.) | Documented here so no styling or test effort is spent on them; keep-or-cut is a product call. | — |
| 9 | **An answer resumes a parked stage; an unprompted message still goes nowhere.** TASK-079 wired the `asking` path end to end. A message sent while no stage is asking is recorded and displayed only. | Decide whether mid-run steering should reach the *next* stage's prompt, or be refused. | — |
| 10 | **Cursor is `conversational: false`.** The CLI is not installed on the machine that built TASK-079, so its session-id emission is unverified; claiming the capability from docs alone would fail silently at runtime. | Verify `cursor-agent --resume` and its stream-json session id, then flip the flag. | — |
| 7 | **Hand-mirrored response types.** `DirectoryListing`, `WorkspaceFile`, `EngineActionResult`, `AddProjectResult` are declared in `api.ts` against the Hono handlers, and nothing prevents drift. | Move each into `@adhd/core` when its shape stabilises. | — |
| 8 | **Theme is light-only.** No dark values, no `prefers-color-scheme`. | A decision, not a bug — recorded so it is not discovered mid-redesign. | — |

Minor: `packages/ui/tmp-devtest.png` is a committed scratch screenshot;
`AGENTS.md` records version `0.6.1` while `package.json` is well past it.
