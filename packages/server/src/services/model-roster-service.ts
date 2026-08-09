import { staticModelsFor } from "@adhd/core";
import type { EngineId, EngineModelRoster, ModelOptionDraft } from "@adhd/core";
import { mergeModelLayers } from "../domain/rules/model-roster.ts";
import { findEngineAdapter } from "../engines/registry.ts";
import type { EngineAdapter } from "../engines/types.ts";

const NO_LIVE_LIST = "This CLI cannot list its own models.";

export class ModelRosterService {
  private readonly cached = new Map<EngineId, EngineModelRoster>();

  async roster(engineId: EngineId): Promise<EngineModelRoster> {
    return this.cached.get(engineId) ?? (await this.refresh(engineId));
  }

  async refresh(engineId: EngineId): Promise<EngineModelRoster> {
    const adapter = findEngineAdapter(engineId);
    const live = await liveModels(adapter);
    const bundled = staticModelsFor(engineId);
    const roster = mergeModelLayers({
      engine: engineId,
      live: live.options,
      configured: configuredModel(adapter),
      bundled,
      ...(live.note === undefined ? {} : { note: live.note }),
    });
    this.cached.set(engineId, roster);
    return roster;
  }

  invalidate(engineId: EngineId): void {
    this.cached.delete(engineId);
  }
}

interface LiveModels {
  options: ModelOptionDraft[];
  note?: string;
}

async function liveModels(adapter: EngineAdapter | undefined): Promise<LiveModels> {
  if (!adapter?.liveModels) {
    return { options: [], note: NO_LIVE_LIST };
  }
  try {
    const options = await adapter.liveModels();
    return options.length > 0 ? { options } : { options, note: "The CLI listed no models." };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { options: [], note: `Model lookup failed (${reason}).` };
  }
}

function configuredModel(adapter: EngineAdapter | undefined): ModelOptionDraft | undefined {
  try {
    return adapter?.configuredModel?.();
  } catch {
    return undefined;
  }
}
