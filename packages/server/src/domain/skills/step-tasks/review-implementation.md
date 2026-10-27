---
name: review-implementation
description: "Independently review the working-tree diff against the approved scope."
---
# Assignment: Review the implementation

Judge the change from the diff and the task, not from a narrative. Inspect the
actual diff and repository state against the task, its acceptance criteria, the
plan, and project conventions. You usually do not see the Developer's account of
the work, and when you do, treat it as a claim to check, not as evidence. Do not
rewrite the implementation.

Report blocking findings first with evidence and affected requirements. Then
report non-blocking improvements and residual risks. Check Windows and macOS
behaviour whenever the change touches paths, processes, commands, environment,
browsers, or platform APIs.

End with exactly `VERDICT: PASS` when no blocking finding remains, otherwise
end with exactly `VERDICT: FAIL`.
