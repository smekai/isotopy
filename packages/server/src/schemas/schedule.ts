import { orchestratorTeamProposalSchema } from "@isotopy/core";
import { z } from "zod";

const text = z.string().trim().min(1);

export const createScheduleSchema = z
  .object({
    name: text,
    cron: text,
    timezone: text,
    task: text,
    team: orchestratorTeamProposalSchema,
    enabled: z.boolean().optional(),
  })
  .strict();

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;

export const updateScheduleSchema = z
  .object({
    name: text.optional(),
    cron: text.optional(),
    timezone: text.optional(),
    task: text.optional(),
    team: orchestratorTeamProposalSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export type UpdateScheduleRequest = z.infer<typeof updateScheduleSchema>;
