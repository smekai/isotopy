---
name: qa-testing
description: Validate Isotopy changes with repository tests and Playwright. Use for QA, browser testing, Playwright scenarios, visual checks, regression coverage, and release verdicts.
---

# QA testing for Isotopy

Read `docs/testing.md`, `docs/e2e-test-plan.md`, and the `run-app` skill before
testing a UI flow. Use the lowest-cost test layer that can prove the
requirement.

**Every test you write follows the AAAAA standard** — Arrange, Anticipate, Act,
Assert, AI. One action per test, no `if`/`for`/`try` in a test body (ESLint
enforces this; loops and polls belong in `test/support/`), atomic anticipations
rather than flag-driven mock factories. The full standard is in `docs/testing.md`
and in the `write-tests` skill; load it before adding a test rather than copying
the shape of whichever file you happened to open.

## Choose the test layer

1. Use component or server tests for workflow semantics, persistence, API
   contracts, and state transitions.
2. Use Playwright for repeatable UI regressions and visual evidence. It stays
   the authority: every rule that must hold has to be provable without any
   agent-specific browser tool, because CI has none.
3. Use your own browser capability for exploration and for looking at something
   once. Anything it finds that must keep holding is promoted into a Playwright
   test — a finding seen only through an agent browser is not covered.

## Run a UI check

1. State the scenario, acceptance criterion, and expected result.
2. Inspect the repository's scripts and Playwright configuration. Prefer its
   existing `webServer` lifecycle; otherwise follow `run-app` for readiness and
   teardown.
3. Run Playwright headlessly with semantic locators and observable assertions.
   A successful click sequence alone is not proof of correct state.
   Where the project under test declares a `ui` start command, ask Isotopy to
   start the product (`POST /automation/product/start`) rather than starting a
   server yourself — it owns that process and its port.
4. Retain screenshots for visual findings and traces when they help reproduce a
   failure. Record the commands, browser mode, and limitations.
5. Promote stable behaviour into a Playwright test when it protects a named
   requirement or regression. Keep unsuitable exploratory observations in the
   QA handoff.
6. Stop only the application and browser processes started by the QA run.

## Repository rules

- Run `pnpm e2e` for the free and seeded suite. It starts an isolated server and
  never spends engine tokens.
- Do not enable the live tier unless the task explicitly authorizes its cost:
  `ISOTOPY_E2E_LIVE=1 pnpm --filter @isotopy/ui e2e live-dev-test`.
- Keep UI assertions in Playwright and workflow behaviour in component tests;
  do not duplicate the same rule at both layers.
- Use existing typed seeded-run fixtures for rendering coverage. Add a test only
  when it protects a named regression or acceptance criterion.

## Verdict and handoff

QA is a normal workflow step. Return evidence in its ordinary handoff and end
with `VERDICT: PASS`, `VERDICT: FAIL`, or `VERDICT: SKIP`. Record:

- scenarios and expected behaviour;
- commands and results;
- screenshots or traces and their locations;
- observed result and coverage gaps;
- Playwright tests added, updated, or proposed;
- cleanup performed.

`FAIL` blocks release or deploy work but does not prevent safe remaining
evidence collection. `SKIP` requires an actionable reason.

## Cross-platform

Support Windows and macOS. Use repository-owned commands instead of shell-only
one-liners, use Playwright-managed browser and server lifecycles where
available, resolve paths with Node APIs, parse output using `/\r?\n/`, and
record the platform actually tested.
