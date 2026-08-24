import type { DatabaseSync as SqliteConnection } from "node:sqlite";
import type { Database } from "./database.ts";

const SQLITE_UTC_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export interface JsonTableSpec {
  table: string;
  idColumn: string;
  migrateLegacyTimestamps: boolean;
}

export const RUNS_TABLE: JsonTableSpec = {
  table: "runs",
  idColumn: "run_id",
  migrateLegacyTimestamps: true,
};

export const MILESTONES_TABLE: JsonTableSpec = {
  table: "milestones",
  idColumn: "milestone_id",
  migrateLegacyTimestamps: true,
};

export const ORCHESTRATIONS_TABLE: JsonTableSpec = {
  table: "orchestrations",
  idColumn: "orchestration_id",
  migrateLegacyTimestamps: false,
};

export const SCHEDULES_TABLE: JsonTableSpec = {
  table: "schedules",
  idColumn: "schedule_id",
  migrateLegacyTimestamps: false,
};

function createTable({ table, idColumn }: JsonTableSpec): string {
  return `
CREATE TABLE IF NOT EXISTS ${table} (
  ${idColumn} TEXT PRIMARY KEY,
  data        TEXT NOT NULL CHECK (json_valid(data)),
  created_at  TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW}),
  updated_at  TEXT NOT NULL DEFAULT (${SQLITE_UTC_NOW})
);`;
}

function schemaFor(spec: JsonTableSpec): string {
  const { table, idColumn } = spec;
  return `${createTable(spec)}
CREATE TRIGGER IF NOT EXISTS ${table}_set_updated_at
AFTER UPDATE ON ${table}
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE ${table}
  SET updated_at = ${SQLITE_UTC_NOW}
  WHERE ${idColumn} = NEW.${idColumn};
END;`;
}

function columnNames(connection: SqliteConnection, table: string): Set<string> {
  const rows = connection.prepare(`PRAGMA table_info(${table})`).all();
  return new Set(
    rows.flatMap((row) => (typeof row.name === "string" ? [row.name] : [])),
  );
}

function countRows(connection: SqliteConnection, sql: string): number {
  const row = connection.prepare(sql).get();
  const value = row?.rows;
  return typeof value === "number" ? value : Number(value ?? 0);
}

function migrateLegacyTimestamps(
  connection: SqliteConnection,
  spec: JsonTableSpec,
): void {
  const { table, idColumn } = spec;
  const columns = columnNames(connection, table);
  if (columns.has("created_at")) {
    return;
  }
  if (!columns.has("updated_at")) {
    throw new Error(`Cannot migrate ${table}: updated_at is missing`);
  }

  const temporaryTable = `${table}_before_timestamp_migration`;
  connection.exec("BEGIN IMMEDIATE");
  try {
    connection.exec(`ALTER TABLE ${table} RENAME TO ${temporaryTable}`);
    connection.exec(createTable(spec));
    connection.exec(`
INSERT INTO ${table}(${idColumn}, data, created_at, updated_at)
SELECT ${idColumn}, data, updated_at, updated_at
FROM ${temporaryTable}
WHERE json_valid(data)`);
    const abandoned = countRows(
      connection,
      `SELECT COUNT(*) AS rows FROM ${temporaryTable} WHERE NOT json_valid(data)`,
    );
    if (abandoned > 0) {
      console.warn(
        `Dropped ${abandoned} malformed ${table} row(s) during timestamp migration; they could not be read before it either`,
      );
    }
    connection.exec(`DROP TABLE ${temporaryTable}`);
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}

export class JsonRecordsTable {
  private readonly upsertStatement: string;

  constructor(
    private readonly db: Database,
    private readonly spec: JsonTableSpec,
  ) {
    const { table, idColumn } = spec;
    this.upsertStatement = `INSERT INTO ${table}(${idColumn}, data) VALUES(?, ?)
  ON CONFLICT(${idColumn}) DO UPDATE SET data = excluded.data`;
    db.register(
      schemaFor(spec),
      spec.migrateLegacyTimestamps
        ? (connection) => {
            migrateLegacyTimestamps(connection, spec);
          }
        : undefined,
    );
  }

  async upsert(id: string, data: string): Promise<void> {
    const connection = await this.db.connection();
    connection.prepare(this.upsertStatement).run(id, data);
  }

  async all(): Promise<string[]> {
    const connection = await this.db.connection();
    const rows = connection
      .prepare(`SELECT data FROM ${this.spec.table}`)
      .all();
    return rows.flatMap((row) => (typeof row.data === "string" ? [row.data] : []));
  }

  async remove(id: string): Promise<void> {
    const { table, idColumn } = this.spec;
    const connection = await this.db.connection();
    connection.prepare(`DELETE FROM ${table} WHERE ${idColumn} = ?`).run(id);
  }
}
