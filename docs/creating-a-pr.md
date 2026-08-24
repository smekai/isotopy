# Opening a pull request

A PR is read by someone who was not here for the work. Everything below exists to
make that reading short.

## 1. The change table is mandatory

```bash
pnpm pr:summary
```

It prints a markdown table of lines changed per category — Source, Tests, Task
board, Run evidence, Docs, Version — against the merge base with `origin/main`.
Paste it into the PR description **verbatim**, near the top. Pass a ref
(`pnpm pr:summary <ref>`) when the base is not `main`.

The table is not decoration. It is the one place a reviewer can see, before
reading a line of the diff, whether this branch was mostly code, mostly
housekeeping, or mostly prose about itself.

**If prose outweighs code, the script says so and the description must answer
it.** Either name the reason in one sentence — a dogfood run really is mostly
evidence, a decision entry really is the deliverable — or go and cut the prose.
"That is just how it came out" is not a reason. The usual culprit is the same
text written three times: once in the task, once in the record, once in the
commit message.

## 2. What does not belong in the PR

**Preparation is not deliverable.** By the time a PR opens, the material that
existed to get the work done has done its job:

- Scratch files, probe scripts, throwaway fixtures. Check the diff for them —
  `pnpm pr:summary` puts anything unclassified under **Other**, which is the row
  to look at hardest.
- The task's own planning prose, restated. `.tasks/DONE.md` already holds what
  the task did; the PR links to it rather than repeating it.
- A blow-by-blow of how the work went. What was tried and rejected belongs in
  `docs/decisions.md` if it will be re-argued later, and nowhere at all if it
  will not.

**A PR description is a summary with links, not a second copy.** If a sentence
already exists in `DONE.md`, a decision entry or a commit message, link to it.

## 3. What the description must carry

- The change table from §1.
- What changed and why, in a few sentences — the problem, not the diff.
- Anything the reviewer would otherwise have to discover: a behaviour change for
  existing users, a migration, a flag that now means something different.
- **What was verified, with numbers.** Test counts before and after, and which
  gates ran. A green tick nobody can check is not evidence.
- **What was not done**, when the branch stops short of what a reader would
  assume. A known gap named in the PR is a decision; the same gap found in review
  is a defect.

## 4. Before opening it

- Every gate green: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
  `pnpm gen:skills` (no resulting diff), `pnpm e2e`.
- The version sequence is complete: every commit bumps the shared patch across
  the root and all `packages/*`, so a three-commit branch carries three numbers.
  See **Versioning** in `AGENTS.md`.
- `.tasks/IN_PROGRESS.md` is empty, or holds only work this PR deliberately
  leaves running.
- Not on `main`. Branch first if you are.

Cross-platform: `pnpm pr:summary` is a Node script over `git diff --numstat`, so
it behaves the same on Windows and POSIX; it splits on `/\r?\n/` rather than
`"\n"` for exactly that reason.
