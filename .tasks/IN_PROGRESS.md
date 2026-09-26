# In Progress

## TASK-176: The suite proves behaviour: specs only for intricate logic, repo checks in their own gate
**Priority:** P2 | **Tags:** testing
**Updated:** 2026-09-26 11:47

Found while reviewing `TASK-172`. Its spec over `sourceTasksToRelease` — a two-condition
predicate — was green, yet neither guard had a component test. Proving each guard end to end is
what exposed a real bug: the Orchestrator's run review writes a closeout that names no task, so a
failed run's source task stayed In Progress forever. The spec could not see that; the route could.

`docs/testing.md` already says component tests are primary and a spec earns its place only for
intricate pure logic. The suite drifted: **56 `*.spec.ts`** (core 11, scheduler 1, server 33,
ui 11 — about 6.3k lines) against 60 component files, and some component tests assert constants
or re-test Zod.

**Five groups to clean:**

1. **Constant or copy asserts** — the test and the code are the same edit. Delete. A message
   assert stays when it checks dynamic data or is the only way to tell which rule refused.
2. **"Two lists agree"** — enforce it in code (derive one from the other, or type it), then delete.
3. **Per-field schema rejection** — tests Zod, not Isotopy. Delete; keep one test per boundary
   *policy* (strict fields, whole-record rejection) and every **migration** test.
4. **Impure specs** — a spec touching the filesystem, SQLite or a real process is a component test
   with the wrong suffix. Rename or merge into the component test of its subject.
5. **Repo checks** — structure, pins, bundled content. Keep them, in their own `*.check.ts` files
   under a `pnpm check` gate, so a red `pnpm test` means the product broke and a red `pnpm check`
   means the repo drifted.

**Plus:** a spec over simple logic reachable through a route is **converted** to a component test,
then deleted. Specs stay only for intricate or platform-specific logic (parsers, reducers, time
zones, path handling), and each still names the bug it catches.

**Rule for every deletion.** Name the rule the test covers, break it in `src/`, and confirm a
component test goes red. If none does, write that component test first. A test that survives its
own mutation is not coverage.

**Evidence:** a verdict table (file → keep / convert / delete / move, one-line reason) in the Done
summary; spec and component counts before and after; the full gate set including `pnpm check`.

**Not in scope:** restructuring component tests beyond what a conversion needs.

Cross-platform: `pnpm check` runs in both the Linux job and the Windows/macOS matrix, where these
checks already ran through `pnpm test`. No new platform surface otherwise.

---
