import type { Database } from "./database.ts";
import type { DatabaseSync as SqliteConnection } from "node:sqlite";
import {
  migrateLegacyTimestampTable,
  SQLITE_UTC_NOW,
} from "./timestamped-table.ts";

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS runs (
  run_id     TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW}),
  updated_at TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW})
);`;

const UPSERT = `INSERT INTO runs(run_id, data) VALUES(?, ?)
  ON CONFLICT(run_id) DO UPDATE SET data = excluded.data`;

export class RunsTable {
  static readonly SCHEMA = `${CREATE_TABLE}
CREATE TRIGGER IF NOT EXISTS runs_set_updated_at
AFTER UPDATE ON runs
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE runs
  SET updated_at = ${SQLITE_UTC_NOW}
  WHERE run_id = NEW.run_id;
END;`;

  constructor(private readonly db: Database) {
    db.register(RunsTable.SCHEMA, RunsTable.migrate);
  }

  private static migrate(connection: SqliteConnection): void {
    migrateLegacyTimestampTable(connection, {
      table: "runs",
      temporaryTable: "runs_before_timestamp_migration",
      createTable: CREATE_TABLE,
      copyRows: `
INSERT INTO runs(run_id, data, created_at, updated_at)
SELECT run_id, data, updated_at, updated_at
FROM runs_before_timestamp_migration`,
    });
  }

  async upsert(runId: string, data: string): Promise<void> {
    const connection = await this.db.connection();
    connection.prepare(UPSERT).run(runId, data);
  }

  async all(): Promise<string[]> {
    const connection = await this.db.connection();
    const rows = connection.prepare("SELECT data FROM runs").all();
    return rows.flatMap((row) => (typeof row.data === "string" ? [row.data] : []));
  }
}
