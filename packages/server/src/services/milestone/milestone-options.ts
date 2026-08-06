import type { ProjectRegistry } from "../project-registry.ts";
import type { RunService } from "../run/run-service.ts";

export interface MilestoneServiceDependencies {
  registry: ProjectRegistry;
  runs: () => RunService;
}
