import { teamDefinitionSchema } from "@isotopy/core";
import type { TeamDefinition } from "@isotopy/core";
import { splitFrontMatter } from "../domain/markdown/front-matter.ts";
import { parseYaml } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

export function parseTeamFile(source: string): ValidationResult<TeamDefinition> {
  const split = splitFrontMatter(source);
  if (split.kind === "absent") {
    return { ok: false, issues: [{ path: [], message: "team.md must open with front matter between --- lines" }] };
  }
  if (split.kind === "unclosed") {
    return { ok: false, issues: [{ path: [], message: "team.md's front matter is never closed by a --- line" }] };
  }
  return parseYaml(teamDefinitionSchema, split.block);
}
