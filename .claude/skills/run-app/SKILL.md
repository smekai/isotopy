---
name: run-app
description: Launch and drive the Isotopy app (Hono server :9477 + Vite UI :5173) — dev command, health checks, headless-Chromium driving, and the sandbox gotcha for real engine runs
---

# Running the Isotopy app

Monorepo: `pnpm dev` at the repo root starts both processes via
concurrently — `@adhd/server` (Hono, port **9477**) and `@adhd/ui`
(Vite + React, port **5173**). The UI proxies `/pipelines`, `/projects`,
`/runs`, `/milestones`, `/health`, `/settings`, `/engines`, `/fs` to the
server, so `http://localhost:5173/health` proves both are up. The proxy
list in `packages/ui/vite.config.ts` mirrors the route mounts in
`packages/server/src/app.ts` — add a mount, add a prefix.

## Launch

```bash
pnpm dev   # run in background; poll, don't sleep
timeout 60 bash -c 'until curl -sf http://localhost:5173/health >/dev/null; do sleep 1; done'
```

Stop: kill the `pnpm dev` task, then confirm ports 9477/5173 are
released (a stray `tsx watch`/`vite` child sometimes survives —
`Get-NetTCPConnection -LocalPort 9477,5173 -State Listen` and stop the
owning processes).

## GOTCHA: real engine runs need an unsandboxed server

The server spawns the coding-agent CLI for every stage that has a skill
(`packages/server/src/engines/claude-code.ts`; PATH lookup, else the
VS Code extension's native binary, else `ADHD_CLAUDE_PATH`). If
`pnpm dev` was started from a **sandboxed** agent shell, the spawned
`claude.exe` exits instantly with code 3221225794 (0xC0000142,
STATUS_DLL_INIT_FAILED) and the run fails. Start the dev server
unsandboxed (or let the user run it in their own terminal) before
verifying engine runs.

**There is no mock pipeline.** Every shipped pipeline drives a real
engine, so any run started through the API or UI spends tokens. For
engine-free verification use `pnpm test`, whose component tests
substitute the engine adapter.

## Smoke checks

- API: `curl http://localhost:9477/health` → `{"ok":true,...}`;
  `curl http://localhost:9477/pipelines` → `full-delivery`, `pm-dev-test`,
  `solo`. `milestone-planning` is marked `internal` and is deliberately
  **absent** from that list — it is started through `POST /milestones/plan`,
  not chosen by the user.
- CLI detection: `curl http://localhost:9477/engines/claude-code/status`
  → `{"installed":true,"path":...,"version":...}`.
- Connection settings: `GET /settings`, `PUT /settings/engines/claude-code`
  (`{"connectionMode":"subscription"|"api-key","apiKey":"..."|null}`);
  stored user-level in `~/.adhd/settings.json` keyed by project, key never
  echoed back. `PUT /settings/preferences` holds engine, model, permission
  mode and the selected pipeline — these are **server** state, not
  localStorage. Scope any call to a project with `-H "X-ADHD-Project: <id>"`.
- Projects: `GET /projects` → the registry (`home` always present);
  `POST /projects` (`{"root":"C:/some/dir"}`) registers one and creates its
  self-ignoring `.adhd/`; `POST /projects/<id>/activate`; `DELETE /projects/<id>`
  unregisters without touching files.
- Milestones: `GET /milestones`, `GET /milestones/:id`, `POST /milestones/plan`
  (starts the planning conversation), `POST /milestones/:id/revise`,
  `PATCH /milestones/:id/proposal`, `POST /milestones/:id/approve` (writes the
  backlog tasks), `POST /milestones/:id/start-next`,
  `POST /milestones/:id/features/:featureId/accept` (clears a
  `needs_attention` feature), `POST /milestones/:id/finalize` (writes
  `summary.json` + `summary.md`; refuses while a feature is unfinished).
  Autorun is `PATCH /milestones/:id` with `{"autoRunNext":true}`.
- Backend behaviour without a browser or a server: `pnpm test`
  (Vitest, mocks the engine adapter). Reach for this before driving the UI.
- E2E, free + seeded tiers (no engine spend, auto-starts its own dev
  server on 9499/5199 against a temp `ADHD_USER_HOME`): `pnpm e2e`.
  The live tier is opt-in:
  `ADHD_E2E_LIVE=1 pnpm --filter @adhd/ui e2e live-dev-test`.
- Which layer a check belongs in: `docs/testing.md`.

## Driving the UI headlessly

`@playwright/test` is a devDependency of `packages/ui`; browsers live
in the user-level ms-playwright cache (`npx playwright install
chromium --only-shell` inside `packages/ui` if missing).

Useful selectors: the pipeline picker is a dropdown whose trigger shows
the selected pipeline's name — **"Full Delivery"**, **"Product Manager +
Developer + QA"**, **"Single agent"** — with menu entries as
`role=option`; header buttons "Setup" / "History"; task input
placeholder "Describe the task..."; status-bar engine pill matches
`/^⬡ Claude Code · /`. A run view is split into Chat / Logs / Artifacts
tabs (`run-tab-<chat|logs|artifacts>`), and a milestone has its own
route at `#/milestones/:id`. Text like "Claude Code · <model>" appears
in both the pill and the team-controller line — anchor or `.first()`
your locators.

**Test ids: do not duplicate the roster here.** It lives in
[`architecture-ui.md`](../../../docs/architecture-ui.md) §9, together with the
rule for when a new one is justified. Note that `milestone-card` and
`milestone-feature` also carry `data-milestone-id` / `data-feature-id`,
which is what the e2e suite locates on.

## Starting a run without the UI

```bash
curl -s -X POST http://localhost:9477/runs -H "content-type: application/json" \
  -H "X-ADHD-Project: <projectId>" \
  -d '{"pipelineId":"full-delivery","task":"...","engine":"claude-code","model":"haiku"}'
# then stream: curl -N http://localhost:9477/runs/<id>/events
```

`pipelineId` is validated against the shipped set, so a retired id
(`one-box`, `dev-test`, `gated-dev-test`) is rejected at the boundary.
The working directory is **not** a request field: a run works in its
project's folder, and a `home` run gets `~/.adhd/home/runs/<id>/workspace`.
Target a folder by targeting its project (`X-ADHD-Project`, or activate
it first). `model` takes standard-context CLI aliases (`opus`/`sonnet`/
`haiku`); full model IDs resolve to 1M-context variants that
subscription plans reject ("Usage credits required for 1M context").

A run that parks on a gate is released with
`POST /runs/:id/gates/:stageId/approve`; a run that parks on a question
is answered with `POST /runs/:id/messages`. `POST /runs/:id/restart`
re-runs from one stage, keeping the completed stages' output.

## Auth gotcha: subscription vs API key

The spawned CLI strips `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` from
its env. Subscription mode (default) uses the user's `claude /login`
OAuth. api-key mode injects the stored key **and passes `--bare`** —
without `--bare`, a logged-in CLI silently ignores the env key and
bills the plan (keys otherwise need interactive approval into
`~/.claude.json` `customApiKeyResponses`).

A subscription **session limit** is currently a hard failure, not a
pause: the stage fails with a hint pointing at Setup → Connection and
the printed reset time is discarded. That is TASK-061, not a bug in
your run.
