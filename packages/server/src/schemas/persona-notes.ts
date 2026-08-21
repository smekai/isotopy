import { personaNotesSchema } from "@isotopy/core";
import type { PersonaNotes } from "@isotopy/core";
import { parseJson } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";
import { takeFencedBlock } from "./fenced-block.ts";

export interface ExtractedPersonaNotes {
  report: string;
  notes?: ValidationResult<PersonaNotes>;
}

export function extractPersonaNotes(output: string): ExtractedPersonaNotes {
  const { report, block } = takeFencedBlock(output, "isotopy-persona-notes");
  if (block === undefined) {
    return { report };
  }
  return { report, notes: parseJson(personaNotesSchema, block) };
}
