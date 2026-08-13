# Project automation

A project's own commands — how to start it, how to check it, how to deploy it —
live in `.adhd/automation.json`. The Setup screen's **Automation** section edits
that file through `GET`/`PUT /automation`. A project that has never configured
anything reads back as the explicit empty configuration rather than an error:

```json
{ "version": 1, "validation": [] }
```

## Commands are arrays, never shell strings

A command is an executable plus an argument array. It is never a shell
one-liner, because quoting rules differ between `cmd.exe` and a POSIX shell and
a string that works on one silently misbehaves on the other.

A command may replace its executable and arguments for Windows or POSIX while
its project-relative working directory and timeout stay shared. The common case
is a Node shim — `npx` on POSIX, `npx.cmd` on Windows — and the Setup form edits
that as a single "Windows executable" field, reusing the same arguments. Two
platforms needing genuinely *different* arguments is rare enough that it is
edited in `automation.json` directly, and the form then leaves those arguments
alone: it only keeps an override in step with the base command while the two
already agree.

Absolute working directories, and any path that climbs out of the project, are
refused when the configuration is saved — not when the command runs. Child
processes inherit the server environment; no credential is ever stored in the
automation file.

## What each section is for

| Field | Used by |
| --- | --- |
| `validation` | The checks the project owns, named by id, for QA and the Release Manager to run |
| `ui` | The start command, readiness URL and ready timeout for showing a built product |
| `preview` | The deployment Full Delivery runs itself once quality has passed |
| `production` | The deployment only a human can trigger, from Setup |

## Preview deployment

The `deploy` box of Full Delivery does not start an agent. Any stage whose step
task is `deploy-preview` is executed by Isotopy directly: with no preview target
configured the stage records that and ends `SKIP`, spending nothing. With one
configured it runs the command, streams stdout and stderr into the stage log,
and reads back an exact `ISOTOPY_DEPLOY_URL=https://…` line if the command prints
one — the last such line wins, because deploy tools print progress before their
result. The reported URL, or the configured one, is then health-checked, and the
stage passes only if both the command and the health check pass.

The quality gate is not re-implemented here: `release` and `deploy` carry the
`delivery` execution policy, and `canRunStage` already suppresses a delivery
stage unless the run is still whole.

The Release Manager's fenced `adhd-release` block is what the release stage is
*for*; a stage that answers in prose fails rather than passing a handoff nothing
downstream can read.

## Evidence on disk

| Path | Written by |
| --- | --- |
| `.adhd/runs/<run-id>/release/` | `release.json`, `release.md` |
| `.adhd/runs/<run-id>/deploy/` | `deployment.json`, `deployment.md`, `deploy.log` |
| `.adhd/deployments/<deployment-id>/` | The same three files, for a production deployment, which belongs to the project rather than to a run |

## Production

Production is deliberately outside Full Delivery and outside milestone autorun.
It is a separate Setup action that requires a browser confirmation *and* an API
request carrying the literal string `DEPLOY PRODUCTION`. A confirmed request
against a project with no production target answers `409` rather than doing
nothing quietly.

## Presets

Vercel and Docker Compose are conveniences that fill in a plausible command;
custom commands are the portable escape hatch. Whichever is chosen, validate
both the Windows and the POSIX form of the command before relying on automatic
preview deployment.
