# Decision Log

Short, dated entries recording *why* a non-obvious choice was made — the home for
rationale that rule **A8** keeps out of code comments. Newest first. An entry is
a decision, its context, and the alternative rejected; it is not a changelog.

---

## 2026-07-23 — The project owns the folder; a run cannot choose its own

**Context:** after projects landed, two folders competed. The composer still
carried a "Working directory" field (persisted per project, sent as
`workspaceDir` on `POST /runs`), while the project itself already had a root. A
run listed under project `my-app` could execute the agent anywhere, and the
precedence between the two was invisible in the UI. The API also accepted an
arbitrary absolute path from the browser as the directory an autonomous agent
would run in.

**Decision:** the working directory is **derived from the project, never sent**.
`resolveWorkspace(paths, runId)` returns the project root; `workspaceDir` is gone
from `StartRunOptions`, the `POST /runs` body and the UI. A project's root is
fixed when it is registered — there is no route or control that changes it, and
the answer to "I want to work elsewhere" is to add another project. The composer
states the folder as read-only context instead of offering a picker.

**The home project keeps a scratch workspace per run.** Home has no code of its
own, so `~/.adhd/home/runs/<id>/workspace` is created per run. This preserves the
zero-setup path (try the app before registering anything) and gives the live e2e
canary a folder it cannot damage — the alternative, refusing engine runs without
a project, was rejected as a worse first five minutes. Home therefore still obeys
"one project, one folder"; its folder is just `~/.adhd/home`.

**Consequence:** `ensureProjectDataDir` now also runs at run start, so the
self-ignoring `.adhd/.gitignore` exists even for projects registered before it
was introduced — an agent writing into a real repository must not leave run
artifacts in `git status`. Rerunning an old run no longer restores a directory;
it restores the pipeline and engine only. Runs recorded before this change keep
whatever `workspacePath` they had, which is why the UI still labels a scratch
workspace as such.

**Rejected:** validating a client-supplied `workspaceDir` against the project
root. It keeps the field, the second source of truth, and the UI ambiguity — for
a knob no one asked for once a project *is* a folder.

---

## 2026-07-22 — A project owns its `.adhd/`; the home project is not the repo

**Context:** every path the server wrote was anchored to `REPO_ROOT` — the ADHD
source checkout. A run against `C:/Dev/my-app` wrote its state, events, handoffs
and scratch workspace into `C:/Dev/smekai/adhd/.adhd/`, so a user's project
history lived inside the tool and every project shared one history, one settings
file and one set of personas.

**Decision:** a project is a directory that owns its own `.adhd/`, like `.git`.
`paths.ts` exports a `ProjectPaths` value (`id`, `root`, `dataDir`) that is
passed to the run store, the skills loader and workspace resolution; the
`REPO_ROOT` constant survives only for loading the tool's own `.env`. A
user-level registry at `~/.adhd/projects.json` lists known projects and names the
active one; requests may override it per call with an `X-ADHD-Project` header.

The fallback for "no project selected" is a **home project whose data lives in
`~/.adhd/home`**, *not* `REPO_ROOT`. The task originally specified the repo as
the fallback, which would have reproduced the bug being fixed for every
unconfigured run. `ADHD_HOME` still overrides the home project's data directory,
which is what gives component tests an isolated root.

**Consequence:** the ~75 runs already in the repo's `.adhd/runs/` are no longer
listed anywhere — accepted deliberately with the owner rather than writing
migration code, since `RunState.projectId` is now required and those runs belong
to no project. The files were left on disk, not deleted.

**Rejected:** keeping one global store and filtering by a project column. It
leaves history inside the tool, so uninstalling ADHD or cloning the repo
elsewhere loses or duplicates a user's run history.

## 2026-07-22 — Credentials are user-level, layered defaults over per-project

**Context:** engine API keys were written to `<repo>/.adhd/settings.json`. Moving
settings into each project's `.adhd/` would have put secrets inside the user's
git working tree.

**Decision:** engine connection settings live in `~/.adhd/settings.json` (mode
`0600`), shaped as `defaults` plus a `projects` map keyed by project id. A
project inherits the user-level default until it overrides an engine, so a newly
added project runs immediately instead of demanding a re-entered key. An
inherited entry is **copied** before being edited — aliasing it wrote a
project's key back into `defaults` and leaked it to every other project, which
is what `projects.comp.ts` now guards.

Each created `<project>/.adhd/` also ships a self-ignoring `.gitignore` (`*`),
written with `wx` so a user who deletes it to commit their history keeps it
deleted.

## 2026-07-22 — Skills are layered, never seeded to disk

**Context:** `loadSkill` used to write the bundled persona to
`.adhd/skills/<id>.md` on first read. During the TASK-053 follow-up those files
silently shadowed the improved bundled constants and had to be regenerated by
hand.

**Decision:** resolution is bundled default → user-level override
(`~/.adhd/skills/<id>.md`) → project addendum
(`<project>/.adhd/skills/<id>.project.md`, appended). A full project replacement
(`<id>.md`) stays supported for power users, but the addendum is the default
path, and **nothing is written to disk on read**. Composition is a pure function
(`domain/skills/compose.ts`); the service only reads files.

**Consequence:** the seeding assertion was inverted — `skills.spec.ts` now proves
`loadSkill` leaves both data roots empty.

## 2026-07-22 — All personas are markdown, bundled through one generated module

**Context:** persona text lived in two shapes. `developer` and `tester` were
hand-written template literals inside `domain/skills/defaults.ts`; `architect`
was a separate generated module, `architect.generated.ts`, because it is composed
from `architect-standards.md`. Nothing but history explained why one persona sat
apart from the others, and prose escaped inside a TS template literal diffs
badly and invites a stray backtick to break the build.

**Decision:** persona *sources* are markdown —
`domain/skills/personas/<id>.md` for hand-written ones, the `gen:` blocks of
`architect-standards.md` for the Architect — and
[`scripts/generate-skills.mjs`](../scripts/generate-skills.mjs) emits a single
`defaults.generated.ts` exporting `DEFAULT_SKILLS`, plus the Claude Code
`SKILL.md`. Adding a persona is now dropping in a markdown file and running
`pnpm gen:skills`; `skill-generation.spec.ts` fails the build on drift.

**Rejected:** *reading the markdown at runtime.* The server builds with plain
`tsc`, which does not copy `.md` into `dist/`, so it would need a bespoke copy
step and would move the shipped source of truth outside the bundle — a packaging
failure would then surface as a persona-less run rather than a build error.

**Rejected:** *generating into the hand-written `defaults.ts`.* Partially
rewriting a file that also holds hand-authored content is exactly the fragility
the generator exists to avoid.

## 2026-07-22 — Architect standard: one source, two generated consumers

> Output paths superseded the same day — see *All personas are markdown* above.
> The decision below still holds; only the emitted files were renamed.

**Context:** the Architect standard must exist as both a Claude Code skill
(`.claude/skills/architect/SKILL.md`) and an ADHD persona constant. Keeping two
hand-written copies in sync fails the first time someone edits one.

**Decision:** a single canonical source, [`architect-standards.md`](./architect-standards.md),
with named `gen:` blocks; the generator emits both consumers, and a drift test
fails the build (`pnpm gen:skills --check`).

**Rejected:** a documented "edit both files" rule — zero enforcement, drifts
silently. The shared *rules* are generated into both; the skill and persona
framing differ deliberately (one addresses this repo, the other runs in a
stranger's), so the two outputs are assembled from different block sets rather
than being byte-identical.

## 2026-07-22 — Server pure logic goes to `packages/server/src/domain/`, not `@adhd/core`

**Context:** rule A3 wants pure domain logic out of the service layer. The
candidates (`stage-context.ts` prompt/handoff/verdict logic, the bundled skill
defaults) are pure, so `@adhd/core` looked like a home.

**Decision:** they moved to a new `packages/server/src/domain/` folder.
`@adhd/core` stays the *shared* contract imported by the browser UI; prompt
builders and persona text have no business in the client bundle. A server-only
domain layer is the right seam.

## 2026-07-22 — TypeScript pinned to 6.0.3, not 7.x

**Context:** rule A7 asks to run the latest TypeScript. Latest at the time was
**7.0.2**.

**Decision:** pinned to **6.0.3**. TypeScript 7 crashes the lint gate:
`typescript-eslint@8.65` declares a peer range of `>=4.8.4 <6.1.0`, and its
`typescript-estree` throws `TypeError: Cannot read properties of undefined
(reading 'Cjs')` under TS 7. 6.0.3 is the newest release the whole toolchain
(lint + typecheck + build) is green on. Revisit when typescript-eslint ships a
TS 7 peer range.

**Consequence:** TS 6 dropped automatic `@types` inclusion, so each project now
declares `"types"` explicitly (`["node"]` for the server, `["vite/client"]` for
the UI). `@types/node` was bumped to v26 to match.

## 2026-07-22 — Adopted `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`

**Context:** both flags were parked in `code-quality.md` as "once the codebase is
ready." Rule A7 pushes for them.

**Decision:** both are on in `tsconfig.base.json`. The two idioms adopted for the
fallout: **widen** an option/result bag field to `?: T | undefined` where
`undefined` is a legitimate in-memory value (the engine adapter interfaces), and
**omit** the key with a conditional spread — or reset with `delete` — where it
should simply be absent from persisted state (run/stage state). Explicit
`= undefined` assignment is now a type error, which is the point: persisted JSON
no longer carries `"model": undefined` noise.

## 2026-07-22 — SetupModal inline-style cleanup deferred

**Context:** rule A6 bans large inline `style={{…}}` blocks. `StageFocusPanel.tsx`
was cleaned to named constants/builders as the reference case. `SetupModal.tsx`
has ~108 inline styles.

**Decision:** deferred to a follow-up task. Extracting ~108 style objects is a
large, visually risky diff with no unit coverage; folding it into the standards
task would bury the standard under churn. All components did get named `XProps`
types (low risk, mechanical); only `StageFocusPanel` got the style extraction.
