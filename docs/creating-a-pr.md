# Opening a pull request

A PR is read by someone who was not here for the work. Everything below exists to
make that reading short.

## 1. The change table is mandatory

Read the per-file counts:

```bash
git diff --numstat $(git merge-base origin/main HEAD)..HEAD
```

Then write them up as a table near the top of the description, one row per
category, with a total:

| Category | What it holds | Files | Added | Removed |
| --- | --- | ---: | ---: | ---: |
| Source | `packages/*/src/**.ts(x)` | | | |
| Tests | `packages/*/test/**`, `packages/*/e2e/**` | | | |
| Task board | `.tasks/**` | | | |
| Docs | any other `.md` | | | |
| Other | everything left — **look at this row hardest** | | | |

The table is not decoration. It is the one place a reviewer sees, before reading
a line of the diff, whether the branch was mostly code, mostly housekeeping, or
mostly prose about itself.

**Add the two totals underneath — code (source + tests) against prose (board +
docs) — and if prose wins, the description must say why in one sentence.** A
dogfood run really is mostly evidence; a decision entry really is the
deliverable. "That is just how it came out" is not a reason, and the usual cause
is one piece of work written three times: once in the task, once in a record,
once in the commit message.

Do not build a script for this. It was tried on 2026-08-24 and removed the same
day: a hundred lines and a category list that drifts, to reformat output `git`
already gives you.

## 2. What does not belong in the PR

**Preparation is not deliverable.** By the time a PR opens, the material that
existed to get the work done has done its job:

- Scratch files, probe scripts, throwaway fixtures. The **Other** row in §1 is
  where those show up.
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

Cross-platform: nothing here is platform-specific. `git merge-base` and
`git diff --numstat` behave the same on Windows and POSIX, and the gates in §4
are the same `pnpm` scripts everywhere.
