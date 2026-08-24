import { z } from "zod";
import { orchestratorTeamProposalSchema } from "./orchestration.ts";
import { requiredText, timestamp } from "./schema.ts";

export const SCHEDULE_TICK_MS = 30_000;

export const SCHEDULE_SKIP_REASONS = ["run_active"] as const;

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
    team: orchestratorTeamProposalSchema,
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

export interface UpdateScheduleInput {
  name?: string;
  cron?: string;
  timezone?: string;
  task?: string;
  enabled?: boolean;
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
