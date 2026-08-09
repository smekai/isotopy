import { ENGINES } from "@adhd/core";
import type { EngineId } from "@adhd/core";

export function unknownModelMessage(engineId: EngineId, modelId: string): string {
  return (
    `Model "${modelId}" isn't offered by ${ENGINES[engineId].label} on this machine — ` +
    "pick one in Setup → AI Harness. An unlisted id has to be set in the CLI's own config file first."
  );
}
