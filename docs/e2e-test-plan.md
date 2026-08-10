# E2E Test Plan — the browser layer

Regression coverage for what the **React app** does with a run. This is the
narrowest layer in [`testing.md`](./testing.md) — read that first for the layer
policy. Run *semantics* (abort → cancelled, gates, restart, per-stage statuses,
handoff chaining, error contracts) live in the component suite under
`packages/server/test/` and are deliberately **not** duplicated here.

**Guiding principle — cheapest tier that can prove it.** A check belongs in the
lowest tier that can catch its failure. The `sequential` pipeline is *simulated*
(no stage carries a persona, so no engine is ever spawned), so what remains here
still costs **zero tokens**.

| Tier | Cost | What it proves | Where |
| --- | --- | --- | --- |
| Free | none | Composer, Setup, persistence, the milestone dashboard, and that run state reaches the status bar / stage focus / live log | `e2e/ui-smoke.spec.ts`, `e2e/run-lifecycle.spec.ts`, `e2e/milestone-dashboard.spec.ts`, first test of `e2e/dev-test-flow.spec.ts` |
| Seeded | none | Per-stage rendering of a two-box run, and the Orchestrator panel, from a fabricated `RunState` / `Orchestration` served by route interception | `e2e/dev-test-flow.spec.ts`, `e2e/orchestration/orchestrator-flow.e2e.ts` |
| Live | ≈ $0.01 | Canary that the real CLI still integrates | `e2e/live-dev-test.spec.ts` (opt-in) |

## Running

```bash
pnpm e2e                        # free + seeded; live is skipped
pnpm --filter @adhd/ui e2e      # the same thing, from the package
```

Playwright auto-starts `pnpm dev` and waits on `/health` (which is proxied to
the API server, so it covers both processes). The suite runs single-worker on
purpose: every spec drives the same server and the same in-memory run store.

**The suite gets its own machine state.** Since preferences became server-side
(TASK-065), a spec that picks a pipeline writes to `~/.adhd/settings.json` — so
Playwright starts the server with `ADHD_USER_HOME` and `ADHD_HOME` pointed at
`<tmp>/adhd-e2e` and its own ports (`9499`/`5199`), and does **not** reuse an
already-running dev server: the isolation is only real on a server this config
started. Your own settings, projects and run history are never touched, and
`pnpm dev` can stay running on 5173 while the suite works.

Preferences also outlive a browser context, which a fresh `localStorage` used to
discard for free. Every spec therefore calls `resetPreferences` in a
`beforeEach` (`e2e/support/preferences.ts`) — without it, the pipeline chosen in
`dev-test-flow.spec.ts` changes the run `run-lifecycle.spec.ts` starts.

The free and seeded tiers create real runs under `.adhd/runs/` (gitignored) but
never spawn an engine. Every test leaves its run in a terminal state, so the
empty-state specs still see a quiet server.

The GitHub Actions workflow runs this suite on Linux and runs the core checks
on Windows and macOS.

## Free tier

1. **Empty state & pipeline picker** — ghost pipeline, task input, and the
   dropdown with all three presets: Full Delivery, Product Manager + Developer
   + QA, and Single agent. The Full Delivery preview renders its nine stages in
   a horizontally scrollable row. "Start run" is disabled while the input is
   empty.
2. **Single-agent mode** — heading switches to "What should the Developer
   build?", the working-directory input appears, footer reads
   `Engine: <label> · <model> — change in Setup`.
3. **Setup → AI Harness** — all three harnesses listed and selectable (none is
   behind a `SOON` pill any more); the model roster is resolved server-side and
   can come from the CLI, so specs assert the entries that matter rather than a
   count; permission modes "Never block (recommended)" / "Auto-review" /
   "Accept edits only".
4. **Persistence across reload** (server-side, asserted through `/settings`) —
   pipeline, engine model and permission mode survive a reload; they also
   survive a browser whose storage was wiped, a legacy model id is migrated on
   read, and a preference an older build left in `localStorage` is adopted once
   and its key removed.
5. **History drawer** — "No runs yet." on a fresh server, otherwise run cards.
6. **Run view wiring** (simulated `sequential`, driven through the API with
   `minDurationMs`/`maxDurationMs`/`failProbability: 0` so it finishes in
   seconds) — three tests, each about *rendering*, not run rules:
   - starting from the composer swaps the empty state for the run view —
     `RUN #n`, the task, a RUNNING status, the first stage auto-focused, its
     live log streaming, and Abort reflected as CANCELLED with "Resume from …"
     and "New run" offered;
   - finishing a run moves the focus panel off the stopped log onto Artifacts;
   - history lists the finished run and clicking the card re-attaches to it.

   *That the abort actually cancels the run, that gates hold it, and that a
   restart resumes correctly are asserted in `runs.comp.ts`.*
7. **`pm-dev-test` picker** — selectable, composer copy names all three boxes,
   ghost pipeline previews Product Manager, Developer, and QA Engineer, and the
   choice survives a reload.
8. **Milestone dashboard** (`milestone-dashboard.spec.ts`) — the milestone is
   seeded by `POST /milestones` rather than planned by an agent, so no engine
   runs and no run is started. Four tests: the milestone reaches the rail with
   its progress count and opens its dashboard at `#/milestones/:id`; the autorun
   toggle survives a reload because it is server state; Finalize stays disabled
   while a feature is unfinished; and "New run" from a milestone route still
   reaches the untouched composer.

   *The e2e home is durable, so seeded milestones accumulate between runs.
   Locate them on `data-milestone-id` from the POST response — a name filter can
   match an earlier run's milestone.*

## Seeded tier

A completed two-box `RunState` is served to the app via Playwright route
interception (`/runs`, `/runs/:id`, `/runs/:id/files`, `/runs/:id/events`), so
per-stage rendering is asserted with no engine and no server state. The fixture
is typed as `RunState` from `@adhd/core`, so a change to the run model breaks
`pnpm typecheck` rather than rotting silently.

1. Both stage nodes render as **Developer** and **Tester**.
2. The stage focus header shows the persona badge — `DEVELOPER` / `TESTER` —
   and the Tester's `PASS` verdict pill (the Developer declares none).
3. **Each box's Artifacts tab shows that box's own `handoff.md`.** This is the
   regression guard for TASK-047, where every stage showed `run.result` — which
   holds only the *last* box's output. The fixture sets `result` to the Tester's
   text on purpose, so the bug reappearing fails the test.

**The Orchestrator panel** (`e2e/orchestration/orchestrator-flow.e2e.ts`) is seeded
the same way, because every orchestration stage spawns a CLI and there is no
cheaper tier that can render one. Three tests: a proposed team lists its roles
behind an enabled **Approve & start**; an `awaiting_user` initiative reads
"Needs your answer" and offers no team; and the run timeline carries the
initiative's runs on `data-run-id`.

## Built tier (opt-in)

Every other tier boots `pnpm dev` — Vite serves the UI and proxies the API — so
none of them can see the compiled server serving its own bundle, which is inert
outside a build. That is how `pnpm build` came to emit an API and an unserved
bundle with nothing noticing. Free, no tokens, but it rebuilds first:

```bash
ADHD_E2E_BUILT=1 pnpm --filter @adhd/ui e2e built-app
```

`ADHD_E2E_BUILT=1` swaps the Playwright web server to `pnpm build && pnpm start`
and points `baseURL` at the server port — one process, one origin, no Vite. The
rebuild is deliberate: a stale `dist` passing for current source is the whole
hazard of testing a build artifact.

Three tests, and this is the **only** coverage of the compiled artifact. A comp
test over the same code could assert the server answers with the bundle, but not
the part that actually breaks: whether a browser *executes* it — MIME types,
hashed asset paths, React mounting, same-origin API calls with no proxy in
front. Asserting status codes a layer down only restates the server's answer, so
that layer was removed rather than kept alongside this one.

## Live tier (opt-in)

One thin real `dev-test` run on haiku, ≈ a cent. Skipped unless enabled:

```bash
ADHD_E2E_LIVE=1 pnpm --filter @adhd/ui e2e live-dev-test
```

Requires an authenticated `claude` CLI, and a dev server started **outside** a
sandboxed agent shell — a sandboxed spawn dies with 0xC0000142 (see the
run-app skill).

This is a **canary, not a proof**. That the boxes chain is proven for free in
`packages/server/test/dev-test-pipeline.comp.ts` against a mocked adapter. What
this test adds is the only thing a mock cannot: that the real CLI is found,
authenticates, honours `--model`, streams parseable output, and writes files
where we expect.

## Known non-bugs

- Right after switching tabs in the stage focus panel, a screenshot can catch
  the old tab still underlined — that's the 0.18s CSS transition, not a state
  bug (verified in TASK-020).
