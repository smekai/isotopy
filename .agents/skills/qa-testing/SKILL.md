---
name: qa-testing
description: Validate ADHD UI changes and workflow evidence. Use for QA, browser testing, Playwright scenarios, visual regression checks, or deciding whether agent-native browser control can complement automated tests.
---

# QA testing for ADHD

Read `docs/testing.md`, `docs/e2e-test-plan.md`, and the `run-app` skill before testing a UI flow. Use the lowest-cost test layer that can prove the requirement.

## Choose the executor

1. Use component or server tests for workflow semantics, persistence, API contracts, and state transitions.
2. Use Playwright for repeatable UI regressions. It is the repository-owned source of CI evidence and must remain runnable without an agent-specific browser tool.
3. Use an agent-native browser only for exploratory or visual checks that benefit from live inspection. First verify that the current agent environment exposes browser control and read its current capability documentation. Do not assume a Codex, Cursor, or Claude browser feature exists, has the same API, or can run in CI.

Agent-native browser control belongs to the executing harness, not to ADHD. Do not add a runtime dependency on a vendor-private tool API. If the capability is unavailable, requires user sign-in, or cannot perform the needed interaction, record `SKIP` with the reason and continue with Playwright when the scenario is expressible there.

## Run a UI check

1. State the scenario, expected result, and whether it is exploratory or a regression candidate.
2. Start only the app processes required for the check. Follow `run-app` for readiness and teardown. Preserve an already-running user app and terminate only processes started by the test run.
3. Exercise the scenario using the chosen executor. Use semantic locators and observable assertions; do not treat a successful click sequence as proof of correct state.
4. Retain screenshots for visual findings and traces when the executor provides them. Record the executor, commands, browser mode, and limitations with the result.
5. Promote stable, deterministic behaviour into a Playwright test. Keep exploratory observations as QA evidence when no durable assertion is appropriate.

## Playwright rules

- Run `pnpm e2e` for the free and seeded suite. It starts an isolated server and never spends engine tokens.
- Do not enable the live tier unless the task explicitly authorizes its cost: `ADHD_E2E_LIVE=1 pnpm --filter @adhd/ui e2e live-dev-test`.
- Keep UI assertions in Playwright and workflow behavior in component tests; do not duplicate the same rule at both layers.
- Use the existing typed seeded-run fixtures for rendering coverage. Add a new test only when it protects a named regression or acceptance criterion.

## Verdict and handoff

End every QA handoff with one of `VERDICT: PASS`, `VERDICT: FAIL`, or `VERDICT: SKIP`, then record:

- scenario and expected behaviour;
- executor and commands used;
- screenshots/traces and their artifact locations;
- observed result and any coverage gap;
- Playwright test added, updated, or proposed.

`FAIL` blocks release or deploy work but does not prevent safe remaining evidence collection. `SKIP` is valid only with an actionable reason and fallback decision.

## Cross-platform

Support Windows and macOS. Use repository commands and typed executable-plus-argument configuration rather than shell-only one-liners. Resolve paths with Node APIs, parse output using `/\r?\n/`, and record the platform actually tested. When an agent-native browser integration is unavailable on one platform, fall back to Playwright and state the limitation accurately.
