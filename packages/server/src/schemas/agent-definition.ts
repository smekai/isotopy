import { z } from "zod";
import { orchestratorTeamProposalSchema } from "@isotopy/core";
import type { OrchestratorTeamProposal } from "@isotopy/core";
import type { ZodType } from "zod";
import { splitFrontMatter } from "../domain/markdown/front-matter.ts";
import { SKILL_ID } from "../domain/rules/persona-notes.ts";
import { parseYaml } from "../domain/validation.ts";
import type { ValidationIssue, ValidationResult } from "../domain/validation.ts";

const agentId = z
  .string()
  .regex(SKILL_ID, "Must contain only lowercase letters, digits, and hyphens");

const text = z.string().trim().min(1);

const personaFrontMatterSchema = z
  .object({
    name: agentId,
    title: text,
    glyph: text.optional(),
    description: text,
  })
  .strict();

const stepFrontMatterSchema = z
  .object({
    name: agentId,
    description: text,
    composable: z.literal(false).optional(),
  })
  .strict();

const knowledgeFrontMatterSchema = z.object({ description: text }).strict();

export type KnowledgeFrontMatter = z.infer<typeof knowledgeFrontMatterSchema>;

type PersonaFrontMatter = z.infer<typeof personaFrontMatterSchema>;

type StepFrontMatter = z.infer<typeof stepFrontMatterSchema>;

export interface AgentDefinition {
  id: string;
  title: string;
  glyph?: string;
  description: string;
  body: string;
}

export interface StepDefinition {
  id: string;
  description: string;
  composable: boolean;
  body: string;
}

export function parseAgentFile(id: string, source: string): ValidationResult<AgentDefinition> {
  return parseDefinition(id, source, personaFrontMatterSchema, toAgent);
}

export function parseStepFile(id: string, source: string): ValidationResult<StepDefinition> {
  return parseDefinition(id, source, stepFrontMatterSchema, toStep);
}

const dutyFrontMatterSchema = z
  .object({
    title: text,
    cron: text,
    timezone: text,
    team: orchestratorTeamProposalSchema.optional(),
  })
  .strict();

export interface DutyDefinition {
  title: string;
  cron: string;
  timezone: string;
  team?: OrchestratorTeamProposal;
  task: string;
}

export function parseDutyFile(source: string): ValidationResult<DutyDefinition> {
  const split = splitFrontMatter(source);
  if (split.kind !== "present") {
    return refused({ path: [], message: "File must open with front matter between --- lines" });
  }
  const meta = parseYaml(dutyFrontMatterSchema, split.block);
  if (!meta.ok) {
    return meta;
  }
  const task = split.body.trim();
  if (task === "") {
    return refused({ path: [], message: "The body is the task the duty gives the team, and it is empty" });
  }
  return { ok: true, value: { ...meta.value, task } };
}

export function parseKnowledgeFile(source: string): ValidationResult<KnowledgeFrontMatter> {
  const split = splitFrontMatter(source);
  if (split.kind !== "present") {
    return refused({ path: [], message: "File must open with front matter between --- lines" });
  }
  return parseYaml(knowledgeFrontMatterSchema, split.block);
}

function toAgent(meta: PersonaFrontMatter, body: string): AgentDefinition {
  return {
    id: meta.name,
    title: meta.title,
    glyph: meta.glyph,
    description: meta.description,
    body,
  };
}

function toStep(meta: StepFrontMatter, body: string): StepDefinition {
  return {
    id: meta.name,
    description: meta.description,
    composable: meta.composable ?? true,
    body,
  };
}

function parseDefinition<Meta extends { name: string }, Definition>(
  id: string,
  source: string,
  schema: ZodType<Meta>,
  build: (meta: Meta, body: string) => Definition,
): ValidationResult<Definition> {
  const split = splitFrontMatter(source);
  if (split.kind === "absent") {
    return refused({ path: [], message: "File must open with front matter between --- lines" });
  }
  if (split.kind === "unclosed") {
    return refused({ path: [], message: "Front matter is never closed by a --- line" });
  }
  const meta = parseYaml(schema, split.block);
  if (!meta.ok) {
    return meta;
  }
  if (meta.value.name !== id) {
    return refused({ path: ["name"], message: `Must be "${id}", the name of its file or folder` });
  }
  return { ok: true, value: build(meta.value, split.body) };
}

function refused(issue: ValidationIssue): ValidationResult<never> {
  return { ok: false, issues: [issue] };
}
