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
| **Router** | One screen. Overlays are conditional renders in [`App.tsx`](../packages/ui/src/App.tsx). | A second genuine screen, or the need to deep-link a run (`/runs/:id`) — likely the first to fall. |
| **State library** | State is either server state (three hooks) or one screen's view state. | State shared between siblings that are not both children of `App`. |
| **CSS framework** | Theme switching is runtime, driven by a JS token object. | See §7 — the token gap is the real problem, not the absence of Tailwind. |
| **Data-fetching library** | Every read is one call and one owner; SSE carries updates, so there is no cache to invalidate. | Refetch-on-focus, retries, or two components needing the same request. |
| **Codegen for API types** | Types are *imported* from `@adhd/core`, which is stronger than generation — client and server reference one declaration. | Nothing. Keep it. |

**Rule.** Adding a dependency to `packages/ui` needs a dated entry in
[`decisions.md`](./decisions.md) naming which row above it invalidates.

`vite.config.ts` reads the repo-root `.env` via `loadEnv` so the UI and server agree
on ports, and proxies `/pipelines /projects /runs /health /settings /engines /fs` to
the server. **That proxy list must stay in sync with the routes mounted in
`packages/server/src/app.ts`** — a new server route is invisible to the dev UI until
it is added there.

---

## 2. Module map

`src/` is flat by design: one nesting level for `components/` and `hooks/`, no
barrel `index.ts` anywhere (**A2**), named exports only.

| Module | Role |
| --- | --- |
| [`main.tsx`](../packages/ui/src/main.tsx) | Bootstrap: `createRoot` + `StrictMode` + `ThemeProvider`. Nothing else ever goes here. |
| [`App.tsx`](../packages/ui/src/App.tsx) | The single composition root — top bar, run view vs. empty state, every overlay. See §6 for what it may own. |
| [`api.ts`](../packages/ui/src/api.ts) | **The only module that touches the network.** §4. |
| [`theme.ts`](../packages/ui/src/theme.ts) | Design tokens: palettes and status colours. Pure data + pure lookups. §7. |
| [`ThemeContext.tsx`](../packages/ui/src/ThemeContext.tsx) | The app's only React context — the selected palette, persisted to `localStorage`. |
| [`index.css`](../packages/ui/src/index.css) | The only stylesheet: reset, body font, `@keyframes adhd-*`, scrollbar. |
| [`run-utils.ts`](../packages/ui/src/run-utils.ts) | Pure run helpers (`isScratchWorkspace`, `childPath`, `resumeStageId`). Unit-tested. |
| [`run-events.ts`](../packages/ui/src/run-events.ts) | `applyEvent` — the pure reducer that advances `RunState`. Kept out of the hook so it needs no DOM to test. §5. |
| [`inline-md.tsx`](../packages/ui/src/inline-md.tsx) | Pure inline-markdown tokeniser → `ReactNode[]`. Unit-testable, no state. |
| [`legacy-prefs.ts`](../packages/ui/src/legacy-prefs.ts) | One-shot migration of pre-TASK-065 `localStorage` preferences to the server. Deletable once no user can still hold them. |
| [`mock-content.ts`](../packages/ui/src/mock-content.ts) | **Prototype fixture data still wired into a shipped component.** See Known gaps / TASK-075. |
| `hooks/` | `useProjects`, `useSettings`, `useRunEvents`, `useElapsed`. §5, §6. |
| `components/` | 16 flat component files, plus `setup/` — the one feature folder. §3. |
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
   [`StageFocusPanel.tsx`](../packages/ui/src/components/StageFocusPanel.tsx) is the
   reference. They live **in-file**: [`decisions.md`](./decisions.md) 2026-07-26
   ruled that A6 asks for *names*, not for a particular file, and that a sibling
   `*.styles.ts` would split one component's markup from its presentation. The one
   exception is a *shared* vocabulary inside a feature folder — builders two or more
   siblings use, which would otherwise be copied (`setup/setup-styles.ts`).
4. **Callbacks are `onX`; the parent owns the decision.** A component reports what
   happened (`onNodeClick`), it does not decide what it means.
5. **Presentational unless it has a reason not to.** A component that only renders
   its props is the default. Container behaviour — fetching, subscribing, deriving —
   belongs in a hook the component calls, or in `App`.

The split as it stands:

- **Pure presentational:** `StageNode`, `StatusIcon`, `GateMarker`, `Waveform`,
  `RunStatusBar`, `PipelineRow`, `TeamController`.
- **Local-state presentational:** `PipelineDropdown`, `EmptyState`, `SteerChat`,
  `VoiceControls` — own open/draft state, no I/O.
- **Container:** `ProjectSwitcher`, `FolderPicker`, `ProjectDrawer`,
  `HistoryDrawer`, `StageFocusPanel`, and inside `setup/` — `EngineStatusCard`,
  `EngineConnection`, `EngineModelPicker` — call `api.ts` themselves. `SetupModal`
  itself is chrome: nav rail, section switching, close.

**Rule.** A component file that passes ~300 lines is a signal, not a limit — look for
the axis it is splitting along and split there. `SetupModal.tsx` was the standing
counter-example at 1002 lines; TASK-073 split it along the `SetupSection` union it
already carried, and then split the harness section again along the same axis — one
component per block that owns its own state and server calls. That is the worked
example of the rule: nine files replace the one, the largest of them
(`EngineStatusCard`, 322 lines — half of it style builders) is one responsibility
and stays whole. `StageFocusPanel.tsx` at 625 lines is now the package's largest
component and the next candidate for the same treatment.

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
useProjects ──ready──▶ App effect ──▶ fetchRuns() ──▶ first non-terminal run
                                                              │
EmptyState ──onStart──▶ App.handleStart ──▶ startRun() ────────┤
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

The five things that are load-bearing:

1. **Nothing project-scoped loads until `projects.ready`.** `App`'s boot effect keys
   on `[projects.ready, projectId]` and clears the run view on every project switch.
   A test asserting on the project name must wait for the list — the switcher shows a
   placeholder for the first tick.
2. **The SSE subscription opens *before* the snapshot fetch.** Events arriving in the
   gap are buffered and replayed onto the snapshot once it lands, so nothing is lost.
   The log dedupe in `applyEvent` (matching `ts` + `message`) absorbs the overlap.
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
   run id is re-opened (view from history, restart-here).

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
| **`App`** | Cross-cutting view state that two or more children need | `activeRunId`, `focusedId`, `pinned`, `focusTab`, overlay flags |
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

`App` currently holds ~14 `useState` plus a `useRef`. That is defensible for one
screen with five overlays, and most of it is genuinely cross-cutting. The threshold
at which it stops being defensible: **when a piece of `App` state is read by exactly
one subtree**, it belongs in that subtree. The `tabChosenByUser` ref is the honest
edge case — it exists to distinguish a user's tab choice from the automatic switch to
`artifacts` on completion, which a plain `useState` cannot express without an extra
render.

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
| `ELEVATION` | `panelUp`, `barUp` | the two *untinted* shadows (`StageFocusPanel` and `TeamController` top edges). Tinted shadows are `d.elevation.*`. |
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
overlay. The two largest overlays — `SetupModal` and `HistoryDrawer` — meet none of
this today (Known gaps).

**Rule** for interactive elements: use a real `<button>`. Do not attach `onClick` to
a `<div>` — it costs keyboard and screen-reader access for nothing.

---

## 9. Testing the UI

Layers, and what each is for — see [`testing.md`](./testing.md) for the repo-wide
version and [`e2e-test-plan.md`](./e2e-test-plan.md) for the browser tiers.

| Layer | Runner | Location | Catches |
| --- | --- | --- | --- |
| Unit spec | Vitest `node` (`pnpm test`) | `packages/ui/test/*.spec.ts` | Pure functions — `run-utils`, `legacy-prefs`, `run-events` |
| Component | Vitest `jsdom` (`pnpm test`) | `packages/ui/test/*.comp.tsx` | Hooks and components, rendered, with `api.ts` mocked |
| E2E | Playwright (`pnpm e2e`) | `packages/ui/e2e/` | Real server, real browser |

The root [`vitest.config.ts`](../vitest.config.ts) declares two projects: **`node`**
takes `packages/*/test/**/*.{comp,spec}.ts`, and **`ui`** takes
`packages/ui/test/**/*.comp.tsx` under `jsdom`. **The extension picks the
environment** — a UI check that must render is a `.comp.tsx`; a UI check over a pure
function stays a `.spec.ts` and runs in `node` with the rest of the suite. Run one at
a time with `pnpm vitest run --project ui`.

**Rule.** A component test substitutes the network boundary and nothing else:
`vi.mock("../src/api")`, with the deferred-promise and SSE-callback plumbing in
`test/support/` rather than in a test body. `useRunEvents.comp.tsx` is the reference —
it drives the subscribe-buffer-replay ordering from §5 directly, which no e2e test can
observe. Because `react-hooks/rules-of-hooks` is an **error** across `packages/ui/**`,
hooks are exercised through `renderHook`, never called in a test body.

The Playwright suite runs in three tiers, deliberately: **free** (`ui-smoke`,
`project-switcher`, `project-drawer` — no engine spend), **seeded**
(`dev-test-flow` — a fabricated `RunState` injected by route interception, so
per-stage rendering is asserted at zero cost), and **live** (`live-dev-test`, skipped
unless `ADHD_E2E_LIVE=1`, described in-file as "a canary, not a proof"). It runs
against an isolated `ADHD_USER_HOME` under `os.tmpdir()` on its own ports
(9499 / 5199) — **a test must never touch the real `~/.adhd`**. Because preferences
are server state, every spec calls `resetPreferences(page)` in `beforeEach`.

**Rule.** Selectors are role- and text-based by default. Add a `data-testid` only
when a stable hook is genuinely needed — a status string, a dynamic stage node, a
list card. The current roster:

`open-project` · `workspace-chip` · `folder-picker` · `project-switcher` ·
`project-drawer` · `project-root` · `run-status` · `stage-node-<stageId>` ·
`stage-profession` · `stage-persona` · `stage-verdict` · `stage-scroll` ·
`artifact-preview` · `artifact-view-<view>` · `artifact-files` · `history-card` ·
`history-resume` · `history-restart` · `history-rerun`

---

## 10. Known gaps

Reviewed 2026-07-27 (TASK-071). Each is stated with its target, so the gap is
actionable rather than merely noted.

| # | Gap | Target | Task |
| --- | --- | --- | --- |
| 1 | ~~**No non-colour tokens.**~~ **Closed by TASK-072** — `SPACE`/`RADIUS`/`FONT`/`WEIGHT`/`ICON`/`Z`/`MOTION`/`EASE`/`ELEVATION` are in `theme.ts` (§7) and all 19 files are migrated. Nothing enforces their use, so a new literal can still creep in. | Prefer a token in review; a lint rule if drift appears. | — |
| 2 | **Fixture data ships.** `mock-content.ts` (hardcoded OAuth-demo reasoning/artifacts) is imported by `StageFocusPanel.tsx:9`; the Reasoning tab renders it regardless of the real run. | Real data where a source exists, an honest empty state where it does not, file deleted. | TASK-075 |
| 3 | ~~**No component tests.**~~ **Closed by TASK-074** — a `jsdom` vitest project takes `*.comp.tsx`, `applyEvent` is covered by `run-events.spec.ts`, and `useRunEvents.comp.tsx` drives the subscribe-buffer-replay ordering. Only that hook is covered so far; the components still have none. | Extend the layer to presentational components as they change. | — |
| 4 | ~~**`SetupModal.tsx` is 1002 lines.**~~ **Closed by TASK-073** — `components/setup/` holds one component per `SetupSection`, the harness section split again into `EngineStatusCard` / `EngineConnection` / `EngineModelPicker`, and the modal is chrome only. `StageFocusPanel.tsx` (625) inherits the title of largest component. | The same treatment for `StageFocusPanel` when it next changes. | — |
| 5 | **`SetupModal` and `HistoryDrawer` are not accessible overlays** — no `role="dialog"`, no `aria-modal`, no Escape, no focus management, while four smaller surfaces do handle Escape. | The §8 overlay rule applied to both. | — |
| 6 | **Non-functional mock surfaces.** `VoiceControls` (`cycleVS` just advances `idle → listening → transcribing → speaking` on click), `SteerChat` (no send endpoint) and `Waveform` are visual placeholders. | Documented here so no styling or test effort is spent on them; keep-or-cut is a product call. | — |
| 7 | **Hand-mirrored response types.** `DirectoryListing`, `WorkspaceFile`, `EngineActionResult`, `AddProjectResult` are declared in `api.ts` against the Hono handlers, and nothing prevents drift. | Move each into `@adhd/core` when its shape stabilises. | — |
| 8 | **Theme is light-only.** No dark values, no `prefers-color-scheme`. | A decision, not a bug — recorded so it is not discovered mid-redesign. | — |

Minor: `packages/ui/tmp-devtest.png` is a committed scratch screenshot;
`AGENTS.md` records version `0.6.1` while `package.json` is well past it.
