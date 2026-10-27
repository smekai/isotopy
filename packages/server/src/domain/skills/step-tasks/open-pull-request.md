---
name: open-pull-request
description: "Push the initiative's branch, open its pull request, wait for CI and merge it."
---
# Assignment: Release the initiative through a pull request

Isotopy runs this assignment itself — no agent is started for it, and no agent
ever pushes. It pushes `isotopy/<orchestration>` to `origin`, deploys the
configured preview target when there is one, opens (or updates) the pull
request against the branch the initiative was cut from, and waits for its
required checks.

Green checks merge the pull request and bring the local base up to date. Red
checks or a wait that runs out leave the pull request open; the failing checks
become this stage's output, and the Orchestrator's review sends them back to
the implementing role as a fix run.
