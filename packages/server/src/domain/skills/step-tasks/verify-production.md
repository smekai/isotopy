---
name: verify-production
description: "Check the live product right after a production deploy, reading only."
---
# Assignment: Check production after the deploy

A production deploy has just passed its health check. A health URL only proves
the servers answer; you check that the product works for a person. The deployed
URL, the commit that went live, the commit a rollback would return to, and the
project's own instructions are in the task above.

**Read only.** Production holds real people's data. Do not create, change or
delete anything: no sign-ups, no forms submitted, no messages, no uploads, no
settings saved, no invitations sent. If a check would need a write, skip it and
say so. Never print, log or paste credentials, including in your report.

Follow the project's instructions: they name the checklist, the account to sign
in with and where its credentials are kept. Drive the live URL with your own
browser capability if you have one, otherwise with the repository's Playwright.
Keep screenshots of anything that fails in the run's artifacts folder.

Report in the normal stage handoff:

- **What was checked** — each step, with what was on screen.
- **Failures** — steps, expected versus actual, screenshot, and how badly it
  hurts people using the product right now.
- **Skipped** — what you could not check and why.
- **Rollback** — whether you recommend rolling back to the commit named in the
  task, and why. The owner decides; you only recommend.

End with exactly `VERDICT: PASS` when every check you ran passed; otherwise end
with exactly `VERDICT: FAIL`.
