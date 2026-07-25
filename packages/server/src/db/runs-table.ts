import { nowIso } from "../utils.ts";
import type { Database } from "./database.ts";

const UPSERT = `INSERT INTO runs(run_id, data, updated_at) VALUES(?, ?, ?)
  ON CONFLICT(run_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`;

export class RunsTable {
  static readonly SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  run_id     TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

  constructor(private readonly db: Database) {
    db.register(RunsTable.SCHEMA);
  }

  async upsert(runId: string, data: string): Promise<void> {
    const connection = await this.db.connection();
    connection.prepare(UPSERT).run(runId, data, nowIso());
  }

  async all(): Promise<string[]> {
    const connection = await this.db.connection();
    const rows = connection.prepare("SELECT data FROM runs").all();
    return rows.flatMap((row) => (typeof row.data === "string" ? [row.data] : []));
  }
}
