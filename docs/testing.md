# Testing

How this repo is tested, and — more usefully — **where a given check belongs**.

## The layers

Put a check in the highest row it can live in. Each row down is slower, more
indirect, and harder to diagnose when it breaks.

| Layer | Files | Runner | Command | Scope |
| --- | --- | --- | --- | --- |
| **Component** | `packages/*/test/*.comp.ts` | Vitest (`node`) | `pnpm test` | The default. Request in → behaviour out, through the real routes, services, orchestrator and run-store. |
| **Component (render)** | `packages/ui/test/*.comp.tsx` | Vitest (`jsdom`) | `pnpm test` | The same, for React code that must render — hooks and components, deps mocked. |
| **Spec** | `packages/*/test/*.spec.ts` | Vitest (`node`) | `pnpm test` | Complicated *pure* functions only. No I/O, no HTTP. |
| **E2E** | `packages/ui/e2e/*.spec.ts` | Playwright | `pnpm e2e` | Only what needs a browser: rendering, focus, tab wiring. |
| **Live** | `e2e/live-dev-test.spec.ts` | Playwright | `ADHD_E2E_LIVE=1 …` | Opt-in canary that the real CLI still integrates. Costs money. |

**Tests never sit beside the code they cover.** Every package keeps them in its
own `test/` directory, split by extension. This is not only taste: `core` and
`server` compile `src/` to `dist/`, so a colocated `*.spec.ts` is emitted into
the build output and shipped. A package that emits therefore needs a
`tsconfig.test.json` that includes `test/` — typechecked, never compiled.
Playwright is the one exception, with its own `packages/ui/e2e/` and its own
runner.

**Component tests are the primary level.** They are nearly as fast as unit tests
(the whole suite is ~1.5s) while exercising the code paths that actually break.
A rule of thumb: if a check would still make sense with the React app deleted,
it is a component test.

**A test must be able to fail for a real reason.** A spec exists for logic
complicated enough to get wrong — a parser, a reducer, an ordering rule, a
platform difference. **If you cannot name the bug a test would catch, it is not
a test.** Three patterns fail that question every time:

| Anti-pattern | Why it is worthless | Example removed |
| --- | --- | --- |
| Asserting a **constant** back | The test and the code are the same edit. It fails when a value legitimately changes, never when behaviour breaks. | `expect(DEMO_PIPELINES.map(p => p.id)).toEqual(["pm-dev-test", "solo"])` |
| Asserting on **prose** | Passes until someone writes a perfectly good sentence. | `expect(persona.endsWith("prompt.")).toBe(true)` — broke on a correct new persona |
| Covering a **one-line expression** | `isValid(x) ? x : default` has no room for a bug the type system does not already catch. | the five `normalizeProjectPreferences` cases |

Two rounds of review deleted ~35 such tests. What survived is the shape to copy:
`parsePreferencesUpdate` (four validated fields, partial output, legacy rewrite)
is covered; `normalizeProjectPreferences` beside it is not, because it is four
ternaries whose only real logic is shared with the parser. `sameProjectRoot` is
covered because it folds case **only on Windows**; `projectNameFor` is not,
because it is `path.basename`.

The cost of a worthless test is not the milliseconds. It is that every future
change drags it along, and that a red suite stops meaning something is broken.

**The extension picks the environment.** `pnpm test` runs two Vitest projects
from one root config: `node` takes `packages/*/test/**/*.{comp,spec}.ts`, and
`ui` takes `packages/ui/test/**/*.comp.tsx` under `jsdom`. So a UI check that
needs to render is a `.comp.tsx`; a UI check over a pure function stays a
`.spec.ts` and runs in `node` with everything else. Run one project at a time
with `pnpm vitest run --project ui`. React state updates must go through
`renderHook`/`render` — `react-hooks/rules-of-hooks` is an **error** across
`packages/ui/**`, so calling a hook directly in a test body fails lint.

**What a UI component test substitutes.** The same principle as the server's
two substitutions: replace the boundary, keep the rest real. For the UI that
boundary is [`api.ts`](../packages/ui/src/api.ts) — the only module that talks
to the network — mocked with `vi.mock("../src/api")`. Anything that needs a real
server, a real browser or real rendering of the whole app stays in `e2e/`.

**Specs are deliberately narrow.** They live in the same `test/` directory as
the component tests, and earn their place only where the logic is intricate
enough that a component test would not localise the failure —
`parseStageVerdict` scanning backwards through markdown-wrapped, CRLF-terminated
model output is the archetype. They are not a coverage exercise.

## Writing a component test: AAAAA

Per [the AAAAA article](https://medium.com/bolt-labs/aaaaa-testing-96583245ae24),
a test moves through five phases:

1. **Arrange** — initial state, fixtures, preconditions.
2. **Anticipate** — declare every external interaction *and the inputs it must
   receive*, up front. This is not a passive stub: the anticipation is itself an
   assertion.
3. **Act** — one action. A single request.
4. **Assert** — return value, persisted state, side effects.
5. **AI** — not a code block. The declarative shape is what makes these tests
   cheap for a model to read, extend, and reason about.

Two rules that are easy to break and worth enforcing in review:

- **One action per test.** If you need a second request to be the point of the
  test, write a second test.
- **No branching or inline logic in a test body.** No `if`, no `for`, no
  `try`. Every loop, poll and retry belongs in `test/support/harness.ts` — that
  is why `waitForRunStatus` and `engine.waitForCall` exist.

### What gets substituted

Exactly two things. Everything else is the real code.

| Dependency | Substituted with | Why |
| --- | --- | --- |
| Engine adapter (spawns a CLI) | `FakeEngine` via `setEngineAdapter()` | Otherwise the test costs money and needs an authenticated CLI. |
| `.adhd` data root | temp dir via `ADHD_HOME` | Otherwise tests write into the developer's real run history. |

### A worked example

```ts
test("a FAIL verdict fails the stage and the run even though the engine exited cleanly", async () => {
  // Arrange
  const { app, engine } = ctx;

  // Anticipate — the Tester succeeds at the process level but reports FAIL.
  engine.anticipate({ as: "Project Manager" }).reports(PM_REPORT);
  engine.anticipate({ as: "Developer" }).reports(DEV_REPORT);
  engine.anticipate({ as: "Tester" }).reports("Broken.\n\nVERDICT: FAIL");

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
code path never touched an engine. Every simulated-pipeline test ends with one.

## Why the live test still exists

It no longer proves the boxes chain — `pm-dev-test-pipeline.comp.ts` does that
for free, including that each prompt quotes every upstream report and that all
three boxes share one workspace. The live test now answers only the question
a mock cannot: *does the real CLI still work?* — found on PATH, authenticated,
honouring `--model`, emitting parseable output, writing files where expected.

## Running

```bash
pnpm test          # component tests + specs (fast, free, no CLI needed)
pnpm test:watch    # same, in watch mode
pnpm e2e           # Playwright, free + seeded tiers
```

CI wiring is still on the "adopt next" list in
[`architecture.md`](./architecture.md). The Vitest suite is CI-ready today: no
credentials, no engine, no browser.

## Cross-platform notes

- Temp roots come from `os.tmpdir()` + `mkdtemp`, never a hardcoded `/tmp`.
- `dispose()` shuts the orchestrator down (cancelling in-flight runs and
  draining queued writes) **before** deleting the temp directory. On Windows a
  rename still in flight makes `fs.rm` throw `EBUSY`; the delete also retries and
  tolerates failure, since a stray temp directory is untidy, not a test failure.
- The component suite never reaches `engines/subprocess.ts`, so it has no
  platform-specific behaviour to diverge on.
