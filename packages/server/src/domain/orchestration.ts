import { orchestrationSchema, type Orchestration } from "@adhd/core";

export function parsePersistedOrchestration(data: string): Orchestration | undefined {
  try {
    const parsed = orchestrationSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
