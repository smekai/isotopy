import type { PackRecord } from "../domain/rules/pack-plan.ts";
import type { ValidationResult } from "../domain/validation.ts";
import { packsFile } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import { parsePackRecords } from "../schemas/pack-record.ts";
import { readOptionalText, writeTextFile } from "../utils/text-file.ts";

export async function readPackRecords(
  projectPath: ProjectPath,
): Promise<ValidationResult<PackRecord[]>> {
  const text = await readOptionalText(packsFile(projectPath));
  if (text === undefined) {
    return { ok: true, value: [] };
  }
  const parsed = parsePackRecords(text);
  return parsed.ok ? { ok: true, value: parsed.value.packs } : parsed;
}

export async function writePackRecords(
  projectPath: ProjectPath,
  packs: PackRecord[],
): Promise<void> {
  await writeTextFile(packsFile(projectPath), JSON.stringify({ version: 1, packs }, null, 2));
}
