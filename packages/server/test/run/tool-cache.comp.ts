// Where a run may download tooling, proven through the real construction path.
// `engine/tool-cache.comp.ts` proves each adapter passes the directory on to its
// CLI; what only a whole run can show is which directory it gets — and the two
// project kinds disagree, because a home run's workspace is nested below its data
// directory rather than the other way round.
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { addTestProject, createTestApp, startRun } from "../support/harness.ts";
import type { TestApp } from "../support/harness.ts";

const ENGINE_RUN = { pipelineId: "solo", task: "work here", engine: "claude-code" };

let ctx: TestApp;

beforeEach(async () => {
  ctx = await createTestApp();
});

afterEach(async () => {
  await ctx.dispose();
});

test("a home run caches tooling inside its own workspace, the only place a sandboxed run may write", async () => {
  // Anticipate
  ctx.engine.anticipate({ as: "Developer" }).reports("done");

  // Act
  const run = await startRun(ctx.app, ENGINE_RUN);

  // Assert
  const call = await ctx.engine.waitForCall();
  expect(call.toolCacheDir).toBe(
    path.join(ctx.home, "runs", run.id, "workspace", ".isotopy", "cache"),
  );
});

test("a project run caches tooling once for the project, not once per run", async () => {
  // Arrange
  const project = await addTestProject(ctx.registry, "acme");

  // Anticipate
  ctx.engine.anticipate({ as: "Developer" }).reports("done");

  // Act
  await startRun(ctx.app, ENGINE_RUN, project.headers);

  // Assert
  const call = await ctx.engine.waitForCall();
  expect(call.toolCacheDir).toBe(path.join(project.root, ".isotopy", "cache"));
});
