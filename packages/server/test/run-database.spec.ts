// The db/ layer's guarantees, observed through RunRepository: a corrupt database
// degrades to an empty load instead of crashing, and a concurrent reader sees the
// writer's committed rows (WAL, gate G6).
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { ProjectPath } from "../src/paths.ts";
import { RunRepository } from "../src/repository/run-repository.ts";
import type { PersistedRun } from "../src/repository/run-repository.ts";
import { makePersistedRun } from "./support/run-fixtures.ts";

let dir: string;
let projectPath: ProjectPath;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "adhd-db-"));
  projectPath = { id: "p", root: dir, dataDir: dir };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(
    () => undefined,
  );
});

function dbPath(): string {
  return path.join(dir, "runs.db");
}

async function withRepository(fn: (repo: RunRepository) => Promise<void>): Promise<void> {
  const repository = new RunRepository(projectPath);
  try {
    await fn(repository);
  } finally {
    await repository.settle();
  }
}

test("a corrupt database degrades to an empty load, not a crash", async () => {
  await writeFile(dbPath(), "this is not a sqlite database");

  let loaded: PersistedRun[] | undefined;
  await withRepository(async (repository) => {
    loaded = await repository.loadAll();
  });

  expect(loaded).toEqual([]);
});

test("a concurrent reader sees rows the writer has committed (WAL)", async () => {
  let seen: string[] = [];
  await withRepository(async (repository) => {
    await repository.writeState("r1", makePersistedRun("r1", "running"));
    await repository.writeState("r2", makePersistedRun("r2", "completed"));

    const { DatabaseSync } = await import("node:sqlite");
    const reader = new DatabaseSync(dbPath(), { readOnly: true });
    const rows = reader.prepare("SELECT run_id FROM runs ORDER BY run_id").all();
    reader.close();
    seen = rows.map((row) => String(row.run_id));
  });

  expect(seen).toEqual(["r1", "r2"]);
});
