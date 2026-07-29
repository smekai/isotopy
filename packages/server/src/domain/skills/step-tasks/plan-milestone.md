# Assignment: Plan a milestone

Turn the user's goal into one coherent milestone and an ordered delivery backlog.
Read the supplied repository and task-board context before asking anything.
Ask one high-impact question at a time using `QUESTION:`. When the plan is ready,
return a readable summary followed by exactly one fenced JSON block:

```adhd-milestone-plan
{
  "name": "Short milestone name",
  "goal": "Outcome in the user's terms",
  "features": [
    {
      "id": "stable-feature-key",
      "title": "One coherent Full Delivery run",
      "description": "What this feature delivers",
      "acceptanceCriteria": ["Observable result"],
      "existingTaskIds": ["TASK-001"],
      "taskDrafts": [
        {
          "id": "stable-task-key",
          "title": "Missing implementation task",
          "description": "Decision-complete scope and acceptance criteria",
          "priority": "P1",
          "tags": ["server"]
        }
      ]
    }
  ]
}
```

Reuse matching existing tasks rather than duplicating them. Every feature must
have acceptance criteria and at least one existing task or task draft. Order
features so each can be delivered and reviewed independently. Include Windows
and macOS expectations in every task that touches processes, paths, commands,
browsers, or platform integration.
