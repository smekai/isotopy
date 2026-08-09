import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import nodepath from "node:path";
import type {
  EngineId,
  EngineLimit,
  LimitChoice,
  LimitResolution,
  MessageKind,
  MessageRole,
  PipelineDefinition,
  RunArtifactRecord,
  RunEvent,
  RunMessage,
  RunState,
  RunSummary,
  StageDefinition,
  StageLogDraft,
  StageOutcome,
  StageState,
  StageUsage,
  StageVerdict,
} from "@adhd/core";
import {
  DEFAULT_PERMISSION_MODE,
  DEMO_PIPELINES,
  ENGINES,
  addUsage,
  agentForStage,
  createInitialRunState,
  isTerminalRunStatus,
  pipelineUsesEngine,
  rosterAccepts,
  toRunSummary,
} from "@adhd/core";
import { CloseoutConsumer } from "../consumers/closeout-consumer.ts";
import { MilestonePlanConsumer } from "../consumers/milestone-plan-consumer.ts";
import { firstRejectionFrom } from "../consumers/stage-output-consumer.ts";
import type { StageOutputRejection } from "../../domain/rules/stage-context.ts";
import type { StageOutputConsumer } from "../consumers/stage-output-consumer.ts";
import { OrchestratorRequiredError } from "../../domain/orchestrator-required-error.ts";
import { assertEngineId, getEngineAdapter } from "../../engines/registry.ts";
import { ensureProjectDataDir, resolveWorkspace, runsDir } from "../../paths.ts";
import type { ProjectPath } from "../../paths.ts";
import {
  renderCancelledCleanupReport,
  renderRunArtifacts,
} from "../../domain/markdown/closeout.ts";
import type { ProjectRegistry } from "../project-registry.ts";
import { ModelRosterService } from "../model-roster-service.ts";
import { unknownModelMessage } from "../../domain/rules/model-roster.ts";
import { SettingsStore } from "../settings-store.ts";
import { WorkflowRuntimeRegistry } from "../../workflow/workflow-runtime.ts";
import type {
  OrchestrationHooks,
  PipelineWorkflowInput,
  RunCompletionStatus,
  RunProjection,
  WorkflowDeps,
} from "../../workflow/types.ts";
import { taskBoardFor } from "../task-board-adapter.ts";
import { MilestoneService } from "../milestone-service.ts";
import { ListenerRegistry } from "../../utils/listener-registry.ts";
import { LIMIT_ERRORS, LIMIT_LOG } from "../../domain/rules/limit-copy.ts";
import {
  formatLimitWait,
  limitWaitMs,
  selectionAfterLimit,
} from "../../domain/rules/engine-limit.ts";
import { formatHandoff } from "../../domain/markdown/stage.ts";
import {
  TERMINAL_OPENWORKFLOW_STATUSES,
  completionMessage,
  outcomeForRestart,
} from "../../domain/rules/run-lifecycle.ts";
import { nowIso } from "../../utils/time.ts";
import type { InheritedRunOptions, StartRunOptions } from "./run-options.ts";
import { RunStore } from "./run-store.ts";

export type { InheritedRunOptions, StartRunOptions } from "./run-options.ts";

export class RunService implements RunProjection {
  readonly store: RunStore;
  readonly milestones: MilestoneService;
  private readonly cancelled = new Set<string>();
  private readonly engineAborts = new Map<string, AbortController>();
  private readonly settings: SettingsStore;
  private readonly rosters: ModelRosterService;
  private readonly runtimes: WorkflowRuntimeRegistry;
  private readonly stageOutputConsumers: StageOutputConsumer[];
  private readonly listeners = new ListenerRegistry<RunEvent>();
  private readonly projectListeners = new ListenerRegistry<RunSummary>();
  private orchestration?: OrchestrationHooks;

  constructor(
    private readonly registry: ProjectRegistry,
    settings?: SettingsStore,
    rosters?: ModelRosterService,
  ) {
    this.settings = settings ?? new SettingsStore();
    this.rosters = rosters ?? new ModelRosterService();
    this.store = new RunStore(registry);
    this.milestones = new MilestoneService(registry, () => this);
    this.stageOutputConsumers = [
      new MilestonePlanConsumer(this.milestones),
      new CloseoutConsumer(this.registry),
    ];
    const deps: WorkflowDeps = {
      projection: this,
      registry: this.registry,
      settings: this.settings,
      rosters: this.rosters,
      orchestration: () => this.orchestration,
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
    this.orchestration?.reconcileRuns();
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
    return this.orchestration?.ensureActive(projectPath, goal);
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

  registerOrchestration(orchestration: OrchestrationHooks): void {
    this.orchestration = orchestration;
  }

  inheritedRunOptions(runId: string): InheritedRunOptions {
    const run = this.store.runs.get(runId);
    const permissionMode = this.store.enginePermissionModes.get(runId);
    return {
      ...(run?.engine === undefined ? {} : { engine: run.engine }),
      ...(run?.model === undefined ? {} : { model: run.model }),
      ...(run?.modelTier === undefined ? {} : { modelTier: run.modelTier }),
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
      modelTier,
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
      if (model !== undefined) {
        await this.requireOfferedModel(engineId, model);
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
      if (modelTier !== undefined) {
        run.modelTier = modelTier;
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
    if (activeOrchestrationId && this.orchestration) {
      await this.orchestration.attachRun(projectPath.id, runId);
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
      void taskBoardFor(this.registry.resolve(run.projectId))
        .transitionTasks(run.sourceTaskIds, "In Progress", run.id)
        .catch((error: unknown) =>
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
    if (orchestrationId !== undefined && this.orchestration) {
      run.orchestrationId = orchestrationId;
      await this.orchestration.attachRun(run.projectId, run.id);
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

  private appendMessage(run: RunState, draft: MessageDraft): RunMessage {
    const message: RunMessage = {
      id: randomUUID().slice(0, 8), ts: nowIso(), role: draft.role,
      stageId: draft.stageId, kind: draft.kind, text: draft.text,
    };
    run.messages.push(message);
    this.emit({
      ts: message.ts, type: "run.message", runId: run.id,
      stageId: message.stageId, chatMessage: message,
    });
    return message;
  }

  bindOpenWorkflowRun(runId: string, openWorkflowRunId: string): void {
    this.store.openWorkflowRunIds.set(runId, openWorkflowRunId);
    void this.store.flushPersist(runId);
  }

  runStarted(runId: string, message: string): void {
    const run = this.live(runId);
    if (!run) return;
    run.status = "running";
    this.emit({ ts: nowIso(), type: "run.started", runId, status: "running", message });
  }

  stageStarted(runId: string, stageId: string): void {
    if (!this.live(runId)) return;
    const stage = this.findStage(runId, stageId);
    if (!stage) return;
    stage.status = "running";
    stage.startedAt = nowIso();
    this.emit({ ts: nowIso(), type: "stage.started", runId, stageId, status: "running" });
  }

  log(runId: string, stageId: string, draft: StageLogDraft): void {
    const stage = this.findStage(runId, stageId);
    if (!stage) return;
    const ts = nowIso();
    stage.logs.push({ ts, ...draft });
    this.emit({ ts, type: "stage.log", runId, stageId, ...draft });
  }

  stageAwaiting(runId: string, stageId: string): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageId);
    if (!run || !stage) return;
    stage.status = "awaiting";
    run.status = "awaiting";
    this.emit({
      ts: nowIso(), type: "stage.awaiting", runId, stageId, status: "awaiting",
      message: `${agentForStage(stageId).profession} is waiting for your approval`,
    });
  }

  stageAsking(runId: string, stageId: string, question: string): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageId);
    if (!run || !stage) return;
    stage.status = "asking";
    run.status = "asking";
    this.appendMessage(run, { role: "agent", stageId, kind: "question", text: question });
    this.emit({ ts: nowIso(), type: "stage.asking", runId, stageId, status: "asking", message: question });
  }

  stageQuestion(runId: string, stageId: string, question: string): void {
    const run = this.live(runId);
    if (run) this.appendMessage(run, { role: "agent", stageId, text: question });
  }

  stageMediatedAnswer(runId: string, stageId: string, answer: string): void {
    const run = this.live(runId);
    if (run) this.appendMessage(run, { role: "agent", stageId, text: answer });
  }

  stageAnswered(runId: string, stageId: string): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageId);
    if (!run || !stage) return;
    stage.status = "running";
    run.status = "running";
    this.emit({
      ts: nowIso(), type: "stage.answered", runId, stageId, status: "running",
      message: `${agentForStage(stageId).profession} is continuing`,
    });
  }

  stageBlocked(runId: string, stageId: string, limit: EngineLimit, attempt: number): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageId);
    if (!run || !stage || !run.engine) return;
    const ts = nowIso();
    stage.status = "blocked";
    run.status = "blocked";
    run.limit = {
      stageId, engine: run.engine, model: run.model, raw: limit.raw,
      resetAt: limit.resetAt, detectedAt: ts, attempt,
    };
    const profession = agentForStage(stageId).profession;
    const message = LIMIT_LOG.blocked(profession, formatLimitWait(limitWaitMs(limit)));
    this.log(runId, stageId, { level: "warn", message });
    this.emit({ ts, type: "stage.blocked", runId, stageId, status: "blocked", message, limit: run.limit });
  }

  limitResolved(runId: string, stageId: string, choice?: LimitChoice): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageId);
    if (!run || !stage || stage.status !== "blocked") return;
    stage.status = "running";
    run.status = "running";
    delete run.limit;
    const profession = agentForStage(stageId).profession;
    const message = LIMIT_LOG.resuming(profession, choice);
    this.log(runId, stageId, { level: "run", message });
    this.emit({ ts: nowIso(), type: "stage.unblocked", runId, stageId, status: "running", message });
  }

  resolveLimit(runId: string, stageId: string, resolution: LimitResolution): RunState {
    const run = this.store.runs.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    const stage = this.requireStage(runId, stageId);
    if (stage.status !== "blocked") throw new Error(LIMIT_ERRORS.notBlocked(stageId));
    const openWorkflowRunId = this.store.openWorkflowRunIds.get(runId);
    if (!openWorkflowRunId) throw new Error(LIMIT_ERRORS.noDurableRun(runId));
    const current = { engine: run.engine, model: run.model, modelTier: run.modelTier };
    const selection = selectionAfterLimit(current, resolution);
    run.engine = selection.engine;
    if (selection.model === undefined) delete run.model;
    else run.model = selection.model;
    if (selection.modelTier === undefined) delete run.modelTier;
    else run.modelTier = selection.modelTier;
    this.limitResolved(runId, stageId, resolution.choice);
    void this.store.flushPersist(runId);
    void this.runtimes.forProject(run.projectId).resolveLimit(runId, stageId, resolution.choice);
    return structuredClone(run);
  }

  private async requireOfferedModel(engineId: EngineId, modelId: string): Promise<void> {
    const roster = await this.rosters.roster(engineId);
    if (!rosterAccepts(roster, modelId)) {
      throw new Error(unknownModelMessage(engineId, modelId));
    }
  }

  gateApproved(runId: string, stageId: string): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageId);
    if (!run || !stage || stage.status !== "awaiting") return;
    const profession = agentForStage(stageId).profession;
    stage.status = "passed";
    stage.completedAt = nowIso();
    run.status = "running";
    this.log(runId, stageId, { level: "pass", message: `✓ Gate approved — ${profession} cleared to proceed` });
    this.emit({
      ts: nowIso(), type: "stage.approved", runId, stageId, status: "passed",
      message: `Gate approved for ${profession}`,
    });
  }

  stagePassed(runId: string, stageId: string): void {
    if (!this.live(runId)) return;
    const stage = this.findStage(runId, stageId);
    if (!stage) return;
    stage.completedAt = nowIso();
    stage.status = "passed";
    this.emit({
      ts: nowIso(), type: "stage.completed", runId, stageId, status: "passed",
      message: `${agentForStage(stageId).profession} completed`,
    });
  }

  stageSkipped(runId: string, stageId: string): void {
    if (!this.live(runId)) return;
    const stage = this.findStage(runId, stageId);
    if (!stage) return;
    const completedAt = nowIso();
    stage.completedAt = completedAt;
    stage.status = "skipped";
    this.emit({
      ts: completedAt, type: "stage.skipped", runId, stageId, status: "skipped",
      message: `${agentForStage(stageId).profession} skipped`,
    });
  }

  stageFailed(runId: string, stageId: string, message: string): void {
    if (!this.live(runId)) return;
    const stage = this.findStage(runId, stageId);
    if (!stage) return;
    stage.completedAt = nowIso();
    stage.status = "failed";
    this.log(runId, stageId, { level: "fail", message: `✗ ${message}` });
    this.emit({ ts: nowIso(), type: "stage.failed", runId, stageId, status: "failed", message });
  }

  setVerdict(runId: string, stageId: string, verdict: StageVerdict): void {
    const stage = this.findStage(runId, stageId);
    if (stage) stage.verdict = verdict;
  }

  stageUsage(runId: string, stageId: string, usage: StageUsage): void {
    const stage = this.findStage(runId, stageId);
    if (!stage) return;
    stage.usage = addUsage(stage.usage, usage);
    this.emit({ ts: nowIso(), type: "stage.usage", runId, stageId, usage: stage.usage });
    void this.store.flushPersist(runId);
  }

  async captureStageOutput(
    runId: string,
    stageDef: StageDefinition,
    output: string,
  ): Promise<StageOutputRejection | undefined> {
    const run = this.live(runId);
    if (!run) return undefined;
    if (output.trim() !== "") {
      run.stageOutputs = { ...run.stageOutputs, [stageDef.id]: output };
      run.result = output;
      await this.store.repositoryForRun(runId).writeHandoff(
        runId,
        stageDef.id,
        formatHandoff(
          {
            stageLabel: stageDef.label,
            profession: agentForStage(stageDef.id).profession,
            engine: this.engineLabel(run),
            model: run.model,
            completedAt: nowIso(),
          },
          output,
        ),
      );
    }
    const rejection = await firstRejectionFrom(
      this.stageOutputConsumers,
      run,
      stageDef,
      output,
    );
    void this.store.flushPersist(runId);
    return rejection;
  }

  async captureRunArtifacts(runId: string, record: RunArtifactRecord): Promise<void> {
    const run = this.live(runId);
    if (!run) return;
    run.artifacts = record;
    await persistRunArtifacts(this.registry.resolve(run.projectId), runId, record);
    void this.store.flushPersist(runId);
  }

  applySeededOutput(runId: string, stageDef: StageDefinition, output: string): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageDef.id);
    if (!run || !stage) return;
    run.stageOutputs = { ...run.stageOutputs, [stageDef.id]: output };
    run.result = output;
  }

  runCompleted(runId: string, status: RunCompletionStatus): void {
    const run = this.live(runId);
    if (!run) return;
    run.status = status;
    run.completedAt = nowIso();
    this.emit({
      ts: nowIso(), type: "run.completed", runId, status,
      message: completionMessage(status), result: run.result,
    });
    void this.settleCompletedRun(run);
  }

  private markCancelled(runId: string): void {
    const run = this.store.runs.get(runId);
    if (!run || isTerminalRunStatus(run.status)) return;
    for (const stage of run.stages) {
      if (
        stage.status === "pending" ||
        stage.status === "running" ||
        stage.status === "awaiting" ||
        stage.status === "asking" ||
        stage.status === "blocked"
      ) {
        stage.status = "skipped";
        this.emit({ ts: nowIso(), type: "stage.skipped", runId, stageId: stage.id, status: "skipped" });
      }
    }
    delete run.limit;
    run.status = "cancelled";
    run.completedAt = nowIso();
    this.emit({ ts: nowIso(), type: "run.completed", runId, status: "cancelled", message: "Run aborted" });
  }

  private markInterrupted(runId: string): void {
    const run = this.store.runs.get(runId);
    if (!run || isTerminalRunStatus(run.status)) return;
    const ts = nowIso();
    for (const stage of run.stages) {
      if (
        stage.status === "running" ||
        stage.status === "awaiting" ||
        stage.status === "asking" ||
        stage.status === "blocked"
      ) {
        stage.status = "failed";
        stage.completedAt = ts;
        this.log(runId, stage.id, { level: "fail", message: "✗ Interrupted by server restart" });
      }
    }
    delete run.limit;
    run.status = "failed";
    run.completedAt = ts;
    this.emit({ ts, type: "run.completed", runId, status: "failed", message: "Interrupted by server restart" });
    void this.settleCompletedRun(run);
  }

  private beginEngineStage(runId: string): AbortController {
    const controller = new AbortController();
    this.engineAborts.set(runId, controller);
    return controller;
  }

  private endEngineStage(runId: string): void {
    this.engineAborts.delete(runId);
  }

  private live(runId: string): RunState | undefined {
    const run = this.store.runs.get(runId);
    return run && !isTerminalRunStatus(run.status) ? run : undefined;
  }

  private findStage(runId: string, stageId: string): StageState | undefined {
    return this.store.runs.get(runId)?.stages.find((stage) => stage.id === stageId);
  }

  private requireStage(runId: string, stageId: string): StageState {
    const stage = this.findStage(runId, stageId);
    if (!stage) {
      throw new Error(`Stage not found: ${stageId}`);
    }
    return stage;
  }

  private engineLabel(run: RunState): string {
    return run.engine ? ENGINES[run.engine].label : UNKNOWN_ENGINE_LABEL;
  }

  private emit(event: RunEvent): void {
    void this.store.repositoryForRun(event.runId)
      .appendEvent(event.runId, event)
      .catch((error) => console.warn(`Failed to persist event for run ${event.runId}:`, error));
    if (event.type !== "stage.log") {
      void this.store.flushPersist(event.runId);
    }
    this.listeners.emit(event.runId, event);
    this.publishSummary(event);
  }

  private publishSummary(event: RunEvent): void {
    if (event.type === "stage.log") return;
    const run = this.store.runs.get(event.runId);
    if (!run || !this.projectListeners.has(run.projectId)) {
      return;
    }
    this.projectListeners.emit(run.projectId, toRunSummary(run));
  }

  private async settleCompletedRun(run: RunState): Promise<void> {
    await this.store.repositoryForRun(run.id).releaseRun(run.id);
    await this.milestones.completeMilestoneRun(run);
    await this.orchestration?.settle(run.id);
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

interface InputExtras {
  startedMessage: string;
  seededOutputs?: Record<string, string>;
  seededOutcomes?: Record<string, StageOutcome>;
  startStageId?: string;
}

interface MessageDraft {
  role: MessageRole;
  stageId?: string;
  kind?: MessageKind;
  text: string;
}

type RunListener = (event: RunEvent) => void;
type RunSummaryListener = (summary: RunSummary) => void;

const ORCHESTRATION_PIPELINE_ID = "orchestration";
const UNKNOWN_ENGINE_LABEL = "unknown";

async function persistRunArtifacts(
  projectPath: ProjectPath,
  runId: string,
  record: RunArtifactRecord,
): Promise<void> {
  const artifactsDir = nodepath.join(runsDir(projectPath), runId, "artifacts");
  await mkdir(artifactsDir, { recursive: true });
  await Promise.all([
    writeFile(
      nodepath.join(artifactsDir, "artifacts.json"),
      `${JSON.stringify(record, null, 2)}\n`,
    ),
    writeFile(
      nodepath.join(artifactsDir, "artifacts.md"),
      renderRunArtifacts(record.report),
    ),
  ]);
}

async function cleanupCancelledRun(
  projectPath: ProjectPath,
  runId: string,
): Promise<void> {
  const tempRoot = nodepath.join(runsDir(projectPath), runId, "tmp");
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 3 });
  const closeoutDir = nodepath.join(runsDir(projectPath), runId, "closeout");
  await mkdir(closeoutDir, { recursive: true });
  await writeFile(
    nodepath.join(closeoutDir, "cleanup-report.md"),
    renderCancelledCleanupReport(),
  );
}
