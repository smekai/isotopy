import type { DatabaseSync as SqliteConnection } from "node:sqlite";

export const SQLITE_UTC_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

interface LegacyTimestampMigration {
  table: string;
  temporaryTable: string;
  createTable: string;
  copyRows: string;
}

function columnNames(
  connection: SqliteConnection,
  table: string,
): Set<string> {
  const rows = connection.prepare(`PRAGMA table_info(${table})`).all();
  return new Set(
    rows.flatMap((row) =>
      typeof row.name === "string" ? [row.name] : [],
    ),
  );
}

export function migrateLegacyTimestampTable(
  connection: SqliteConnection,
  migration: LegacyTimestampMigration,
): void {
  const columns = columnNames(connection, migration.table);
  if (columns.has("created_at")) {
    return;
  }
  if (!columns.has("updated_at")) {
    throw new Error(
      `Cannot migrate ${migration.table}: updated_at is missing`,
    );
  }

  connection.exec("BEGIN IMMEDIATE");
  try {
    connection.exec(
      `ALTER TABLE ${migration.table} RENAME TO ${migration.temporaryTable}`,
    );
    connection.exec(migration.createTable);
    connection.exec(migration.copyRows);
    connection.exec(`DROP TABLE ${migration.temporaryTable}`);
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}
