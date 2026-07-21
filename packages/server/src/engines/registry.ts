import { ENGINES } from "@adhd/core";
import type { EngineId } from "@adhd/core";
import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import { cursorAdapter } from "./cursor.js";
import type { EngineAdapter } from "./types.js";

/** The shipped adapters — the set `resetEngineAdapters()` restores. */
const BUILT_IN: [EngineId, EngineAdapter][] = [
  [claudeCodeAdapter.id, claudeCodeAdapter],
  [cursorAdapter.id, cursorAdapter],
  [codexAdapter.id, codexAdapter],
];

const adapters = new Map<EngineId, EngineAdapter>(BUILT_IN);

/**
 * Substitute the adapter for an engine. This is the seam component tests use to
 * run the whole pipeline without spawning a CLI — see docs/testing.md. Always
 * pair with `resetEngineAdapters()` so one test can't leak into the next.
 */
export function setEngineAdapter(id: EngineId, adapter: EngineAdapter): void {
  adapters.set(id, adapter);
}

/** Restore the shipped adapters, discarding any substitutions. */
export function resetEngineAdapters(): void {
  adapters.clear();
  for (const [id, adapter] of BUILT_IN) {
    adapters.set(id, adapter);
  }
}

export function assertEngineId(id: string): asserts id is EngineId {
  if (!(id in ENGINES)) {
    throw new Error(`Unknown engine: ${id}`);
  }
}

/** Like getEngineAdapter, but returns undefined for engines without an implementation. */
export function findEngineAdapter(id: EngineId): EngineAdapter | undefined {
  return adapters.get(id);
}

export function getEngineAdapter(id: string): EngineAdapter {
  assertEngineId(id);
  const adapter = adapters.get(id);
  if (!adapter) {
    throw new Error(`Engine "${ENGINES[id].label}" is not implemented yet`);
  }
  return adapter;
}
