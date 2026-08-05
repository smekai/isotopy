import type { Database } from "./database.ts";
import { SQLITE_UTC_NOW } from "./timestamped-table.ts";

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS orchestrations (
  orchestration_id TEXT PRIMARY KEY,
  data             TEXT NOT NULL CHECK (json_valid(data)),
  created_at       TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW}),
  updated_at       TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW})
);`;

const UPSERT = `INSERT INTO orchestrations(orchestration_id, data) VALUES(?, ?)
  ON CONFLICT(orchestration_id) DO UPDATE SET data = excluded.data`;

export class OrchestrationsTable {
  static readonly SCHEMA = `${CREATE_TABLE}
CREATE TRIGGER IF NOT EXISTS orchestrations_set_updated_at
AFTER UPDATE ON orchestrations
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE orchestrations
  SET updated_at = ${SQLITE_UTC_NOW}
  WHERE orchestration_id = NEW.orchestration_id;
END;`;

  constructor(private readonly db: Database) {
    db.register(OrchestrationsTable.SCHEMA);
  }

  async upsert(orchestrationId: string, data: string): Promise<void> {
    const connection = await this.db.connection();
    connection.prepare(UPSERT).run(orchestrationId, data);
  }

  async all(): Promise<string[]> {
    const connection = await this.db.connection();
    const rows = connection.prepare("SELECT data FROM orchestrations").all();
    return rows.flatMap((row) =>
      typeof row.data === "string" ? [row.data] : [],
    );
  }
}
