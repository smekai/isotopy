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
  private applied = 0;

  constructor(private readonly path: ProjectPath) {}

  register(schema: string, migrate?: Migration): void {
    this.registrations.push({ schema, migrate });
  }

  describe(): string {
    return path.join(this.path.dataDir, "runs.db");
  }

  async connection(): Promise<SqliteConnection> {
    if (!this.ready) {
      const opening = this.open();
      this.ready = opening;
      void opening.catch(() => {
        if (this.ready === opening) {
          delete this.ready;
        }
      });
    }
    const db = await this.ready;
    this.applyPending(db);
    return db;
  }

  private async open(): Promise<SqliteConnection> {
    await ensureProjectDataDir(this.path);
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(this.describe());
    db.exec("PRAGMA journal_mode=WAL");
    db.exec(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS}`);
    this.applied = 0;
    return db;
  }

  private applyPending(db: SqliteConnection): void {
    while (this.applied < this.registrations.length) {
      const registration = this.registrations[this.applied];
      if (registration) {
        db.exec(registration.schema);
        registration.migrate?.(db);
        db.exec(registration.schema);
      }
      this.applied += 1;
    }
  }

  async settle(): Promise<void> {
    if (!this.ready) {
      return;
    }
    const pending = this.ready;
    delete this.ready;
    this.applied = 0;
    try {
      const db = await pending;
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      db.close();
    } catch (error) {
      console.warn(`Failed to close run database at ${this.describe()}:`, error);
    }
  }
}
