import { ENGINES } from "@adhd/core";
import type { EngineId } from "@adhd/core";
import { claudeCodeAdapter } from "./claude-code.js";
import { cursorAdapter } from "./cursor.js";
import type { EngineAdapter } from "./types.js";

const adapters = new Map<EngineId, EngineAdapter>([
  [claudeCodeAdapter.id, claudeCodeAdapter],
  [cursorAdapter.id, cursorAdapter],
]);

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
