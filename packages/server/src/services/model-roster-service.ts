import { mergeModelLayers, staticModelsFor } from "@isotopy/core";
import type { EngineId, EngineModelRoster } from "@isotopy/core";
import { findEngineAdapter } from "../engines/registry.ts";
import type { EngineAdapter, LiveModelLayer } from "../engines/types.ts";
import type { Logger } from "../utils/logger.ts";
import { messageOf } from "../utils/message-of.ts";

export class ModelRosterService {
  private readonly cached = new Map<EngineId, Promise<EngineModelRoster>>();

  constructor(private readonly logger: Logger) {}

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
      configured: this.configuredModel(engineId, adapter),
      bundled: staticModelsFor(engineId),
      note: live.note,
    });
  }

  private configuredModel(engineId: EngineId, adapter: EngineAdapter | undefined) {
    try {
      return adapter?.configuredModel();
    } catch (error) {
      this.logger.warn(`Could not read the configured ${engineId} model`, { error });
      return undefined;
    }
  }
}

async function liveModels(adapter: EngineAdapter | undefined): Promise<LiveModelLayer> {
  try {
    return (await adapter?.liveModels()) ?? { options: [] };
  } catch (error) {
    const reason = messageOf(error);
    return { options: [], note: `Model lookup failed (${reason}).` };
  }
}

