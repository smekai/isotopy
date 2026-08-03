import { milestoneSchema, type Milestone } from "@adhd/core";

export function parsePersistedMilestone(data: string): Milestone | undefined {
  try {
    const parsed = milestoneSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
