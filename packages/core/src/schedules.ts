import { z } from "zod";
import { orchestratorTeamProposalSchema } from "./orchestration.ts";
import type { OrchestratorTeamProposal } from "./orchestration.ts";
import { requiredText, timestamp } from "./schema.ts";

export const SCHEDULE_TICK_MS = 30_000;

export const SCHEDULE_SKIP_REASONS = ["run_active", "orchestrator_busy"] as const;

export type ScheduleSkipReason = (typeof SCHEDULE_SKIP_REASONS)[number];

export const scheduleOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fired"), runId: requiredText }).strict(),
  z.object({ kind: z.literal("skipped"), reason: z.enum(SCHEDULE_SKIP_REASONS) }).strict(),
  z.object({ kind: z.literal("failed"), error: requiredText }).strict(),
]);

export type ScheduleOutcome = z.infer<typeof scheduleOutcomeSchema>;

export const scheduleSchema = z
  .object({
    id: requiredText,
    projectId: requiredText,
    name: requiredText,
    cron: requiredText,
    timezone: requiredText,
    task: requiredText,
    team: orchestratorTeamProposalSchema.optional(),
    builtIn: requiredText.optional(),
    enabled: z.boolean(),
    lastWindowAt: timestamp.optional(),
    lastFiredAt: timestamp.optional(),
    lastOutcome: scheduleOutcomeSchema.optional(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export type Schedule = z.infer<typeof scheduleSchema>;

export const scheduleViewSchema = scheduleSchema
  .extend({ nextFireAt: timestamp.optional() })
  .strict();

export type ScheduleView = z.infer<typeof scheduleViewSchema>;

const inputText = z.string().trim().min(1);

export const createScheduleSchema = z
  .object({
    name: inputText,
    cron: inputText,
    timezone: inputText,
    task: inputText,
    team: orchestratorTeamProposalSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;

export const updateScheduleSchema = createScheduleSchema.partial().strict();

export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;

export function scheduleIsBuiltIn(schedule: Schedule): boolean {
  return schedule.builtIn !== undefined;
}

export function schedulePinsTeam(
  schedule: Schedule,
): schedule is Schedule & { team: OrchestratorTeamProposal } {
  return schedule.team !== undefined;
}

export function scheduleAnchor(schedule: Schedule): string {
  return schedule.lastWindowAt ?? schedule.createdAt;
}

export function isScheduleDue(
  schedule: Schedule,
  nextFireAt: string | undefined,
  now: string,
): boolean {
  return schedule.enabled && nextFireAt !== undefined && nextFireAt <= now;
}
