---
name: run-app
description: Launch and drive the ADHD app (Hono server :9477 + Vite UI :5173) — dev command, health checks, headless-Chromium driving, and the sandbox gotcha for real engine runs
---

# Running the ADHD app

Monorepo: `pnpm dev` at the repo root starts both processes via
concurrently — `@adhd/server` (Hono, port **9477**) and `@adhd/ui`
(Vite + React, port **5173**). The UI proxies `/pipelines`, `/runs`,
`/health` to the server, so `http://localhost:5173/health` proves both
are up.

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
  `curl http://localhost:9477/pipelines` → `sequential` + `one-box`.
- UI free-tier E2E (no engine spend, auto-starts the dev server):
  `pnpm --filter @adhd/ui e2e`
- Full checklist incl. the manual live tier: `docs/e2e-test-plan.md`.

## Driving the UI headlessly

`@playwright/test` is a devDependency of `packages/ui`; browsers live
in the user-level ms-playwright cache (`npx playwright install
chromium --only-shell` inside `packages/ui` if missing). Useful
selectors: pipeline picker buttons "Full team · mock" / "Single
agent"; header buttons "Setup" / "History"; task input placeholder
"Describe the task..."; status-bar engine pill matches
`/^⬡ Claude Code · /`. History run cards are clickable divs (no View
button). Text like "Claude Code · <model>" appears in both the pill
and the team-controller line — anchor or `.first()` your locators.

## Starting a run without the UI

```bash
curl -s -X POST http://localhost:9477/runs -H "content-type: application/json" \
  -d '{"pipelineId":"one-box","task":"...","engine":"claude-code","model":"claude-haiku-4-5","workspaceDir":"C:/some/existing/dir"}'
# then stream: curl -N http://localhost:9477/runs/<id>/events
```

`workspaceDir` must exist (else 400); omit it for a scratch workspace
per run.
