# Assignment: Review a settled run and decide what happens next

A run you own has finished. Read the orchestration goal, the approved team, the
run's terminal status, its stage outputs, its Product Manager closeout if one was
supplied, and any milestone context. Then do two things in one turn.

## First: collect the run's artifacts

Consolidate what the run produced into durable facts a later run can use. When a
Product Manager closeout was supplied, take its report as authoritative and
condense it rather than re-deriving it from the raw stage outputs.

Return exactly one fenced `adhd-run-artifacts` JSON block:

````
```adhd-run-artifacts
{
  "summary": "What this run actually produced",
  "deliveredScope": ["Completed outcome"],
  "decisions": ["Durable decision a later run must not relitigate"],
  "knowledge": ["Fact useful to a later run"],
  "findings": [
    {
      "id": "stable-finding-key",
      "title": "Unresolved problem",
      "severity": "blocking",
      "evidence": "Where it was observed"
    }
  ],
  "nextRecommendation": "What this orchestration should do next"
}
```
````

`severity` is exactly `blocking` or `non_blocking` — those two spellings only.
Record which platform was exercised and any Windows/macOS gap as knowledge. Do
not invent scope the run did not deliver, and do not mark unresolved work
complete because the run reached a terminal status.

## Second: decide what happens next

Return exactly one fenced `adhd-orchestrator-decision` JSON block. The available
actions are the ones in your orchestration assignment. For a settled run these
four are the ones that apply:

Start another run with the approved team, when the goal needs more work that the
same team can do:

```json
{
  "action": "start_run",
  "rationale": "Why this is the next run",
  "task": "Decision-complete scope for this run",
  "fromStage": "optional role id to begin at"
}
```

Name `fromStage` when the roles before it have nothing left to do — their output
from this run is carried into the next one, and they do not run again. A run that
verified nothing because verification was blocked needs the verifying role, not
the whole team; re-running the role that already delivered spends the user's
money to produce what you already have.

Continue a milestone by running its next feature. Only available when the run
belonged to a milestone whose context says continuing is permitted. Name a
`featureId` from the supplied ready features to override the default order:

```json
{
  "action": "continue_milestone",
  "rationale": "Why this feature is next",
  "featureId": "optional ready feature id"
}
```

Ask the user, when the next step turns on a decision only they hold:

```json
{ "action": "ask_user", "question": "One specific question" }
```

Stop, because the goal is met or cannot proceed:

```json
{ "action": "stop", "reason": "Why this ends here", "summary": "What was achieved" }
```

## Rules

An unmet environment precondition is not a quality verdict. A role can report
`FAIL` because the work is wrong, or because it could never do the work at all —
no browser was connected, no credential was supplied, no tool was installed, no
service was running. Read which one the findings describe. The second is not
fixed by running the same team against the same machine again: it is an
`ask_user` naming exactly what the user must connect, install, or start. Say it
the first time you read it, not on the fourth run.

A failed or needs-attention run is not automatically a reason to stop — decide
from the findings whether the work can continue. Do not propose a new team here;
the approved team is already composed. Do not answer or route a specialist
question in this turn — no specialist is waiting.
