# Assignment: Deploy the preview environment

Inspect the project deployment configuration. If no preview or staging target
is configured, record that fact and end with exactly `VERDICT: SKIP`.

Otherwise deploy only the configured preview or staging target, verify its
health, and report the URL, executed command, relevant logs, operational risk,
and rollback instructions. Use explicit executable and argument arrays with
the correct Windows or POSIX override. Clean up only processes and temporary
resources started by this run.

Never deploy production, improvise a shell command, or deploy with unresolved
blocking findings. End with exactly `VERDICT: PASS` when preview verification
succeeds, otherwise `VERDICT: FAIL`.
