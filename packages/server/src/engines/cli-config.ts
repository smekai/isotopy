import { readFileSync } from "node:fs";
import type { ModelOptionDraft } from "@adhd/core";

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
