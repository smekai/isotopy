import { ENGINES } from "@isotopy/core";
import type { EngineId } from "@isotopy/core";

const UNKNOWN_ENGINE_LABEL = "unknown";

export function engineLabel(engine: EngineId | undefined): string {
  return engine ? ENGINES[engine].label : UNKNOWN_ENGINE_LABEL;
}

export function engineWithModel(engine: EngineId | undefined, model: string | undefined): string {
  return model ? `${engineLabel(engine)} · ${model}` : engineLabel(engine);
}
