// File-backed persistence for runs. One directory per run under .adhd/runs/<id>/
// (alongside the engine workspace/): state.json is the atomically-rewritten
// snapshot; events.jsonl is the append-only event trail. The orchestrator is
// the only writer — this module just owns the disk layout and I/O idioms.
import { appendFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EnginePermissionMode, RunEvent, RunState } from "@adhd/core";
import { REPO_ROOT } from "../paths.js";

const RUNS_DIR = path.join(REPO_ROOT, ".adhd", "runs");

/** Simulation timings needed to restart a mock run after a reload. */
export interface PersistedSimOptions {
  minDurationMs: number;
  maxDurationMs: number;
  failProbability: number;
}

/**
 * Envelope written to state.json. Wraps the RunState with the bits the
 * orchestrator keeps outside it (permission mode, sim timings) so a reloaded
 * run can be restarted exactly as it was launched.
 */
export interface PersistedRun {
  version: 1;
  run: RunState;
  permissionMode?: EnginePermissionMode;
  simOptions?: PersistedSimOptions;
}

function runDir(runId: string): string {
  return path.join(RUNS_DIR, runId);
}

async function writeStateFile(runId: string, persisted: PersistedRun): Promise<void> {
  const dir = runDir(runId);
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, "state.json");
  const tmp = `${target}.tmp`;
  await writeFile(tmp, `${JSON.stringify(persisted, null, 2)}\n`);
  await rename(tmp, target);
}

// Serialize writes per run so two rapid transitions can't clash on the shared
// tmp file (Windows rename in particular is unforgiving about concurrency).
const stateQueues = new Map<string, Promise<void>>();

/** Atomically write state.json (tmp + rename), mirroring settings.ts. */
export function writeState(runId: string, persisted: PersistedRun): Promise<void> {
  const prior = stateQueues.get(runId) ?? Promise.resolve();
  const next = prior.then(() => writeStateFile(runId, persisted));
  // Keep the tail chained even if this write rejects, but surface the error to
  // the caller of this specific write.
  stateQueues.set(
    runId,
    next.catch(() => undefined),
  );
  return next;
}

// Append is fire-and-forget from emit(); serialize per run so concurrent calls
// can't interleave lines, and never reject back to the caller.
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

function isPersistedRun(value: unknown): value is PersistedRun {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PersistedRun).run === "object" &&
    (value as PersistedRun).run !== null &&
    typeof (value as PersistedRun).run.id === "string"
  );
}

/**
 * Load every persisted run from .adhd/runs/. Directories without a state.json
 * (e.g. a bare workspace/) and corrupt files are skipped with a warning, so a
 * single bad run can't stop the server from booting.
 */
export async function loadAllRuns(): Promise<PersistedRun[]> {
  let entries: string[];
  try {
    entries = await readdir(RUNS_DIR);
  } catch {
    return []; // no runs dir yet — nothing to restore
  }

  const loaded: PersistedRun[] = [];
  for (const name of entries) {
    const statePath = path.join(RUNS_DIR, name, "state.json");
    let raw: string;
    try {
      raw = await readFile(statePath, "utf8");
    } catch {
      continue; // no state.json in this dir — skip silently
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
