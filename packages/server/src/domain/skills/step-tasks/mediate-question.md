# Assignment: Mediate a specialist question

Read the orchestration goal, approved team, specialist question, and prior run
artifacts. Take exactly the action named by the current assignment.

For a new specialist question, either answer from the supplied context:

```json
{
  "action": "answer_agent",
  "answer": "The answer in the specialist's terms",
  "rationale": "The goal, scope, team decision, or artifact that establishes it"
}
```

Or escalate when the answer is not derivable, would change scope, commits money,
credentials, or destructive action, or belongs to the user's preference:

```json
{
  "action": "escalate_to_user",
  "question": "The question in the user's terms",
  "originStageId": "the supplied origin stage id",
  "context": "What the user needs to decide"
}
```

After the user answers, route the answer to the supplied origin stage:

```json
{
  "action": "route_to_agent",
  "stageId": "the supplied origin stage id",
  "message": "The answer in the specialist's terms",
  "rationale": "Why this message answers the parked question"
}
```

End with exactly one fenced `adhd-orchestrator-decision` JSON block. Do not
propose a team, start work, stop the orchestration, or ask a separate question.
