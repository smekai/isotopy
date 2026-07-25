---
name: validate-code
description: Validate a change against this repo's architecture standard before calling it done — the A1–A9 review pass (comments, layering, seams, named types), the automated gates (lint, typecheck, test, build, e2e, gen:skills), and where "why" belongs. Load after writing or refactoring code here, and when reviewing a diff.
---

# Validating a change

[`architect`](../architect/SKILL.md) prescribes how code here must be **written**.
This skill is how you check that what you wrote actually meets it — run it on
your own diff before reporting done, and when reviewing someone else's.

Validation is two passes. The gates are necessary and cheap; they are not
sufficient, because none of them can see a layering violation or a comment that
should have been a rename.

---

## Pass 1 — the automated gates

From the repo root, shell-neutral:

```
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Then, conditionally:

| Run this | When |
|---|---|
| `pnpm --filter @adhd/ui e2e` | any UI structural change |
| `pnpm gen:skills` (commit the output) | you edited a `gen:` block in `docs/architecture.md` or a persona under `domain/skills/personas/` |
| the `run-app` skill | the change is only provable in the running app — a new endpoint, a screen, a storage path |

Rules about the gates:

- **Never report a change as done on a red gate.** If a gate fails for a reason
  you believe is unrelated, say so explicitly with the output; do not silently
  skip it.
- **A new behaviour needs a test that fails without it.** Adding only green
  assertions to existing tests proves nothing.
- **Tests live in `packages/*/test/`**, never beside the source — `src/` is what
  ships, and a colocated spec lands in `dist/`. `*.spec.ts` for pure units,
  `*.comp.ts` for request-in/behaviour-out component tests, `packages/ui/e2e/`
  for Playwright.
- **Watch what a test writes.** A test that touches the developer's real
  `~/.adhd` or the repo's `.adhd/` is a broken test even when it passes. Point
  `ADHD_HOME` and `ADHD_USER_HOME` at temp directories (`createTestApp` in
  `test/support/harness.ts` already does).

---

## Pass 2 — the standard, rule by rule

Read your own diff and answer each of these. A "no" is a change to make, not a
note to write down.

### A1 — Comments are a smell

Grep your diff for `//`, `/*` and `*`. For **every** surviving comment in a
`src/` file, one of these must be true, or it goes:

- it is a one-line pointer at genuinely intricate *local* logic — a subtle regex,
  a protocol quirk, a platform workaround right at the line;
- it is in a test (tests may explain themselves freely).

Everything else is deleted, and the content it carried goes to one of two places:

- a **better name** — if the comment explains *what* the code does, rename the
  function, variable or type until the comment is redundant, then delete it;
- a **Markdown doc** — if it explains *why this design*, move it to
  `docs/implementation-notes.md` (the non-obvious "how it works") or
  `docs/decisions.md` (a dated entry: context, decision, rejected alternative).

A doc comment restating a signature TypeScript already carries is noise. Deleting
a comment without relocating what it knew is data loss — do the move.

### A2 — Depend on interfaces

- Does a module reach for a concretion by import where it could receive one?
  `EngineAdapter` (`engines/types.ts`) is the shape to copy: define the seam as a
  type in its own file, construct at the edge, pass it in.
- Does any module now have two reasons to change? Split it along the axis that
  changes independently. Persistence is the layering reference: a `RunRepository`
  coordinator (`src/repository/`) over a data-access layer (`src/db/`), folders
  named for the layer not the backend, and no barrel `index.ts`.

### A3 / A9 — Layering

Dependencies flow one way: **bootstrap → routes → services → domain/adapters.**

- `packages/core` — shared pure types and rules. It is imported by the **UI**, so
  nothing `node:` or server-only may enter it.
- `packages/server/src/domain/` — server-only pure logic, no I/O.
- `packages/server/src/services/` — I/O and lifecycle only. A service method
  should read like a table of contents; arithmetic, string-building or branching
  on domain state belongs in a domain function it calls.
- `packages/server/src/routes/` — transport mapping only, never business rules.
- UI: exactly one module (`packages/ui/src/api.ts`) talks to the network;
  components call it rather than fetching.

Quick check: `grep -rn "node:" packages/core/src` must stay empty, and a service
that grew a pure helper should have handed it to `domain/`.

### A4 — The workflow seam

`RunOrchestrator.executeStage()` is the single decision point for how a unit of
long work runs. If your change spread `await` chains for long-running work across
a service instead of going through that seam, pull it back.

### A5 — Classes where there is state or a lifecycle

Free functions threading the same mutable map through their arguments want to be
a class that owns it. Conversely, a class with no state is a namespace — make it
functions.

### A6 — Name the shapes

- Every component exports a named `XProps` interface.
- No large inline `style={{…}}` blocks: static ones become module-level
  constants, theme- or state-dependent ones become small named builders
  (`StageFocusPanel.tsx` is the reference).
- A config blob or options bag written inline at a call site gets a named type.
- A literal repeated twice exists once, named.

### A7 — Lean on the types

- Discriminated unions over stringly-typed state; exhaustive `switch` closed with
  a `never` assertion so a new case is a compile error.
- `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on
  and stay on. Reset an optional field with `delete obj.field`, not `= undefined`;
  omit an absent key with a conditional spread.
- A `as` cast that papers over a real gap is a failure, not a fix. Casting to
  silence the compiler is the single most common way this pass gets faked.

### A8 — Evidence in Markdown

Did this change make a call worth defending later — a storage location, a
fallback, a dependency pin, a deliberate data loss? Then `docs/decisions.md` gets
a dated entry with the alternative you rejected. If you had to explain the change
in your summary message, that explanation belongs in the docs too.

### Cross-platform (this repo builds for Windows **and** macOS)

- Paths built and compared with `path.join` / `path.resolve`; separators
  normalised before comparison; case folded **only** on `win32`.
- No hardcoded home or temp directory — `os.homedir()`, `os.tmpdir()`.
- No shell-specific syntax in scripts that both platforms run.
- On Windows a file handle can still be closing: deletes in teardown need
  `maxRetries`, and a leaked handle shows up as `EBUSY`.

---

## Reporting

State the gates you actually ran and what they printed — never "should pass".
Then, briefly:

- **What changed** — one line per file.
- **Which rules applied** — the ids (A1–A9) your changes trace to.
- **What you deliberately did not do** — scope you left out, and why.

If you found and fixed a real defect while validating, say so plainly; a bug
caught by your own test run is the pass working, not something to bury.
