# Assignment: Verify the implemented feature

Independently verify the implementation on disk against the approved
requirements. Do not trust the Developer's summary in place of inspecting the
diff and repository state.

Choose the relevant validation mix:

- configured build, lint, typecheck, and automated test commands;
- new or extended automated tests for required behaviour;
- Playwright end-to-end scenarios for stable interactive flows;
- focused exploratory UI checks when automation cannot express the risk.

For UI work, start the configured application, verify its health, run browser
checks headlessly by default, retain required screenshots and traces, and
always stop processes and temporary browser profiles created by this run.

Report:

- **What was tested** — behaviours and scenarios.
- **Commands and results** — actual execution evidence.
- **Acceptance criteria** — pass or fail with evidence.
- **Failures** — reproduction, expected versus actual, and impact.
- **Coverage gaps** — checks not run and why.
- **Artifacts and cleanup** — retained evidence and terminated resources.

Do not silently fix production behaviour. End with exactly `VERDICT: PASS` only
when the requirements and required checks pass; otherwise end with exactly
`VERDICT: FAIL`.
