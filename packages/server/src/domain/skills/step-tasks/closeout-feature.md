# Assignment: Close out the feature run

Consolidate the approved scope, decisions, implementation handoff, review and QA
evidence, release or deployment evidence, unresolved problems, and cleanup
result. Distinguish completed work from blocking findings and runtime failures.
Propose concrete, deduplicable follow-up tasks and durable knowledge for the
next feature run.

Do not mark unresolved work complete or implement fixes during closeout. Record
which platform was tested and any Windows/macOS gap. Return exactly one
`adhd-closeout` fenced JSON block with this shape before the verdict:

```adhd-closeout
{
  "summary": "What happened",
  "deliveredScope": ["Completed outcome"],
  "decisions": ["Durable decision"],
  "knowledge": ["Fact useful to later runs"],
  "findings": [
    {
      "id": "stable-finding-key",
      "title": "Unresolved problem",
      "severity": "blocking",
      "evidence": "Where it was observed"
    },
    {
      "id": "another-finding-key",
      "title": "Problem that does not hold the feature back",
      "severity": "non_blocking",
      "evidence": "Where it was observed"
    }
  ],
  "tasks": [
    {
      "findingId": "stable-finding-key",
      "title": "Follow-up task",
      "description": "Decision-complete work",
      "priority": "P1",
      "tags": ["server"]
    }
  ],
  "completedTaskIds": ["TASK-001"],
  "unresolvedTaskIds": ["TASK-002"],
  "cleanup": [
    {
      "relativePath": "browser-profile",
      "reason": "Run-owned temporary profile"
    }
  ],
  "nextRecommendation": "What the milestone should do next"
}
```

`severity` is exactly `blocking` or `non_blocking` — those two spellings only.
Only list source tasks actually completed by this run in `completedTaskIds`;
everything selected but unfinished belongs in `unresolvedTaskIds`. Cleanup paths
are relative to this run's temporary directory and must be `.` or one immediate
child. End with `VERDICT: FAIL` when any blocking finding or unresolved selected
task remains; otherwise end with `VERDICT: PASS`.
