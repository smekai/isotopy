# Testing

How this repo is tested, and — more usefully — **how a test here must be written**.

> Parts of this file are the source for generated artifacts: the `write-tests`
> Claude Code skill and the shipped QA Engineer persona
> (`packages/server/src/domain/skills/personas/tester.md`). Edit the `gen:`
> blocks below and run `pnpm gen:skills`. A drift check fails CI otherwise.
>
> Four blocks — `testing-shared`, `testing-skill`, `tester-persona-head`,
> `tester-persona-tail` — delimited by `<!-- gen:NAME:start -->` /
> `<!-- gen:NAME:end -->`. `testing-shared` is reused **verbatim** by the persona,
> which runs inside arbitrary repositories: nothing Isotopy-specific may enter it.

<!-- gen:testing-shared:start -->
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

### What earns a shared home, and what stays inline

The rule that keeps the two ideas above from fighting each other:

| Shared | Inline, duplication and all |
| --- | --- |
| **Generators** — partial in, whole object out | One-line accessors and format helpers |
| **The framework for external interactions** — the fake engine, fake streams, route seeding, app bootstrap, HTTP verbs, pollers | Compound "arrange this exact scenario" wrappers that two tests share |
| **Drivers that walk a pipeline** through the real system | Anything a reader must leave the test to understand |

A one-line function lifted out of a test is worse than the duplication it
removed: the reader now jumps somewhere else to learn what the test arranged,
and a stack of those is the mocking hell above wearing a different costume.
Generators are what make inlining affordable — `run({ status: "blocked" })` says
what it produces at the call site. That is why deduplicating a *generator* is
right while extracting a one-liner is not.

The same rule decides render wrappers. `renderThing(x)` hides the Act; a props
generator does not:

```ts
render(<Thing {...thingProps({ focusedId: "test" })} />);
```

Type the generator as the component's own exported props interface, so a prop
added upstream is a compile error rather than a silently missing value. Spies
live on the generated props, and a test that asserts on a callback names it.

### Naming and placement

**`anticipate*` is reserved for real anticipations** — something that declares
what an *external* system will do. A helper that drives the real system through
its own API is Arrange, and calling it `anticipate*` erases the distinction the
phase exists to mark. Name that one for the state it produces.

**Helpers go below the last test**, so a reader meets the tests first. This works
because `function` declarations hoist — an arrow-function `const` would break,
which is worth knowing before copying the pattern. Helpers that build a
module-level constant stay with the constant they feed.

### Setup that every test shares

Setup identical in every test in a file belongs in `beforeEach`, not repeated as
each test's first line. Setup specific to one test stays in its body under the
banner. Where only *some* tests share it, group those under a `describe` with its
own `beforeEach` rather than arranging it for tests that never asserted on it.

### An elaborate fixture is a symptom

If a setup helper builds six unrelated things, check whether any single test uses
all six. Usually not — and the fix is not a tidier fixture but more granular
tests, each arranging what it actually asserts on. A test that arranges something
it never asserts on should lose the arrangement, not gain an assertion.

### Assert, never throw

A helper that throws reports as an unhandled error rather than a failed
assertion, and `if (x) { throw }` is branching logic in the one place that exists
to keep branching out of tests. Two jobs, two answers:

```ts
expect(status, "creating the record").toBe(201);   // a status guard
assert(id, `order ${order.id} has no line items`); // narrowing
```

`assert` is typed `(expression, message?): asserts expression`, so it narrows the
type as well as failing the test — which is what lets an accessor return a
non-optional value without a cast.

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
narrowing accessor is exactly where extracted logic should go. The rule bans
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
<!-- gen:testing-shared:end -->

<!-- gen:testing-skill:start -->
## Applying this in the Isotopy repo

### The layers

Put a check in the highest row it can live in. Each row down is slower, more
indirect, and harder to diagnose when it breaks.

| Layer | Files | Runner | Command | Scope |
| --- | --- | --- | --- | --- |
| **Component** | `packages/*/test/**/*.comp.ts` | Vitest (`node`) | `pnpm test` | The default. Request in → behaviour out, through the real routes, services, orchestrator and run-store. |
| **Component (render)** | `packages/ui/test/**/*.comp.tsx` | Vitest (`jsdom`) | `pnpm test` | The same, for React code that must render — hooks and components, deps mocked. |
| **Spec** | `packages/*/test/**/*.spec.ts` | Vitest (`node`) | `pnpm test` | Complicated *pure* functions only. No I/O, no HTTP. |
| **E2E** | `packages/ui/e2e/**/*.e2e.ts` | Playwright | `pnpm e2e` | Only what needs a browser: rendering, focus, tab wiring. |
| **Live** | `e2e/run/live-dev-test.e2e.ts` | Playwright | `ISOTOPY_E2E_LIVE=1 …` | Opt-in canary that the real CLI still integrates. Costs money. |

**`.spec.ts` means one thing: a Vitest unit spec over a pure function.** A
browser test is `.e2e.ts` (Playwright's `testMatch`), because one extension
meaning two things is how a browser test gets read as a unit spec.

### Where a file lives

Tests are grouped by subject, not left in one flat directory:

```text
packages/server/test/       milestone/  engine/  run/  support/   … rest at root
packages/ui/test/           milestone/  run/     support/         … rest at root
packages/ui/e2e/            milestone/  run/     support/         … rest at root
```

Everything that is not clearly one of those stays at the root until it earns a
folder. `vitest.config.ts` and the ESLint test-body rule both glob with `**`, so
a new folder needs no config change.

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

Phase banners are expected in `*.comp.ts`, `*.comp.tsx` and `*.e2e.ts`.
A short pure `*.spec.ts` is exempt: banners on a three-line assertion over a
pure function are the noise the standard exists to prevent. The hard rules —
one action, no logic in the body — apply everywhere and are enforced by ESLint.

One test is exempt from one-action-per-test: `e2e/run/live-dev-test.e2e.ts`, where
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
| `.isotopy` data root | temp dir via `ISOTOPY_HOME` | Otherwise tests write into the developer's real run history. |

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
<!-- gen:testing-skill:end -->

## Merge protection

`main` is protected: a change reaches it through a pull request that cannot merge
until CI is green. The ruleset lives on GitHub, not in this repo — configured at
**Settings → Rules → Rulesets → New branch ruleset**:

| Setting | Value |
| --- | --- |
| Target / enforcement | `main`, Active |
| Require a pull request before merging | ☑ — 0 required approvals (solo repo) |
| Require status checks to pass | ☑ — the four below |
| Require branches to be up to date | ☐ — see below |
| Block force pushes | ☑ |
| Bypass list | `Repository admin` |

The required checks must be named exactly as the workflow renders them. A name
that matches no job is silently never required, which looks identical to a
working gate until something red merges:

- `checks`
- `e2e`
- `windows-latest core checks`
- `macos-latest core checks`

The last two come from the `cross-platform` matrix job's
`name: ${{ matrix.os }} core checks`, not from the job id.

"Require branches to be up to date" stays **off** deliberately: with four jobs
and a single maintainer it forces a rebase-and-rerun cycle on every merge for no
real safety gain. Admin bypass stays **on** so a docs typo or a CI fix is not
gated behind its own broken CI. See
[`decisions.md`](./decisions.md), 2026-08-04.

## Why the live test still exists

It no longer proves the boxes chain — `pm-dev-test-pipeline.comp.ts` does that
for free, including that each prompt quotes every upstream report and that all
three boxes share one workspace. The live test now answers only the question
a mock cannot: *does the real CLI still work?* — found on PATH, authenticated,
honouring `--model`, emitting parseable output, writing files where expected.

## Forcing a plan limit by hand

A limit is the one behaviour you cannot wait for on demand, so every adapter
takes a binary override — `ISOTOPY_CLAUDE_PATH`, `ISOTOPY_CODEX_PATH`,
`ISOTOPY_CURSOR_PATH`. Point one at a stub that prints a limit line to **stderr**
and exits non-zero, and the real adapter, the real subprocess harness and the
real detection patterns all run. No code change, no test hook.

macOS / Linux:

```bash
cat > /tmp/fake-claude <<'EOF'
#!/bin/sh
echo "You've hit your session limit · resets 4:30pm (Europe/Tallinn)" >&2
exit 1
EOF
chmod +x /tmp/fake-claude
ISOTOPY_CLAUDE_PATH=/tmp/fake-claude pnpm dev
```

Windows (PowerShell) — it must be `.cmd` or `.bat`, which is what
`commandNeedsWindowsShell` looks for:

```powershell
@'
@echo off
echo You've hit your session limit - resets 4:30pm (Europe/Tallinn) 1>&2
exit /b 1
'@ | Out-File -Encoding ascii $env:TEMP\fake-claude.cmd
$env:ISOTOPY_CLAUDE_PATH = "$env:TEMP\fake-claude.cmd"; pnpm dev
```

Start any run: the stage goes `blocked`, the popup names the reset in your own
timezone and counts down, and the rail shows `BLOCKED`. Kill the server with the
run parked and `pnpm dev` again — it comes back still parked. To watch it resume
on its own instead of waiting until 4:30pm, use a short delay the parser
understands: `try again in 20 seconds`.

`engine-limit-adapters.comp.ts` automates exactly this for all three engines.

## Cross-platform notes

- Temp roots come from `os.tmpdir()` + `mkdtemp`, never a hardcoded `/tmp`.
- `dispose()` shuts the orchestrator down (cancelling in-flight runs and
  draining queued writes) **before** deleting the temp directory. On Windows a
  rename still in flight makes `fs.rm` throw `EBUSY`; the delete also retries and
  tolerates failure, since a stray temp directory is untidy, not a test failure.
- The component suite never reaches `engines/subprocess.ts`, so it has no
  platform-specific behaviour to diverge on.

## The QA Engineer persona

The blocks below are the shipped persona's own prose, wrapped around the shared
standard above by `pnpm gen:skills`. They are not documentation of this repo —
they are the prompt an Isotopy QA step runs with, in whatever repository it lands.

<!-- gen:tester-persona-head:start -->
# Role: QA Engineer

You are a comprehensive quality engineer responsible for automated and
interactive product verification. Choose the smallest reliable mix of checks
that proves the assigned requirements and exposes meaningful regression risk.

## Persona and assignment

You are an ordinary agent-backed workflow step, like Product Manager,
Developer, and the other personas. This file defines your stable identity and
working principles. The workflow step supplies the current task, upstream
handoffs, required evidence, and verdict rules.

Automated QA, end-to-end testing, and focused exploratory testing are
capabilities of this one persona. They are not separate agents.

## Responsibilities

- Review requirements, design or architecture handoffs, and the implementation
  diff.
- Inspect the repository and run its relevant build, lint, typecheck, and test
  scripts.
- Decide whether unit, integration, or end-to-end coverage is needed for the
  changed behaviour.
- Add durable automated tests when they protect required behaviour or a useful
  regression boundary.
- Drive a running product with your own browser capability where you have one.
  Where you have none, Playwright is the complete fallback and stays the
  authority for anything that must run in CI.
- Reach that fallback through the repository's own Playwright and the browsers
  it already has. Installing a second version alongside it is a last resort, and
  never a silent one — say so in the handoff when you do.
- Perform focused exploratory checks in a browser when a stable automated
  assertion cannot adequately express the risk.
- Never start, stop or kill the product yourself, and never choose a port for
  it. Ask Isotopy to start it and drive the URL it returns; where Isotopy offers no
  such mechanism, use the repository's own Playwright `webServer` lifecycle.
- Report actual commands, results, screenshots, traces, coverage gaps, and
  relevant platform limitations in the normal stage handoff.
- Always terminate the browser processes you started after retaining required
  evidence.
<!-- gen:tester-persona-head:end -->

<!-- gen:tester-persona-tail:start -->
Follow the repository's own testing conventions where they exist and are
stricter than the above. Where they do not exist, the standard above is the
default you write to.

## Boundaries

- Do not make a browser capability a precondition. Where none exists,
  Playwright must still prove the same behaviour, and CI only ever sees
  Playwright.
- Do not install anything into a cache shared with the rest of the machine, and
  do not change where a tool keeps one. `PLAYWRIGHT_BROWSERS_PATH` is already
  set for you: leave it exactly as it is, and never unset or override it. A
  browser installer prunes builds it does not recognise, so an install against
  the machine's own cache can break tooling this repository never touched.
- Do not hide a product defect by weakening expectations or tests.
- Do not silently rewrite production behaviour; report implementation defects
  for the Developer.
- Do not claim a check ran when it was only inspected or inferred.
- Never delete permanent tests, user work, retained evidence, or historical run
  records during cleanup.

Be skeptical, reproducible, and clear about verified facts versus remaining
risk.
<!-- gen:tester-persona-tail:end -->
