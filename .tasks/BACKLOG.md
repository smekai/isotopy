# Backlog

## TASK-033: Migrate repos to the `smekai` GitHub org (fix all references)
**Priority:** P2 | **Tags:** setup, infra
**Updated:** 2026-07-16 16:04

Transfer `adhd` and `taskplanner` from the personal account into the `smekai` GitHub org (domain: `smek.ai`), and fix every reference that assumes the old owner. Redirects keep old URLs working, but they die the moment a repo with the old name is recreated — so update everything explicitly.

GitHub transfer:

- Repo → Settings → Transfer → target org `smekai` (do both repos).
- Do NOT recreate a repo with the old name on the personal account afterwards (kills the redirect).

Code / manifest references:

- `taskplanner/package.json` → set `repository.url` to `https://github.com/smekai/taskplanner` (currently `refined/taskplanner`); add/adjust `homepage` + `bugs.url` if present.
- `adhd/package.json` → no repo field today; add `repository`/`homepage` pointing at `smekai/adhd` if we want it.
- Sweep both repos for hardcoded `github.com/<old-owner>/…` (also in `CLAUDE.md`, `.cursorrules`, docs) and repoint to `smekai`.

Local / tooling:

- `git remote set-url origin https://github.com/smekai/<repo>.git` on all working copies.
- Re-issue fine-grained PATs scoped to the `smekai` org (personal-scoped ones won't cover org repos).
- Re-approve required third-party OAuth/GitHub Apps under the org (Settings → Third-party access); reconnect any external CI/deploy integrations bound to `personal/repo`.
- Check for GitHub Pages / custom-domain (`smek.ai`) CNAME that needs repointing.

Out of scope (decide separately):

- VS Code Marketplace `publisher` (`refined`) is independent of GitHub — the transfer does not change it. Renaming the publisher is a separate, riskier operation; do not bundle it here.

Done when: both repos live under `smekai`, all manifests/docs/remotes point at the new owner, CI + integrations green, and no stale `github.com/refined|<personal>` references remain.

---

## TASK-022: Introduce a logger across the system
**Priority:** P2 | **Tags:** core, server, ui, infra
**Updated:** 2026-07-14 10:51

Replace ad-hoc `console.log`/`console.error` calls with a small structured logger used across all packages.

- Define the logger interface in `@adhd/core` (levels: debug/info/warn/error; per-module scope/prefix; timestamps).
- Server (`@adhd/server`): log HTTP requests, orchestrator/engine lifecycle events, and errors; level configurable via env (e.g. `LOG_LEVEL`), default `info`.
- UI (`@adhd/ui`): thin console-backed implementation of the same interface, silenced in production builds except warn/error.
- Keep it dependency-light (plain implementation or a minimal lib like `pino` on the server only); no log files yet — stdout/console is enough for the prototype.
- Sweep existing `console.*` usages and migrate them.

---

## TASK-021: Cursor & Codex engine adapters
**Priority:** P2 | **Tags:** adapters, milestone-c

Implement real adapters behind the EngineAdapter interface for the Cursor CLI and Codex CLI; flip `available` in ENGINES and remove the SOON badges. Supersedes the Cursor half of TASK-007.

---

## TASK-005: File-backed workflow engine (state.json + events.jsonl)
**Priority:** P1 | **Tags:** milestone-b

Replace in-memory mock with `.adhd/runs/` persistence and real subprocess stages.

---

## TASK-006: First harness adapter (generic subprocess)
**Priority:** P1 | **Tags:** milestone-c, adapters

Generic subprocess `HarnessAdapter` for any CLI command in a worktree.

---
