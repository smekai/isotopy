import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Database } from "../src/db/database.ts";
import {
  JsonRecordsTable,
  MILESTONES_TABLE,
  RUNS_TABLE,
} from "../src/db/json-records-table.ts";
import type { ProjectPath } from "../src/paths.ts";

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LEGACY_TIMESTAMP = "2026-07-01T10:20:30.456Z";

let dir: string;
let projectPath: ProjectPath;
let database: Database | undefined;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "isotopy-timestamps-"));
  projectPath = { id: "p", root: dir, dataDir: dir };
});

afterEach(async () => {
  await database?.settle();
  await rm(dir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  });
});

function createTables(): {
  runs: JsonRecordsTable;
  milestones: JsonRecordsTable;
} {
  database = new Database(projectPath);
  return {
    runs: new JsonRecordsTable(database, RUNS_TABLE),
    milestones: new JsonRecordsTable(database, MILESTONES_TABLE),
  };
}

test("SQLite supplies UTC creation and update timestamps on insert", async () => {
  const { runs, milestones } = createTables();

  await runs.upsert("run-1", '{"version":1}');
  await milestones.upsert("milestone-1", '{"id":"milestone-1"}');

  const connection = await database?.connection();
  const run = connection
    ?.prepare(
      "SELECT created_at, updated_at FROM runs WHERE run_id = 'run-1'",
    )
    .get();
  const milestone = connection
    ?.prepare(
      "SELECT created_at, updated_at FROM milestones WHERE milestone_id = 'milestone-1'",
    )
    .get();

  expect(run?.created_at).toMatch(ISO_UTC);
  expect(run?.updated_at).toBe(run?.created_at);
  expect(milestone?.created_at).toMatch(ISO_UTC);
  expect(milestone?.updated_at).toBe(milestone?.created_at);
});

test("updates advance updated_at while reads leave both timestamps unchanged", async () => {
  const { runs } = createTables();
  await runs.upsert("run-1", '{"version":1}');
  const connection = await database?.connection();
  connection
    ?.prepare("UPDATE runs SET updated_at = ? WHERE run_id = ?")
    .run(LEGACY_TIMESTAMP, "run-1");
  const beforeRead = connection
    ?.prepare(
      "SELECT created_at, updated_at FROM runs WHERE run_id = 'run-1'",
    )
    .get();

  await runs.all();
  const afterRead = connection
    ?.prepare(
      "SELECT created_at, updated_at FROM runs WHERE run_id = 'run-1'",
    )
    .get();
  await runs.upsert("run-1", '{"version":2}');
  const afterUpdate = connection
    ?.prepare(
      "SELECT created_at, updated_at FROM runs WHERE run_id = 'run-1'",
    )
    .get();

  expect(afterRead).toEqual(beforeRead);
  expect(afterUpdate?.created_at).toBe(beforeRead?.created_at);
  expect(afterUpdate?.updated_at).toMatch(ISO_UTC);
  expect(afterUpdate?.updated_at).not.toBe(LEGACY_TIMESTAMP);
});

test("legacy run and milestone tables migrate transactionally", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const legacy = new DatabaseSync(path.join(dir, "runs.db"));
  legacy.exec(`
CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE milestones (
  milestone_id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL
);
INSERT INTO runs(run_id, data, updated_at)
VALUES('run-1', '{"version":1}', '${LEGACY_TIMESTAMP}');
INSERT INTO milestones(milestone_id, data, updated_at)
VALUES('milestone-1', '{"id":"milestone-1"}', '${LEGACY_TIMESTAMP}');
`);
  legacy.close();

  createTables();
  const connection = await database?.connection();
  const run = connection
    ?.prepare(
      "SELECT data, created_at, updated_at FROM runs WHERE run_id = 'run-1'",
    )
    .get();
  const milestone = connection
    ?.prepare(
      "SELECT data, created_at, updated_at FROM milestones WHERE milestone_id = 'milestone-1'",
    )
    .get();

  expect(run).toMatchObject({
    data: '{"version":1}',
    created_at: LEGACY_TIMESTAMP,
    updated_at: LEGACY_TIMESTAMP,
  });
  expect(milestone).toMatchObject({
    data: '{"id":"milestone-1"}',
    created_at: LEGACY_TIMESTAMP,
    updated_at: LEGACY_TIMESTAMP,
  });
});

// The legacy runs table carried no json_valid CHECK, so it can hold a row that
// RunRepository was already skipping on read. Rebuilding the table under the
// unified schema must not fail on it: the migration runs on every connection()
// until it succeeds, so one bad row would take the whole project database down.
test("a legacy row that is not JSON is dropped rather than failing the migration", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const legacy = new DatabaseSync(path.join(dir, "runs.db"));
  legacy.exec(`
CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO runs(run_id, data, updated_at)
VALUES('run-ok', '{"version":1}', '${LEGACY_TIMESTAMP}');
INSERT INTO runs(run_id, data, updated_at)
VALUES('run-corrupt', 'this is not json', '${LEGACY_TIMESTAMP}');
`);
  legacy.close();
  const warnings = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  createTables();
  const connection = await database?.connection();

  const rows = connection?.prepare("SELECT run_id FROM runs ORDER BY run_id").all();
  expect(rows).toEqual([{ run_id: "run-ok" }]);
  expect(warnings).toHaveBeenCalledWith(
    expect.stringContaining("Dropped 1 malformed runs row(s)"),
  );
  warnings.mockRestore();
});
