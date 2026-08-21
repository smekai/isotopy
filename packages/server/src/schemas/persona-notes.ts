import { personaNotesSchema } from "@isotopy/core";
import type { PersonaNotes } from "@isotopy/core";
import { parseJson } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

const NOTES_BLOCK = /```isotopy-persona-notes\s*([\s\S]*?)```\s*/i;

export interface ExtractedPersonaNotes {
  report: string;
  notes?: ValidationResult<PersonaNotes>;
}

export function extractPersonaNotes(output: string): ExtractedPersonaNotes {
  const match = NOTES_BLOCK.exec(output);
  if (match === null) {
    return { report: output };
  }
  return {
    report: `${output.slice(0, match.index)}${output.slice(match.index + match[0].length)}`.trimEnd(),
    notes: parseJson(personaNotesSchema, match[1] ?? ""),
  };
}
