---
name: run-app
description: Launch and drive the ADHD app (Hono server :9477 + Vite UI :5173) — dev command, health checks, headless-Chromium driving, and the sandbox gotcha for real engine runs
---

# Running the ADHD app

Monorepo: `pnpm dev` at the repo root starts both processes via
concurrently — `@adhd/server` (Hono, port **9477**) and `@adhd/ui`
(Vite + React, port **5173**). The UI proxies `/pipelines`, `/projects`,
`/runs`, `/health`, `/settings`, `/engines`, `/fs` to the server, so
`http://localhost:5173/health` proves both are up.

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

The server spawns the Claude Code CLI for `one-box` runs
(`packages/server/src/engines/claude-code.ts`; PATH lookup, else the
VS Code extension's native binary, else `ADHD_CLAUDE_PATH`). If
`pnpm dev` was started from a **sandboxed** agent shell, the spawned
`claude.exe` exits instantly with code 3221225794 (0xC0000142,
STATUS_DLL_INIT_FAILED) and the run fails. Start the dev server
unsandboxed (or let the user run it in their own terminal) before
verifying engine runs. Mock (`sequential`) runs are unaffected.

## Smoke checks

- API: `curl http://localhost:9477/health` → `{"ok":true,...}`;
  `curl http://localhost:9477/pipelines` → `sequential`, `one-box`,
  `dev-test` (the two-box Developer→Tester flow).
- CLI detection: `curl http://localhost:9477/engines/claude-code/status`
  → `{"installed":true,"path":...,"version":...}`.
- Connection settings: `GET /settings`, `PUT /settings/engines/claude-code`
  (`{"connectionMode":"subscription"|"api-key","apiKey":"..."|null}`);
  stored user-level in `~/.adhd/settings.json` keyed by project, key never
  echoed back. Scope any call to a project with `-H "X-ADHD-Project: <id>"`.
- Projects: `GET /projects` → the registry (`home` always present);
  `POST /projects` (`{"root":"C:/some/dir"}`) registers one and creates its
  self-ignoring `.adhd/`; `POST /projects/<id>/activate`; `DELETE /projects/<id>`
  unregisters without touching files.
- Backend behaviour without a browser or a server: `pnpm test`
  (Vitest component tests, ~1.5s, mocks the engine adapter). Reach
  for this before driving the UI.
- E2E, free + seeded tiers (no engine spend, auto-starts the dev
  server): `pnpm e2e`. The live tier is opt-in:
  `ADHD_E2E_LIVE=1 pnpm --filter @adhd/ui e2e live-dev-test`.
- Which layer a check belongs in: `docs/testing.md`.

## Driving the UI headlessly

`@playwright/test` is a devDependency of `packages/ui`; browsers live
in the user-level ms-playwright cache (`npx playwright install
chromium --only-shell` inside `packages/ui` if missing). Useful
selectors: the pipeline picker is a dropdown — trigger button shows
the selected label ("Full team" / "Single agent" / "Developer +
Tester"), menu entries are `role=option`; header buttons "Setup" /
"History"; task input placeholder "Describe the task...";
status-bar engine pill matches `/^⬡ Claude Code · /`. History run
cards are clickable divs (no View button). Text like "Claude Code ·
<model>" appears in both the pill and the team-controller line —
anchor or `.first()` your locators.

Test ids for the moving parts: `run-status` (run status word — stage
nodes render the same words for themselves, so always anchor on
this), `stage-node-<stageId>`, `stage-profession`, `stage-persona`,
`stage-verdict`, `artifact-preview`, `artifact-view-workflow` /
`artifact-view-files`, `history-card`, `project-switcher`,
`open-project` / `project-drawer` / `project-root`, `workspace-chip`.

## Starting a run without the UI

```bash
curl -s -X POST http://localhost:9477/runs -H "content-type: application/json" \
  -H "X-ADHD-Project: <projectId>" \
  -d '{"pipelineId":"one-box","task":"...","engine":"claude-code","model":"haiku"}'
# then stream: curl -N http://localhost:9477/runs/<id>/events
```

The working directory is **not** a request field: a run works in its
project's folder, and a `home` run gets `~/.adhd/home/runs/<id>/workspace`.
Target a folder by targeting its project (`X-ADHD-Project`, or activate
it first). `model` takes standard-context CLI aliases (`opus`/`sonnet`/
`haiku`); full model IDs resolve to 1M-context variants that
subscription plans reject ("Usage credits required for 1M context").

## Auth gotcha: subscription vs API key

The spawned CLI strips `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` from
its env. Subscription mode (default) uses the user's `claude /login`
OAuth. api-key mode injects the stored key **and passes `--bare`** —
without `--bare`, a logged-in CLI silently ignores the env key and
bills the plan (keys otherwise need interactive approval into
`~/.claude.json` `customApiKeyResponses`).
