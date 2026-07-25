import type { Database } from "./database.ts";

const CLAIM = `INSERT INTO active_runs(project_id, run_id, started_at) VALUES(?, ?, ?)
  ON CONFLICT(project_id) DO NOTHING`;

export class ActiveRunsTable {
  static readonly SCHEMA = `
CREATE TABLE IF NOT EXISTS active_runs (
  project_id TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL,
  started_at TEXT NOT NULL
);`;

  constructor(private readonly db: Database) {
    db.register(ActiveRunsTable.SCHEMA);
  }

  async claim(projectId: string, runId: string, startedAt: string): Promise<boolean> {
    const connection = await this.db.connection();
    const result = connection.prepare(CLAIM).run(projectId, runId, startedAt);
    return Number(result.changes) > 0;
  }

  async release(projectId: string, runId: string): Promise<void> {
    const connection = await this.db.connection();
    connection
      .prepare("DELETE FROM active_runs WHERE project_id = ? AND run_id = ?")
      .run(projectId, runId);
  }

  async current(projectId: string): Promise<string | undefined> {
    const connection = await this.db.connection();
    const row = connection
      .prepare("SELECT run_id FROM active_runs WHERE project_id = ?")
      .get(projectId);
    return row && typeof row.run_id === "string" ? row.run_id : undefined;
  }
}
