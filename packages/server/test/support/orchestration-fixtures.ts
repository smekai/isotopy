import type { Orchestration } from "@isotopy/core";
import { OrchestrationRepository } from "../../src/repository/orchestration-repository.ts";
import type { ProjectRegistry } from "../../src/services/project-registry.ts";

const AT = "2026-08-05T00:00:00.000Z";

export function orchestration(overrides: Partial<Orchestration> = {}): Orchestration {
  return {
    id: overrides.id ?? "orch-1",
    projectId: overrides.projectId ?? "home",
    goal: overrides.goal ?? "Deliver the requested work",
    status: overrides.status ?? "running",
    turns: overrides.turns ?? [],
    brokerTurns: overrides.brokerTurns ?? [],
    runIds: overrides.runIds ?? [],
    createdAt: overrides.createdAt ?? AT,
    updatedAt: overrides.updatedAt ?? AT,
  };
}

export async function seedOrchestration(
  registry: ProjectRegistry,
  seed: Orchestration,
): Promise<void> {
  const repository = new OrchestrationRepository(registry.resolve(seed.projectId));
  await repository.write(seed);
  await repository.settle();
}
