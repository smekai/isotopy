# Code Quality Standards

How code in this repo is organized, linted, and configured. Introduced by TASK-032.

## Linting

- ESLint 10 flat config lives at [`eslint.config.mjs`](../eslint.config.mjs): JS + typescript-eslint recommended rules everywhere, React hooks rules for `packages/ui`.
- Run `pnpm lint` (or `pnpm lint:fix`) from the repo root. Keep it green — treat lint errors like compile errors.
- The `design/` folder (Figma export) and build output are excluded.

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

Dependency direction: `index.ts → app.ts → routes → services → engines/core`. Routes never contain business rules; services never touch `Request`/`Response`.

### `packages/ui` — React app

- `main.tsx` bootstrap, `App.tsx` composition.
- `components/` presentational + container components, `hooks/` reusable stateful logic.
- `api.ts` is the only module that talks HTTP; components import functions from it, never `fetch` directly.
- Pure helpers (`run-utils.ts`, `theme.ts`) stay separate from stateful modules.

## Configuration & constants

- **No hardcoded hosts/ports.** Everything comes from env vars with sensible defaults — see [`.env.example`](../.env.example). Copy it to `.env` (gitignored) for local overrides.
- The server loads the root `.env` itself (`src/config.ts`), Vite reads the same file via `loadEnv`, so one file drives both processes.
- Named constants over magic numbers: timeouts, poll intervals, and status lists are declared at the top of the module that owns them (or in `@adhd/core` when shared, e.g. `TERMINAL_RUN_STATUSES`).
- Secrets (API keys) never go in code or `.env.example`; runtime secrets live in `.adhd/settings.json` (gitignored) or real env vars.

## Practices to keep (and adopt next)

Already in place:

- **Strict TypeScript** (`strict: true`, `isolatedModules`) with `pnpm typecheck` across the workspace.
- **`import type`** for type-only imports (enforced by lint).
- **UI-safe views**: the server never serializes secrets to the client (`SettingsView`).

Recommended next steps, in rough priority order:

1. **CI gate** — a GitHub Actions workflow running `pnpm lint && pnpm typecheck && pnpm build` on every PR; later add the Playwright smoke suite.
2. **Formatter** — add Prettier (or Biome) with a pre-commit hook (`husky` + `lint-staged`) so style never reaches review.
3. **Unit tests** — Vitest for pure logic first (core helpers, `run-orchestrator` state transitions, engine output parsing); the e2e suite already covers the happy path.
4. **Structured logger** — replace `console.*` (tracked as TASK-022; `LOG_LEVEL` should join `config.ts`).
5. **Request validation** — zod (or Hono's validator) at route boundaries instead of hand-rolled `body.x !== undefined` checks; the parsed types then flow into services for free.
6. **Stricter compiler flags** — `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` in `tsconfig.base.json` once the codebase is ready.
7. **Dependency boundaries** — as the codebase grows, enforce the layer rules above with `eslint-plugin-import` (`no-restricted-imports`: e.g. routes may not import engines directly).
