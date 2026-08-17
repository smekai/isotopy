// Component test: does a run's tooling install into the project, or into the
// machine? TASK-141 watched an agent's `npx playwright install` prune the build
// this repo's own e2e suite depends on out of the user-level cache. The rule is
// per adapter, so it is proven per adapter, against a stub binary that reports
// the environment it was actually handed.
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { EngineId } from "@isotopy/core";
import {
  installEngineStubs,
  recordedBrowsersPaths,
  removeEngineStubs,
  resetEngineStubs,
  runStubAdapter,
} from "../support/engine-stub.ts";

const PROJECT_CACHE = path.join("C:", "work", "acme", ".isotopy", "cache");
const ENGINES: EngineId[] = ["claude-code", "codex", "cursor"];

beforeAll(() => {
  installEngineStubs();
});

beforeEach(() => {
  resetEngineStubs();
});

afterAll(() => {
  removeEngineStubs();
});

describe.each(ENGINES)("%s", (engine) => {
  test("downloads browsers into the project's own cache, never the machine's", async () => {
    // Act
    await runStubAdapter(engine, { toolCacheDir: PROJECT_CACHE });

    // Assert
    expect(recordedBrowsersPaths()).toEqual([path.join(PROJECT_CACHE, "ms-playwright")]);
  });

  test("leaves the variable alone when no cache was scoped, rather than blanking it", async () => {
    // Act
    await runStubAdapter(engine);

    // Assert — an empty value would send Playwright to the CWD, which is worse than the default.
    expect(recordedBrowsersPaths()).toEqual(["<unset>"]);
  });
});
