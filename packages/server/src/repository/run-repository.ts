import { mkdir, writeFile } from "node:fs/promises";
import nodepath from "node:path";
import type { RunEvent } from "@isotopy/core";
import { ActiveRunsTable } from "../db/active-runs-table.ts";
import type { Database } from "../db/database.ts";
import { EventsTable } from "../db/events-table.ts";
import { JsonRecordsTable, RUNS_TABLE } from "../db/json-records-table.ts";
import {
  parsePersistedRun,
  parsePersistedRunEvent,
} from "../schemas/run-persistence.ts";
import type { PersistedRun } from "../schemas/run-persistence.ts";
import { formatValidationIssues } from "../domain/validation.ts";
import { runsDir } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import { nowIso } from "../utils/time.ts";

export type { PersistedRun } from "../schemas/run-persistence.ts";

export class RunRepository {
  private readonly runs: JsonRecordsTable;
  private readonly events: EventsTable;
  private readonly active: ActiveRunsTable;
  private readonly handoffs = new Set<Promise<void>>();

  constructor(
    private readonly path: ProjectPath,
    private readonly db: Database,
  ) {
    this.runs = new JsonRecordsTable(this.db, RUNS_TABLE);
    this.events = new EventsTable(this.db);
    this.active = new ActiveRunsTable(this.db);
  }

  async writeState(runId: string, persisted: PersistedRun): Promise<void> {
    await this.runs.upsert(runId, JSON.stringify(persisted));
  }

  async appendEvent(runId: string, event: RunEvent): Promise<void> {
    await this.events.append(runId, JSON.stringify(event));
  }

  async loadEvents(runId: string): Promise<RunEvent[]> {
    const rows = await this.events.allForRun(runId);
    return rows.flatMap((data) => {
      const parsed = parsePersistedRunEvent(data);
      if (parsed.ok) {
        return [parsed.value];
      }
      console.warn(
        `Skipping malformed event row for run ${runId}: ${formatValidationIssues(parsed.issues)}`,
      );
      return [];
    });
  }

  async admitRun(runId: string): Promise<boolean> {
    return this.active.claim(this.path.id, runId, nowIso());
  }

  async releaseRun(runId: string): Promise<void> {
    await this.active.release(this.path.id, runId);
  }

  writeHandoff(runId: string, stageId: string, content: string): Promise<void> {
    const op = persistHandoff(this.path, runId, stageId, content);
    this.handoffs.add(op);
    void op.finally(() => this.handoffs.delete(op));
    return op;
  }

  async loadAll(): Promise<PersistedRun[]> {
    let rows: string[];
    try {
      rows = await this.runs.all();
    } catch (error) {
      console.warn(`Failed to read runs from ${this.db.describe()}:`, error);
      return [];
    }
    return rows.flatMap((data) => this.parseRunData(data));
  }

  private parseRunData(data: string): PersistedRun[] {
    const parsed = parsePersistedRun(data);
    if (parsed.ok) {
      return [parsed.value];
    }
    console.warn(
      `Skipping malformed run row in the run database: ${formatValidationIssues(parsed.issues)}`,
    );
    return [];
  }

  async settle(): Promise<void> {
    await Promise.allSettled([...this.handoffs]);
  }
}

async function persistHandoff(
  path: ProjectPath,
  runId: string,
  stageId: string,
  content: string,
): Promise<void> {
  try {
    const dir = nodepath.join(runsDir(path), runId, stageId);
    await mkdir(dir, { recursive: true });
    await writeFile(nodepath.join(dir, "handoff.md"), content);
  } catch (error) {
    console.warn(`Failed to write handoff for run ${runId}/${stageId}:`, error);
  }
}
