import { randomUUID } from "node:crypto";
import { orchestrationStatusFor } from "@adhd/core";
import type { Orchestration, RunState, StageDefinition } from "@adhd/core";
import { renderOrchestrationContext } from "../domain/markdown/orchestration.ts";
import { extractOrchestratorDecision } from "../domain/orchestrator-decision.ts";
import { PERSONA_CATALOG, STEP_TASK_CATALOG } from "../domain/skills/catalog.ts";
import { formatValidationIssues } from "../domain/validation.ts";
import type { ProjectPath } from "../paths.ts";
import { OrchestrationRepository } from "../repository/orchestration-repository.ts";
import { nowIso } from "../utils.ts";
import { milestoneCloseoutContext } from "./product-manager-closeout.ts";
import type { ProjectRegistry } from "./project-registry.ts";
import type { RunOrchestrator, StartRunOptions } from "./run-orchestrator.ts";
import type { StageOutputConsumer } from "./stage-output-consumer.ts";
import { taskBoardPlanningContext } from "./task-board-adapter.ts";

const PIPELINE_ID = "orchestration";

const STAGE_ID = "orchestrate";

export type StartOrchestrationOptions = Omit<
  StartRunOptions,
  "task" | "milestoneId" | "featureId" | "orchestrationId" | "sourceTaskIds"
>;

export interface OrchestrationDependencies {
  registry: ProjectRegistry;
  runs: RunOrchestrator;
}

export class OrchestrationService implements StageOutputConsumer {
  private readonly orchestrations = new Map<string, Orchestration>();
  private readonly repositories = new Map<string, OrchestrationRepository>();
  private readonly registry: ProjectRegistry;
  private readonly runs: RunOrchestrator;

  constructor({ registry, runs }: OrchestrationDependencies) {
    this.registry = registry;
    this.runs = runs;
  }

  async init(): Promise<void> {
    for (const project of this.registry.all()) {
      const projectPath = this.registry.resolve(project.id);
      for (const orchestration of await this.repositoryFor(projectPath).loadAll()) {
        orchestration.projectId = projectPath.id;
        this.orchestrations.set(orchestration.id, orchestration);
      }
    }
  }

  async shutdown(): Promise<void> {
    await Promise.all(
      [...this.repositories.values()].map((repository) => repository.settle()),
    );
  }

  list(projectId: string): Orchestration[] {
    return [...this.orchestrations.values()]
      .filter((orchestration) => orchestration.projectId === projectId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((orchestration) => structuredClone(orchestration));
  }

  get(orchestrationId: string): Orchestration | undefined {
    const orchestration = this.orchestrations.get(orchestrationId);
    return orchestration ? structuredClone(orchestration) : undefined;
  }

  async start(
    projectPath: ProjectPath,
    goalInput: string,
    options: StartOrchestrationOptions,
  ): Promise<RunState> {
    const goal = goalInput.trim();
    if (!goal) {
      throw new Error("Orchestration goal is required");
    }
    const now = nowIso();
    const orchestration: Orchestration = {
      id: randomUUID().slice(0, 8),
      projectId: projectPath.id,
      goal,
      status: "conversing",
      turns: [],
      runIds: [],
      createdAt: now,
      updatedAt: now,
    };
    this.orchestrations.set(orchestration.id, orchestration);
    await this.persist(orchestration);

    const run = await this.runs.startRun(projectPath, PIPELINE_ID, {
      ...options,
      task: await this.buildTask(projectPath, goal),
      orchestrationId: orchestration.id,
    });
    orchestration.runIds.push(run.id);
    orchestration.updatedAt = nowIso();
    await this.persist(orchestration);
    return run;
  }

  async consume(
    run: RunState,
    stageDef: StageDefinition,
    output: string,
  ): Promise<void> {
    if (
      run.pipelineId !== PIPELINE_ID ||
      stageDef.id !== STAGE_ID ||
      !run.orchestrationId
    ) {
      return;
    }
    const orchestration = this.orchestrations.get(run.orchestrationId);
    if (!orchestration) {
      return;
    }
    const parsed = extractOrchestratorDecision(output);
    if (parsed.ok) {
      orchestration.turns.push({
        runId: run.id,
        decision: parsed.value,
        at: nowIso(),
      });
      orchestration.latestDecision = parsed.value;
      orchestration.status = orchestrationStatusFor(parsed.value);
      delete orchestration.decisionError;
    } else {
      orchestration.decisionError = formatValidationIssues(parsed.issues);
    }
    orchestration.updatedAt = nowIso();
    await this.persist(orchestration);
  }

  private async buildTask(projectPath: ProjectPath, goal: string): Promise<string> {
    const [boardContext, closeoutContext] = await Promise.all([
      taskBoardPlanningContext(projectPath),
      milestoneCloseoutContext(projectPath),
    ]);
    return renderOrchestrationContext({
      goal,
      personas: PERSONA_CATALOG,
      stepTasks: STEP_TASK_CATALOG,
      boardContext,
      closeoutContext,
    });
  }

  private persist(orchestration: Orchestration): Promise<void> {
    return this.repositoryFor(
      this.registry.resolve(orchestration.projectId),
    ).write(orchestration);
  }

  private repositoryFor(projectPath: ProjectPath): OrchestrationRepository {
    const existing = this.repositories.get(projectPath.id);
    if (existing) {
      return existing;
    }
    const repository = new OrchestrationRepository(projectPath);
    this.repositories.set(projectPath.id, repository);
    return repository;
  }
}
