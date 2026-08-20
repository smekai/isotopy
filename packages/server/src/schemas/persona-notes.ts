import { personaNotesSchema } from "@isotopy/core";
import type { PersonaNotes } from "@isotopy/core";
import { parseJson } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

const NOTES_BLOCK = /```isotopy-persona-notes\s*([\s\S]*?)```/i;

export function extractPersonaNotes(
  output: string,
): ValidationResult<PersonaNotes> | undefined {
  const block = NOTES_BLOCK.exec(output)?.[1];
  return block === undefined ? undefined : parseJson(personaNotesSchema, block);
}
