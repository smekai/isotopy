import type { ZodType } from "zod";

import type { Database } from "../db/database.ts";
import { JsonRecordsTable } from "../db/json-records-table.ts";
import type { JsonTableSpec } from "../db/json-records-table.ts";
import { parsePersistedRecord } from "../schemas/persisted-record.ts";

export class JsonRecordRepository<T extends { id: string }> {
  private readonly table: JsonRecordsTable;

  constructor(
    db: Database,
    spec: JsonTableSpec,
    private readonly schema: ZodType<T>,
    private readonly label: string,
  ) {
    this.table = new JsonRecordsTable(db, spec);
  }

  async write(record: T): Promise<void> {
    await this.table.upsert(record.id, JSON.stringify(record));
  }

  async loadAll(): Promise<T[]> {
    const rows = await this.table.all();
    return rows.flatMap((data) => {
      const record = parsePersistedRecord(this.schema, data);
      if (record) {
        return [record];
      }
      console.warn(`Skipping malformed ${this.label} row in the project database`);
      return [];
    });
  }

  async remove(id: string): Promise<void> {
    await this.table.remove(id);
  }
}
