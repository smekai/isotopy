# Running the Isotopy app

Monorepo: `pnpm dev` at the repo root starts both processes via
concurrently — `@isotopy/server` (Hono, port **9477**) and `@isotopy/ui`
(Vite + React, port **5173**). The UI proxies `/projects`,
`/runs`, `/milestones`, `/orchestrations`, `/health`, `/settings`,
`/engines`, `/automation`, `/fs` to the server, so
`http://localhost:5173/health` proves both are up. The proxy
list in `packages/ui/vite.config.ts` mirrors the route mounts in
`packages/server/src/app.ts` — add a mount, add a prefix.

## Launch

```bash
pnpm dev   # run in background; poll, don't sleep
timeout 60 bash -c 'until curl -sf http://localhost:5173/health >/dev/null; do sleep 1; done' || {
  echo "UI proxy never answered — checking the server directly:"
  curl -sv http://localhost:9477/health
  false   # the group's status is its last command; without this the check exits 0
}
```

**A timeout here is a failure, not a slow start** — `curl -sf` treats the
proxy's 500 exactly like a connection refused, so without the `||` branch a
broken proxy is indistinguishable from a server still booting, and 60 seconds
later you carry on against an app that cannot load anything.

If the proxied URL stays dead while `http://localhost:9477/health` answers, the
API server is up and something between you and it is not: either the Vite
process never started, or the *proxy hop* is failing. Check both ports are
listening before blaming the app. A harness that starts the two `pnpm --filter`
commands itself can produce a broken hop with both processes alive —
`[vite] http proxy error … EADDRINUSE` in the UI log — while a plain `pnpm dev`
on the same machine is fine.

Stop: kill the `pnpm dev` task, then confirm ports 9477/5173 are
released (a stray `tsx watch`/`vite` child sometimes survives —
`Get-NetTCPConnection -LocalPort 9477,5173 -State Listen` and stop the
owning processes).

## GOTCHA: real engine runs need an unsandboxed server

The server spawns the coding-agent CLI for every stage that has a skill
(`packages/server/src/engines/claude-code.ts`; PATH lookup, else the
VS Code extension's native binary, else `ISOTOPY_CLAUDE_PATH`). If
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

- API: `curl http://localhost:9477/health` → `{"ok":true,...}`. Pipelines are not an
  endpoint: the UI imports `DEMO_PIPELINES` from `@isotopy/core` and filters
  `internal` itself, which is why `milestone-planning` never appears in the picker —
  it is started through `POST /milestones/plan`.
- CLI detection: `curl http://localhost:9477/engines/claude-code/status`
  → `{"installed":true,"path":...,"version":...}`.
- Connection settings: `GET /settings`, `PUT /settings/engines/claude-code`
  (`{"connectionMode":"subscription"|"api-key","apiKey":"..."|null}`);
  stored user-level in `~/.isotopy/settings.json` keyed by project, key never
  echoed back. `PUT /settings/preferences` holds engine, model, permission
  mode and the selected pipeline — these are **server** state, not
  localStorage. Scope any call to a project with `-H "X-Isotopy-Project: <id>"`.
- Projects: `GET /projects` → the registry (`home` always present);
  `POST /projects` (`{"root":"C:/some/dir"}`) registers one and creates its
  self-ignoring `.isotopy/`; `POST /projects/<id>/activate`; `DELETE /projects/<id>`
  unregisters without touching files.
- Milestones: `GET /milestones`, `GET /milestones/:id`, `POST /milestones/plan`
  (starts the planning conversation), `POST /milestones/:id/revise`,
  `PATCH /milestones/:id/proposal`, `POST /milestones/:id/approve` (writes the
  backlog tasks), `POST /milestones/:id/start-next`,
  `POST /milestones/:id/features/:featureId/accept` (clears a
  `needs_attention` feature), `POST /milestones/:id/finalize` (writes
  `summary.json` + `summary.md`; refuses while a feature is unfinished).
  Autorun is `PATCH /milestones/:id` with `{"autoRunNext":true}`.
- Orchestrator: `GET /orchestrations` → the initiatives; `POST /orchestrations`
  (`{"goal":"..."}`) starts one, parked on the Orchestrator's first turn;
  `GET /orchestrations/:id`; `POST /orchestrations/:id/approve` accepts or edits
  the proposed team and launches the composed run — every field is optional, so
  accepting the proposal unchanged still needs a body, `{}`, and editing it takes
  `engine`, `model`, `modelTier`, `roleTiers` or `permissionMode`;
  `POST /orchestrations/:id/messages` (`{"text":"..."}`) answers a question it
  asked; `POST /orchestrations/:id/stop` ends the initiative. Every one of these
  is parsed strictly — a missing or unknown field is a 400, not a default.
- Preview — the built product, run by Isotopy rather than by an agent:
  `GET /automation/product` → `state` (`stopped` | `starting` | `ready` |
  `failed` | `exited` — `stopped` is the ordinary answer for a project whose
  product is not running, not an error), `url`, `lastError`;
  `POST /automation/product/start`, idempotent, returning the process already
  running if there is one;
  `POST /automation/product/stop`. The per-project config is `GET /automation`
  and `PUT /automation`. `POST /automation/deploy/production` runs the production
  target and is guarded: it takes `{"confirmation":"DEPLOY PRODUCTION"}`
  verbatim, and any other body is a 400 rather than a deployment. A stage never
  starts the product itself — it is told to ask through the `## Environment`
  block Isotopy injects into a QA prompt.
- Backend behaviour without a browser or a server: `pnpm test`
  (Vitest, mocks the engine adapter). Reach for this before driving the UI.
- E2E, free + seeded tiers (no engine spend, auto-starts its own dev
  server on 9499/5199 against a temp `ISOTOPY_USER_HOME`): `pnpm e2e`.
  The live tier is opt-in:
  `ISOTOPY_E2E_LIVE=1 pnpm --filter @isotopy/ui e2e live-dev-test`.
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
[`architecture-ui.md`](./architecture-ui.md) §9, together with the
rule for when a new one is justified. Note that `milestone-card` and
`milestone-feature` also carry `data-milestone-id` / `data-feature-id`,
which is what the e2e suite locates on.

## Starting a run without the UI

```bash
curl -s -X POST http://localhost:9477/runs -H "content-type: application/json" \
  -H "X-Isotopy-Project: <projectId>" \
  -d '{"pipelineId":"full-delivery","task":"...","engine":"claude-code","model":"haiku"}'
# then stream: curl -N http://localhost:9477/runs/<id>/events
```

`pipelineId` is validated against the shipped set, so a retired id
(`one-box`, `dev-test`, `gated-dev-test`) is rejected at the boundary.
The working directory is **not** a request field: a run works in its
project's folder, and a `home` run gets `~/.isotopy/home/runs/<id>/workspace`.
Target a folder by targeting its project (`X-Isotopy-Project`, or activate
it first). `model` takes standard-context CLI aliases (`opus`/`sonnet`/
`haiku`); full model IDs resolve to 1M-context variants that
subscription plans reject ("Usage credits required for 1M context").

A run that parks on a gate is released with
`POST /runs/:id/gates/:stageId/approve`; a run that parks on a question
is answered with `POST /runs/:id/messages`. `POST /runs/:id/restart`
re-runs from one stage, keeping the completed stages' output.
`POST /runs/:id/abort` cancels a live run; `POST /runs/:id/reveal` opens its
workspace in the platform file manager and takes no path — it resolves the
folder from the run it is scoped to.

## Auth gotcha: subscription vs API key

The spawned CLI strips `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` from
its env. Subscription mode (default) uses the user's `claude /login`
OAuth. api-key mode injects the stored key **and passes `--bare`** —
without `--bare`, a logged-in CLI silently ignores the env key and
bills the plan (keys otherwise need interactive approval into
`~/.claude.json` `customApiKeyResponses`).

A subscription **session limit** parks the run; it does not fail it. The
stage stops on a durable `limit:<runId>:<stageId>` signal carrying the reset
time parsed from the CLI's own message, resumes by itself once that time
passes, and survives a server restart still parked. Release it early — with a
different model or tier, once the plan is topped up — via
`POST /runs/:id/limit/:stageId/resolve`. A parked run is not a stuck run, so
wait or resolve it rather than aborting and re-running from the top.
