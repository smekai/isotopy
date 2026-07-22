# Decision Log

Short, dated entries recording *why* a non-obvious choice was made — the home for
rationale that rule **A8** keeps out of code comments. Newest first. An entry is
a decision, its context, and the alternative rejected; it is not a changelog.

---

## 2026-07-22 — Architect standard: one source, two generated consumers

**Context:** the Architect standard must exist as both a Claude Code skill
(`.claude/skills/architect/SKILL.md`) and an ADHD persona constant
(`packages/server/src/domain/skills/architect.generated.ts`). Keeping two hand-
written copies in sync fails the first time someone edits one.

**Decision:** a single canonical source, [`architect-standards.md`](./architect-standards.md),
with named `gen:` blocks; [`scripts/generate-architect-skill.mjs`](../scripts/generate-architect-skill.mjs)
emits both consumers, and `architect-skill.spec.ts` fails the build on drift
(`pnpm gen:skills --check`).

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
