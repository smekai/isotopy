import { AUTO_MODEL_OPTION, ENGINES } from "@adhd/core";
import type {
  EngineId,
  EngineModelOption,
  EngineModelOrigin,
  EngineModelRoster,
  ModelOptionDraft,
  StaticModelRoster,
} from "@adhd/core";

export interface ModelLayers {
  engine: EngineId;
  live: ModelOptionDraft[];
  configured?: ModelOptionDraft;
  bundled: StaticModelRoster;
  note?: string;
}

export function mergeModelLayers(layers: ModelLayers): EngineModelRoster {
  const options: EngineModelOption[] = [AUTO_MODEL_OPTION];
  const taken = new Set([AUTO_MODEL_OPTION.id]);
  for (const [origin, drafts] of layeredDrafts(layers)) {
    for (const draft of drafts) {
      if (taken.has(draft.id)) {
        continue;
      }
      taken.add(draft.id);
      options.push({ ...draft, origin });
    }
  }
  return {
    engine: layers.engine,
    options,
    staticCheckedOn: layers.bundled.checkedOn,
    ...(layers.note === undefined ? {} : { note: layers.note }),
  };
}

export function unknownModelMessage(engineId: EngineId, modelId: string): string {
  return (
    `Model "${modelId}" isn't offered by ${ENGINES[engineId].label} on this machine — ` +
    "pick one in Setup → AI Harness. An unlisted id has to be set in the CLI's own config file first."
  );
}

function layeredDrafts(layers: ModelLayers): [EngineModelOrigin, ModelOptionDraft[]][] {
  return [
    ["live", layers.live],
    ["config", layers.configured === undefined ? [] : [layers.configured]],
    ["static", layers.bundled.options],
  ];
}
