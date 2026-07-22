import { appendFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EnginePermissionMode, RunEvent, RunState } from "@adhd/core";
import { runsDir } from "../paths.js";

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

function runDir(runId: string): string {
  return path.join(runsDir(), runId);
}

async function writeStateFile(runId: string, persisted: PersistedRun): Promise<void> {
  const dir = runDir(runId);
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, "state.json");
  const tmp = `${target}.tmp`;
  await writeFile(tmp, `${JSON.stringify(persisted, null, 2)}\n`);
  await rename(tmp, target);
}

const stateQueues = new Map<string, Promise<void>>();

export function writeState(runId: string, persisted: PersistedRun): Promise<void> {
  const prior = stateQueues.get(runId) ?? Promise.resolve();
  const next = prior.then(() => writeStateFile(runId, persisted));
  stateQueues.set(
    runId,
    next.catch(() => undefined),
  );
  return next;
}

const appendQueues = new Map<string, Promise<void>>();

async function writeEventLine(runId: string, event: RunEvent): Promise<void> {
  const dir = runDir(runId);
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

export function appendEvent(runId: string, event: RunEvent): Promise<void> {
  const prior = appendQueues.get(runId) ?? Promise.resolve();
  const next = prior.then(() => writeEventLine(runId, event)).catch((error) => {
    console.warn(`Failed to persist event for run ${runId}:`, error);
  });
  appendQueues.set(runId, next);
  return next;
}

export function writeHandoff(
  runId: string,
  stageId: string,
  content: string,
): Promise<void> {
  return track(
    (async () => {
      try {
        const dir = path.join(runDir(runId), stageId);
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, "handoff.md"), content);
      } catch (error) {
        console.warn(`Failed to write handoff for run ${runId}/${stageId}:`, error);
      }
    })(),
  );
}

const inFlight = new Set<Promise<unknown>>();

function track<T>(operation: Promise<T>): Promise<T> {
  inFlight.add(operation);
  void operation.catch(() => undefined).finally(() => inFlight.delete(operation));
  return operation;
}

export async function settleWrites(): Promise<void> {
  const pending = [...stateQueues.values(), ...appendQueues.values(), ...inFlight];
  await Promise.allSettled(pending);
  const stillPending = [...stateQueues.values(), ...appendQueues.values(), ...inFlight];
  await Promise.allSettled(stillPending);
}

function isPersistedRun(value: unknown): value is PersistedRun {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PersistedRun).run === "object" &&
    (value as PersistedRun).run !== null &&
    typeof (value as PersistedRun).run.id === "string"
  );
}

export async function loadAllRuns(): Promise<PersistedRun[]> {
  const dir = runsDir();
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
