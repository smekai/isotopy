import { mergeModelLayers, staticModelsFor } from "@adhd/core";
import type { EngineId, EngineModelRoster } from "@adhd/core";
import { findEngineAdapter } from "../engines/registry.ts";
import type { EngineAdapter, LiveModelLayer } from "../engines/types.ts";

export class ModelRosterService {
  private readonly cached = new Map<EngineId, Promise<EngineModelRoster>>();

  roster(engineId: EngineId): Promise<EngineModelRoster> {
    return this.cached.get(engineId) ?? this.refresh(engineId);
  }

  refresh(engineId: EngineId): Promise<EngineModelRoster> {
    const pending = this.resolveRoster(engineId).catch((error: unknown) => {
      this.cached.delete(engineId);
      throw error;
    });
    this.cached.set(engineId, pending);
    return pending;
  }

  invalidate(engineId: EngineId): void {
    this.cached.delete(engineId);
  }

  private async resolveRoster(engineId: EngineId): Promise<EngineModelRoster> {
    const adapter = findEngineAdapter(engineId);
    const live = await liveModels(adapter);
    return mergeModelLayers({
      live: live.options,
      configured: configuredModel(adapter),
      bundled: staticModelsFor(engineId),
      note: live.note,
    });
  }
}

async function liveModels(adapter: EngineAdapter | undefined): Promise<LiveModelLayer> {
  try {
    return (await adapter?.liveModels()) ?? { options: [] };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { options: [], note: `Model lookup failed (${reason}).` };
  }
}

function configuredModel(adapter: EngineAdapter | undefined) {
  try {
    return adapter?.configuredModel();
  } catch {
    return undefined;
  }
}
