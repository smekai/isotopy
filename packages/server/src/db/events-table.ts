import type { Database } from "./database.ts";

export class EventsTable {
  static readonly SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  seq    INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  data   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_run_idx ON events(run_id);`;

  constructor(private readonly db: Database) {}

  async append(runId: string, data: string): Promise<void> {
    const connection = await this.db.connection();
    connection.prepare("INSERT INTO events(run_id, data) VALUES(?, ?)").run(runId, data);
  }
}
