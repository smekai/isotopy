import { readFileSync } from "node:fs";
import type { ModelOptionDraft } from "@isotopy/core";
import type { LiveModelLayer } from "./types.ts";

export const NO_LIVE_LISTING: LiveModelLayer = {
  options: [],
  note: "This CLI cannot list its own models.",
};

export function configuredModelFrom(
  configPath: string,
  readModelId: (text: string) => string | undefined,
  hint: string,
): ModelOptionDraft | undefined {
  let text: string;
  try {
    text = readFileSync(configPath, "utf8");
  } catch {
    return undefined;
  }
  const id = readModelId(text);
  return id === undefined ? undefined : { id, label: id, hint };
}
