import { nowIso } from "../utils.ts";
import type { Database } from "./database.ts";

const UPSERT = `INSERT INTO milestones(milestone_id, data, updated_at) VALUES(?, ?, ?)
  ON CONFLICT(milestone_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`;

export class MilestonesTable {
  static readonly SCHEMA = `
CREATE TABLE IF NOT EXISTS milestones (
  milestone_id TEXT PRIMARY KEY,
  data         TEXT NOT NULL CHECK (json_valid(data)),
  updated_at   TEXT NOT NULL
);`;

  constructor(private readonly db: Database) {
    db.register(MilestonesTable.SCHEMA);
  }

  async upsert(milestoneId: string, data: string): Promise<void> {
    const connection = await this.db.connection();
    connection.prepare(UPSERT).run(milestoneId, data, nowIso());
  }

  async all(): Promise<string[]> {
    const connection = await this.db.connection();
    const rows = connection.prepare("SELECT data FROM milestones").all();
    return rows.flatMap((row) =>
      typeof row.data === "string" ? [row.data] : [],
    );
  }
}
