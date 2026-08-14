// The RunRepository contract against the sole (SQLite) adapter: a run round-trips
// through writeState -> loadAll, writes upsert rather than duplicate, the event
// log and handoff artifacts don't perturb the restored snapshot.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { ProjectPath } from "../../src/paths.ts";
import { RunRepository } from "../../src/repository/run-repository.ts";
import { makePersistedRun, makeRunEvent } from "../support/run-fixtures.ts";

let dir: string;
let projectPath: ProjectPath;
let repository: RunRepository;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "isotopy-repo-"));
  projectPath = { id: "p", root: dir, dataDir: dir };
  repository = new RunRepository(projectPath);
});

afterEach(async () => {
  await repository.settle();
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(
    () => undefined,
  );
});

test("a written run is returned by loadAll", async () => {
  await repository.writeState("r1", makePersistedRun("r1", "running"));

  const loaded = await repository.loadAll();

  expect(loaded.map((p) => p.run.id)).toEqual(["r1"]);
  expect(loaded[0]?.run.status).toBe("running");
});

test("a second writeState for the same run replaces, not duplicates", async () => {
  await repository.writeState("r1", makePersistedRun("r1", "running"));
  await repository.writeState("r1", makePersistedRun("r1", "completed"));

  const loaded = await repository.loadAll();

  expect(loaded).toHaveLength(1);
  expect(loaded[0]?.run.status).toBe("completed");
});

test("appendEvent does not change what loadAll restores", async () => {
  await repository.writeState("r1", makePersistedRun("r1", "running"));
  await repository.appendEvent("r1", makeRunEvent("r1"));

  const loaded = await repository.loadAll();

  expect(loaded.map((p) => p.run.id)).toEqual(["r1"]);
});

test("writeHandoff writes handoff.md under the run's stage dir", async () => {
  await repository.writeHandoff("r1", "developer", "# handoff body");

  const content = await readFile(
    path.join(dir, "runs", "r1", "developer", "handoff.md"),
    "utf8",
  );
  expect(content).toBe("# handoff body");
});
