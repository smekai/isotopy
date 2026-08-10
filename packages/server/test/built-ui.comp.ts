// `pnpm build` used to produce an API server and a static UI bundle with nothing
// serving the bundle, so there was no way to run the built app at all — the gap
// a first-time installer hits first.
//
// That the bundle reaches a *browser* is the built e2e tier's job
// (`packages/ui/e2e/built-app.e2e.ts`, ADHD_E2E_BUILT=1); asserting a 200 here
// would only restate it. What is left are the two cases a browser suite covers
// badly, because both need a server that was started differently: a build that
// is not there at all, and an API route the static middleware must not swallow.
//
// The mount lives in the compiled entrypoint rather than in `createApp`, because
// importing `@hono/node-server/serve-static` into the app module wedges
// `tsx watch` under `concurrently` and `pnpm dev` never comes up. Tests therefore
// mount it the same way `index.ts` does.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createTestApp } from "./support/harness.ts";
import type { TestApp } from "./support/harness.ts";
import { mountBuiltUi } from "../src/utils/built-ui.ts";

const MARKER = "<!doctype html><title>built ui</title>";

let ctx: TestApp;
let uiDir: string;

beforeEach(() => {
  uiDir = mkdtempSync(path.join(os.tmpdir(), "adhd-built-ui-"));
});

afterEach(async () => {
  await ctx?.dispose();
  delete process.env.ADHD_UI_DIR;
  rmSync(uiDir, { recursive: true, force: true, maxRetries: 3 });
});

test("serving the bundle never swallows an API route", async () => {
  // Arrange — the static middleware matches "/*", so this is the collision case.
  writeBundle();
  process.env.ADHD_UI_DIR = uiDir;
  ctx = await createTestApp();
  await mountBuiltUi(ctx.app);

  // Act
  const response = await ctx.app.request("/health");

  // Assert
  expect(await response.json()).toMatchObject({ ok: true });
});

test("with no bundle built, the server is still a working API rather than a broken page", async () => {
  // Arrange — ADHD_UI_DIR deliberately points at a directory with no index.html.
  process.env.ADHD_UI_DIR = uiDir;
  ctx = await createTestApp();
  await mountBuiltUi(ctx.app);

  // Act
  const response = await ctx.app.request("/health");

  // Assert
  expect(response.status).toBe(200);
});

function writeBundle(): void {
  mkdirSync(path.join(uiDir, "assets"), { recursive: true });
  writeFileSync(path.join(uiDir, "index.html"), MARKER);
  writeFileSync(path.join(uiDir, "assets", "app.js"), "export default 1;\n");
}
