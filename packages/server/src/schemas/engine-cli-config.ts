import { z } from "zod";
import type { ModelOptionDraft } from "@adhd/core";
import { parseJson } from "../domain/validation.ts";

const CURSOR_ROUTED_MODEL_ID = "default";

const modelId = z.string().trim().min(1);

const claudeSettingsSchema = z.object({ model: modelId.optional() });

const cursorCliConfigSchema = z.object({
  model: z
    .union([
      modelId,
      z.object({ modelId: modelId.optional(), displayModelId: modelId.optional() }),
    ])
    .optional(),
});

export function claudeSettingsModel(text: string): string | undefined {
  const parsed = parseJson(claudeSettingsSchema, text);
  return parsed.ok ? parsed.value.model : undefined;
}

export function cursorCliConfigModel(text: string): string | undefined {
  const parsed = parseJson(cursorCliConfigSchema, text);
  if (!parsed.ok || parsed.value.model === undefined) {
    return undefined;
  }
  const { model } = parsed.value;
  const id = typeof model === "string" ? model : model.displayModelId ?? model.modelId;
  return id === CURSOR_ROUTED_MODEL_ID ? undefined : id;
}

export function codexConfigModel(text: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) {
      return undefined;
    }
    const match = /^model\s*=\s*["']([^"']+)["']/.exec(trimmed);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

export function parseCursorModels(stdout: string): ModelOptionDraft[] {
  const options: ModelOptionDraft[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s*([\w.:-]+)\s+-\s+(.+?)\s*$/.exec(line);
    if (!match) {
      continue;
    }
    const [, id, label] = match;
    if (id === undefined || label === undefined) {
      continue;
    }
    const current = /\(current[^)]*\)/i.test(label);
    const clean = label.replace(/\s*\(current[^)]*\)\s*/i, "").trim() || id;
    options.push({
      id,
      label: id === "auto" ? `Cursor ${clean}` : clean,
      hint: current ? "the CLI's current default" : "",
    });
  }
  return options;
}
