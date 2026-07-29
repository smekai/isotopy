# Project automation

ADHD stores project-owned automation in `.adhd/automation.json`. The Setup
screen edits this file through the server API. Missing configuration is
represented by the explicit versioned default:

```json
{
  "version": 1,
  "validation": [],
  "ui": null,
  "preview": null,
  "production": null
}
```

Commands are an executable plus an argument array. They are never shell
one-liners. A command can replace its executable and arguments for Windows or
POSIX, while its project-relative working directory and timeout remain shared.
ADHD rejects absolute working directories and paths that escape the project.
Child processes inherit the server environment; credentials are not stored in
the automation file.

## Deployment

Full Delivery validates the Release Manager's fenced `adhd-release` record
before it can deploy. If preview is configured and quality has passed, the SRE
stage runs the command, records stdout and stderr, reads an optional exact
`ADHD_DEPLOY_URL=https://…` output marker, and verifies the configured or
reported URL. No preview configuration produces `SKIP` without starting a paid
agent.

Release evidence is stored under `.adhd/runs/<run-id>/release/`. Preview
deployment evidence is stored under `.adhd/runs/<run-id>/deploy/`. Each
deployment directory contains structured JSON, readable Markdown, and the
captured process log.

Production is not part of Full Delivery or milestone autorun. It is a separate
Setup action with a browser confirmation and an API request containing the
literal confirmation `DEPLOY PRODUCTION`. Production evidence is stored under
`.adhd/deployments/<deployment-id>/`.

Vercel and Docker Compose presets are conveniences only. Custom commands are
the portable escape hatch. Every project should validate both its Windows and
POSIX command variants before relying on automatic preview deployment.
