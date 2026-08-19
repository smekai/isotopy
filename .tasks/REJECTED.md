# Rejected

## TASK-152: `pnpm dev` gives a UI that cannot reach the server on Windows
**Priority:** P1 | **Tags:** infra, ui, server, milestone-h
**Updated:** 2026-08-19 10:30

**Rejected as not reproducible, 2026-08-19.** `pnpm dev` is not broken. The failure was an
artefact of how the processes were started, and the task was filed on a diagnosis that did not
survive being tested.

**What the investigation actually showed.** Started through the agent harness — two separate
`pnpm --filter … dev` commands — the UI proxy failed on every route with
`AggregateError [EADDRINUSE]`, reproducibly, across two sessions. Started with a plain `pnpm dev`
on the same machine, same default ports, same `localhost` bind (`[::1]:9477`) and the same
name-based proxy target, it works with **zero** proxy errors. The variable is the launcher, not
the repository.

Three hypotheses were tested and each one died:

- *The server binds one address family.* True — `hostname: "localhost"` binds `::1` only here, and
  `127.0.0.1:9477` is refused. But pinning both sides to `127.0.0.1` fixed the harness case **and**
  leaving the bind alone while pinning only the proxy also fixed it, while fixing the bind alone did
  not. So the bind was never the cause.
- *The port is reserved.* No. 9477 is outside every Windows excluded range, and the dynamic range
  starts at 49152.
- *e2e does not exercise this path.* Wrong, and this was the claim in the original filing.
  `playwright.config.ts` runs `pnpm dev` verbatim and gates on a proxied `/health`. It passes
  because `pnpm dev` genuinely works — not because it avoids the proxy.

**No product change was made.** Pinning loopback literals was drafted and discarded: it would have
changed shipped defaults to accommodate one launcher, on a machine where the shipped defaults are
fine.

**The diagnosability half survived, as skill and log rather than as a task.** Two things turned a
minute of confusion into an hour and are now fixed:

- `.claude/skills/run-app/SKILL.md` polled the proxied `/health` with `curl -sf` inside
  `timeout 60`, so a proxy returning 500 was indistinguishable from a server still booting and the
  agent carried on regardless. The health gate now fails loudly, prints the direct URL's response
  for comparison, and says what a dead proxied URL beside a healthy direct one actually means —
  either the Vite process never started or the proxy hop is failing, which are different faults.
  The first attempt at this reproduced the very bug it was fixing: a shell group returns its last
  command's status, so `… || { echo; curl; }` exited **0** whenever the direct `curl` succeeded.
  Caught in review; the group now ends in `false`.
- `packages/server/src/index.ts` logged a URL built from config rather than from the socket. It now
  prints the address actually bound, which is the fact that was missing while guessing at families.

Original scope follows, for the record:

Found while verifying `TASK-148` in the real app. `pnpm dev` starts both processes, the UI loads, and
**every** proxied request fails:

```
[vite] http proxy error: /settings
AggregateError [EADDRINUSE]: at internalConnectMultiple (node:net:1134:18)
```

The server binds `localhost`, which on this machine resolves to IPv6 only — `netstat` shows
`[::1]:9477 LISTENING`, `curl http://[::1]:9477/health` answers `200`, and
`curl http://127.0.0.1:9477/health` is refused. Vite's proxy client tries both families and reports
the aggregate as `EADDRINUSE`. So the whole app degrades to "Could not load projects" with no error
that names the cause.

`pnpm e2e` is unaffected — it starts its own pair on 9499/5199 and its 68 tests pass — which is
exactly why this has stayed invisible: the gate that would catch it does not use this path.

**Why it matters:** `pnpm dev` is what `.claude/skills/run-app/SKILL.md` tells an agent to run, so
every dogfood starts here. `TASK-141`'s pre-flight already lost time to stale claims in that skill;
this loses more, and silently.

**Decide which side moves.** Either the server binds both families (`ISOTOPY_HOST=0.0.0.0`, or
listening on `::` with dual-stack), or the Vite proxy targets an explicit literal rather than
`localhost` (`packages/ui/vite.config.ts` builds `serverUrl` from `ISOTOPY_PORT`). Whichever wins,
`pnpm dev` must work on a stock Windows box without an env var, and the health check in the run-app
skill should prove the *proxied* path, not just the direct one — today it checks
`http://localhost:5173/health`, which is the request that fails, so the skill's own gate should have
caught this.

Cross-platform: the failure is a Windows name-resolution difference; the fix must not break macOS,
where `localhost` usually resolves IPv4-first.


---

## TASK-095: Agent-native browser testing for QA
**Priority:** P3 | **Tags:** testing, adapters, engine, milestone-h
**Updated:** 2026-08-11 17:30

**Rejected as answered by:** TASK-138, 2026-08-11.

`TASK-138` built this from the other side. The embedded browser it added to show a user the
running product needed the product's process and URL to be owned by ADHD — and once they are,
an agent driving that same URL needs nothing further from ADHD. The research behind that task
([`docs/embedded-preview.md`](../docs/embedded-preview.md)) is the reason: Cursor, Codex and
Claude Code all already drive a page over CDP, so the "vendor-neutral seam for browser-control
capabilities exposed by Codex, Cursor, Claude" this task asked for is a seam each vendor
already owns. Building an abstraction over it would have been ADHD's third copy of something
that turns over faster than we could track it, which is the same objection `TASK-129` raised
about model ids.

**Its policy half survived, as policy rather than as a task.** "When no compatible capability
exists, Playwright remains the complete fallback and CI authority" is now written into
`packages/server/src/domain/skills/personas/tester.md` (via the `gen:` blocks in
`docs/testing.md`) and `step-tasks/verify-feature.md`. A third copy lived in
`.agents/skills/qa-testing/SKILL.md` until `TASK-151` deleted that directory on 2026-08-19 —
nothing read it, and it was a hand-maintained restatement of the two homes above.
The persona's old boundary — *"Do not use or depend on an agent-native browser in the MVP;
that work is deferred to TASK-095"* — is gone, replaced by the rule that a browser capability
may be used but must never become a precondition, because CI has none.

Original scope follows, for the record:

Add a vendor-neutral testing seam for browser-control capabilities exposed by Codex, Cursor, Claude, or another active harness. QA may use an available native browser first for exploratory and visual checks, then promote stable behaviour into repository-owned Playwright tests. When no compatible capability exists, Playwright remains the complete fallback and CI authority.

Cross-platform: support Windows and macOS capability detection and degrade to Playwright with an accurate recorded reason.

---

## TASK-097: Post-MVP — compose delivery workflows from the persona catalog
**Priority:** P2 | **Tags:** core, server, ui, engine
**Updated:** 2026-07-29 08:56

**Superseded by:** TASK-110

Use an initialization/planning step to analyze an approved feature and select the required personas and developer specializations from the available catalog, for example adding a Product Designer for UI work or a mobile developer specialization for a mobile feature. Persist the generated workflow, explain its composition, preserve required quality and closeout policies, and require human approval before execution.

Cross-platform: workflow composition is pure logic/UI; any selected persona tools must declare Windows and macOS support or degrade with an accurate SKIP reason.

---

## TASK-039: Pluggable run persistence — storage adapter + selectable DB backend
**Priority:** P2 | **Tags:** server, core, infra
**Updated:** 2026-07-26 19:27

The file-backed store from TASK-005 (`state.json` + `events.jsonl` under `.adhd/runs/`) works but flat JSON files are not a great long-term home for run state. Introduce a `RunStore` interface and make the backend selectable, then implement a real DB adapter alongside the JSON one.

**Scope:**
- Extract a `RunStore` interface from `packages/server/src/services/run-store.ts` (`writeState`, `appendEvent`, `loadAllRuns`) so the orchestrator depends on the interface, not the file functions.
- Keep the current JSON files as the **default** adapter (`JsonRunStore`) — no behaviour change out of the box.
- Add at least one real DB adapter (candidate: **SQLite** via better-sqlite3/libsql — single-file, zero-server, fits the local-first story; evaluate vs. Postgres for the hosted story).
- Config/env selector (e.g. `ADHD_RUN_STORE=json|sqlite`) wired through `config.ts`; document in `.env.example`.
- Migration note: how existing `.adhd/runs/*` JSON is imported into the DB (one-shot importer or lazy).

**Deliverable:** `RunStore` interface + `JsonRunStore` (default) + one DB adapter, selectable by config, with the orchestrator unchanged behind the interface. Depends on TASK-005.

---

## TASK-007: Claude Code / Cursor adapters
**Priority:** P2 | **Tags:** milestone-c, adapters
**Updated:** 2026-07-14 09:57

Wire Claude Code and Cursor CLI as implementation harness adapters. Superseded by TASK-013 (Claude Code) / TASK-021 (Cursor, Codex).

---
