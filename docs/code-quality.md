# Code Quality Standards

How code in this repo is organized, linted, and configured. Introduced by TASK-032.

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
| `settings.ts` | UI-safe settings view models |

Core stays dependency-free and side-effect-free: types, constants, and pure functions only.

### `packages/server` — HTTP API

| Path | Role |
| --- | --- |
| `src/index.ts` | **Bootstrap only** — load config, build app, listen. Read this file to see what happens at service start. |
| `src/app.ts` | Composition: wires middleware + route controllers |
| `src/config.ts` | All environment-driven configuration (reads root `.env`) |
| `src/routes/` | Controllers — one file per resource, thin HTTP mapping only |
| `src/services/` | Domain logic (run orchestrator); no HTTP awareness |
| `src/engines/` | Engine adapters (subprocess integration) behind `EngineAdapter` |
| `src/settings.ts`, `src/paths.ts` | Persistence/filesystem helpers |
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
- Secrets (API keys) never go in code or `.env.example`; runtime secrets live in `.adhd/settings.json` (gitignored) or real env vars.

## Subsystem review: Developer→Tester flow (TASK-049)

Assessment of the two-box flow against the conventions above, with the refactors applied.

| Finding | Resolution |
| --- | --- |
| `executeEngineStage` inlined persona resolution + prompt building, mixing lifecycle with input assembly | Extracted `resolveStageInputs()`; the method is now stage lifecycle only |
| `stage-prompt.ts` had grown to hold both prompt building *and* handoff formatting | Renamed to `stage-context.ts` — it owns cross-box context in both directions |
| `agentForStage()` and engine-label formatting computed twice; bare `"unknown"` literal | Extracted `engineLabel()`; added the `UNKNOWN_ENGINE_LABEL` constant |
| `run.result` holds only the *last* stage's output — the reason the UI needed a fallback | Documented at the assignment; per-box consumers must read `stageOutputs` |

Conventions upheld: `@adhd/core` stays pure (`pipelineUsesEngine` is a pure helper; persona *text* lives in the server, not core); persona defaults (pure data) sit in `skill-defaults.ts` apart from the I/O in `skills.ts`; `run-store.ts` remains the only module that knows the run disk layout; no `console.*` in the new modules; no hardcoded paths or secrets.

**Deliberate seam:** `RunOrchestrator.executeStage()` is the single decision point for how a stage runs. A durable-workflow executor (Aiki) replaces that method alone — engine adapters and the surrounding lifecycle are untouched.

**Known gap (not code):** persona adherence is model-dependent. On `haiku` the Tester verified with inline `node -e` checks rather than writing a test file, and ignored an instruction placed *after* the closing "Do not restate this prompt" line. Put must-follow output rules before that line.

## Practices to keep (and adopt next)

Already in place:

- **Strict TypeScript** (`strict: true`, `isolatedModules`) with `pnpm typecheck` across the workspace. `packages/ui` typechecks twice — `tsconfig.json` for the browser app, `tsconfig.e2e.json` for the Node-side Playwright/Vite configs, so `process` and friends stay out of reach of `src/`.
- **`import type`** for type-only imports (enforced by lint).
- **UI-safe views**: the server never serializes secrets to the client (`SettingsView`).
- **Layered tests** — component tests (Vitest, `pnpm test`) are the primary level; specs cover complicated pure functions; Playwright covers only the browser; one opt-in live canary. See [`testing.md`](./testing.md) for the policy and the AAAAA convention (TASK-062).
- **Testable seams** — `ADHD_HOME` moves the data root, `setEngineAdapter()` substitutes a harness, and `createApp({ orchestrator })` injects the service instead of routes reaching for a module singleton.

Recommended next steps, in rough priority order:

1. **CI gate** — a GitHub Actions workflow running `pnpm lint && pnpm typecheck && pnpm test && pnpm build` on every PR, then `pnpm e2e`. The Vitest suite is CI-ready today (no credentials, no engine, no browser, ~1.5s); the Playwright job additionally needs `npx playwright install chromium`. The workflow itself is not written yet.
2. **Formatter** — add Prettier (or Biome) with a pre-commit hook (`husky` + `lint-staged`) so style never reaches review.
3. ~~**Unit tests**~~ — done in TASK-062, and landed differently than sketched here: component tests over the HTTP boundary turned out to be the higher-value default, with unit specs kept narrow. Engine *adapter* output parsing is still uncovered — the fake adapter substitutes for it, so `claude-code.ts`'s stream parsing has no test of its own. That is the next real gap.
4. **Structured logger** — replace `console.*` (tracked as TASK-022; `LOG_LEVEL` should join `config.ts`).
5. **Request validation** — zod (or Hono's validator) at route boundaries instead of hand-rolled `body.x !== undefined` checks; the parsed types then flow into services for free.
6. **Stricter compiler flags** — `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` in `tsconfig.base.json` once the codebase is ready.
7. **Dependency boundaries** — as the codebase grows, enforce the layer rules above with `eslint-plugin-import` (`no-restricted-imports`: e.g. routes may not import engines directly).
