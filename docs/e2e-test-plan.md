# E2E Test Plan — the browser layer

Regression coverage for what the **React app** does with a run. This is the
narrowest layer in [`testing.md`](./testing.md) — read that first for the layer
policy. Run *semantics* (abort → cancelled, gates, restart, per-stage statuses,
handoff chaining, error contracts) live in the component suite under
`packages/server/test/` and are deliberately **not** duplicated here.

**Guiding principle — cheapest tier that can prove it.** A check belongs in the
lowest tier that can catch its failure. Everything except the live canary costs
**zero tokens**: the free tier never starts a run that spawns an engine, and the
seeded tier fabricates the run entirely.

A browser test is `packages/ui/e2e/**/*.e2e.ts`. Playwright's `testMatch` looks
for that extension, and `.spec.ts` means a Vitest unit spec — see `testing.md`.

| Tier | Cost | What it proves | Where |
| --- | --- | --- | --- |
| Free | none | Composer, Setup, project switching, and the milestone dashboard, against a real server | `ui-smoke.e2e.ts`, `project-drawer.e2e.ts`, `project-switcher.e2e.ts`, `milestone/milestone-dashboard.e2e.ts` |
| Seeded | none | Per-stage rendering, the initiative thread, parked runs and the product preview, from a fabricated `RunState` served by route interception | `run/dev-test-flow.e2e.ts`, `run/run-limit.e2e.ts`, `run/run-question.e2e.ts`, `run/product-preview.e2e.ts`, `orchestration/orchestrator-flow.e2e.ts` |
| Built | none | That the compiled bundle actually executes in a browser | `built-app.e2e.ts` (opt-in) |
| Live | ≈ $0.01 | Canary that the real CLI still integrates | `run/live-dev-test.e2e.ts` (opt-in) |

## Running

```bash
pnpm e2e
```

That runs the free and seeded tiers; built and live are skipped. The same thing
from the package is `pnpm --filter @isotopy/ui e2e`.

Playwright auto-starts `pnpm dev` and waits on `/health` (which is proxied to
the API server, so it covers both processes). The suite runs single-worker on
purpose: every spec drives the same server and the same in-memory run store.

**The suite gets its own machine state.** Since preferences became server-side
(TASK-065), a spec that picks a pipeline writes to `~/.isotopy/settings.json` — so
Playwright starts the server with `ISOTOPY_USER_HOME` and `ISOTOPY_HOME` pointed at
`<tmp>/isotopy-e2e` and its own ports (`9499`/`5199`), and does **not** reuse an
already-running dev server: the isolation is only real on a server this config
started. Your own settings, projects and run history are never touched, and
`pnpm dev` can stay running on 5173 while the suite works.

Preferences also outlive a browser context, which a fresh `localStorage` used to
discard for free. Every spec therefore calls `resetPreferences` in a
`beforeEach` (`e2e/support/preferences.ts`) — without it, the pipeline chosen in
one spec changes the run the next one starts. Because `null` clears an override
rather than meaning "off", the reset has to name each stored key explicitly.

The GitHub Actions workflow runs this suite on Linux and runs the core checks
on Windows and macOS.

## Free tier

Real server, real navigation, no run that reaches an engine.

- **`ui-smoke.e2e.ts`** — home leads with the Orchestrator, which cannot start
  until a goal is described; describing one arms it. The fixed-pipeline composer
  is one click behind it, its dropdown offers every pipeline and closes on
  Escape, and describing a task arms both **Start run** and **Plan milestone**.
  Full Delivery previews the persona team; single-agent mode shows the folder as
  read-only context. Setup → AI Harness lists engines, status, models and
  permission modes — the roster resolves server-side and can come from the CLI,
  so the specs assert the entries that matter rather than a count.
- **`project-switcher.e2e.ts`** — the header switcher lists the home project and
  offers to add one, exactly one project is active at a time, Add project opens
  the folder picker, and Escape closes both. Setup names the active project.
- **`project-drawer.e2e.ts`** — the Project button opens a drawer naming the
  active project's folder (stated, never editable), summarising engine and
  permission mode and linking into the Setup section it summarises.
- **`milestone/milestone-dashboard.e2e.ts`** — the milestone is seeded by
  `POST /milestones` rather than planned by an agent, so no engine runs. The
  milestone reaches the rail with its progress count and opens its dashboard at
  `#/milestones/:id`; the autorun toggle is server state and survives a reload;
  Finalize stays disabled until the needs-attention feature is accepted, and the
  acceptance itself survives a reload; the milestone route is a sibling of home,
  so the composer is untouched.

  *The e2e home is durable, so seeded milestones accumulate between runs.
  Locate them on `data-milestone-id` from the POST response — a name filter can
  match an earlier run's milestone.*

## Seeded tier

A `RunState` is served to the app via Playwright route interception (`/runs`,
`/runs/:id`, `/runs/:id/files`, `/runs/:id/events`), so rendering is asserted
with no engine and no server state. Fixtures are typed as `RunState` from
`@isotopy/core`, so a change to the run model breaks `pnpm typecheck` rather
than rotting silently. A fixture may still name a retired pipeline id, because
it never reaches the pipeline registry.

- **`run/dev-test-flow.e2e.ts`** — the two boxes render as Developer and QA
  Engineer with their persona badges; the Logs tab badges every stage and only
  the verifier declares a verdict; clicking a stage node filters the log; the
  chat carries what the boxes said, in order, and nothing else. From a finished
  run the user reaches the files, reads a changed file without leaving the run,
  and can ask the server to reveal the project folder.

  **Each box's Handoffs view opens on that box's own `handoff.md`**, and picking
  the other box swaps the preview. This is the regression guard for TASK-047,
  where every stage showed `run.result` — which holds only the *last* box's
  output. The fixture sets `result` to the Tester's text on purpose, so the bug
  reappearing fails the test.

  Its first two tests are free-tier in nature: the default pipeline is
  selectable and previews all three boxes, and the choice is stored server-side
  so it survives a reload.
- **`orchestration/orchestrator-flow.e2e.ts`** — seeded because every
  orchestration stage spawns a CLI and no cheaper tier can render one. A proposed
  team lists its roles behind an enabled **Approve & start**, with each role's
  model preset on the card so cost is visible before approving; an
  `awaiting_user` initiative says so and offers no team; the Orchestrator's
  question is answered in the thread it was asked in; the initiative has no tab
  of its own, because it *is* the conversation; and the rail gathers an
  initiative's runs under its goal, collapsing without losing the initiative.
- **`run/run-limit.e2e.ts`** — a parked run announces the limit over the run with
  the raw line behind it, the countdown ticks rather than showing a frozen
  timestamp, the rail shows BLOCKED, dropping to a cheaper preset posts the model
  it stands for, Escape leaves the run parked rather than resolved, and a parked
  run can still be aborted.
- **`run/run-question.e2e.ts`** — a parked question reads as a question rather
  than ordinary narration, the composer asks for an answer and already has focus,
  the rail shows ASKING, and the typed answer is posted to the run's message
  endpoint.
- **`run/product-preview.e2e.ts`** — a project that never declared how to start
  itself is offered no Preview tab; a declared product earns one that offers to
  start it; a running product is embedded, which is the whole point of the tab;
  and a product that refuses framing names the header instead of leaving an
  empty box.

## Built tier (opt-in)

Every other tier boots `pnpm dev`, so none of them sees the compiled artifact at
all — which is how `pnpm build` came to emit a server and a UI bundle that
nothing served, with no test noticing. Free, no tokens, but it rebuilds first:

```bash
ISOTOPY_E2E_BUILT=1 pnpm --filter @isotopy/ui e2e built-app
```

`ISOTOPY_E2E_BUILT=1` swaps the Playwright web server to `pnpm build && pnpm start`,
which runs `vite preview` over `dist/` in place of the dev server. Ports and
proxy are unchanged, so `baseURL` is the same as every other tier. The rebuild is
deliberate: a stale `dist` passing for current source is the whole hazard of
testing a build artifact.

Three tests (`built-app.e2e.ts`), and this is the **only** coverage of the
compiled artifact: that it boots from the bundle rather than a dev server
compiling on the fly, that it reaches the API through the preview proxy, and
that a first-time visitor can reach Setup — so the bundle is not a dead shell. A
component test could assert that a bundle is answered with, but not the part that
actually breaks: whether a browser *executes* it — MIME types, hashed asset
paths, React mounting, and the proxied API answering the built page.

## Live tier (opt-in)

One thin real two-box run on haiku, ≈ a cent. Skipped unless enabled:

```bash
ISOTOPY_E2E_LIVE=1 pnpm --filter @isotopy/ui e2e live-dev-test
```

Requires an authenticated `claude` CLI, and a dev server started **outside** a
sandboxed agent shell — a sandboxed spawn dies with 0xC0000142 (see the
run-app skill).

This is a **canary, not a proof**. That the boxes chain is proven for free in
`packages/server/test/run/pm-dev-test-pipeline.comp.ts` against a mocked adapter.
What this test adds is the only thing a mock cannot: that the real CLI is found,
authenticates, honours `--model`, streams parseable output, and writes files
where we expect.

## Known non-bugs

- Right after switching tabs in the run view, a screenshot can catch the old tab
  still underlined — that's the 0.18s CSS transition, not a state bug (verified
  in TASK-020).
