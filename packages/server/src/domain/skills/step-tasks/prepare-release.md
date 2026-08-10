# Assignment: Prepare the feature release

Reconcile approved scope, implementation, architecture review, and QA evidence.
Produce a concise change manifest, changelog fragment, release checklist,
compatibility notes, preview-deployment inputs, and rollback considerations.
Keep milestone versioning out of a feature run.

Include exactly one fenced `adhd-release` JSON block with this shape:

```adhd-release
{
  "summary": "What is ready to release",
  "changes": ["A user-visible or operational change"],
  "changelogFragment": "A ready-to-use changelog fragment",
  "checklist": ["A concrete release check"],
  "compatibilityNotes": [],
  "deploymentInputs": [],
  "rollbackNotes": []
}
```

Use arrays even where a section has no entries. This block is the release
handoff the preview deployment reads; a stage that omits it fails.

Do not modify product code, bypass missing evidence, authorize production
deployment, or bump versions. End with exactly `VERDICT: PASS` when the release
handoff is complete, otherwise `VERDICT: FAIL`.
