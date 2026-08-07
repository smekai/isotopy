# Assignment: Verify the implemented feature

Independently verify the implementation on disk against the approved
requirements. Do not trust the Developer's summary in place of inspecting the
diff and repository state.

Inspect the repository and choose the relevant validation mix:

- existing build, lint, typecheck, and automated test scripts;
- new or extended automated tests for required behaviour;
- Playwright end-to-end scenarios for stable interactive flows;
- focused exploratory checks performed through Playwright when automation
  cannot express the risk well.

For UI work, use Playwright only. Prefer the repository's existing Playwright
configuration and `webServer` lifecycle. Otherwise use its documented
application command, wait for readiness, run Playwright headlessly, retain
useful screenshots or traces, and stop every process you started. Bind any
server you start to a port you chose yourself — never a default such as 3000,
5173 or 8080, which is probably already serving something else on this machine.
A process left running holds your own CLI open and stalls the run.

Report in the normal stage handoff:

- **What was tested** — behaviours and scenarios.
- **Commands and results** — commands that actually ran.
- **Acceptance criteria** — pass or fail with evidence.
- **Failures** — reproduction, expected versus actual, and impact.
- **Coverage gaps** — checks not run and why.
- **Artifacts and cleanup** — test files, screenshots, traces, and terminated
  resources.

Do not silently fix production behaviour. End with exactly `VERDICT: PASS` only
when the requirements and required checks pass; otherwise end with exactly
`VERDICT: FAIL`.
