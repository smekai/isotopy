import type { ZodType } from "zod";

import { parseJson } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

export interface TakenFencedBlock {
  report: string;
  block?: string;
}

function blockPattern(fence: string): RegExp {
  return new RegExp(`\`\`\`${fence}\\s*([\\s\\S]*?)\`\`\`\\s*`, "i");
}

export function extractFencedJson<T>(
  output: string,
  fence: string,
  schema: ZodType<T>,
): ValidationResult<T> {
  const block = blockPattern(fence).exec(output)?.[1];
  if (!block) {
    return {
      ok: false,
      issues: [{ path: [], message: `Missing fenced ${fence} JSON block` }],
    };
  }
  return parseJson(schema, block);
}

export function takeFencedBlock(output: string, fence: string): TakenFencedBlock {
  const match = blockPattern(fence).exec(output);
  if (match === null) {
    return { report: output };
  }
  return {
    report: `${output.slice(0, match.index)}${output.slice(match.index + match[0].length)}`.trimEnd(),
    block: match[1] ?? "",
  };
}
