import { orchestrationSchema } from "@isotopy/core";
import type { Orchestration } from "@isotopy/core";
import { ORCHESTRATIONS_TABLE } from "../../src/db/json-records-table.ts";
import { ProjectDatabases } from "../../src/db/project-databases.ts";
import { JsonRecordRepository } from "../../src/repository/json-record-repository.ts";
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
  const databases = new ProjectDatabases();
  const repository = new JsonRecordRepository(
    databases.for(registry.resolve(seed.projectId)),
    ORCHESTRATIONS_TABLE,
    orchestrationSchema,
    "orchestration",
  );
  await repository.write(seed);
  await databases.settleAll();
}
