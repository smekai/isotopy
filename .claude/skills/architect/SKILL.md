---
name: architect
description: The prescriptive code standard for this repo — comments-as-smell, SOLID, DDD layering, workflow seams, named types, strict TypeScript. Load when writing or refactoring code here.
---

# Architect — how code in this repo must be written

> Generated from `docs/architecture.md`. Do not edit here — edit the
> source and run `pnpm gen:skills`.

## The rules

Nine rules, each with a stable id. They are stated to transfer to any
codebase — the Isotopy Architect persona applies them in whatever repository it is
dropped into, and this repo is just the first place they are enforced.

### A1 — Comments are a smell

A function that needs a comment to be understood is badly named or badly
factored. Refactor it — extract and name the confusing part — instead of
annotating it. The bar is deliberately high: **source files carry almost no
comments.** The narrow survivors are a one-line pointer at genuinely intricate
*local* logic that cannot be made self-evident (a subtle regex, a protocol quirk,
a platform workaround right at the line) and tests. Everything else goes:
comments that restate *what* the code does are deleted; the *why* behind a
decision does not become a comment — it moves to a Markdown doc (see A8). If you
reach for a comment, first rename; if that fails, document in Markdown.

### A2 — SOLID, and depend on interfaces

One reason to change per module or class (single responsibility). Depend on an
interface, not a concretion: define the seam as a type, and let callers receive
an implementation rather than importing one. When you find a module doing two
jobs, split it along the axis that changes independently.

Keep the seam in its **own file**, separate from the mechanics behind it — a file
named for one backend is not where a shared abstraction belongs. Layer a coarse
concern over its detail: a repository (domain-facing persistence) sits over a
data-access layer, each in a folder named for the *layer* — `repository/`, `db/` —
never for a backend (`sqlite/`), one responsibility per file. Prefer direct imports;
a barrel `index.ts` that only re-exports is indirection to avoid. A file's name is
the kebab-case of its main exported class (or the package's existing component
convention).

### A3 — DDD layering: fat domain, thin service

Pure functions and domain rules live in a **domain** layer with no I/O. The
**service** layer stays thin — a top-level narration of *what happens*,
delegating the *how* to the domain. A service method should read like a table of
contents. If a service is doing arithmetic, string-building, or branching on
domain state, that logic belongs in a pure domain function it calls. Ask whether
the file names a product concept: if it would make just as much sense in another
product, it is a util, not domain or service.

### A4 — Long-running work is a workflow, not an inline await chain

A genuinely long-lived operation (minutes, external processes, human waits)
belongs behind a durable runtime that owns its *whole lifecycle* — starting and
queueing the work, the orchestration loop, human gates, durable timers, retries
and crash recovery — not an ad-hoc chain of `await`s sprinkled through a service.
The seam is the **workflow itself**, with each unit of work a durable *step*; it
is not a single method you swap while the lifecycle around it stays put.

### A5 — Classes over loose function bags where there is state or a lifecycle

A set of free functions that all thread the same mutable state through their
arguments wants to be a class. When there is a lifecycle — start, subscribe,
flush, shut down — model it as an object that owns its state. Keep free functions
for genuinely stateless, pure transforms.

### A6 — No big anonymous objects

Inline object literals that carry structure — a props type written inline at a
call site, a large `style={{…}}` block, a config blob — get a **name**. Extract a
named `interface`/`type` for shapes, and named constants or small named builder
functions for styles. A reader should be able to point at a type by its name, and
a repeated inline literal should exist once.

### A7 — Lean on the type system

Prefer discriminated unions over stringly-typed state; `satisfies` to check a
literal against a type without widening it; `const` type parameters and branded
ids where identity matters; exhaustive `switch` closed with a `never` assertion
so a new case is a compile error. Turn the strict compiler flags on and keep them
on. Model illegal states as unrepresentable rather than guarding against them at
runtime.

Avoid `unknown` and `as unknown as` in business logic — a double-cast defeats the
type system rather than using it. Reach for a library's own typed return values
and narrow them (`typeof`, a type guard) instead of re-casting. Confine `unknown`
to a focused boundary codec backed by a runtime schema. Reject a malformed
record as a whole with path-aware issues; do not recover a plausible partial
object by dropping bad fields. The codec hands typed values to everything
downstream. Isotopy-owned formats are strict about unknown fields. External
protocols may preserve unknown fields and event types, but every field Isotopy
consumes is validated before it leaves the codec.

### A8 — Evidence lives in Markdown, not code comments

The rationale for a non-obvious decision does **not** go in a code comment (see
A1) — it goes in a Markdown document: an architecture doc, or a short dated entry
in a decision log. Code says *what*; the docs say *why we chose this*. When you
make a call worth defending later, write it down where it can be read without
opening the source.

### A9 — Architecture differs by tier: backend, frontend, mobile

The rules above are universal; their *shape* is not. Each tier has its own
expression, and a change is judged against its tier.

- **Backend** — layered dependencies flow one way:
  bootstrap → controllers → services → domain/adapters. Controllers do only
  transport mapping and never hold business rules; services never touch
  transport types; the domain is pure. External tools sit behind an adapter
  interface. This is where A3 and A4 bite hardest.

- **Frontend** — presentational and container components, with reusable stateful
  logic in hooks. Exactly one module talks to the network; components call it
  rather than fetching directly. Props types are named (A6); styles are named
  constants or builders, not sprawling inline literals; pure view helpers stay
  apart from stateful modules. In this repo the tier is written out in full —
  module map, data flow, state ownership, design tokens, accessibility — in
  `docs/architecture-ui.md`; read it before changing UI code.

- **Mobile** — the same domain, pulled from the shared package, with
  platform-specific code behind an interface so a screen never branches on the
  OS. View code stays declarative; anything touching a native capability goes
  through a typed seam. (No mobile package exists yet; these are the rules for
  when one lands, so it is not invented under deadline.)

### Placement and naming of files

**Placement:** does this file name a product concept? A run, a milestone, a
stage, a persona, a task board. If it would make just as much sense in a
different product, it is a `util`. If it names a product concept: parse an
untrusted boundary → `schemas/`; other pure logic → `domain/`; I/O or
lifecycle → `services/`.

**Naming:** a file's name is the kebab-case of its main exported class
(PascalCase for UI components, matching each package's existing convention).

## Applying this in the Isotopy repo

Concrete anchors for the rules above, specific to this codebase. Read
[`architecture.md`](../docs/architecture.md) for the full layout reference,
[`decisions.md`](../docs/decisions.md) for the rationale log (A8), and
[`implementation-notes.md`](../docs/implementation-notes.md) for the "why" behind
non-obvious code — the platform workarounds and protocol quirks that A1 keeps out
of the source. When you strip or avoid a comment, that is where its content goes.

- **The interface to model (A2):** `EngineAdapter` in
  `packages/server/src/engines/types.ts`. Adapters are constructed and handed to
  the orchestrator; nothing reaches for a concrete engine by import. New pluggable
  seams follow its shape. Persistence is the layering reference: `RunRepository`
  (`src/repository/`) is a coordinator over a data-access layer (`src/db/` —
  `Database`, `JsonRecordsTable`, `EventsTable`). Folders are named for the layer, never a
  backend, and there is no barrel `index.ts` — callers import the file they need.

- **The domain layer (A3):** `packages/core` is the *shared* pure layer (imported
  by the UI too, so nothing platform- or server-specific goes there). Boundary
  schemas live in `packages/server/src/schemas/` (HTTP, persistence, settings,
  and LLM extractors). Server-only pure logic lives in
  `packages/server/src/domain/` — rules under `domain/rules/`, Markdown under
  `domain/markdown/`, bundled prompts under `domain/skills/`. Services pass typed
  values and keep only I/O and lifecycle. Repositories persist already-rendered
  content and know nothing about Markdown semantics. Product-named files land in
  `schemas/`, `domain/`, or `services/`; product-neutral helpers land in `utils/`
  (see Placement and naming above). A file that exports a class is named for that
  class (`run-service.ts` → `RunService`).

- **The workflow seam (A4):** the durable runtime is **OpenWorkflow**, in
  `workflow/` (see [`workflow-runtime-options.md`](../docs/workflow-runtime-options.md)).
  `workflow/pipeline-workflow.ts` is the durable workflow body (the run loop) and
  `workflow/stage-execution.ts` is the durable *step* — the one place that decides
  how a stage runs. Durability owns start/queueing, the loop, gates, durable
  timers, retries, recovery and cancellation state — *not* one method. The old
  claim that a durable executor "replaces `executeStage()` alone" was wrong and
  is corrected here.

- **The stateful class (A5):** `RunService` owns the run read model
  (`RunState` + events + SSE) and hosts the per-project durable runtime; that is
  why it is a class, not a module of functions. It is the *single writer* of the
  read model — the durable workflow drives it; the API only reads it.
  `MilestoneService` owns milestone CRUD beside it; `RunStore` holds the
  cross-project run map and persistence.
- **Named types & styles (A6):** every component exports a named `XProps`
  interface; `components/run/run-styles.ts` is the reference for lifting
  `style={{…}}` into named constants and builders.

- **Strict TypeScript (A7):** `tsconfig.base.json` carries `strict` and
  `noUncheckedIndexedAccess`. Use `field?: T` when a property may be absent or
  `undefined`; both mean "not supplied". Reserve `null` for an explicit cleared
  or removed value. Because those two mean the same thing,
  `exactOptionalPropertyTypes` is deliberately **off** — so assign an optional
  field directly (`{ framing: current.framing }`) and never assemble it
  conditionally (`...(framing === undefined ? {} : { framing })`). That spread
  protects no invariant; it is a vestige of the flag, and copying it from a file
  that still has one spreads it further, which is why ESLint bans it rather than
  this paragraph alone. Spreading a *group* — `...(cond ? { a, b } : {})` — is a
  different thing and stays: unrolling it would repeat the condition per field.
  Where a conditional guarded a falsy value rather than an absent one, keep that
  meaning explicit (`apiKey: stored?.apiKey || undefined`) rather than letting an
  empty string through. Runtime schemas own untrusted HTTP, persisted JSON,
  settings, project-registry, TaskPlanner, and engine-protocol input. Routes and
  adapters receive only parsed values; services and repositories do not rebuild
  types through hand-written record traversal. Isotopy-owned records reject
  unknown fields. TaskPlanner and engine codecs permit unrelated external
  fields while validating every consumed field. Relative imports use `.ts`
  extensions (like `@isotopy/core`); `rewriteRelativeImportExtensions` rewrites
  them to `.js` on build.

**Verify a change** (from the repo root, shell-neutral):

```
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

For UI structural changes, also `pnpm --filter @isotopy/ui e2e`. If you touched the
`gen:` blocks in `architecture.md`, run `pnpm gen:skills` and commit the
regenerated files.
