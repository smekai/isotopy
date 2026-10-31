import { z } from "zod";
import { ENGINE_SLOTS, MODEL_TIERS } from "./engines.ts";
import { STAGE_EXECUTION_POLICIES } from "./pipelines.ts";
import { requiredText } from "./schema.ts";

export const TEAM_FILE = "team.md";

export const teamRoleSchema = z
  .object({
    id: requiredText,
    label: requiredText,
    agent: requiredText,
    engine: z.enum(ENGINE_SLOTS).optional(),
    modelTier: z.enum(MODEL_TIERS).optional(),
    executionPolicy: z.enum(STAGE_EXECUTION_POLICIES).optional(),
    interactive: z.boolean().optional(),
  })
  .strict();

export type TeamRole = z.infer<typeof teamRoleSchema>;

export const teamFlowStepSchema = z
  .object({ role: requiredText, step: requiredText })
  .strict();

export type TeamFlowStep = z.infer<typeof teamFlowStepSchema>;

export const teamDefinitionSchema = z
  .object({
    roster: z.array(teamRoleSchema).min(1),
    flows: z.record(requiredText, z.array(teamFlowStepSchema).min(1)),
  })
  .strict();

export type TeamDefinition = z.infer<typeof teamDefinitionSchema>;

export const TEAM_SOURCES = ["project", "template"] as const;

export type TeamSource = (typeof TEAM_SOURCES)[number];

export const projectTeamSchema = z.discriminatedUnion("state", [
  z
    .object({
      state: z.literal("valid"),
      source: z.enum(TEAM_SOURCES),
      text: requiredText,
      team: teamDefinitionSchema,
    })
    .strict(),
  z
    .object({
      state: z.literal("invalid"),
      source: z.enum(TEAM_SOURCES),
      text: requiredText,
      issues: z.array(requiredText).min(1),
    })
    .strict(),
]);

export type ProjectTeam = z.infer<typeof projectTeamSchema>;
