import type { DatabaseSync as SqliteConnection } from "node:sqlite";
import type { Database } from "./database.ts";
import {
  migrateLegacyTimestampTable,
  SQLITE_UTC_NOW,
} from "./timestamped-table.ts";

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS milestones (
  milestone_id TEXT PRIMARY KEY,
  data         TEXT NOT NULL CHECK (json_valid(data)),
  created_at   TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW}),
  updated_at   TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW})
);`;

const UPSERT = `INSERT INTO milestones(milestone_id, data) VALUES(?, ?)
  ON CONFLICT(milestone_id) DO UPDATE SET data = excluded.data`;

export class MilestonesTable {
  static readonly SCHEMA = `${CREATE_TABLE}
CREATE TRIGGER IF NOT EXISTS milestones_set_updated_at
AFTER UPDATE ON milestones
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE milestones
  SET updated_at = ${SQLITE_UTC_NOW}
  WHERE milestone_id = NEW.milestone_id;
END;`;

  constructor(private readonly db: Database) {
    db.register(MilestonesTable.SCHEMA, MilestonesTable.migrate);
  }

  private static migrate(connection: SqliteConnection): void {
    migrateLegacyTimestampTable(connection, {
      table: "milestones",
      temporaryTable: "milestones_before_timestamp_migration",
      createTable: CREATE_TABLE,
      copyRows: `
INSERT INTO milestones(milestone_id, data, created_at, updated_at)
SELECT milestone_id, data, updated_at, updated_at
FROM milestones_before_timestamp_migration`,
    });
  }

  async upsert(milestoneId: string, data: string): Promise<void> {
    const connection = await this.db.connection();
    connection.prepare(UPSERT).run(milestoneId, data);
  }

  async all(): Promise<string[]> {
    const connection = await this.db.connection();
    const rows = connection.prepare("SELECT data FROM milestones").all();
    return rows.flatMap((row) =>
      typeof row.data === "string" ? [row.data] : [],
    );
  }
}
