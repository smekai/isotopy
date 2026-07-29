# Assignment: Deploy the preview environment

ADHD executes this assignment deterministically from the project automation
configuration. If no preview target is configured, the stage returns `SKIP`
without starting a paid agent.

Otherwise deploy only the configured preview target, verify its health, and
persist the URL, executed command, logs, result, and rollback input. Use explicit
executable and argument arrays with the correct Windows or POSIX override.

Never deploy production, improvise a shell command, or deploy with unresolved
blocking findings. End with exactly `VERDICT: PASS` when preview verification
succeeds, otherwise `VERDICT: FAIL`.
