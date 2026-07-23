import { appendFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EnginePermissionMode, RunEvent, RunState } from "@adhd/core";
import { runsDir } from "../paths.js";
import type { ProjectPaths } from "../paths.js";

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
}

export interface RunStore {
  writeState(runId: string, persisted: PersistedRun): Promise<void>;
  appendEvent(runId: string, event: RunEvent): Promise<void>;
  writeHandoff(runId: string, stageId: string, content: string): Promise<void>;
  loadAll(): Promise<PersistedRun[]>;
  settle(): Promise<void>;
}

export type RunStoreFactory = (paths: ProjectPaths) => RunStore;

function isPersistedRun(value: unknown): value is PersistedRun {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PersistedRun).run === "object" &&
    (value as PersistedRun).run !== null &&
    typeof (value as PersistedRun).run.id === "string"
  );
}

export class JsonRunStore implements RunStore {
  private readonly stateQueues = new Map<string, Promise<void>>();
  private readonly appendQueues = new Map<string, Promise<void>>();
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(private readonly paths: ProjectPaths) {}

  private runDir(runId: string): string {
    return path.join(runsDir(this.paths), runId);
  }

  private async writeStateFile(runId: string, persisted: PersistedRun): Promise<void> {
    const dir = this.runDir(runId);
    await mkdir(dir, { recursive: true });
    const target = path.join(dir, "state.json");
    const tmp = `${target}.tmp`;
    await writeFile(tmp, `${JSON.stringify(persisted, null, 2)}\n`);
    await rename(tmp, target);
  }

  writeState(runId: string, persisted: PersistedRun): Promise<void> {
    const prior = this.stateQueues.get(runId) ?? Promise.resolve();
    const next = prior.then(() => this.writeStateFile(runId, persisted));
    this.stateQueues.set(
      runId,
      next.catch(() => undefined),
    );
    return next;
  }

  private async writeEventLine(runId: string, event: RunEvent): Promise<void> {
    const dir = this.runDir(runId);
    const target = path.join(dir, "events.jsonl");
    const line = `${JSON.stringify(event)}\n`;
    try {
      await appendFile(target, line);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await mkdir(dir, { recursive: true });
        await appendFile(target, line);
      } else {
        throw error;
      }
    }
  }

  appendEvent(runId: string, event: RunEvent): Promise<void> {
    const prior = this.appendQueues.get(runId) ?? Promise.resolve();
    const next = prior.then(() => this.writeEventLine(runId, event)).catch((error) => {
      console.warn(`Failed to persist event for run ${runId}:`, error);
    });
    this.appendQueues.set(runId, next);
    return next;
  }

  writeHandoff(runId: string, stageId: string, content: string): Promise<void> {
    return this.track(
      (async () => {
        try {
          const dir = path.join(this.runDir(runId), stageId);
          await mkdir(dir, { recursive: true });
          await writeFile(path.join(dir, "handoff.md"), content);
        } catch (error) {
          console.warn(`Failed to write handoff for run ${runId}/${stageId}:`, error);
        }
      })(),
    );
  }

  private track<T>(operation: Promise<T>): Promise<T> {
    this.inFlight.add(operation);
    void operation.catch(() => undefined).finally(() => this.inFlight.delete(operation));
    return operation;
  }

  private pending(): Promise<unknown>[] {
    return [...this.stateQueues.values(), ...this.appendQueues.values(), ...this.inFlight];
  }

  async settle(): Promise<void> {
    await Promise.allSettled(this.pending());
    await Promise.allSettled(this.pending());
  }

  async loadAll(): Promise<PersistedRun[]> {
    const dir = runsDir(this.paths);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }

    const loaded: PersistedRun[] = [];
    for (const name of entries) {
      const statePath = path.join(dir, name, "state.json");
      let raw: string;
      try {
        raw = await readFile(statePath, "utf8");
      } catch {
        continue;
      }
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isPersistedRun(parsed)) {
          loaded.push(parsed);
        } else {
          console.warn(`Skipping malformed run state: ${statePath}`);
        }
      } catch {
        console.warn(`Skipping corrupt run state: ${statePath}`);
      }
    }
    return loaded;
  }
}

export const createJsonRunStore: RunStoreFactory = (paths) => new JsonRunStore(paths);
