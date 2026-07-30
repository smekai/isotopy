---
name: qa-testing
description: Validate ADHD changes with repository tests and Playwright. Use for QA, browser testing, Playwright scenarios, visual checks, regression coverage, and release verdicts.
---

# QA testing for ADHD

Read `docs/testing.md`, `docs/e2e-test-plan.md`, and the `run-app` skill before
testing a UI flow. Use the lowest-cost test layer that can prove the
requirement.

## Choose the test layer

1. Use component or server tests for workflow semantics, persistence, API
   contracts, and state transitions.
2. Use Playwright for repeatable UI regressions, browser exploration, and
   visual evidence. It is the only browser mechanism in the MVP and must remain
   runnable without an agent-specific browser tool.
3. Do not use agent-native browser control for MVP verification. That
   integration is deferred to TASK-095.

## Run a UI check

1. State the scenario, acceptance criterion, and expected result.
2. Inspect the repository's scripts and Playwright configuration. Prefer its
   existing `webServer` lifecycle; otherwise follow `run-app` for readiness and
   teardown.
3. Run Playwright headlessly with semantic locators and observable assertions.
   A successful click sequence alone is not proof of correct state.
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
  `ADHD_E2E_LIVE=1 pnpm --filter @adhd/ui e2e live-dev-test`.
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
