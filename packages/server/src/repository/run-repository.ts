import type { EnginePermissionMode, RunEvent, RunState } from "@adhd/core";
import { ActiveRunsTable } from "../db/active-runs-table.ts";
import { Database } from "../db/database.ts";
import { EventsTable } from "../db/events-table.ts";
import { RunsTable } from "../db/runs-table.ts";
import type { ProjectPaths } from "../paths.ts";
import { nowIso } from "../utils.ts";
import { persistHandoff } from "./handoff.ts";

export interface PersistedSimOptions {
  minDurationMs: number;
  maxDurationMs: number;
  failProbability: number;
}

export interface PersistedRun {
  version: 1;
  run: RunState;
  permissionMode?: EnginePermissionMode;
  simOptions?: PersistedSimOptions;
  /** The OpenWorkflow run id backing this logical run (for signals/cancel). */
  owRunId?: string;
}

export function isPersistedRun(value: unknown): value is PersistedRun {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PersistedRun).run === "object" &&
    (value as PersistedRun).run !== null &&
    typeof (value as PersistedRun).run.id === "string"
  );
}

export function parsePersistedRun(text: string): PersistedRun | undefined {
  try {
    const value = JSON.parse(text);
    return isPersistedRun(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export class RunRepository {
  private readonly db: Database;
  private readonly runs: RunsTable;
  private readonly events: EventsTable;
  private readonly active: ActiveRunsTable;
  private readonly handoffs = new Set<Promise<void>>();

  constructor(private readonly paths: ProjectPaths) {
    this.db = new Database(
      paths,
      `${RunsTable.SCHEMA}\n${EventsTable.SCHEMA}\n${ActiveRunsTable.SCHEMA}`,
    );
    this.runs = new RunsTable(this.db);
    this.events = new EventsTable(this.db);
    this.active = new ActiveRunsTable(this.db);
  }

  async writeState(runId: string, persisted: PersistedRun): Promise<void> {
    try {
      await this.runs.upsert(runId, JSON.stringify(persisted));
    } catch (error) {
      console.warn(`Failed to persist run ${runId}:`, error);
    }
  }

  async appendEvent(runId: string, event: RunEvent): Promise<void> {
    try {
      await this.events.append(runId, JSON.stringify(event));
    } catch (error) {
      console.warn(`Failed to persist event for run ${runId}:`, error);
    }
  }

  async loadEvents(runId: string): Promise<RunEvent[]> {
    let rows: string[];
    try {
      rows = await this.events.allForRun(runId);
    } catch (error) {
      console.warn(`Failed to read events for run ${runId}:`, error);
      return [];
    }
    return rows.flatMap((data) => {
      try {
        return [JSON.parse(data) as RunEvent];
      } catch {
        return [];
      }
    });
  }

  /** Admission (G2): claim the project for a run; false if one is active. */
  async admitRun(runId: string): Promise<boolean> {
    try {
      return await this.active.claim(this.paths.id, runId, nowIso());
    } catch (error) {
      console.warn(`Failed to claim admission for run ${runId}:`, error);
      return true;
    }
  }

  async releaseRun(runId: string): Promise<void> {
    try {
      await this.active.release(this.paths.id, runId);
    } catch (error) {
      console.warn(`Failed to release admission for run ${runId}:`, error);
    }
  }

  async activeRunId(): Promise<string | undefined> {
    try {
      return await this.active.current(this.paths.id);
    } catch {
      return undefined;
    }
  }

  writeHandoff(runId: string, stageId: string, content: string): Promise<void> {
    const op = persistHandoff(this.paths, runId, stageId, content);
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
    const run = parsePersistedRun(data);
    if (run) {
      return [run];
    }
    console.warn("Skipping malformed run row in the run database");
    return [];
  }

  async settle(): Promise<void> {
    await Promise.allSettled([...this.handoffs]);
    await this.db.settle();
  }
}
