import path from "node:path";
import { stringify } from "yaml";
import { TEAM_FILE, orchestrationSchema } from "@isotopy/core";
import type { Orchestration, OrchestratorDecision, TeamDefinition, TeamRole } from "@isotopy/core";
import { ORCHESTRATIONS_TABLE } from "../../src/db/json-records-table.ts";
import { ProjectDatabases } from "../../src/db/project-databases.ts";
import { JsonRecordRepository } from "../../src/repository/json-record-repository.ts";
import type { ProjectRegistry } from "../../src/services/project-registry.ts";
import { fencedBlock } from "./fake-engine.ts";
import { RecordingLogger } from "./recording-logger.ts";
import { writeTextFile } from "../../src/utils/text-file.ts";

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

export const DEVELOPER_ROLE: TeamRole = {
  id: "implementation",
  label: "Implementing",
  agent: "developer",
};

export const QA_ROLE: TeamRole = {
  id: "test",
  label: "Verifying",
  agent: "tester",
  executionPolicy: "quality",
};

export const PAIR_TEAM: TeamDefinition = {
  roster: [DEVELOPER_ROLE, QA_ROLE],
  flows: {
    pair: [
      { role: "implementation", step: "implement-feature" },
      { role: "test", step: "verify-feature" },
    ],
  },
};

export const START_PAIR: OrchestratorDecision = {
  action: "start_run",
  rationale: "One Developer and one QA Engineer cover this",
  flow: "pair",
  task: "Build the search endpoint and verify it",
};

export function teamFileText(team: TeamDefinition, body = "# The team\n"): string {
  return `---\n${stringify(team)}---\n${body}`;
}

export const VERIFYING_TEAM: TeamDefinition = {
  ...PAIR_TEAM,
  flows: { ...PAIR_TEAM.flows, verify: [{ role: "test", step: "verify-feature" }] },
};

export const TEAM_CHANGE: OrchestratorDecision = {
  action: "propose_team_change",
  rationale: "Verification keeps coming back on its own",
  team: teamFileText(VERIFYING_TEAM),
};

export async function writeTeam(dataDir: string, team: TeamDefinition = PAIR_TEAM): Promise<void> {
  await writeTeamText(dataDir, teamFileText(team));
}

export async function writeTeamText(dataDir: string, text: string): Promise<void> {
  await writeTextFile(path.join(dataDir, TEAM_FILE), text);
}

export function projectDataDir(root: string): string {
  return path.join(root, ".isotopy");
}

export function fenced(decision: unknown): string {
  return `Here is what I propose.\n\n${fencedBlock("isotopy-orchestrator-decision", decision)}`;
}
