import { randomUUID } from "node:crypto";
import type {
  PipelineDefinition,
  RunEvent,
  RunMessage,
  RunState,
  RunSummary,
  StageOutcome,
  StageState,
} from "@adhd/core";
import {
  DEFAULT_PERMISSION_MODE,
  DEMO_PIPELINES,
  ENGINES,
  agentForStage,
  createInitialRunState,
  isTerminalRunStatus,
  STAGE_OUTCOMES,
  pipelineUsesEngine,
} from "@adhd/core";
import { CloseoutConsumer } from "../consumers/closeout-consumer.ts";
import { MilestonePlanConsumer } from "../consumers/milestone-plan-consumer.ts";
import type { StageOutputConsumer } from "../consumers/stage-output-consumer.ts";
import { OrchestratorRequiredError } from "../orchestrator-required-error.ts";
import type { QuestionMediator } from "../question-mediator.ts";
import type { RunReviewer } from "../run-reviewer.ts";
import { assertEngineId, getEngineAdapter } from "../../engines/registry.ts";
import { ensureProjectDataDir, resolveWorkspace } from "../../paths.ts";
import type { ProjectPath } from "../../paths.ts";
import type { ProjectRegistry } from "../project-registry.ts";
import { SettingsStore } from "../settings-store.ts";
import { WorkflowRuntimeRegistry } from "../../workflow/workflow-runtime.ts";
import type {
  PipelineWorkflowInput,
  RunProjection,
  WorkflowDeps,
} from "../../workflow/types.ts";
import { transitionTasks } from "../task-board-adapter.ts";
import { cleanupCancelledRun } from "../product-manager-closeout.ts";
import { MilestoneService } from "../milestone/milestone-service.ts";
import { RunStore } from "./run-store.ts";
import { RunProjectionSupport } from "./run-projection-support.ts";

const ORCHESTRATION_PIPELINE_ID = "orchestration";

function outcomeForRestart(stage: StageState): StageOutcome {
  if (stage.status === "failed") {
    return stage.verdict === "FAIL"
      ? STAGE_OUTCOMES.NEEDS_ATTENTION
      : STAGE_OUTCOMES.FAILED;
  }
  if (stage.status === "skipped") {
    return STAGE_OUTCOMES.SKIPPED;
  }
  return STAGE_OUTCOMES.PASSED;
}

const TERMINAL_OPENWORKFLOW_STATUSES = new Set([
  "succeeded",
  "completed",
  "failed",
  "canceled",
]);

type RunListener = (event: RunEvent) => void;

type RunSummaryListener = (summary: RunSummary) => void;

export interface InheritedRunOptions {
  engine?: string;
  model?: string;
  permissionMode?: string;
}

export interface StartRunOptions extends InheritedRunOptions {
  task?: string;
  milestoneId?: string;
  featureId?: string;
  orchestrationId?: string;
  sourceTaskIds?: string[];
}

export interface RunServiceDependencies {
  registry: ProjectRegistry;
  settings?: SettingsStore;
}

interface InputExtras {
  startedMessage: string;
  seededOutputs?: Record<string, string>;
  seededOutcomes?: Record<string, StageOutcome>;
  startStageId?: string;
}

export class RunService extends RunProjectionSupport implements RunProjection {
  readonly store: RunStore;
  readonly milestones: MilestoneService;
  protected readonly cancelled = new Set<string>();
  protected readonly engineAborts = new Map<string, AbortController>();
  protected readonly registry: ProjectRegistry;
  private readonly settings: SettingsStore;
  protected readonly runtimes: WorkflowRuntimeRegistry;
  protected readonly stageOutputConsumers: StageOutputConsumer[];
  protected questionMediator?: QuestionMediator;
  protected runReviewer?: RunReviewer;

  constructor({ registry, settings }: RunServiceDependencies) {
    super();
    this.registry = registry;
    this.settings = settings ?? new SettingsStore();
    this.store = new RunStore(registry);
    this.milestones = new MilestoneService({
      registry,
      runs: () => this,
    });
    this.stageOutputConsumers = [
      new MilestonePlanConsumer(this.milestones),
      new CloseoutConsumer(this.registry),
    ];
    const deps: WorkflowDeps = {
      projection: this,
      registry: this.registry,
      settings: this.settings,
      questionMediator: () => this.questionMediator,
      runReviewer: () => this.runReviewer,
      beginEngineStage: (runId) => this.beginEngineStage(runId),
      endEngineStage: (runId) => this.endEngineStage(runId),
      isCancelled: (runId) => this.cancelled.has(runId),
    };
    this.runtimes = new WorkflowRuntimeRegistry(deps, this.registry);
  }

  async init(): Promise<void> {
    for (const project of this.registry.all()) {
      const projectPath = this.registry.resolve(project.id);
      await this.milestones.loadProject(projectPath);
      await this.store.loadProject(projectPath);
      for (const run of this.store.listRuns(projectPath.id)) {
        if (!isTerminalRunStatus(run.status)) {
          await this.reconcileOnLoad(projectPath, run);
        }
      }
    }
    this.questionMediator?.reconcileRuns();
    for (const project of this.registry.all()) {
      const projectPath = this.registry.resolve(project.id);
      await this.runtimes.for(projectPath).start();
    }
  }

  async shutdown(): Promise<void> {
    for (const controller of this.engineAborts.values()) {
      controller.abort();
    }
    await this.runtimes.stopAll();
    await Promise.all(
      [...this.store.runs.keys()].map((runId) => this.store.flushPersist(runId)),
    );
    await this.store.settle();
    await this.milestones.settle();
  }


  private async reconcileOnLoad(projectPath: ProjectPath, run: RunState): Promise<void> {
    const openWorkflowRunId = this.store.openWorkflowRunIds.get(run.id);
    if (!openWorkflowRunId) {
      this.markInterrupted(run.id);
      return;
    }
    let status: string | undefined;
    try {
      status = await this.runtimes.for(projectPath).runStatus(openWorkflowRunId);
    } catch {
      return;
    }
    if (status === undefined || !TERMINAL_OPENWORKFLOW_STATUSES.has(status)) {
      return;
    }
    if (status === "canceled") {
      this.markCancelled(run.id);
    } else if (status === "failed") {
      this.markInterrupted(run.id);
    } else {
      this.runCompleted(run.id, "completed");
    }
    await this.store.repositoryForRun(run.id).releaseRun(run.id);
    await this.milestones.completeMilestoneRun(run);
  }

  listPipelines(): PipelineDefinition[] {
    return DEMO_PIPELINES.filter((pipeline) => pipeline.internal !== true);
  }

  getPipeline(pipelineId: string): PipelineDefinition | undefined {
    return DEMO_PIPELINES.find((pipeline) => pipeline.id === pipelineId);
  }

  private pipelineForRun(run: RunState): PipelineDefinition | undefined {
    return run.pipeline ?? this.getPipeline(run.pipelineId);
  }

  private async owningOrchestrationId(
    projectPath: ProjectPath,
    pipelineId: string,
    goal: string,
  ): Promise<string | undefined> {
    if (pipelineId === ORCHESTRATION_PIPELINE_ID) {
      return undefined;
    }
    return this.questionMediator?.ensureActive(projectPath, goal);
  }

  listRuns(projectId: string): RunState[] {
    return this.store.listRuns(projectId);
  }

  getRun(runId: string): RunState | undefined {
    return this.store.getRun(runId);
  }

  allRuns(): RunState[] {
    return this.store.allRuns();
  }

  registerStageOutputConsumer(consumer: StageOutputConsumer): void {
    this.stageOutputConsumers.push(consumer);
  }

  registerQuestionMediator(mediator: QuestionMediator): void {
    this.questionMediator = mediator;
  }

  registerRunReviewer(reviewer: RunReviewer): void {
    this.runReviewer = reviewer;
  }

  inheritedRunOptions(runId: string): InheritedRunOptions {
    const run = this.store.runs.get(runId);
    const permissionMode = this.store.enginePermissionModes.get(runId);
    return {
      ...(run?.engine === undefined ? {} : { engine: run.engine }),
      ...(run?.model === undefined ? {} : { model: run.model }),
      ...(permissionMode === undefined ? {} : { permissionMode }),
    };
  }


  subscribe(runId: string, listener: RunListener): () => void {
    return this.listeners.add(runId, listener);
  }

  subscribeProject(projectId: string, listener: RunSummaryListener): () => void {
    return this.projectListeners.add(projectId, listener);
  }


  async replayEvents(runId: string): Promise<RunEvent[]> {
    return this.store.replayEvents(runId);
  }

  async startRun(
    projectPath: ProjectPath,
    pipelineId: string,
    options: StartRunOptions = {},
  ): Promise<RunState> {
    const pipeline = this.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Unknown pipeline: ${pipelineId}`);
    }
    return this.startRunWith(projectPath, pipeline, options);
  }

  startComposedRun(
    projectPath: ProjectPath,
    pipeline: PipelineDefinition,
    options: StartRunOptions = {},
  ): Promise<RunState> {
    return this.startRunWith(projectPath, pipeline, options);
  }

  private async startRunWith(
    projectPath: ProjectPath,
    pipeline: PipelineDefinition,
    options: StartRunOptions,
  ): Promise<RunState> {
    const {
      task,
      engine,
      model,
      permissionMode,
      milestoneId,
      featureId,
      orchestrationId: requestedOrchestrationId,
      sourceTaskIds,
    } = options;
    const activeOrchestrationId = await this.owningOrchestrationId(
      projectPath,
      pipeline.id,
      task ?? pipeline.name,
    );
    if (
      requestedOrchestrationId !== undefined &&
      activeOrchestrationId !== undefined &&
      requestedOrchestrationId !== activeOrchestrationId
    ) {
      throw new OrchestratorRequiredError(
        "The requested Orchestrator is not the project's active Orchestrator",
      );
    }
    const orchestrationId = requestedOrchestrationId ?? activeOrchestrationId;
    const planningRun =
      pipeline.id === "milestone-planning" &&
      milestoneId !== undefined &&
      featureId === undefined;
    if (
      !planningRun &&
      (milestoneId === undefined) !== (featureId === undefined)
    ) {
      throw new Error("milestoneId and featureId must be provided together");
    }
    const linkedMilestone =
      milestoneId !== undefined
        ? this.milestones.requireMilestone(projectPath.id, milestoneId)
        : undefined;
    const linkedFeature =
      linkedMilestone && featureId !== undefined
        ? this.milestones.requireMilestoneFeature(linkedMilestone, featureId)
        : undefined;
    if (linkedFeature && linkedFeature.status !== "ready") {
      throw new Error(`Feature is ${linkedFeature.status}`);
    }

    const usesEngine = pipelineUsesEngine(pipeline);
    if (usesEngine) {
      const engineId = engine ?? "claude-code";
      getEngineAdapter(engineId);
      assertEngineId(engineId);
      const connection = this.settings.getEngineConnection(projectPath.id, engineId);
      const mode = ENGINES[engineId].connections.find((m) => m.id === connection.mode);
      if (mode?.requiresApiKey && !connection.apiKey) {
        throw new Error(
          `Connection mode "${mode.label}" needs an API key — add one in Setup → Connection, or switch back to subscription.`,
        );
      }
    }

    await ensureProjectDataDir(projectPath);

    const runId = randomUUID().slice(0, 8);
    const admitted = await this.store.repositoryFor(projectPath).admitRun(runId);
    if (!admitted) {
      throw new Error(
        "A run is already active in this project — wait for it to finish or abort it before starting another.",
      );
    }

    const run = createInitialRunState({
      runId,
      number: this.store.takeRunNumber(projectPath.id),
      projectId: projectPath.id,
      pipeline,
      task,
      milestoneId,
      featureId,
      orchestrationId,
      sourceTaskIds,
    });

    if (usesEngine) {
      const engineId = engine ?? "claude-code";
      assertEngineId(engineId);
      run.engine = engineId;
      if (model !== undefined) {
        run.model = model;
      }
      run.workspacePath = await resolveWorkspace(projectPath, runId);
      this.store.enginePermissionModes.set(
        runId,
        permissionMode === "acceptEdits" ? "acceptEdits" : DEFAULT_PERMISSION_MODE,
      );
    }

    this.store.runs.set(runId, run);
    if (planningRun && linkedMilestone) {
      await this.milestones.recordPlanningRun(linkedMilestone, runId);
    }
    if (linkedMilestone && linkedFeature) {
      await this.milestones.recordFeatureRun(linkedMilestone, linkedFeature, runId);
    }
    await this.store.flushPersist(runId);

    if (activeOrchestrationId && this.questionMediator) {
      await this.questionMediator.attachRun(projectPath.id, runId);
    }
    await this.launch(projectPath, run, { startedMessage: `Started pipeline: ${pipeline.name}` });
    return structuredClone(run);
  }

  approveGate(runId: string, stageId: string): RunState {
    const run = this.store.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const stage = this.requireStage(runId, stageId);
    if (stage.status !== "awaiting") {
      throw new Error(`Stage ${stageId} is not awaiting approval`);
    }
    const openWorkflowRunId = this.store.openWorkflowRunIds.get(runId);
    if (!openWorkflowRunId) {
      throw new Error(`Run ${runId} has no durable run to approve`);
    }

    this.gateApproved(runId, stageId);
    if (stageId === "intake" && run.sourceTaskIds?.length) {
      void transitionTasks(
        this.registry.resolve(run.projectId),
        run.sourceTaskIds,
        "In Progress",
        run.id,
      ).catch((error: unknown) =>
        console.warn(`Failed to move source tasks for run ${runId}:`, error),
      );
    }
    void this.runtimes.forProject(run.projectId).approveGate(runId, stageId);
    return structuredClone(run);
  }

  abortRun(runId: string): RunState {
    const run = this.store.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    if (isTerminalRunStatus(run.status)) {
      throw new Error(`Run ${runId} is already finished`);
    }

    this.cancelled.add(runId);
    this.engineAborts.get(runId)?.abort();
    const openWorkflowRunId = this.store.openWorkflowRunIds.get(runId);
    if (openWorkflowRunId) {
      void this.runtimes.forProject(run.projectId).cancel(openWorkflowRunId).catch(() => {});
    }
    this.markCancelled(runId);
    void this.settleCompletedRun(run)
      .then(() =>
        cleanupCancelledRun(this.registry.resolve(run.projectId), run.id),
      )
      .catch((error: unknown) =>
        console.warn(`Failed to clean cancelled run ${run.id}:`, error),
      );
    return structuredClone(run);
  }

  postMessage(runId: string, text: string): RunMessage {
    const run = this.store.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    if (isTerminalRunStatus(run.status)) {
      throw new Error(`Run ${runId} has finished — start a new run to say more`);
    }

    const asking = run.stages.find((stage) => stage.status === "asking");
    if (!asking) {
      return this.appendMessage(run, { role: "user", text });
    }

    const message = this.appendMessage(run, {
      role: "user",
      stageId: asking.id,
      kind: "answer",
      text,
    });
    void this.runtimes.forProject(run.projectId).answerQuestion(runId, asking.id, text);
    return message;
  }


  async restartRun(runId: string, stageId: string): Promise<RunState> {
    const run = this.store.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const orchestrationId = await this.owningOrchestrationId(
      this.registry.resolve(run.projectId),
      run.pipelineId,
      run.task ?? run.pipelineName,
    );
    if (
      run.status !== "needs_attention" &&
      run.status !== "failed" &&
      run.status !== "cancelled"
    ) {
      throw new Error(
        `Run ${runId} can only be restarted after needing attention, failing, or being aborted`,
      );
    }
    if (!this.pipelineForRun(run)) {
      throw new Error(
        `This run used the "${run.pipelineId}" pipeline, which no longer exists — start a new run instead`,
      );
    }
    const startIndex = run.stages.findIndex((stage) => stage.id === stageId);
    if (startIndex === -1) {
      throw new Error(`Stage not found: ${stageId}`);
    }

    const outputs = { ...run.stageOutputs };
    const seededOutputs: Record<string, string> = {};
    const seededOutcomes: Record<string, StageOutcome> = {};
    for (const stage of run.stages.slice(0, startIndex)) {
      seededOutcomes[stage.id] = outcomeForRestart(stage);
      const output = outputs[stage.id];
      if (output !== undefined) {
        seededOutputs[stage.id] = output;
      }
    }

    this.cancelled.delete(runId);
    for (const stage of run.stages.slice(startIndex)) {
      stage.status = "pending";
      stage.logs = [];
      delete stage.startedAt;
      delete stage.completedAt;
      delete stage.verdict;
      delete outputs[stage.id];
    }
    run.stageOutputs = outputs;
    run.status = "running";
    if (orchestrationId !== undefined && this.questionMediator) {
      run.orchestrationId = orchestrationId;
      await this.questionMediator.attachRun(run.projectId, run.id);
    }
    delete run.completedAt;
    void this.store.flushPersist(runId);

    const profession = agentForStage(stageId).profession;
    void this.launch(this.registry.resolve(run.projectId), run, {
      startedMessage: `Restarted from ${profession}`,
      seededOutputs,
      seededOutcomes,
      startStageId: stageId,
    });
    return structuredClone(run);
  }

  private async launch(
    projectPath: ProjectPath,
    run: RunState,
    extras: InputExtras,
  ): Promise<void> {
    const pipeline = this.pipelineForRun(run);
    if (!pipeline) {
      throw new Error(`Unknown pipeline: ${run.pipelineId}`);
    }
    if (extras.startStageId !== undefined) {
      const admitted = await this.store.repositoryFor(projectPath).admitRun(run.id);
      if (!admitted) {
        this.markInterrupted(run.id);
        return;
      }
    }
    const runtime = this.runtimes.for(projectPath);
    await runtime.start();
    const input = this.buildInput(run, pipeline, extras);
    const openWorkflowRunId = await runtime.startRun(input);
    this.bindOpenWorkflowRun(run.id, openWorkflowRunId);
  }

  private buildInput(
    run: RunState,
    pipeline: PipelineDefinition,
    extras: InputExtras,
  ): PipelineWorkflowInput {
    return {
      runId: run.id,
      projectId: run.projectId,
      pipeline,
      task: run.task,
      engine: run.engine,
      model: run.model,
      permissionMode: this.store.enginePermissionModes.get(run.id) ?? DEFAULT_PERMISSION_MODE,
      workspacePath: run.workspacePath,
      startedMessage: extras.startedMessage,
      seededOutputs: extras.seededOutputs,
      seededOutcomes: extras.seededOutcomes,
      startStageId: extras.startStageId,
    };
  }
}
