import path from "node:path";
import type { DatabaseSync as SqliteConnection } from "node:sqlite";
import { ensureProjectDataDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";

const BUSY_TIMEOUT_MS = 5000;

type Migration = (connection: SqliteConnection) => void;

interface Registration {
  schema: string;
  migrate?: Migration;
}

export class Database {
  private ready?: Promise<SqliteConnection>;
  private readonly registrations: Registration[] = [];

  constructor(private readonly path: ProjectPath) {}

  register(schema: string, migrate?: Migration): void {
    this.registrations.push({ schema, migrate });
  }

  describe(): string {
    return path.join(this.path.dataDir, "runs.db");
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
    await ensureProjectDataDir(this.path);
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(this.describe());
    db.exec("PRAGMA journal_mode=WAL");
    db.exec(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS}`);
    for (const registration of this.registrations) {
      db.exec(registration.schema);
      registration.migrate?.(db);
      db.exec(registration.schema);
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
