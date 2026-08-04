---
name: write-tests
description: How a test in this repo must be written — the AAAAA phases, one action per test, no logic in a test body, generators over flag-driven factories, and which layer a check belongs in. Load before adding or restructuring any test.
---

# Writing a test in this repo

> Generated from `docs/testing.md`. Do not edit here — edit the
> source and run `pnpm gen:skills`.

## Writing a test: AAAAA

Per [the AAAAA article](https://medium.com/bolt-labs/aaaaa-testing-96583245ae24),
a test moves through five phases.

1. **Arrange** — initial state, fixtures, preconditions.
2. **Anticipate** — declare every external interaction *and the inputs it must
   receive*, up front. This is not a passive stub: the anticipation is itself an
   assertion.
3. **Act** — one action.
4. **Assert** — return value, persisted state, side effects.
5. **AI** — not a code block. The declarative shape is what makes these tests
   cheap for a model to read, extend, and reason about. A test that encapsulates
   its own setup and assumptions can be written correctly without loading the
   rest of the suite into context.

Mark the phases with comment banners, and only for phases that have content — a
test with no external interaction has no `// Anticipate` banner.

### The thesis: logic belongs in the application, not the test

The failure this framework exists to prevent is a test suite that becomes a
second, worse implementation of the system. It arrives through the setup
helpers. A fixture factory grows a boolean, then another, and the branching
needed to honour them is business logic — untested logic, guarding the tests
that guard everything else:

```ts
async function arrangeProducts(products, withCategories = true, withImages = true, mockSearch = true) {
  for (const product of products) {
    if (withCategories && !withImages) {
      await insertProductWithCategory(product, CATEGORY);
    } else if (withCategories && withImages) {
      await insertProductWithCategoryAndImages(product, IMAGE, CATEGORY);
    } else if (withImages) {
      await insertProductWithImage(product, IMAGE.id);
    } else {
      await insertProduct(product);
    }
    if (mockSearch) {
      mockImageSearch(IMAGE);
    }
  }
}
```

Nobody writes that on purpose; it accretes. Each flag was one caller's
reasonable request. The result is harder to read, write and refactor than the
production code it protects, and a bug in it fails tests that are actually fine.

Three habits keep it from forming.

**Atomic anticipations.** One anticipation states one interaction: these inputs,
that response. Write a second named anticipation for the failure case rather
than a flag that switches between them.

```ts
function anticipateImageSearch(imageId = IMAGE_ID) { … }
function anticipateImageSearchTimeout(imageId = IMAGE_ID) { … }
```

**Generators, not flag-driven factories.** A fixture builder takes a partial and
fills each field independently. No branch decides *which shape* to build; the
caller names the one field it cares about and everything else defaults.

```ts
const image = (overrides: Partial<Image> = {}): Image => ({
  id: overrides.id ?? nextId(),
  url: overrides.url ?? `https://example.test/${nextId()}`,
  type: overrides.type ?? "png",
});

image({ url: "not a url" });
```

**Duplication is a boundary, not a smell.** Two tests that arrange almost the
same state should say so twice rather than share a helper that branches. The DRY
instinct is what produced the example above. A test file is read far more often
than it is edited, and reading it must not require jumping into a helper to find
out what the setup actually did.

### The rules

- **One action per test.** The Act phase holds a single request, render or call.
  If a second action is the point of the test, that is a second test.
- **No branching or inline logic in a test body.** No `if`, no `for`, no `try`,
  no `while`. Every loop, poll and retry belongs in a support module. A test body
  states *what holds*, never *how to check it*.
- **Anticipations are atomic** — no internal branching, for the same reason.
- **The name states the behavioural rule**, in a full sentence, ideally with the
  reason: "running out of prepaid credit is not a limit — waiting would never
  clear it" beats "test limit detection".

Module-level helpers in a test file are not test bodies; a named builder or a
throwing accessor is exactly where extracted logic should go. The rule bans
logic *in the body*, not in the file.

### A test must be able to fail for a real reason

A test exists for logic complicated enough to get wrong — a parser, a reducer,
an ordering rule, a platform difference. **If you cannot name the bug a test
would catch, it is not a test.** Three patterns fail that question every time:

| Anti-pattern | Why it is worthless |
| --- | --- |
| Asserting a **constant** back | The test and the code are the same edit. It fails when a value legitimately changes, never when behaviour breaks. |
| Asserting on **prose** | Passes until someone writes a perfectly good sentence. |
| Covering a **one-line expression** | A ternary or a delegation has no room for a bug the type system does not already catch. |

The cost of a worthless test is not the milliseconds. It is that every future
change drags it along, and that a red suite stops meaning something is broken.

Deleting a test is therefore a legitimate outcome of writing one. Weakening an
assertion to make a suite pass is not.

## Applying this in the ADHD repo

### The layers

Put a check in the highest row it can live in. Each row down is slower, more
indirect, and harder to diagnose when it breaks.

| Layer | Files | Runner | Command | Scope |
| --- | --- | --- | --- | --- |
| **Component** | `packages/*/test/*.comp.ts` | Vitest (`node`) | `pnpm test` | The default. Request in → behaviour out, through the real routes, services, orchestrator and run-store. |
| **Component (render)** | `packages/ui/test/*.comp.tsx` | Vitest (`jsdom`) | `pnpm test` | The same, for React code that must render — hooks and components, deps mocked. |
| **Spec** | `packages/*/test/*.spec.ts` | Vitest (`node`) | `pnpm test` | Complicated *pure* functions only. No I/O, no HTTP. |
| **E2E** | `packages/ui/e2e/*.spec.ts` | Playwright | `pnpm e2e` | Only what needs a browser: rendering, focus, tab wiring. |
| **Live** | `e2e/live-dev-test.spec.ts` | Playwright | `ADHD_E2E_LIVE=1 …` | Opt-in canary that the real CLI still integrates. Costs money. |

**Component tests are the primary level.** They are nearly as fast as unit tests
(the whole suite is ~9s) while exercising the code paths that actually break.
A rule of thumb: if a check would still make sense with the React app deleted,
it is a component test.

**Tests never sit beside the code they cover.** Every package keeps them in its
own `test/` directory, split by extension. This is not only taste: `core` and
`server` compile `src/` to `dist/`, so a colocated `*.spec.ts` is emitted into
the build output and shipped. A package that emits therefore needs a
`tsconfig.test.json` that includes `test/` — typechecked, never compiled.
Playwright is the one exception, with its own `packages/ui/e2e/` and its own
runner.

**The extension picks the environment.** `pnpm test` runs two Vitest projects
from one root config: `node` takes `packages/*/test/**/*.{comp,spec}.ts`, and
`ui` takes `packages/ui/test/**/*.comp.tsx` under `jsdom`. So a UI check that
needs to render is a `.comp.tsx`; a UI check over a pure function stays a
`.spec.ts` and runs in `node` with everything else. Run one project at a time
with `pnpm vitest run --project ui`. React state updates must go through
`renderHook`/`render` — `react-hooks/rules-of-hooks` is an **error** across
`packages/ui/**`, so calling a hook directly in a test body fails lint.

**Specs are deliberately narrow.** They live in the same `test/` directory as
the component tests, and earn their place only where the logic is intricate
enough that a component test would not localise the failure —
`parseStageVerdict` scanning backwards through markdown-wrapped, CRLF-terminated
model output is the archetype. They are not a coverage exercise.

Phase banners are expected in `*.comp.ts`, `*.comp.tsx` and `e2e/*.spec.ts`.
A short pure `*.spec.ts` is exempt: banners on a three-line assertion over a
pure function are the noise the standard exists to prevent. The hard rules —
one action, no logic in the body — apply everywhere and are enforced by ESLint.

One test is exempt from one-action-per-test: `e2e/live-dev-test.spec.ts`, where
every action spends real tokens and minutes. Splitting it would buy six paid
runs to learn what one already proves. It still carries its banners, and the
exemption is written at the top of the file rather than left to be inferred.

### Which checks earned their place

Two rounds of review deleted ~35 worthless tests. What survived is the shape to
copy. `parsePreferencesUpdate` (four validated fields, partial output, legacy
rewrite) is covered; `normalizeProjectPreferences` beside it is not, because it
is four ternaries whose only real logic is shared with the parser.
`sameProjectRoot` is covered because it folds case **only on Windows**;
`projectNameFor` is not, because it is `path.basename`. The three deletions that
made the point: `expect(DEMO_PIPELINES.map(p => p.id)).toEqual([…])` asserted a
constant back; `expect(persona.endsWith("prompt.")).toBe(true)` asserted on prose
and broke on a correct new persona; the five `normalizeProjectPreferences` cases
covered one-line expressions.

### What gets substituted

Exactly two things on the server. Everything else is the real code.

| Dependency | Substituted with | Why |
| --- | --- | --- |
| Engine adapter (spawns a CLI) | `FakeEngine` via `setEngineAdapter()` | Otherwise the test costs money and needs an authenticated CLI. |
| `.adhd` data root | temp dir via `ADHD_HOME` | Otherwise tests write into the developer's real run history. |

The UI's substituted boundary is [`api.ts`](../packages/ui/src/api.ts) — the only
module that talks to the network — mocked with `vi.mock("../src/api")`. In `e2e/`
it is `page.route(…)` interception, which seeds a run for zero tokens. Anything
that needs a real server, a real browser or real rendering of the whole app stays
in `e2e/`.

### Where the logic lives instead

`packages/server/test/support/harness.ts` is the home for every loop, poll and
retry — that is why `waitForRunStatus`, `waitForStageStatus` and
`engine.waitForCall` exist. The UI equivalents are
`packages/ui/test/support/` (`fake-run-stream.ts` owns the deferred promises and
all `act()` wrapping) and `packages/ui/e2e/support/`. ESLint enforces the split:
`if`/`for`/`while`/`try` inside a `test()` or `it()` callback is an error under
`packages/*/test/**` and `packages/ui/e2e/**`, and `**/support/**` is exempt
because that is where it belongs.

### A worked example

```ts
test("a FAIL verdict fails the stage and the run even though the engine exited cleanly", async () => {
  // Arrange
  const { app, engine } = ctx;

  // Anticipate — the QA Engineer succeeds at the process level but reports FAIL.
  engine.anticipate({ as: "Product Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  engine.anticipate({ as: "QA Engineer" }).reports("Broken.\n\nVERDICT: FAIL");

  // Act
  const run = await startRun(app, { pipelineId: "pm-dev-test", task: TASK, engine: "claude-code" });
  await approveIntake(app, run.id);

  // Assert
  const finished = await waitForRunStatus(app, run.id, "failed");
  expect(stageOf(finished, "test").verdict).toBe("FAIL");
  engine.verify();
});
```

`anticipate()` takes optional matchers for `cwd`, `model`, `permissionMode`,
`persona` and `prompt` (string = exact, RegExp = match). `verify()` then asserts
the calls arrived **in order**, with those inputs, and that nothing extra was
called.

`engine.verify()` with **no** anticipations is a real assertion: it proves the
code path never touched an engine. Every simulated-pipeline test ends with one,
and it keeps its banner — `// Anticipate — none: this path must not reach an
engine.` — because the absence is the point.

### Running

```bash
pnpm test          # component tests + specs (fast, free, no CLI needed)
pnpm test:watch    # same, in watch mode
pnpm e2e           # Playwright, free + seeded tiers
```
