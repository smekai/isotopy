import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { ProjectPath } from "../src/paths.ts";
import { RunChangeCollector } from "../src/services/run-change-collector.ts";
import {
  addDirtyEmbeddedRepository,
  commitEverything,
  initGitRepository,
} from "./support/git-project.ts";

const RUN_ID = "run-0001";

const projects: string[] = [];

afterEach(async () => {
  await Promise.all(projects.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function project(): Promise<ProjectPath> {
  const root = await mkdtemp(path.join(os.tmpdir(), "isotopy-changes-"));
  projects.push(root);
  await writeFile(path.join(root, "README.md"), "# app\n");
  return { id: "test-project", root, dataDir: path.join(root, ".isotopy") };
}

test("a folder that is not a repository still reports what the run created", async () => {
  const collector = new RunChangeCollector();
  const scope = await project();
  await collector.captureBaseline(scope, RUN_ID, scope.root);
  await writeFile(path.join(scope.root, "app.ts"), "export const app = 1;\n");

  expect(await collector.capture(scope, RUN_ID, scope.root)).toMatchObject({
    source: "snapshot",
    files: [{ path: "app.ts", kind: "created" }],
  });
});

test("a file the run rewrote is reported as edited, not as new", async () => {
  const collector = new RunChangeCollector();
  const scope = await project();
  await collector.captureBaseline(scope, RUN_ID, scope.root);
  await writeFile(path.join(scope.root, "README.md"), "# app\n\nNow with prose.\n");

  expect(await collector.capture(scope, RUN_ID, scope.root)).toMatchObject({
    files: [{ path: "README.md", kind: "edited" }],
  });
});

test("a file the run removed is reported as deleted", async () => {
  const collector = new RunChangeCollector();
  const scope = await project();
  await collector.captureBaseline(scope, RUN_ID, scope.root);
  await rm(path.join(scope.root, "README.md"));

  expect(await collector.capture(scope, RUN_ID, scope.root)).toMatchObject({
    files: [{ path: "README.md", kind: "deleted" }],
  });
});

test("work the agent committed is still reported, even though the tree is clean", async () => {
  const collector = new RunChangeCollector();
  const scope = await project();
  await initGitRepository(scope.root);
  await commitEverything(scope.root, "initial");
  await collector.captureBaseline(scope, RUN_ID, scope.root);
  await writeFile(path.join(scope.root, "app.ts"), "export const app = 1;\n");
  await commitEverything(scope.root, "add the app");

  expect(await collector.capture(scope, RUN_ID, scope.root)).toMatchObject({
    source: "git",
    files: [{ path: "app.ts", kind: "created" }],
  });
});

test("the first commit in a fresh repository is reported, not swallowed by the missing baseline", async () => {
  const collector = new RunChangeCollector();
  const scope = await project();
  await initGitRepository(scope.root);
  await collector.captureBaseline(scope, RUN_ID, scope.root);
  await commitEverything(scope.root, "initial");

  expect(await collector.capture(scope, RUN_ID, scope.root)).toMatchObject({
    source: "git",
    files: [{ path: "README.md", kind: "created" }],
  });
});

test("a file already dirty before the run started is not claimed as the run's work", async () => {
  const collector = new RunChangeCollector();
  const scope = await project();
  await initGitRepository(scope.root);
  await commitEverything(scope.root, "initial");
  await writeFile(path.join(scope.root, "README.md"), "# app, edited by hand\n");
  await collector.captureBaseline(scope, RUN_ID, scope.root);

  expect(await collector.capture(scope, RUN_ID, scope.root)).toMatchObject({ files: [] });
});

test("a file already dirty before the run started is claimed once the run rewrites it", async () => {
  const collector = new RunChangeCollector();
  const scope = await project();
  await initGitRepository(scope.root);
  await commitEverything(scope.root, "initial");
  await writeFile(path.join(scope.root, "README.md"), "# app, edited by hand\n");
  await collector.captureBaseline(scope, RUN_ID, scope.root);
  await writeFile(path.join(scope.root, "README.md"), "# app, then rewritten by the run\n");

  expect(await collector.capture(scope, RUN_ID, scope.root)).toMatchObject({
    source: "git",
    files: [{ path: "README.md", kind: "edited" }],
  });
});

test("an untracked file already present before the run is claimed once the run rewrites it", async () => {
  const collector = new RunChangeCollector();
  const scope = await project();
  await initGitRepository(scope.root);
  await commitEverything(scope.root, "initial");
  await writeFile(path.join(scope.root, "notes.md"), "dropped here by hand\n");
  await collector.captureBaseline(scope, RUN_ID, scope.root);
  await writeFile(path.join(scope.root, "notes.md"), "rewritten by the run\n");

  expect(await collector.capture(scope, RUN_ID, scope.root)).toMatchObject({
    source: "git",
    files: [{ path: "notes.md", kind: "created" }],
  });
});

test("a dirty submodule cannot hide the run's edits, because it is unhashable and the rest are not", async () => {
  const collector = new RunChangeCollector();
  const scope = await project();
  await initGitRepository(scope.root);
  await commitEverything(scope.root, "initial");
  await addDirtyEmbeddedRepository(scope.root, "sub");
  await writeFile(path.join(scope.root, "README.md"), "# app, edited by hand\n");
  await collector.captureBaseline(scope, RUN_ID, scope.root);
  await writeFile(path.join(scope.root, "README.md"), "# app, then rewritten by the run\n");

  expect(await collector.capture(scope, RUN_ID, scope.root)).toMatchObject({
    source: "git",
    files: [{ path: "README.md", kind: "edited" }],
  });
});

test("a run with no baseline reports nothing rather than inventing a change set", async () => {
  const collector = new RunChangeCollector();
  const scope = await project();

  expect(await collector.capture(scope, RUN_ID, scope.root)).toBeUndefined();
});

test("the change set is written beside the run as readable markdown", async () => {
  const collector = new RunChangeCollector();
  const scope = await project();
  await collector.captureBaseline(scope, RUN_ID, scope.root);
  await writeFile(path.join(scope.root, "app.ts"), "export const app = 1;\n");
  await collector.capture(scope, RUN_ID, scope.root);

  expect(
    await readFile(path.join(scope.dataDir, "runs", RUN_ID, "changes", "changes.md"), "utf8"),
  ).toContain("`app.ts`");
});
