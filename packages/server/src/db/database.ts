import path from "node:path";
import type { DatabaseSync as SqliteConnection } from "node:sqlite";
import { ensureProjectDataDir } from "../paths.ts";
import type { ProjectPaths } from "../paths.ts";

const BUSY_TIMEOUT_MS = 5000;

export class Database {
  private ready?: Promise<SqliteConnection>;
  private readonly schemas: string[] = [];

  constructor(private readonly paths: ProjectPaths) {}

  register(schema: string): void {
    this.schemas.push(schema);
  }

  describe(): string {
    return path.join(this.paths.dataDir, "runs.db");
  }

  connection(): Promise<SqliteConnection> {
    if (!this.ready) {
      const opening = this.open();
      this.ready = opening;
      void opening.catch(() => {
        if (this.ready === opening) {
          delete this.ready;
        }
      });
    }
    return this.ready;
  }

  private async open(): Promise<SqliteConnection> {
    await ensureProjectDataDir(this.paths);
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(this.describe());
    db.exec("PRAGMA journal_mode=WAL");
    db.exec(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS}`);
    for (const schema of this.schemas) {
      db.exec(schema);
    }
    return db;
  }

  async settle(): Promise<void> {
    if (!this.ready) {
      return;
    }
    const pending = this.ready;
    delete this.ready;
    try {
      const db = await pending;
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      db.close();
    } catch (error) {
      console.warn(`Failed to close run database at ${this.describe()}:`, error);
    }
  }
}
