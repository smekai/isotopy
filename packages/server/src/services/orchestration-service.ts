import { randomUUID } from "node:crypto";
import {
  addUsage,
  agentForStage,
  isTerminalRunStatus,
  orchestrationStatusFor,
  parkedQuestion,
} from "@isotopy/core";
import type {
  ModelTier,
  Orchestration,
  OrchestrationStatus,
  OrchestratorBrokerDecision,
  OrchestratorDecision,
  PipelineDefinition,
  RunState,
  StageDefinition,
  StageUsage,
} from "@isotopy/core";
import {
  renderComposedRunTask,
  renderGatePreference,
  renderOrchestrationContext,
  renderOrchestrationFollowUp,
  renderQuestionMediationContext,
  renderRunReviewContext,
  renderTaskAfterRejection,
} from "../domain/markdown/orchestration.ts";
import type {
  OrchestrationContext,
  QuestionMediationArtifact,
  RunReviewMilestoneContext,
} from "../domain/markdown/orchestration.ts";
import {
  artifactDigestOf,
  digestsOf,
  milestoneReviewContext,
  runLabel,
  stageOutputsOf,
} from "../domain/rules/orchestration-context.ts";
import { blockedLaunchRefusal } from "../domain/rules/orchestration-loop.ts";
import type { SettledLaunch } from "../domain/rules/orchestration-loop.ts";
import { seedFromSettledRun } from "../domain/rules/run-seeding.ts";
import type { SeededStart } from "../domain/rules/run-seeding.ts";
import { extractOrchestratorDecision } from "../schemas/orchestrator-decision.ts";
import { PERSONA_CATALOG, STEP_TASK_CATALOG } from "../domain/skills/catalog.ts";
import { composeTeamPipeline, withRoleTiers } from "../schemas/team-composition.ts";
import { formatValidationIssues } from "../domain/validation.ts";
import type { ValidationResult } from "../domain/validation.ts";
import type { ProjectPath } from "../paths.ts";
import { OrchestrationRepository } from "../repository/orchestration-repository.ts";
import { nowIso } from "../utils/time.ts";
import { milestoneCloseoutContext } from "./milestone-closeout.ts";
import type { ProjectRegistry } from "./project-registry.ts";
import type { RunService } from "./run/run-service.ts";
import type { SettingsStore } from "./settings-store.ts";
import type { StageOutputRejection } from "../domain/rules/stage-context.ts";
import type { StageOutputConsumer } from "./consumers/stage-output-consumer.ts";
import type { InheritedRunOptions } from "./run/run-options.ts";
import { OrchestratorRequiredError } from "../domain/orchestrator-required-error.ts";
import type {
  QuestionMediationContext,
  QuestionMediationRequest,
  RunReview,
  RunReviewContext,
  RunReviewRequest,
} from "../workflow/types.ts";
import { taskBoardFor } from "./task-board-adapter.ts";

export type StartOrchestrationOptions = InheritedRunOptions;

export interface ApproveTeamOptions extends StartOrchestrationOptions {
  roleTiers?: Record<string, ModelTier | null>;
}

export class OrchestrationService implements StageOutputConsumer {
  private readonly orchestrations = new Map<string, Orchestration>();
  private readonly repositories = new Map<string, OrchestrationRepository>();
  private readonly settledRuns = new Set<string>();

  constructor(
    private readonly registry: ProjectRegistry,
    private readonly runs: RunService,
    private readonly settings: SettingsStore,
  ) {}

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

  async ensureActive(projectPath: ProjectPath, goal: string): Promise<string> {
    const active = this.activeFor(projectPath.id);
    if (active) {
      return active.id;
    }
    const orchestration = this.newOrchestration(projectPath.id, goal, "running");
    this.orchestrations.set(orchestration.id, orchestration);
    await this.persist(orchestration);
    return orchestration.id;
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
      await this.terminate(active, "Superseded by a new Orchestrator");
    }
    const orchestration = this.newOrchestration(projectPath.id, goal, "conversing");
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
    options: ApproveTeamOptions,
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
    const approved = withRoleTiers(decision.team, options.roleTiers);
    if (!approved.ok) {
      return approved;
    }
    const composed = composeTeamPipeline(approved.value, orchestration.id);
    if (!composed.ok) {
      return composed;
    }
    const run = await this.runs.startComposedRun(projectPath, composed.value, {
      ...options,
      task: renderComposedRunTask({
        goal: orchestration.goal,
        team: approved.value,
      }),
      orchestrationId: orchestration.id,
    });
    orchestration.approvedTeam = approved.value;
    orchestration.composedPipeline = composed.value;
    if (!orchestration.runIds.includes(run.id)) {
      orchestration.runIds.push(run.id);
    }
    orchestration.status = "running";
    orchestration.updatedAt = nowIso();
    await this.persist(orchestration);
    return { ok: true, value: run };
  }

  async answer(
    projectPath: ProjectPath,
    orchestrationId: string,
    text: string,
    options: StartOrchestrationOptions = {},
  ): Promise<RunState> {
    const orchestration = this.orchestrations.get(orchestrationId);
    if (!orchestration || orchestration.projectId !== projectPath.id) {
      throw new Error("Orchestration not found");
    }
    if (orchestration.status === "stopped") {
      throw new Error(
        "This Orchestrator has stopped — start a new initiative to say more",
      );
    }
    const asking = this.askingRun(orchestration);
    if (asking) {
      this.runs.postMessage(asking.id, text);
      return asking;
    }
    const question = parkedQuestion(orchestration);
    if (question === undefined) {
      throw new Error("The Orchestrator is not waiting on an answer");
    }
    const lastRunId = orchestration.runIds.at(-1);
    const run = await this.runs.startRun(projectPath, PIPELINE_ID, {
      ...(lastRunId ? this.runs.inheritedRunOptions(lastRunId) : {}),
      ...options,
      task: await this.followUpTask(projectPath, orchestration, question, text),
      orchestrationId: orchestration.id,
    });
    orchestration.runIds.push(run.id);
    orchestration.status = "conversing";
    orchestration.updatedAt = nowIso();
    await this.persist(orchestration);
    return run;
  }

  async consume(
    run: RunState,
    stageDef: StageDefinition,
    output: string,
  ): Promise<StageOutputRejection | undefined> {
    if (
      run.pipelineId !== PIPELINE_ID ||
      stageDef.id !== STAGE_ID ||
      !run.orchestrationId
    ) {
      return undefined;
    }
    const orchestration = this.orchestrations.get(run.orchestrationId);
    if (!orchestration) {
      return undefined;
    }
    const profession = agentForStage(stageDef).profession;
    const parsed = extractOrchestratorDecision(output);
    if (!parsed.ok) {
      const cause = formatValidationIssues(parsed.issues);
      return this.refuse(
        orchestration,
        cause,
        `${profession} produced no usable decision — ${cause}`,
      );
    }
    const refusal = this.refusalFor(orchestration, run, run.status, parsed.value);
    if (refusal !== undefined) {
      return this.refuse(
        orchestration,
        refusal,
        `${profession} decided something that cannot be acted on — ${refusal}`,
      );
    }
    orchestration.turns.push({
      runId: run.id,
      decision: parsed.value,
      at: nowIso(),
    });
    orchestration.latestDecision = parsed.value;
    delete orchestration.decisionError;
    if (parsed.value.action === "stop") {
      await this.terminate(orchestration, parsed.value.reason, run.id);
      return undefined;
    }
    orchestration.status = orchestrationStatusFor(parsed.value);
    orchestration.updatedAt = nowIso();
    await this.persist(orchestration);
    return undefined;
  }

  private async refuse(
    orchestration: Orchestration,
    cause: string,
    reason: string,
  ): Promise<StageOutputRejection> {
    orchestration.decisionError = cause;
    orchestration.updatedAt = nowIso();
    await this.persist(orchestration);
    return { reason };
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

  async restartTask(run: RunState): Promise<string | undefined> {
    const orchestration = run.orchestrationId
      ? this.orchestrations.get(run.orchestrationId)
      : undefined;
    const error = orchestration?.decisionError;
    if (run.pipelineId !== PIPELINE_ID || run.task === undefined || error === undefined) {
      return undefined;
    }
    return renderTaskAfterRejection({ task: run.task, error });
  }

  async reviewContextFor(request: RunReviewRequest): Promise<RunReviewContext> {
    const run = this.runs.getRun(request.runId);
    if (!run) {
      throw new Error(`Run not found: ${request.runId}`);
    }
    const orchestration = this.activeFor(run.projectId);
    if (!orchestration) {
      throw new OrchestratorRequiredError(
        "The project has no active Orchestrator to review this run",
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
      prompt: renderRunReviewContext({
        goal: orchestration.goal,
        team: orchestration.approvedTeam,
        runLabel: runLabel(run),
        runStatus: request.status,
        closeout: run.closeout?.report,
        artifacts: stageOutputsOf(run),
        milestone: this.reviewMilestone(run),
        rejectedDecision: orchestration.decisionError,
      }),
    };
  }

  async recordDecisionUsage(orchestrationId: string, usage: StageUsage): Promise<void> {
    const orchestration = this.orchestrations.get(orchestrationId);
    if (!orchestration) {
      return;
    }
    orchestration.usage = addUsage(orchestration.usage, usage);
    orchestration.updatedAt = nowIso();
    await this.persist(orchestration);
  }

  async recordReview(
    request: RunReviewRequest,
    context: RunReviewContext,
    review: RunReview,
  ): Promise<void> {
    const orchestration = this.orchestrations.get(context.orchestrationId);
    if (!orchestration || orchestration.status === "stopped") {
      throw new OrchestratorRequiredError(
        "The Orchestrator stopped before it could record the run review",
      );
    }
    const decision = this.actionableDecision(orchestration, request, review);
    if (decision.value && !this.hasTurnFor(orchestration, request.runId)) {
      orchestration.turns.push({
        runId: request.runId,
        decision: decision.value,
        at: nowIso(),
      });
      orchestration.latestDecision = decision.value;
      if (decision.value.action !== "stop") {
        orchestration.status = orchestrationStatusFor(decision.value);
      }
    }
    const errors = [...review.errors, ...decision.errors];
    if (errors.length > 0) {
      orchestration.decisionError = errors.join("; ");
    } else if (decision.value) {
      delete orchestration.decisionError;
    }
    orchestration.updatedAt = nowIso();
    await this.persist(orchestration);
  }

  async settle(runId: string): Promise<void> {
    if (this.settledRuns.has(runId)) {
      return;
    }
    const run = this.runs.getRun(runId);
    if (!run) {
      return;
    }
    const orchestration = this.activeFor(run.projectId);
    const decision = orchestration?.turns.at(-1);
    if (!orchestration || decision?.runId !== runId) {
      return;
    }
    this.settledRuns.add(runId);
    await this.act(orchestration, run, decision.decision);
  }

  private async act(
    orchestration: Orchestration,
    run: RunState,
    decision: OrchestratorDecision,
  ): Promise<void> {
    if (decision.action === "stop") {
      await this.terminate(orchestration, decision.reason, run.id);
      return;
    }
    const projectPath = this.registry.resolve(orchestration.projectId);
    const options = this.runs.inheritedRunOptions(run.id);
    const started = await this.launch(
      projectPath,
      orchestration,
      run,
      decision,
      options,
    ).catch((error: unknown) => {
      orchestration.decisionError =
        error instanceof Error ? error.message : String(error);
      return undefined;
    });
    if (started && !orchestration.runIds.includes(started.id)) {
      orchestration.runIds.push(started.id);
    }
    orchestration.updatedAt = nowIso();
    await this.persist(orchestration);
  }

  private async launch(
    projectPath: ProjectPath,
    orchestration: Orchestration,
    run: RunState,
    decision: OrchestratorDecision,
    options: StartOrchestrationOptions,
  ): Promise<RunState | undefined> {
    if (decision.action === "start_run") {
      const pipeline = orchestration.composedPipeline;
      if (!pipeline) {
        throw new Error(NO_APPROVED_TEAM);
      }
      const seeded = this.seedFrom(
        pipeline,
        orchestration,
        run,
        decision.fromStage,
      );
      if (seeded && !seeded.ok) {
        throw new Error(formatValidationIssues(seeded.issues));
      }
      return this.runs.startComposedRun(projectPath, pipeline, {
        ...options,
        task: decision.task,
        orchestrationId: orchestration.id,
        seeded: seeded?.value,
      });
    }
    if (decision.action === "delegate_milestone_planning") {
      return this.runs.milestones.startMilestonePlanning(projectPath, decision.goal, options);
    }
    if (decision.action === "continue_milestone") {
      return this.continueMilestone(projectPath, run, decision.featureId, options);
    }
    return undefined;
  }

  private actionableDecision(
    orchestration: Orchestration,
    request: RunReviewRequest,
    review: RunReview,
  ): ReviewedDecision {
    const settled = this.runs.getRun(request.runId);
    if (!review.decision || !settled) {
      return { value: review.decision, errors: [] };
    }
    const refusal = this.refusalFor(
      orchestration,
      settled,
      request.status,
      review.decision,
    );
    return refusal === undefined
      ? { value: review.decision, errors: [] }
      : { errors: [refusal] };
  }

  private refusalFor(
    orchestration: Orchestration,
    settled: RunState,
    settledStatus: RunState["status"],
    decision: OrchestratorDecision,
  ): string | undefined {
    if (decision.action !== "start_run") {
      return undefined;
    }
    const pipeline = orchestration.composedPipeline;
    if (!pipeline) {
      return NO_APPROVED_TEAM;
    }
    const seeded = this.seedFrom(
      pipeline,
      orchestration,
      settled,
      decision.fromStage,
    );
    if (seeded && !seeded.ok) {
      return formatValidationIssues(seeded.issues);
    }
    return blockedLaunchRefusal([
      ...this.settledLaunches(orchestration),
      { action: decision.action, status: settledStatus },
    ]);
  }

  private seedFrom(
    pipeline: PipelineDefinition,
    orchestration: Orchestration,
    settled: RunState,
    fromStage: string | undefined,
  ): ValidationResult<SeededStart> | undefined {
    const source = this.seedSource(orchestration, settled);
    return fromStage === undefined
      ? undefined
      : seedFromSettledRun(pipeline, source, fromStage, runLabel(source));
  }

  private seedSource(orchestration: Orchestration, settled: RunState): RunState {
    if (settled.pipelineId !== PIPELINE_ID) {
      return settled;
    }
    return (
      [...orchestration.runIds]
        .reverse()
        .map((runId) => this.runs.getRun(runId))
        .find(
          (candidate): candidate is RunState =>
            candidate !== undefined && candidate.pipelineId !== PIPELINE_ID,
        ) ?? settled
    );
  }

  private settledLaunches(orchestration: Orchestration): SettledLaunch[] {
    return orchestration.turns.map((turn) => ({
      action: turn.decision.action,
      status: this.runs.getRun(turn.runId)?.status,
    }));
  }

  private continueMilestone(
    projectPath: ProjectPath,
    run: RunState,
    featureId: string | undefined,
    options: StartOrchestrationOptions,
  ): Promise<RunState> {
    const milestone = run.milestoneId
      ? this.runs.milestones.getMilestone(run.milestoneId)
      : undefined;
    if (!milestone) {
      throw new Error("The settled run does not belong to a milestone to continue");
    }
    if (!milestone.autoRunNext) {
      throw new Error(
        `Milestone "${milestone.name}" does not continue on its own — enable auto-run to let the Orchestrator start its next feature`,
      );
    }
    return this.runs.milestones.startNextMilestoneRun(projectPath, milestone.id, {
      ...options,
      featureId,
    });
  }

  private reviewMilestone(run: RunState): RunReviewMilestoneContext | undefined {
    const milestone = run.milestoneId
      ? this.runs.milestones.getMilestone(run.milestoneId)
      : undefined;
    return milestone ? milestoneReviewContext(milestone, run.featureId) : undefined;
  }

  private hasTurnFor(orchestration: Orchestration, runId: string): boolean {
    return orchestration.turns.some((turn) => turn.runId === runId);
  }

  private async buildTask(projectPath: ProjectPath, goal: string): Promise<string> {
    return renderOrchestrationContext(await this.goalContext(projectPath, goal));
  }

  private async followUpTask(
    projectPath: ProjectPath,
    orchestration: Orchestration,
    question: string,
    answer: string,
  ): Promise<string> {
    return renderOrchestrationFollowUp({
      ...(await this.goalContext(projectPath, orchestration.goal)),
      team: orchestration.approvedTeam,
      question,
      answer,
      artifacts: this.priorArtifacts(orchestration),
    });
  }

  private async goalContext(
    projectPath: ProjectPath,
    goal: string,
  ): Promise<OrchestrationContext> {
    const [boardContext, closeoutContext] = await Promise.all([
      taskBoardFor(projectPath).planningContext(),
      milestoneCloseoutContext(projectPath),
    ]);
    return {
      goal,
      personas: PERSONA_CATALOG,
      stepTasks: STEP_TASK_CATALOG,
      boardContext,
      closeoutContext,
      gatePreference: renderGatePreference(
        this.settings.getPreferences(projectPath.id).gates,
      ),
    };
  }

  private askingRun(orchestration: Orchestration): RunState | undefined {
    return orchestration.runIds
      .map((runId) => this.runs.getRun(runId))
      .find((run): run is RunState => run?.status === "asking");
  }

  private priorArtifacts(orchestration: Orchestration): QuestionMediationArtifact[] {
    const runIds = new Set(orchestration.runIds);
    return digestsOf(
      this.runs
        .listRuns(orchestration.projectId)
        .filter((run) => runIds.has(run.id) && run.pipelineId !== PIPELINE_ID),
    );
  }

  private newOrchestration(
    projectId: string,
    goal: string,
    status: OrchestrationStatus,
  ): Orchestration {
    const now = nowIso();
    return {
      id: randomUUID().slice(0, 8),
      projectId,
      goal,
      status,
      turns: [],
      runIds: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  private activeFor(projectId: string): Orchestration | undefined {
    return [...this.orchestrations.values()]
      .filter(
        (orchestration) =>
          orchestration.projectId === projectId && orchestration.status !== "stopped",
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  }

  private mediationArtifacts(
    orchestration: Orchestration,
    current: RunState,
  ): QuestionMediationArtifact[] {
    const runIds = new Set([...orchestration.runIds, current.id]);
    return this.runs
      .listRuns(orchestration.projectId)
      .filter((run) => runIds.has(run.id) && run.pipelineId !== PIPELINE_ID)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .flatMap((run) =>
        run.id === current.id ? stageOutputsOf(run) : artifactDigestOf(run),
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

interface ReviewedDecision {
  value?: OrchestratorDecision;
  errors: string[];
}

const NO_APPROVED_TEAM =
  "The Orchestrator asked to start a run before a team was approved";

const PIPELINE_ID = "orchestration";

const STAGE_ID = "orchestrate";
