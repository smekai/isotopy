---
name: run-app
description: Launch and drive the Isotopy app (Hono server :9477 + Vite UI :5173) — dev command, health checks, headless-Chromium driving, and the sandbox gotcha for real engine runs
---

# Running the Isotopy app

Monorepo: `pnpm dev` at the repo root starts both processes via
concurrently — `@isotopy/server` (Hono, port **9477**) and `@isotopy/ui`
(Vite + React, port **5173**). The UI proxies `/pipelines`, `/runs`,
`/health`, `/settings`, `/engines` to the server, so
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

The server spawns the Codex CLI for `one-box` runs
(`packages/server/src/engines/Codex.ts`; PATH lookup, else the
VS Code extension's native binary, else `ISOTOPY_CLAUDE_PATH`). If
`pnpm dev` was started from a **sandboxed** agent shell, the spawned
`Codex.exe` exits instantly with code 3221225794 (0xC0000142,
STATUS_DLL_INIT_FAILED) and the run fails. Start the dev server
unsandboxed (or let the user run it in their own terminal) before
verifying engine runs. Mock (`sequential`) runs are unaffected.

## Smoke checks

- API: `curl http://localhost:9477/health` → `{"ok":true,...}`;
  `curl http://localhost:9477/pipelines` → `full-delivery`,
  `pm-dev-test`, and `solo`.
- CLI detection: `curl http://localhost:9477/engines/Codex/status`
  → `{"installed":true,"path":...,"version":...}`.
- Connection settings: `GET /settings`, `PUT /settings/engines/Codex`
  (`{"connectionMode":"subscription"|"api-key","apiKey":"..."|null}`);
  stored in gitignored `.adhd/settings.json`, key never echoed back.
- E2E, free + seeded tiers (no engine spend, auto-starts the dev
  server): `pnpm e2e`. The live tier is opt-in:
  `ISOTOPY_E2E_LIVE=1 pnpm --filter @isotopy/ui e2e live-dev-test`.
- Full plan and what each tier proves: `docs/e2e-test-plan.md`.

## Driving the UI headlessly

`@playwright/test` is a devDependency of `packages/ui`; browsers live
in the user-level ms-playwright cache (`npx playwright install
chromium --only-shell` inside `packages/ui` if missing). Useful
selectors: the pipeline picker is a dropdown — trigger button shows
the selected label ("Full Delivery" / "Product Manager + Developer +
QA" / "Single agent"), menu entries are
`role=option`; header buttons "Setup" / "History"; task input
placeholder "Describe the task..."; status-bar engine pill matches
`/^⬡ Codex · /`. History run cards are clickable divs (no View
button). Text like "Codex · <model>" appears in both the pill
and the team-controller line — anchor or `.first()` your locators.

Test ids for the moving parts: `run-status` (run status word — stage
nodes render the same words for themselves, so always anchor on
this), `stage-node-<stageId>`, `stage-profession`, `stage-persona`,
`stage-verdict`, `artifact-preview`, `artifact-view-workflow` /
`artifact-view-files`, `history-card`.

## Starting a run without the UI

```bash
curl -s -X POST http://localhost:9477/runs -H "content-type: application/json" \
  -d '{"pipelineId":"full-delivery","task":"...","engine":"claude-code","model":"haiku"}'
# then stream: curl -N http://localhost:9477/runs/<id>/events
```

`workspaceDir` must exist (else 400); omit it for a scratch workspace
per run. `model` takes standard-context CLI aliases (`opus`/`sonnet`/
`haiku`); full model IDs resolve to 1M-context variants that
subscription plans reject ("Usage credits required for 1M context").

## Auth gotcha: subscription vs API key

The spawned CLI strips `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` from
its env. Subscription mode (default) uses the user's `Codex /login`
OAuth. api-key mode injects the stored key **and passes `--bare`** —
without `--bare`, a logged-in CLI silently ignores the env key and
bills the plan (keys otherwise need interactive approval into
`~/.Codex.json` `customApiKeyResponses`).
