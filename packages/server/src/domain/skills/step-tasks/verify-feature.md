# Assignment: Verify the implemented feature

Independently verify the implementation on disk against the approved
requirements. Do not trust the Developer's summary in place of inspecting the
diff and repository state.

Inspect the repository and choose the relevant validation mix:

- existing build, lint, typecheck, and automated test scripts;
- new or extended automated tests for required behaviour;
- end-to-end scenarios for stable interactive flows;
- focused exploratory checks in a browser when automation cannot express the
  risk well.

For UI work you need the product running. **Do not start it yourself, do not
kill it, and do not choose a port.** Where an `## Environment` section is given
above, ask ADHD to start the product and drive the URL it hands back; it owns
that process and will stop it. Where no such section is given, prefer the
repository's own Playwright configuration and its `webServer` lifecycle, which
owns the same problem.

Drive the running product with your own browser capability if you have one.
Where you have none, Playwright is the complete fallback and stays the authority
for anything that must run in CI. Retain useful screenshots or traces either
way, and stop only the browser processes you started yourself.

Report in the normal stage handoff:

- **What was tested** — behaviours and scenarios.
- **Commands and results** — commands that actually ran.
- **Acceptance criteria** — pass or fail with evidence.
- **Failures** — reproduction, expected versus actual, and impact.
- **Coverage gaps** — checks not run and why.
- **Artifacts and cleanup** — test files, screenshots, traces, and how the
  product was reached: through ADHD, through Playwright's `webServer`, or not
  at all.

Do not silently fix production behaviour. End with exactly `VERDICT: PASS` only
when the requirements and required checks pass; otherwise end with exactly
`VERDICT: FAIL`.
