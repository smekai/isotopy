# Parallel agents: one instance, one task

**Question.** The owner's rule: one agent can be busy with only one task at a time; if the
project needs two developers, two agents are started. Today Isotopy runs one thing at a time per
project. What does it take to run several agent instances at once, each on its own task?

## What stops it today

| Constraint | Where | Why it exists |
|---|---|---|
| One active run per project | `db/active-runs-table.ts` (primary key `project_id`); a second start throws "A run is already active in this project" | One working copy; one product preview; simple admission |
| One workflow at a time | `workflow/workflow-runtime.ts`: `maxConcurrentWorkflowRuns: 1` | Same |
| Stages in a run run in order | `workflow/pipeline-workflow.ts` | A pipeline is a sequence |
| No worktrees | Decision 2026-10-27 ("Branch per initiative; release through a PR") | Isotopy starts the product and keeps its data from the project root, so a worktree's preview would show the base, not the work |
| One initiative branch checked out | `services/initiative-branches.ts` | The project root is on one branch at a time |
| Schedules skip when busy | `run_active` skip in `services/schedule-service.ts` | Follows from the first row |

Separate projects already run in parallel: each has its own embedded Aiki runtime.

## Terms to settle

- **Agent definition**: a persona in the catalog (today's "agent").
- **Role**: a slot in `team.md`'s roster that names an agent, engine slot and tier.
- **Agent instance**: a definition running now, on one task, in one working copy. Two Developers
  are two instances of one definition, possibly of one role.

Today an instance exists only implicitly, as the stage that is running.

## Options for isolation

**1. A worktree per instance.** Each instance works on its own branch in its own worktree; its
branch merges into the initiative branch (or opens its own pull request).
- For: real isolation; git does the merging; the CLIs already work fine in any folder.
- Against: reverses the 2026-10-27 rejection unless the preview question is answered: either
  the preview runs from an integration checkout (the initiative branch), or each instance gets
  its own preview on its own port. Windows hazards: long paths (`core.longpaths`), files locked
  by a running process when a worktree is removed, `node_modules` per worktree (disk, install
  time).

**2. Parallel only where nobody writes.** Several reviewers, testers or researchers run at
once in the project root; writers stay one at a time.
- For: small change; no worktrees.
- Against: does not give the owner two developers.

**3. Separate clones per instance** instead of worktrees.
- For: no shared `.git`, no worktree locks.
- Against: more disk; branch syncing through a remote or local fetch.

## What else changes

- Admission becomes a limit (instances per project, per engine, per subscription) instead of a
  single row.
- Aiki concurrency above 1, and the run read model with concurrent writers (see
  [storage.md](storage.md)).
- The Orchestrator decides more than "the next run": it starts several, assigns tasks so that
  two instances do not change the same files, and merges.
- Board claims (`services/run/source-task-claim.ts`) become the guard against two instances
  taking one task.
- Usage limits: two instances on one subscription hit its limit twice as fast; the limit parks
  (`engine-limit`) must be per engine, not per run.
- The UI shows instances, not runs (see [ui-team-home.md](ui-team-home.md)).

## Open questions

- Who decides to start a second Developer: the owner (a seat count in `team.md`), the
  Orchestrator, or both?
- Merge conflicts between instances: who resolves them, an instance, the Orchestrator, or the
  owner?
- How many instances does one subscription sustain before limits make parallelism slower than
  sequence? Measure on ShareTravel.
- Does an instance outlive its task (a standing agent with memory, see
  [observational-memory.md](observational-memory.md)), or is it created per task?

## What a decision needs

An answer to the preview question, the admission limits, and a measured case with two
developers on one project.

Cross-platform: worktree removal with locked files on Windows, long paths, and per-instance
ports on both Windows and macOS are the hazards any option must cover.
