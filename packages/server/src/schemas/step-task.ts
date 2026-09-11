import { z } from "zod";
import { splitFrontMatter } from "../domain/markdown/front-matter.ts";
import { TOOL_IDS } from "../domain/rules/tool-catalog.ts";
import type { ToolId } from "../domain/rules/tool-catalog.ts";
import { validate } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";

const text = z.string().trim().min(1);

export const STEP_TASK_CONTEXTS = ["product-environment"] as const;

export type StepTaskContext = (typeof STEP_TASK_CONTEXTS)[number];

export interface StepTaskDeclaration {
  agent?: string;
  summary?: string;
  internal: boolean;
  context: StepTaskContext[];
  tools: ToolId[];
}

export interface ParsedStepTask extends StepTaskDeclaration {
  assignment: string;
}

const flag = z.preprocess(readFlag, z.boolean());

const contexts = z.preprocess(readList, z.array(z.enum(STEP_TASK_CONTEXTS)));

const tools = z.preprocess(readList, z.array(z.enum(TOOL_IDS)));

export const stepTaskFrontMatterSchema = z
  .object({
    agent: text.optional(),
    summary: text.optional(),
    internal: flag.optional(),
    context: contexts.optional(),
    tools: tools.optional(),
  })
  .strict();

export function parseStepTask(source: string): ValidationResult<ParsedStepTask> {
  const document = splitFrontMatter(source);
  if (!document.ok) {
    return document;
  }
  const declared = validate(stepTaskFrontMatterSchema, document.value.fields);
  if (!declared.ok) {
    return declared;
  }
  return {
    ok: true,
    value: {
      agent: declared.value.agent,
      summary: declared.value.summary,
      internal: declared.value.internal ?? false,
      context: declared.value.context ?? [],
      tools: declared.value.tools ?? [],
      assignment: document.value.body,
    },
  };
}

function readFlag(value: unknown): unknown {
  if (value === "true") {
    return true;
  }
  return value === "false" ? false : value;
}

function readList(value: unknown): unknown {
  return typeof value === "string" ? [value] : value;
}
