import { orchestrationSchema } from "@isotopy/core";
import type {
  Orchestration,
  OrchestratorDecision,
  OrchestratorRole,
  OrchestratorTeamProposal,
} from "@isotopy/core";
import { ORCHESTRATIONS_TABLE } from "../../src/db/json-records-table.ts";
import { ProjectDatabases } from "../../src/db/project-databases.ts";
import { JsonRecordRepository } from "../../src/repository/json-record-repository.ts";
import type { ProjectRegistry } from "../../src/services/project-registry.ts";
import { fencedBlock } from "./fake-engine.ts";
import { RecordingLogger } from "./recording-logger.ts";

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
  const databases = new ProjectDatabases(new RecordingLogger());
  const repository = new JsonRecordRepository(
    databases.for(registry.resolve(seed.projectId)),
    ORCHESTRATIONS_TABLE,
    orchestrationSchema,
    "orchestration",
    new RecordingLogger(),
  );
  await repository.write(seed);
  await databases.settleAll();
}

export const DEVELOPER_ROLE: OrchestratorRole = {
  id: "implementation",
  label: "Developer",
  skill: "developer",
  stepTask: "implement-feature",
};

export const QA_ROLE: OrchestratorRole = {
  id: "test",
  label: "QA Engineer",
  skill: "tester",
  stepTask: "verify-feature",
  executionPolicy: "quality",
};

export const TEAM: OrchestratorTeamProposal = {
  name: "Delivery pair",
  summary: "Build the search endpoint and verify it",
  roles: [DEVELOPER_ROLE, QA_ROLE],
};

export const TEAM_PROPOSAL: OrchestratorDecision = {
  action: "propose_team",
  rationale: "One Developer and one QA Engineer cover this",
  team: TEAM,
};

export function fenced(decision: unknown): string {
  return `Here is what I propose.\n\n${fencedBlock("isotopy-orchestrator-decision", decision)}`;
}
