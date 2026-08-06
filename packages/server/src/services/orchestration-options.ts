import type { ProjectRegistry } from "./project-registry.ts";
import type { RunService, StartRunOptions } from "./run/run-service.ts";

export type StartOrchestrationOptions = Omit<
  StartRunOptions,
  "task" | "milestoneId" | "featureId" | "orchestrationId" | "sourceTaskIds"
>;

export interface OrchestrationDependencies {
  registry: ProjectRegistry;
  runs: RunService;
}
