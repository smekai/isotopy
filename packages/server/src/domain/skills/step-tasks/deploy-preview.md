# Assignment: Deploy the preview environment

ADHD runs this assignment itself, from the project's automation configuration —
no agent is started for it. When no preview target is configured the stage ends
with `SKIP` rather than spending an engine turn on it.

When a preview target is configured, ADHD runs its configured executable and
argument array with the correct Windows or POSIX override, reads back a single
`ADHD_DEPLOY_URL=https://…` line if the command prints one, verifies the
resulting URL against the configured health check, and stores the command, URL,
logs, and verdict as run evidence.

Production is never deployed here. It is a separate, explicitly confirmed action
in Setup.
