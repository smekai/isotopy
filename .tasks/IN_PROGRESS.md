# In Progress

## TASK-143: Final filesystem and repository cutover to Isotopy
**Priority:** P1 | **Tags:** server, ui, infra, testing, milestone-g
**Updated:** 2026-08-14 00:00

Perform every physical path and repository identity change only after `TASK-131`, `TASK-132`, and `TASK-133` are green:

- Change user and project state roots from `.adhd` to `.isotopy` everywhere, using the existing centralized path helpers.
- Rename `packages/ui/public/adhd-icon.png` to an Isotopy filename and update all consumers.
- Rename the GitHub repository from `smekai/adhd` to `smekai/isotopy`, then update `repository`, `homepage`, `bugs`, badges, documentation links, CI references, and the local `origin`.
- Stop app servers, watchers, and tools that hold the checkout; rename the local checkout directory from `adhd` to `isotopy` from its parent directory.
- Run a final case-insensitive identifier and filename audit. Keep only explicitly allowlisted historical references.

**No migration:** do not move or read legacy `.adhd` state. Existing directories remain untouched and Isotopy starts with fresh state.

**Cutover verification:** clone from the new repository URL into a fresh path; install, typecheck, lint, test, build, launch the dev stack, and complete one real engine-backed run. Confirm all generated state lands under `.isotopy` and that no running configuration relies on the former checkout path or repository URL.

Cross-platform: use `path.join` and `os.homedir()`; never hardcode separators. On Windows, close processes that lock the checkout before renaming it. On macOS/POSIX, verify the exact lowercase path on a case-sensitive filesystem. Document PowerShell and bash cutover commands, record the platform actually tested, and mark the other untested if not exercised.

### Plan

**Decisions taken with the user (2026-08-14):**

1. Delete the three back-compat guard tests. Each asserts that a retired ADHD-era name
   is *ignored*, and each is the sole reason its string still exists in test code. With
   no back-compat, they guard a path that does not exist.
2. `docs/decisions.md`, `.tasks/DONE.md`, and `CHANGELOG.md` are the allowlisted
   historical record — their ADHD references described what was true when written, and
   rewriting them would falsify the record.
3. `design/` is renamed too, despite being non-product code.
4. One PR carries everything including the new repository URLs. They 404 until the
   repository is renamed; GitHub redirects the old slug afterward.

**Steps:**

1. **State root.** Two literals in `packages/server/src/paths.ts` — the `userIsotopyDir()`
   home fallback and the per-project `dataDir` in `projectPaths()` — are the whole
   behavioural change; every other path helper already derives from them. Then the
   non-derived references: `utils/workspace-files.ts` snapshot ignore list, `.gitignore`,
   `eslint.config.mjs`, `.env.example`, and the two UI strings that *display* the path
   (`LogsPanel.tsx` persona tooltip, `EngineConnection.tsx` settings-location copy).
   `isScratchWorkspace` matches `/\/runs\/[^/]+\/workspace$/` and needs no change.
2. **Icon.** `git mv packages/ui/public/adhd-icon.png isotopy-icon.png`; artwork is
   abstract and unchanged. Update `App.tsx`, `TeamController.tsx`, `README.md`.
3. **Repository identity.** `package.json` name and the three `smekai/adhd` URLs. The
   `smekai/taskplanner` links are a different repository and stay.
4. **Tests.** `.adhd` fixtures → `.isotopy`; every `mkdtemp` prefix `adhd-*` →
   `isotopy-*` (14 sites). Delete the three guards from decision 1 and the
   `e2e-test-plan.md` line describing the localStorage one.
5. **Docs.** Path rename across ten files. `docs/architecture.md` also carries
   non-path items a bulk replace misses: the planned CLI verbs, the `adhd/*` git branch
   prefix convention, and the repo-layout tree root. `docs/decisions.md` untouched.
6. **Design mockup.** `design/App.tsx` keyframes and both literal wordmarks;
   `design/README.md`.
7. **Skills.** `.claude/skills/write-tests` is generated from `docs/testing.md` — edit
   the source and run `pnpm gen:skills`. `.claude/skills/{run-app,validate-code}` and
   `.agents/skills/run-app` are hand-written.
8. **Bookkeeping.** Bump 0.10.3 → 0.10.4 across the root and all three packages;
   CHANGELOG entry under `[Unreleased]`.

**Out of scope — the user runs the repository and checkout renames**, which cannot be
done from inside this checkout without invalidating the session's working directory.

**Verification:** lint, typecheck, test, build, `gen:skills` with no resulting diff, e2e,
then a case-insensitive `git grep` and `git ls-files` audit excluding the allowlisted
historical files. Finally launch the dev stack, start a run, and confirm state lands
under `.isotopy` with no `.adhd` directory created.

---
