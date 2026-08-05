import { randomUUID } from "node:crypto";
import { isTerminalRunStatus, orchestrationStatusFor } from "@adhd/core";
import type {
  Orchestration,
  OrchestratorBrokerDecision,
  RunState,
  StageDefinition,
} from "@adhd/core";
import {
  renderComposedRunTask,
  renderOrchestrationContext,
  renderQuestionMediationContext,
} from "../domain/markdown/orchestration.ts";
import { extractOrchestratorDecision } from "../domain/orchestrator-decision.ts";
import { PERSONA_CATALOG, STEP_TASK_CATALOG } from "../domain/skills/catalog.ts";
import { composeTeamPipeline } from "../domain/team-composition.ts";
import { formatValidationIssues } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";
import type { ProjectPath } from "../paths.ts";
import { OrchestrationRepository } from "../repository/orchestration-repository.ts";
import { nowIso } from "../utils.ts";
import { milestoneCloseoutContext } from "./product-manager-closeout.ts";
import type { ProjectRegistry } from "./project-registry.ts";
import type { RunOrchestrator, StartRunOptions } from "./run-orchestrator.ts";
import type { StageOutputConsumer } from "./stage-output-consumer.ts";
import {
  ActiveOrchestratorConflictError,
  OrchestratorRequiredError,
} from "./question-mediator.ts";
import type {
  QuestionMediationContext,
  QuestionMediationRequest,
  QuestionMediator,
} from "./question-mediator.ts";
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

export class OrchestrationService implements StageOutputConsumer, QuestionMediator {
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
      await this.reconcileActiveOrchestrations(projectPath.id);
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

  activeId(projectId: string): string | undefined {
    return this.activeFor(projectId)?.id;
  }

  async attachRun(projectId: string, runId: string): Promise<void> {
    const orchestration = this.activeFor(projectId);
    if (!orchestration) {
      throw new OrchestratorRequiredError(
        "The project has no active Orchestrator to own the run",
      );
    }
    if (!orchestration.runIds.includes(runId)) {
      orchestration.runIds.push(runId);
      orchestration.updatedAt = nowIso();
      await this.persist(orchestration);
    }
  }

  reconcileRuns(): void {
    for (const orchestration of this.orchestrations.values()) {
      if (orchestration.status !== "stopped") {
        continue;
      }
      for (const runId of orchestration.runIds) {
        const run = this.runs.getRun(runId);
        if (run && !isTerminalRunStatus(run.status)) {
          this.runs.abortRun(run.id);
        }
      }
    }
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
    const active = this.activeFor(projectPath.id);
    if (active) {
      throw new ActiveOrchestratorConflictError(
        `Project already has an active Orchestrator: ${active.id}`,
      );
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
    try {
      const run = await this.runs.startRun(projectPath, PIPELINE_ID, {
        ...options,
        task: await this.buildTask(projectPath, goal),
        orchestrationId: orchestration.id,
      });
      orchestration.runIds.push(run.id);
      orchestration.updatedAt = nowIso();
      await this.persist(orchestration);
      return run;
    } catch (error) {
      this.orchestrations.delete(orchestration.id);
      throw error;
    }
  }

  async approveTeam(
    projectPath: ProjectPath,
    orchestrationId: string,
    options: StartOrchestrationOptions,
  ): Promise<ValidationResult<RunState>> {
    const orchestration = this.orchestrations.get(orchestrationId);
    if (!orchestration || orchestration.projectId !== projectPath.id) {
      throw new Error("Orchestration not found");
    }
    const decision = orchestration.latestDecision;
    if (
      orchestration.status !== "awaiting_approval" ||
      decision?.action !== "propose_team"
    ) {
      throw new Error("No team is awaiting approval on this orchestration");
    }
    const composed = composeTeamPipeline(decision.team, orchestration.id);
    if (!composed.ok) {
      return composed;
    }
    const run = await this.runs.startComposedRun(projectPath, composed.value, {
      ...options,
      task: renderComposedRunTask({
        goal: orchestration.goal,
        team: decision.team,
      }),
      orchestrationId: orchestration.id,
    });
    orchestration.approvedTeam = decision.team;
    orchestration.composedPipeline = composed.value;
    if (!orchestration.runIds.includes(run.id)) {
      orchestration.runIds.push(run.id);
    }
    orchestration.status = "running";
    orchestration.updatedAt = nowIso();
    await this.persist(orchestration);
    return { ok: true, value: run };
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
      delete orchestration.decisionError;
      if (parsed.value.action === "stop") {
        await this.terminate(orchestration, parsed.value.reason, run.id);
        return;
      }
      orchestration.status = orchestrationStatusFor(parsed.value);
    } else {
      orchestration.decisionError = formatValidationIssues(parsed.issues);
    }
    orchestration.updatedAt = nowIso();
    await this.persist(orchestration);
  }

  async stop(projectPath: ProjectPath, orchestrationId: string): Promise<Orchestration> {
    const orchestration = this.orchestrations.get(orchestrationId);
    if (!orchestration || orchestration.projectId !== projectPath.id) {
      throw new Error("Orchestration not found");
    }
    await this.terminate(orchestration, "Stopped by user");
    return structuredClone(orchestration);
  }

  async contextFor(
    request: QuestionMediationRequest,
  ): Promise<QuestionMediationContext> {
    const run = this.runs.getRun(request.runId);
    if (!run) {
      throw new Error(`Run not found: ${request.runId}`);
    }
    const orchestration = this.activeFor(run.projectId);
    if (!orchestration) {
      throw new OrchestratorRequiredError(
        "The project has no active Orchestrator to mediate this question",
      );
    }
    if (
      run.orchestrationId !== undefined &&
      run.orchestrationId !== orchestration.id
    ) {
      throw new OrchestratorRequiredError(
        "The run belongs to an Orchestrator that is no longer active",
      );
    }
    return {
      orchestrationId: orchestration.id,
      prompt: renderQuestionMediationContext({
        goal: orchestration.goal,
        team: orchestration.approvedTeam,
        phase: request.phase,
        originStageId: request.stageId,
        question: request.question,
        userAnswer: request.userAnswer,
        artifacts: this.mediationArtifacts(orchestration, run),
      }),
    };
  }

  async recordDecision(
    request: QuestionMediationRequest,
    context: QuestionMediationContext,
    decision: OrchestratorBrokerDecision,
  ): Promise<void> {
    const orchestration = this.orchestrations.get(context.orchestrationId);
    if (!orchestration || orchestration.status === "stopped") {
      throw new OrchestratorRequiredError(
        "The Orchestrator stopped before it could record the mediation decision",
      );
    }
    const id = `${request.runId}:${request.stageId}:${request.stageTurn}:${request.phase}`;
    orchestration.brokerTurns ??= [];
    if (!orchestration.brokerTurns.some((turn) => turn.id === id)) {
      orchestration.brokerTurns.push({
        id,
        runId: request.runId,
        stageId: request.stageId,
        phase: request.phase,
        decision,
        at: nowIso(),
      });
      orchestration.updatedAt = nowIso();
      await this.persist(orchestration);
    }
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

  private activeFor(projectId: string): Orchestration | undefined {
    return [...this.orchestrations.values()]
      .filter(
        (orchestration) =>
          orchestration.projectId === projectId && orchestration.status !== "stopped",
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  }

  private mediationArtifacts(orchestration: Orchestration, current: RunState) {
    const runIds = new Set([...orchestration.runIds, current.id]);
    return this.runs
      .listRuns(orchestration.projectId)
      .filter((run) => runIds.has(run.id) && run.pipelineId !== PIPELINE_ID)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .flatMap((run) =>
        run.stages.flatMap((stage) => {
          const output = run.stageOutputs?.[stage.id];
          return output
            ? [
                {
                  runLabel: `Run ${run.number}: ${run.pipelineName}`,
                  stageLabel: stage.label,
                  output,
                },
              ]
            : [];
        }),
      );
  }

  private async reconcileActiveOrchestrations(projectId: string): Promise<void> {
    const active = [...this.orchestrations.values()]
      .filter(
        (orchestration) =>
          orchestration.projectId === projectId && orchestration.status !== "stopped",
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    for (const duplicate of active.slice(1)) {
      await this.terminate(
        duplicate,
        "Retired when the project adopted one active Orchestrator",
      );
    }
  }

  private async terminate(
    orchestration: Orchestration,
    reason: string,
    completingRunId?: string,
  ): Promise<void> {
    if (orchestration.status === "stopped") {
      return;
    }
    for (const runId of orchestration.runIds) {
      const run = this.runs.getRun(runId);
      if (
        run &&
        run.id !== completingRunId &&
        !isTerminalRunStatus(run.status)
      ) {
        this.runs.abortRun(run.id);
      }
    }
    const stoppedAt = nowIso();
    orchestration.status = "stopped";
    orchestration.stoppedAt = stoppedAt;
    orchestration.stopReason = reason;
    orchestration.updatedAt = stoppedAt;
    await this.persist(orchestration);
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
