// The db/ layer's guarantees, observed through RunRepository: a corrupt database
// degrades to an empty load instead of crashing, a concurrent reader sees the
// writer's committed rows (WAL, gate G6), and a legacy table keeps working after
// it migrates.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import type { ProjectPath } from "../../src/paths.ts";
import { ProjectDatabases } from "../../src/db/project-databases.ts";
import { RunRepository } from "../../src/repository/run-repository.ts";
import type { PersistedRun } from "../../src/repository/run-repository.ts";
import { makePersistedRun } from "../support/run-fixtures.ts";

let dir: string;
let projectPath: ProjectPath;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "isotopy-db-"));
  projectPath = { id: "p", root: dir, dataDir: dir };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(
    () => undefined,
  );
});

test("a corrupt database degrades to an empty load, not a crash", async () => {
  // Arrange
  await writeFile(dbPath(), "this is not a sqlite database");

  // Act
  const loaded = await loadAllRuns();

  // Assert
  expect(loaded).toEqual([]);
});

test("a concurrent reader sees rows the writer has committed (WAL)", async () => {
  // Arrange / Act
  let seen: string[] = [];
  await withRepository(async (repository) => {
    await repository.writeState("r1", makePersistedRun("r1", "running"));
    await repository.writeState("r2", makePersistedRun("r2", "completed"));
    seen = await readRunIdsFromSecondConnection();
  });

  // Assert
  expect(seen).toEqual(["r1", "r2"]);
});

test("a legacy run row stays writable once its table has migrated", async () => {
  // Arrange
  await writeLegacyRunsTable(makePersistedRun("legacy", "running"));

  // Act
  await withRepository((repository) =>
    repository.writeState("legacy", makePersistedRun("legacy", "completed")),
  );

  // Assert
  expect(await loadAllRuns()).toEqual([makePersistedRun("legacy", "completed")]);
});

function dbPath(): string {
  return path.join(dir, "runs.db");
}

async function withRepository(fn: (repo: RunRepository) => Promise<void>): Promise<void> {
  const databases = new ProjectDatabases();
  const repository = new RunRepository(projectPath, databases.for(projectPath));
  try {
    await fn(repository);
  } finally {
    await repository.settle();
    await databases.settleAll();
  }
}

async function loadAllRuns(): Promise<PersistedRun[]> {
  let loaded: PersistedRun[] = [];
  await withRepository(async (repository) => {
    loaded = await repository.loadAll();
  });
  return loaded;
}

async function readRunIdsFromSecondConnection(): Promise<string[]> {
  const { DatabaseSync } = await import("node:sqlite");
  const reader = new DatabaseSync(dbPath(), { readOnly: true });
  const rows = reader.prepare("SELECT run_id FROM runs ORDER BY run_id").all();
  reader.close();
  return rows.map((row) => String(row.run_id));
}

async function writeLegacyRunsTable(run: PersistedRun): Promise<void> {
  const { DatabaseSync } = await import("node:sqlite");
  const legacy = new DatabaseSync(dbPath());
  legacy.exec(`
CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`);
  legacy
    .prepare("INSERT INTO runs(run_id, data, updated_at) VALUES(?, ?, ?)")
    .run(run.run.id, JSON.stringify(run), "2026-07-01T10:20:30.456Z");
  legacy.close();
}
