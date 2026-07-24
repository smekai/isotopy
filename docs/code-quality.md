# Code Quality Standards

How code in this repo is organized, linted, and configured. Introduced by TASK-032.

> **Descriptive, not prescriptive.** This file records the layout that *exists*.
> For the rules any new or refactored code *must* follow, see
> [`architect-standards.md`](./architect-standards.md) (the Architect standard);
> [`decisions.md`](./decisions.md) for the rationale behind non-obvious choices;
> and [`implementation-notes.md`](./implementation-notes.md) for the "why" behind
> non-obvious code, which — per the comments-are-a-smell rule — lives in docs, not
> in source comments.

## Linting

- ESLint 10 flat config lives at [`eslint.config.mjs`](../eslint.config.mjs): JS + typescript-eslint recommended rules everywhere, React hooks rules for `packages/ui`.
- Run `pnpm lint` (or `pnpm lint:fix`) from the repo root. Keep it green — treat lint errors like compile errors.
- The `design/` folder (design reference) and build output are excluded.

## Layout conventions

Each package separates code by role. The rule of thumb: **models ≠ services ≠ controllers ≠ bootstrap**, and pure functions live apart from context-dependent code.

### `packages/core` — shared domain model

One file per domain, re-exported from `index.ts` (the only import path consumers use):

| File | Contents |
| --- | --- |
| `agents.ts` | Agent professions per stage |
| `engines.ts` | Engine/harness definitions, connection modes, model options |
| `pipelines.ts` | Pipeline/stage definitions and pure helpers |
| `runs.ts` | Run/stage state models, run events, status constants |
| `settings.ts` | UI-safe settings view models, project preferences and their defaults |

Core stays dependency-free and side-effect-free: types, constants, and pure functions only.

### `packages/server` — HTTP API

| Path | Role |
| --- | --- |
| `src/index.ts` | **Bootstrap only** — load config, build app, listen. Read this file to see what happens at service start. |
| `src/app.ts` | Composition: wires middleware + route controllers |
| `src/config.ts` | All environment-driven configuration (reads root `.env`) |
| `src/routes/` | Controllers — one file per resource, thin HTTP mapping only |
| `src/services/` | I/O and lifecycle (run orchestrator, persistence, skill loading); no HTTP awareness |
| `src/domain/` | Server-only **pure** logic: `stage-context.ts` (prompt/handoff/verdict), `skills/defaults.generated.ts` + `skills/personas/*.md` (bundled persona text), `skills/compose.ts` (persona layering). No I/O — the thin-service/fat-domain split (A3) |
| `src/engines/` | Engine adapters (subprocess integration) behind `EngineAdapter` |
| `src/paths.ts` | Filesystem layout — resolves a `ProjectPaths` (per-project data dir, user-level roots) instead of exporting a global constant |
| `src/utils.ts` | Pure, context-free helpers (no I/O, no internal imports) |
| `test/` | Component tests, unit specs, and their support harness ([`testing.md`](./testing.md)) — never colocated with `src/`, which would emit them into `dist/` |

Dependency direction: `index.ts → app.ts → routes → services → engines/core`. Routes never contain business rules; services never touch `Request`/`Response`. Routes are factories (`createRunRoutes(orchestrator)`) that receive their service rather than importing a singleton — which is what lets a component test mount them over a throwaway orchestrator.

### `packages/ui` — React app

- `main.tsx` bootstrap, `App.tsx` composition.
- `components/` presentational + container components, `hooks/` reusable stateful logic.
- `api.ts` is the only module that talks HTTP; components import functions from it, never `fetch` directly.
- Pure helpers (`run-utils.ts`, `theme.ts`) stay separate from stateful modules.
- `test/` holds unit specs; `e2e/` holds the Playwright suite. Neither lives in `src/`.

## Configuration & constants

- **No hardcoded hosts/ports.** Everything comes from env vars with sensible defaults — see [`.env.example`](../.env.example). Copy it to `.env` (gitignored) for local overrides.
- The server loads the root `.env` itself (`src/config.ts`), Vite reads the same file via `loadEnv`, so one file drives both processes.
- Named constants over magic numbers: timeouts, poll intervals, and status lists are declared at the top of the module that owns them (or in `@adhd/core` when shared, e.g. `TERMINAL_RUN_STATUSES`).
- Secrets (API keys) never go in code or `.env.example`; runtime secrets live in the user-level `~/.adhd/settings.json` (mode `0600`) or real env vars — **never** in a project's `.adhd/`, which sits in the user's git working tree.

## Subsystem review: Developer→Tester flow (TASK-049)

Assessment of the two-box flow against the conventions above, with the refactors applied.

| Finding | Resolution |
| --- | --- |
| `executeEngineStage` inlined persona resolution + prompt building, mixing lifecycle with input assembly | Extracted `resolveStageInputs()`; the method is now stage lifecycle only |
| `stage-prompt.ts` had grown to hold both prompt building *and* handoff formatting | Renamed to `stage-context.ts` — it owns cross-box context in both directions |
| `agentForStage()` and engine-label formatting computed twice; bare `"unknown"` literal | Extracted `engineLabel()`; added the `UNKNOWN_ENGINE_LABEL` constant |
| `run.result` holds only the *last* stage's output — the reason the UI needed a fallback | Documented at the assignment; per-box consumers must read `stageOutputs` |

Conventions upheld: `@adhd/core` stays pure (`pipelineUsesEngine` is a pure helper; persona *text* lives in the server, not core); persona defaults (pure data) sit in `domain/skills/` apart from the I/O in `skills.ts`; the run repository (`src/repository/`) over its `db/` data-access layer is the only place that knows the run storage layout; no `console.*` in the new modules; no hardcoded paths or secrets.

**Deliberate seam:** the durable runtime is OpenWorkflow (`workflow/`). `RunOrchestrator` *is* the durable workflow (body in `workflow/pipeline-workflow.ts`); `workflow/stage-execution.ts` is the durable *step* — the single decision point for how a stage runs (simulate vs. engine). Durability owns the whole lifecycle — start/queueing, the loop, gates, durable timers, retries, recovery, cancellation — not one method; `RunOrchestrator` is the single writer of the read model. (The earlier "replaces `executeStage()` alone" claim is corrected in `workflow-runtime-options.md` §4.)

**Known gap (not code):** persona adherence is model-dependent. On `haiku` the Tester verified with inline `node -e` checks rather than writing a test file, and ignored an instruction placed *after* the closing "Do not restate this prompt" line. Put must-follow output rules before that line.

## Practices to keep (and adopt next)

Already in place:

- **Strict TypeScript** (`strict: true`, `isolatedModules`) with `pnpm typecheck` across the workspace. `packages/ui` typechecks twice — `tsconfig.json` for the browser app, `tsconfig.e2e.json` for the Node-side Playwright/Vite configs, so `process` and friends stay out of reach of `src/`.
- **`import type`** for type-only imports (enforced by lint).
- **UI-safe views**: the server never serializes secrets to the client (`SettingsView`).
- **Layered tests** — component tests (Vitest, `pnpm test`) are the primary level; specs cover complicated pure functions; Playwright covers only the browser; one opt-in live canary. See [`testing.md`](./testing.md) for the policy and the AAAAA convention (TASK-062).
- **Testable seams** — `ADHD_HOME` and `ADHD_USER_HOME` move the data roots, `setEngineAdapter()` substitutes a harness, `RunOrchestrator` takes its `RunStore` factory, and `createApp({ orchestrator, registry, settings })` injects services instead of routes reaching for a module singleton.

Recommended next steps, in rough priority order:

1. **CI gate** — a GitHub Actions workflow running `pnpm lint && pnpm typecheck && pnpm test && pnpm build` on every PR, then `pnpm e2e`. The Vitest suite is CI-ready today (no credentials, no engine, no browser, ~1.5s); the Playwright job additionally needs `npx playwright install chromium`. The workflow itself is not written yet.
2. **Formatter** — add Prettier (or Biome) with a pre-commit hook (`husky` + `lint-staged`) so style never reaches review.
3. ~~**Unit tests**~~ — done in TASK-062, and landed differently than sketched here: component tests over the HTTP boundary turned out to be the higher-value default, with unit specs kept narrow. Engine *adapter* output parsing is still uncovered — the fake adapter substitutes for it, so `claude-code.ts`'s stream parsing has no test of its own. That is the next real gap.
4. **Structured logger** — replace `console.*` (tracked as TASK-022; `LOG_LEVEL` should join `config.ts`).
5. **Request validation** — zod (or Hono's validator) at route boundaries instead of hand-rolled `body.x !== undefined` checks; the parsed types then flow into services for free.
6. ~~**Stricter compiler flags**~~ — done in TASK-052: `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on in `tsconfig.base.json`, and TypeScript is on 6.0.3. See [`decisions.md`](./decisions.md) for the version pin and the two migration idioms.
7. **Dependency boundaries** — as the codebase grows, enforce the layer rules above with `eslint-plugin-import` (`no-restricted-imports`: e.g. routes may not import engines directly).
