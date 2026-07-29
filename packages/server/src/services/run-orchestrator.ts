import { randomUUID } from "node:crypto";
import type {
  CreateMilestoneFeatureInput,
  CreateMilestoneInput,
  EnginePermissionMode,
  LogLevel,
  MessageKind,
  MessageRole,
  Milestone,
  MilestoneFeature,
  MilestoneProposal,
  PipelineDefinition,
  RunEvent,
  RunMessage,
  RunState,
  RunSummary,
  StageDefinition,
  StageOutcome,
  StageState,
  StageUsage,
  StageVerdict,
  UpdateMilestoneFeatureInput,
  UpdateMilestoneInput,
} from "@adhd/core";
import {
  DEFAULT_PERMISSION_MODE,
  DEMO_PIPELINES,
  ENGINES,
  addUsage,
  agentForStage,
  createInitialRunState,
  isTerminalRunStatus,
  nextMilestoneFeature,
  STAGE_OUTCOMES,
  pipelineUsesEngine,
  toRunSummary,
} from "@adhd/core";
import { ListenerRegistry } from "./listener-registry.ts";
import { assertEngineId, getEngineAdapter } from "../engines/registry.ts";
import { ensureProjectDataDir, resolveWorkspace } from "../paths.ts";
import type { ProjectPath } from "../paths.ts";
import type { ProjectRegistry } from "./project-registry.ts";
import { RunRepository } from "../repository/run-repository.ts";
import type { PersistedRun } from "../repository/run-repository.ts";
import { MilestoneRepository } from "../repository/milestone-repository.ts";
import { SettingsStore } from "./settings-store.ts";
import { formatHandoff } from "../domain/stage-context.ts";
import { parseMilestonePlan } from "../domain/milestone-plan.ts";
import { nowIso } from "../utils.ts";
import { WorkflowRuntimeRegistry } from "../workflow/workflow-runtime.ts";
import type {
  PipelineWorkflowInput,
  RunCompletionStatus,
  RunProjection,
  WorkflowDeps,
} from "../workflow/types.ts";
import {
  approveMilestoneTasks,
  taskBoardPlanningContext,
  transitionTasks,
} from "./task-board-adapter.ts";
import {
  applyProductManagerCloseout,
  cleanupCancelledRun,
  milestoneCloseoutContext,
  persistMilestoneSummary,
} from "./product-manager-closeout.ts";

const PERSIST_DEBOUNCE_MS = 150;

const UNKNOWN_ENGINE_LABEL = "unknown";

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

function completionMessage(status: RunCompletionStatus): string {
  if (status === "completed") {
    return "Run completed successfully";
  }
  if (status === "needs_attention") {
    return "Run needs attention";
  }
  return "Run failed";
}

const TERMINAL_OPENWORKFLOW_STATUSES = new Set([
  "succeeded",
  "completed",
  "failed",
  "canceled",
]);

type RunListener = (event: RunEvent) => void;

type RunSummaryListener = (summary: RunSummary) => void;

export interface StartRunOptions {
  task?: string | undefined;
  engine?: string | undefined;
  model?: string | undefined;
  permissionMode?: string | undefined;
  milestoneId?: string | undefined;
  featureId?: string | undefined;
  sourceTaskIds?: string[] | undefined;
}

export interface RunOrchestratorDependencies {
  registry: ProjectRegistry;
  settings?: SettingsStore;
}

interface InputExtras {
  startedMessage: string;
  seededOutputs?: Record<string, string> | undefined;
  seededOutcomes?: Record<string, StageOutcome> | undefined;
  startStageId?: string | undefined;
}

interface MessageDraft {
  role: MessageRole;
  stageId?: string | undefined;
  kind?: MessageKind | undefined;
  text: string;
}

export class RunOrchestrator implements RunProjection {
  private readonly runs = new Map<string, RunState>();
  private readonly listeners = new ListenerRegistry<RunEvent>();
  private readonly projectListeners = new ListenerRegistry<RunSummary>();
  private readonly cancelled = new Set<string>();
  private readonly engineAborts = new Map<string, AbortController>();
  private readonly enginePermissionModes = new Map<string, EnginePermissionMode>();
  private readonly persistTimers = new Map<string, NodeJS.Timeout>();
  private readonly repositories = new Map<string, RunRepository>();
  private readonly milestoneRepositories = new Map<string, MilestoneRepository>();
  private readonly milestones = new Map<string, Milestone>();
  private readonly completingMilestoneRuns = new Set<string>();
  private readonly nextRunNumbers = new Map<string, number>();
  private readonly openWorkflowRunIds = new Map<string, string>();
  private readonly registry: ProjectRegistry;
  private readonly settings: SettingsStore;
  private readonly runtimes: WorkflowRuntimeRegistry;

  constructor({ registry, settings }: RunOrchestratorDependencies) {
    this.registry = registry;
    this.settings = settings ?? new SettingsStore();
    const deps: WorkflowDeps = {
      projection: this,
      registry: this.registry,
      settings: this.settings,
      beginEngineStage: (runId) => this.beginEngineStage(runId),
      endEngineStage: (runId) => this.endEngineStage(runId),
      isCancelled: (runId) => this.cancelled.has(runId),
    };
    this.runtimes = new WorkflowRuntimeRegistry(deps, this.registry);
  }

  async init(): Promise<void> {
    for (const project of this.registry.all()) {
      const projectPath = this.registry.resolve(project.id);
      await this.loadProject(projectPath);
      await this.runtimes.for(projectPath).start();
    }
  }

  async shutdown(): Promise<void> {
    for (const controller of this.engineAborts.values()) {
      controller.abort();
    }
    await this.runtimes.stopAll();
    await Promise.all([...this.runs.keys()].map((runId) => this.flushPersist(runId)));
    await Promise.all(
      [...this.repositories.values()].map((repository) => repository.settle()),
    );
    await Promise.all(
      [...this.milestoneRepositories.values()].map((repository) =>
        repository.settle(),
      ),
    );
  }

  private async loadProject(projectPath: ProjectPath): Promise<void> {
    for (const milestone of await this.milestoneRepositoryFor(projectPath).loadAll()) {
      milestone.projectId = projectPath.id;
      this.milestones.set(milestone.id, milestone);
    }
    const loaded = await this.repositoryFor(projectPath).loadAll();
    let maxNumber = this.nextRunNumbers.get(projectPath.id) ?? 1;
    for (const persisted of loaded) {
      const { run } = persisted;
      run.projectId = projectPath.id;
      this.runs.set(run.id, run);
      if (persisted.permissionMode) {
        this.enginePermissionModes.set(run.id, persisted.permissionMode);
      }
      if (persisted.openWorkflowRunId) {
        this.openWorkflowRunIds.set(run.id, persisted.openWorkflowRunId);
      }
      maxNumber = Math.max(maxNumber, run.number + 1);
      if (!isTerminalRunStatus(run.status)) {
        await this.reconcileOnLoad(projectPath, run);
      }
    }
    this.nextRunNumbers.set(projectPath.id, maxNumber);
  }

  private async reconcileOnLoad(projectPath: ProjectPath, run: RunState): Promise<void> {
    const openWorkflowRunId = this.openWorkflowRunIds.get(run.id);
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
    await this.repositoryForRun(run.id).releaseRun(run.id);
    await this.completeMilestoneRun(run);
  }

  listPipelines(): PipelineDefinition[] {
    return DEMO_PIPELINES.filter((pipeline) => pipeline.internal !== true);
  }

  getPipeline(pipelineId: string): PipelineDefinition | undefined {
    return DEMO_PIPELINES.find((pipeline) => pipeline.id === pipelineId);
  }

  listRuns(projectId: string): RunState[] {
    return [...this.runs.values()]
      .filter((run) => run.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getRun(runId: string): RunState | undefined {
    return this.runs.get(runId);
  }

  listMilestones(projectId: string): Milestone[] {
    return [...this.milestones.values()]
      .filter((milestone) => milestone.projectId === projectId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((milestone) => structuredClone(milestone));
  }

  getMilestone(milestoneId: string): Milestone | undefined {
    const milestone = this.milestones.get(milestoneId);
    return milestone ? structuredClone(milestone) : undefined;
  }

  async createMilestone(
    projectPath: ProjectPath,
    input: CreateMilestoneInput,
  ): Promise<Milestone> {
    const name = input.name.trim();
    if (!name) {
      throw new Error("Milestone name is required");
    }
    const now = nowIso();
    const milestone: Milestone = {
      id: randomUUID().slice(0, 8),
      projectId: projectPath.id,
      name,
      goal: input.goal?.trim() || undefined,
      status: input.status ?? "active",
      autoRunNext: input.autoRunNext ?? false,
      features: (input.features ?? []).map((feature) =>
        this.newMilestoneFeature(feature, now),
      ),
      planningRunIds: [],
      createdAt: now,
      updatedAt: now,
    };
    this.milestones.set(milestone.id, milestone);
    await this.persistMilestone(milestone);
    return structuredClone(milestone);
  }

  async startMilestonePlanning(
    projectPath: ProjectPath,
    goalInput: string,
    options: Omit<StartRunOptions, "task" | "milestoneId" | "featureId">,
  ): Promise<RunState> {
    const goal = goalInput.trim();
    if (!goal) {
      throw new Error("Milestone goal is required");
    }
    const milestone = await this.createMilestone(projectPath, {
      name: "Draft milestone",
      goal,
      status: "draft",
    });
    return this.startPlanningTurn(projectPath, milestone.id, goal, options);
  }

  async reviseMilestonePlan(
    projectPath: ProjectPath,
    milestoneId: string,
    feedbackInput: string,
    options: Omit<StartRunOptions, "task" | "milestoneId" | "featureId">,
  ): Promise<RunState> {
    const milestone = this.requireMilestone(projectPath.id, milestoneId);
    if (milestone.status !== "draft") {
      throw new Error("Only draft milestones can be revised");
    }
    const feedback = feedbackInput.trim();
    if (!feedback) {
      throw new Error("Revision feedback is required");
    }
    const task = [
      `Original milestone goal:\n${milestone.goal ?? milestone.name}`,
      milestone.proposal
        ? `Current proposal:\n${JSON.stringify(milestone.proposal, null, 2)}`
        : undefined,
      `User revision request:\n${feedback}`,
    ]
      .filter((value): value is string => value !== undefined)
      .join("\n\n");
    return this.startPlanningTurn(projectPath, milestone.id, task, options);
  }

  async updateMilestoneProposal(
    projectPath: ProjectPath,
    milestoneId: string,
    proposalInput: Omit<MilestoneProposal, "revision" | "createdAt">,
  ): Promise<Milestone> {
    const milestone = this.requireMilestone(projectPath.id, milestoneId);
    if (milestone.status !== "draft") {
      throw new Error("Only draft milestone proposals can be edited");
    }
    const parsed = parseMilestonePlan(
      `\`\`\`adhd-milestone-plan\n${JSON.stringify(proposalInput)}\n\`\`\``,
      (milestone.proposal?.revision ?? 0) + 1,
      nowIso(),
    );
    if (!parsed.proposal) {
      throw new Error(parsed.errors.join("; "));
    }
    milestone.proposal = parsed.proposal;
    milestone.name = parsed.proposal.name;
    milestone.goal = parsed.proposal.goal;
    delete milestone.approvalError;
    milestone.updatedAt = nowIso();
    await this.persistMilestone(milestone);
    return structuredClone(milestone);
  }

  async approveMilestonePlan(
    projectPath: ProjectPath,
    milestoneId: string,
  ): Promise<Milestone> {
    const milestone = this.requireMilestone(projectPath.id, milestoneId);
    if (milestone.status !== "draft") {
      throw new Error("Only draft milestones can be approved");
    }
    if (!milestone.proposal) {
      throw new Error("Milestone has no valid proposal");
    }
    try {
      const links = await approveMilestoneTasks(
        projectPath,
        milestone,
        milestone.proposal,
      );
      const now = nowIso();
      milestone.features = milestone.proposal.features.map((feature) => ({
        id: feature.id,
        title: feature.title,
        description: feature.description,
        acceptanceCriteria: [...feature.acceptanceCriteria],
        status: "ready",
        taskIds: links.featureTaskIds[feature.id] ?? [],
        runIds: [],
        findings: [],
        createdAt: now,
        updatedAt: now,
      }));
      milestone.name = milestone.proposal.name;
      milestone.goal = milestone.proposal.goal;
      milestone.status = "active";
      milestone.updatedAt = now;
      delete milestone.approvalError;
      await this.persistMilestone(milestone);
      return structuredClone(milestone);
    } catch (error) {
      milestone.approvalError =
        error instanceof Error ? error.message : "Milestone approval failed";
      milestone.updatedAt = nowIso();
      await this.persistMilestone(milestone);
      throw error;
    }
  }

  async updateMilestone(
    projectPath: ProjectPath,
    milestoneId: string,
    input: UpdateMilestoneInput,
  ): Promise<Milestone> {
    const milestone = this.requireMilestone(projectPath.id, milestoneId);
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new Error("Milestone name cannot be empty");
      }
      milestone.name = name;
    }
    if (input.goal !== undefined) {
      if (input.goal === null || input.goal.trim() === "") {
        delete milestone.goal;
      } else {
        milestone.goal = input.goal.trim();
      }
    }
    if (input.autoRunNext !== undefined) {
      milestone.autoRunNext = input.autoRunNext;
    }
    if (input.status !== undefined) {
      milestone.status = input.status;
      if (input.status === "completed") {
        milestone.completedAt = nowIso();
      } else {
        delete milestone.completedAt;
      }
    }
    milestone.updatedAt = nowIso();
    await this.persistMilestone(milestone);
    return structuredClone(milestone);
  }

  async addMilestoneFeature(
    projectPath: ProjectPath,
    milestoneId: string,
    input: CreateMilestoneFeatureInput,
  ): Promise<Milestone> {
    const milestone = this.requireMilestone(projectPath.id, milestoneId);
    const now = nowIso();
    milestone.features.push(this.newMilestoneFeature(input, now));
    milestone.updatedAt = now;
    await this.persistMilestone(milestone);
    return structuredClone(milestone);
  }

  async updateMilestoneFeature(
    projectPath: ProjectPath,
    milestoneId: string,
    featureId: string,
    input: UpdateMilestoneFeatureInput,
  ): Promise<Milestone> {
    const milestone = this.requireMilestone(projectPath.id, milestoneId);
    const feature = this.requireMilestoneFeature(milestone, featureId);
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) {
        throw new Error("Feature title cannot be empty");
      }
      feature.title = title;
    }
    if (input.description !== undefined) {
      if (input.description === null || input.description.trim() === "") {
        delete feature.description;
      } else {
        feature.description = input.description.trim();
      }
    }
    if (input.acceptanceCriteria !== undefined) {
      feature.acceptanceCriteria = this.cleanStrings(input.acceptanceCriteria);
    }
    if (input.taskIds !== undefined) {
      feature.taskIds = this.cleanStrings(input.taskIds);
    }
    if (input.status !== undefined) {
      feature.status = input.status;
      if (input.status === "completed") {
        feature.completedAt = nowIso();
      } else {
        delete feature.completedAt;
      }
    }
    const now = nowIso();
    feature.updatedAt = now;
    milestone.updatedAt = now;
    await this.persistMilestone(milestone);
    return structuredClone(milestone);
  }

  async finalizeMilestone(
    projectPath: ProjectPath,
    milestoneId: string,
  ): Promise<Milestone> {
    const milestone = this.requireMilestone(projectPath.id, milestoneId);
    const unfinished = milestone.features.filter(
      (feature) => feature.status !== "completed",
    );
    if (unfinished.length > 0) {
      throw new Error(
        `Milestone has ${unfinished.length} unfinished feature${unfinished.length === 1 ? "" : "s"}`,
      );
    }
    const now = nowIso();
    milestone.status = "completed";
    milestone.completedAt = now;
    milestone.updatedAt = now;
    await this.persistMilestone(milestone);
    await persistMilestoneSummary(
      projectPath,
      milestone,
      [...this.runs.values()],
    );
    return structuredClone(milestone);
  }

  async startNextMilestoneRun(
    projectPath: ProjectPath,
    milestoneId: string,
    options: Omit<
      StartRunOptions,
      "task" | "milestoneId" | "featureId" | "sourceTaskIds"
    > = {},
  ): Promise<RunState> {
    const milestone = this.requireMilestone(projectPath.id, milestoneId);
    if (milestone.status !== "active") {
      throw new Error(`Milestone is ${milestone.status}`);
    }
    if (milestone.features.some((feature) => feature.status === "in_progress")) {
      throw new Error("Milestone already has a feature run in progress");
    }
    const feature = nextMilestoneFeature(milestone);
    if (!feature) {
      throw new Error("Milestone has no ready feature");
    }
    const task = [
      `Milestone: ${milestone.name}`,
      milestone.goal ? `Milestone goal: ${milestone.goal}` : undefined,
      `Feature: ${feature.title}`,
      feature.description,
      feature.acceptanceCriteria.length > 0
        ? `Acceptance criteria:\n${feature.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}`
        : undefined,
      feature.taskIds.length > 0
        ? `Source tasks: ${feature.taskIds.join(", ")}`
        : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n\n");
    return this.startRun(projectPath, "full-delivery", {
      ...options,
      task,
      milestoneId: milestone.id,
      featureId: feature.id,
      sourceTaskIds: feature.taskIds,
    });
  }

  subscribe(runId: string, listener: RunListener): () => void {
    return this.listeners.add(runId, listener);
  }

  subscribeProject(projectId: string, listener: RunSummaryListener): () => void {
    return this.projectListeners.add(projectId, listener);
  }

  async replayEvents(runId: string): Promise<RunEvent[]> {
    return this.repositoryForRun(runId).loadEvents(runId);
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

    const {
      task,
      engine,
      model,
      permissionMode,
      milestoneId,
      featureId,
      sourceTaskIds,
    } = options;
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
        ? this.requireMilestone(projectPath.id, milestoneId)
        : undefined;
    const linkedFeature =
      linkedMilestone && featureId !== undefined
        ? this.requireMilestoneFeature(linkedMilestone, featureId)
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
    const admitted = await this.repositoryFor(projectPath).admitRun(runId);
    if (!admitted) {
      throw new Error(
        "A run is already active in this project — wait for it to finish or abort it before starting another.",
      );
    }

    const run = createInitialRunState({
      runId,
      number: this.takeRunNumber(projectPath.id),
      projectId: projectPath.id,
      pipeline,
      task,
      milestoneId,
      featureId,
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
      this.enginePermissionModes.set(
        runId,
        permissionMode === "acceptEdits" ? "acceptEdits" : DEFAULT_PERMISSION_MODE,
      );
    }

    this.runs.set(runId, run);
    if (planningRun && linkedMilestone) {
      linkedMilestone.planningRunIds.push(runId);
      linkedMilestone.updatedAt = nowIso();
      await this.persistMilestone(linkedMilestone);
    }
    if (linkedMilestone && linkedFeature) {
      linkedFeature.status = "in_progress";
      linkedFeature.runIds.push(runId);
      linkedFeature.updatedAt = nowIso();
      linkedMilestone.updatedAt = linkedFeature.updatedAt;
      await this.persistMilestone(linkedMilestone);
    }
    await this.flushPersist(runId);

    await this.launch(projectPath, run, { startedMessage: `Started pipeline: ${pipeline.name}` });
    return structuredClone(run);
  }

  approveGate(runId: string, stageId: string): RunState {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const stage = this.requireStage(runId, stageId);
    if (stage.status !== "awaiting") {
      throw new Error(`Stage ${stageId} is not awaiting approval`);
    }
    const openWorkflowRunId = this.openWorkflowRunIds.get(runId);
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
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    if (isTerminalRunStatus(run.status)) {
      throw new Error(`Run ${runId} is already finished`);
    }

    this.cancelled.add(runId);
    this.engineAborts.get(runId)?.abort();
    const openWorkflowRunId = this.openWorkflowRunIds.get(runId);
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
    const run = this.runs.get(runId);
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

  private appendMessage(run: RunState, draft: MessageDraft): RunMessage {
    const message: RunMessage = {
      id: randomUUID().slice(0, 8),
      ts: nowIso(),
      role: draft.role,
      stageId: draft.stageId,
      kind: draft.kind,
      text: draft.text,
    };
    run.messages.push(message);
    this.emit({
      ts: message.ts,
      type: "run.message",
      runId: run.id,
      stageId: message.stageId,
      chatMessage: message,
    });
    return message;
  }

  restartRun(runId: string, stageId: string): RunState {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    if (
      run.status !== "needs_attention" &&
      run.status !== "failed" &&
      run.status !== "cancelled"
    ) {
      throw new Error(
        `Run ${runId} can only be restarted after needing attention, failing, or being aborted`,
      );
    }
    if (!this.getPipeline(run.pipelineId)) {
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
    delete run.completedAt;
    void this.flushPersist(runId);

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
    if (extras.startStageId !== undefined) {
      const admitted = await this.repositoryFor(projectPath).admitRun(run.id);
      if (!admitted) {
        this.markInterrupted(run.id);
        return;
      }
    }
    const runtime = this.runtimes.for(projectPath);
    await runtime.start();
    const input = this.buildInput(run, extras);
    const openWorkflowRunId = await runtime.startRun(input);
    this.bindOpenWorkflowRun(run.id, openWorkflowRunId);
  }

  private buildInput(run: RunState, extras: InputExtras): PipelineWorkflowInput {
    const pipeline = this.getPipeline(run.pipelineId);
    if (!pipeline) {
      throw new Error(`Unknown pipeline: ${run.pipelineId}`);
    }
    return {
      runId: run.id,
      projectId: run.projectId,
      pipeline,
      task: run.task,
      engine: run.engine,
      model: run.model,
      permissionMode: this.enginePermissionModes.get(run.id) ?? DEFAULT_PERMISSION_MODE,
      workspacePath: run.workspacePath,
      startedMessage: extras.startedMessage,
      seededOutputs: extras.seededOutputs,
      seededOutcomes: extras.seededOutcomes,
      startStageId: extras.startStageId,
    };
  }

  bindOpenWorkflowRun(runId: string, openWorkflowRunId: string): void {
    this.openWorkflowRunIds.set(runId, openWorkflowRunId);
    this.schedulePersist(runId, true);
  }

  runStarted(runId: string, message: string): void {
    const run = this.live(runId);
    if (!run) {
      return;
    }
    run.status = "running";
    this.emit({ ts: nowIso(), type: "run.started", runId, status: "running", message });
  }

  stageStarted(runId: string, stageId: string): void {
    if (!this.live(runId)) {
      return;
    }
    const stage = this.findStage(runId, stageId);
    if (!stage) {
      return;
    }
    stage.status = "running";
    stage.startedAt = nowIso();
    this.emit({ ts: nowIso(), type: "stage.started", runId, stageId, status: "running" });
  }

  log(runId: string, stageId: string, level: LogLevel, message: string): void {
    const stage = this.findStage(runId, stageId);
    if (!stage) {
      return;
    }
    const ts = nowIso();
    stage.logs.push({ ts, level, message });
    this.emit({ ts, type: "stage.log", runId, stageId, message, level });
  }

  stageAwaiting(runId: string, stageId: string): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageId);
    if (!run || !stage) {
      return;
    }
    stage.status = "awaiting";
    run.status = "awaiting";
    this.emit({
      ts: nowIso(),
      type: "stage.awaiting",
      runId,
      stageId,
      status: "awaiting",
      message: `${agentForStage(stageId).profession} is waiting for your approval`,
    });
  }

  stageAsking(runId: string, stageId: string, question: string): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageId);
    if (!run || !stage) {
      return;
    }
    stage.status = "asking";
    run.status = "asking";
    this.appendMessage(run, { role: "agent", stageId, kind: "question", text: question });
    this.emit({
      ts: nowIso(),
      type: "stage.asking",
      runId,
      stageId,
      status: "asking",
      message: question,
    });
  }

  stageAnswered(runId: string, stageId: string): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageId);
    if (!run || !stage) {
      return;
    }
    stage.status = "running";
    run.status = "running";
    this.emit({
      ts: nowIso(),
      type: "stage.answered",
      runId,
      stageId,
      status: "running",
      message: `${agentForStage(stageId).profession} is continuing`,
    });
  }

  gateApproved(runId: string, stageId: string): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageId);
    if (!run || !stage || stage.status !== "awaiting") {
      return;
    }
    const profession = agentForStage(stageId).profession;
    stage.status = "passed";
    stage.completedAt = nowIso();
    run.status = "running";
    this.log(runId, stageId, "pass", `✓ Gate approved — ${profession} cleared to proceed`);
    this.emit({
      ts: nowIso(),
      type: "stage.approved",
      runId,
      stageId,
      status: "passed",
      message: `Gate approved for ${profession}`,
    });
  }

  stagePassed(runId: string, stageId: string): void {
    if (!this.live(runId)) {
      return;
    }
    const stage = this.findStage(runId, stageId);
    if (!stage) {
      return;
    }
    stage.completedAt = nowIso();
    stage.status = "passed";
    this.emit({
      ts: nowIso(),
      type: "stage.completed",
      runId,
      stageId,
      status: "passed",
      message: `${agentForStage(stageId).profession} completed`,
    });
  }

  stageSkipped(runId: string, stageId: string): void {
    if (!this.live(runId)) {
      return;
    }
    const stage = this.findStage(runId, stageId);
    if (!stage) {
      return;
    }
    const completedAt = nowIso();
    stage.completedAt = completedAt;
    stage.status = "skipped";
    this.emit({
      ts: completedAt,
      type: "stage.skipped",
      runId,
      stageId,
      status: "skipped",
      message: `${agentForStage(stageId).profession} skipped`,
    });
  }

  stageFailed(runId: string, stageId: string, message: string): void {
    if (!this.live(runId)) {
      return;
    }
    const stage = this.findStage(runId, stageId);
    if (!stage) {
      return;
    }
    stage.completedAt = nowIso();
    stage.status = "failed";
    this.log(runId, stageId, "fail", `✗ ${message}`);
    this.emit({ ts: nowIso(), type: "stage.failed", runId, stageId, status: "failed", message });
  }

  setVerdict(runId: string, stageId: string, verdict: StageVerdict): void {
    const stage = this.findStage(runId, stageId);
    if (stage) {
      stage.verdict = verdict;
    }
  }

  stageUsage(runId: string, stageId: string, usage: StageUsage): void {
    const stage = this.findStage(runId, stageId);
    if (!stage) {
      return;
    }
    stage.usage = addUsage(stage.usage, usage);
    this.emit({ ts: nowIso(), type: "stage.usage", runId, stageId, usage: stage.usage });
    this.schedulePersist(runId, false);
  }

  async captureStageOutput(
    runId: string,
    stageDef: StageDefinition,
    output: string,
  ): Promise<void> {
    const run = this.live(runId);
    if (!run || output.trim() === "") {
      return;
    }
    run.stageOutputs = { ...run.stageOutputs, [stageDef.id]: output };
    run.result = output;
    if (
      run.pipelineId === "milestone-planning" &&
      stageDef.id === "milestone-plan" &&
      run.milestoneId
    ) {
      const milestone = this.milestones.get(run.milestoneId);
      if (milestone) {
        const parsed = parseMilestonePlan(
          output,
          (milestone.proposal?.revision ?? 0) + 1,
          nowIso(),
        );
        if (parsed.proposal) {
          milestone.proposal = parsed.proposal;
          milestone.name = parsed.proposal.name;
          milestone.goal = parsed.proposal.goal;
          delete milestone.approvalError;
        } else {
          milestone.approvalError = parsed.errors.join("; ");
        }
        milestone.updatedAt = nowIso();
        await this.persistMilestone(milestone);
      }
    }
    await this.repositoryForRun(runId).writeHandoff(
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
    if (run.pipelineId === "full-delivery" && stageDef.id === "closeout") {
      run.closeout = await applyProductManagerCloseout(
        this.registry.resolve(run.projectId),
        run,
        output,
      );
    }
    this.schedulePersist(runId, true);
  }

  applySeededOutput(runId: string, stageDef: StageDefinition, output: string): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageDef.id);
    if (!run || !stage) {
      return;
    }
    run.stageOutputs = { ...run.stageOutputs, [stageDef.id]: output };
    run.result = output;
  }

  runCompleted(runId: string, status: RunCompletionStatus): void {
    const run = this.live(runId);
    if (!run) {
      return;
    }
    run.status = status;
    run.completedAt = nowIso();
    this.emit({
      ts: nowIso(),
      type: "run.completed",
      runId,
      status,
      message: completionMessage(status),
      result: run.result,
    });
    void this.settleCompletedRun(run);
  }

  private markCancelled(runId: string): void {
    const run = this.runs.get(runId);
    if (!run || isTerminalRunStatus(run.status)) {
      return;
    }
    for (const stage of run.stages) {
      if (
        stage.status === "pending" ||
        stage.status === "running" ||
        stage.status === "awaiting" ||
        stage.status === "asking"
      ) {
        stage.status = "skipped";
        this.emit({ ts: nowIso(), type: "stage.skipped", runId, stageId: stage.id, status: "skipped" });
      }
    }
    run.status = "cancelled";
    run.completedAt = nowIso();
    this.emit({
      ts: nowIso(),
      type: "run.completed",
      runId,
      status: "cancelled",
      message: "Run aborted",
    });
  }

  private markInterrupted(runId: string): void {
    const run = this.runs.get(runId);
    if (!run || isTerminalRunStatus(run.status)) {
      return;
    }
    const ts = nowIso();
    for (const stage of run.stages) {
      if (stage.status === "running" || stage.status === "awaiting" || stage.status === "asking") {
        stage.status = "failed";
        stage.completedAt = ts;
        stage.logs.push({ ts, level: "fail", message: "✗ Interrupted by server restart" });
      }
    }
    run.status = "failed";
    run.completedAt = ts;
    this.emit({
      ts,
      type: "run.completed",
      runId,
      status: "failed",
      message: "Interrupted by server restart",
    });
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
    const run = this.runs.get(runId);
    return run && !isTerminalRunStatus(run.status) ? run : undefined;
  }

  private findStage(runId: string, stageId: string): StageState | undefined {
    return this.runs.get(runId)?.stages.find((stage) => stage.id === stageId);
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
    void this.repositoryForRun(event.runId)
      .appendEvent(event.runId, event)
      .catch((error) => console.warn(`Failed to persist event for run ${event.runId}:`, error));
    this.schedulePersist(event.runId, event.type !== "stage.log");
    this.listeners.emit(event.runId, event);
    this.publishSummary(event);
  }

  private publishSummary(event: RunEvent): void {
    if (event.type === "stage.log") {
      return;
    }
    const run = this.runs.get(event.runId);
    if (!run || !this.projectListeners.has(run.projectId)) {
      return;
    }
    this.projectListeners.emit(run.projectId, toRunSummary(run));
  }

  private milestoneRepositoryFor(
    projectPath: ProjectPath,
  ): MilestoneRepository {
    const existing = this.milestoneRepositories.get(projectPath.id);
    if (existing) {
      return existing;
    }
    const repository = new MilestoneRepository(projectPath);
    this.milestoneRepositories.set(projectPath.id, repository);
    return repository;
  }

  private async startPlanningTurn(
    projectPath: ProjectPath,
    milestoneId: string,
    userContext: string,
    options: Omit<StartRunOptions, "task" | "milestoneId" | "featureId">,
  ): Promise<RunState> {
    const boardContext = await taskBoardPlanningContext(projectPath);
    const storedCloseoutContext = await milestoneCloseoutContext(projectPath);
    const priorKnowledge = [...this.milestones.values()]
      .filter(
        (milestone) =>
          milestone.projectId === projectPath.id &&
          milestone.id !== milestoneId &&
          (milestone.features.some((feature) => feature.findings.length > 0) ||
            milestone.status === "completed"),
      )
      .map((milestone) => {
        const findings = milestone.features.flatMap((feature) =>
          feature.findings.map((finding) => finding.title),
        );
        return `- ${milestone.name}${findings.length > 0 ? `: ${findings.join("; ")}` : ""}`;
      });
    const task = [
      userContext,
      boardContext,
      storedCloseoutContext,
      priorKnowledge.length > 0
        ? `Prior milestone knowledge:\n${priorKnowledge.join("\n")}`
        : undefined,
    ]
      .filter((value): value is string => value !== undefined)
      .join("\n\n");
    return this.startRun(projectPath, "milestone-planning", {
      ...options,
      task,
      milestoneId,
    });
  }

  private requireMilestone(projectId: string, milestoneId: string): Milestone {
    const milestone = this.milestones.get(milestoneId);
    if (!milestone || milestone.projectId !== projectId) {
      throw new Error(`Milestone not found: ${milestoneId}`);
    }
    return milestone;
  }

  private requireMilestoneFeature(
    milestone: Milestone,
    featureId: string,
  ): MilestoneFeature {
    const feature = milestone.features.find(
      (candidate) => candidate.id === featureId,
    );
    if (!feature) {
      throw new Error(`Feature not found: ${featureId}`);
    }
    return feature;
  }

  private newMilestoneFeature(
    input: CreateMilestoneFeatureInput,
    now: string,
  ): MilestoneFeature {
    const title = input.title.trim();
    if (!title) {
      throw new Error("Feature title is required");
    }
    return {
      id: randomUUID().slice(0, 8),
      title,
      description: input.description?.trim() || undefined,
      acceptanceCriteria: this.cleanStrings(input.acceptanceCriteria ?? []),
      status: "ready",
      taskIds: this.cleanStrings(input.taskIds ?? []),
      runIds: [],
      findings: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  private cleanStrings(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private persistMilestone(milestone: Milestone): Promise<void> {
    return this.milestoneRepositoryFor(
      this.registry.resolve(milestone.projectId),
    ).write(milestone);
  }

  private async settleCompletedRun(run: RunState): Promise<void> {
    await this.repositoryForRun(run.id).releaseRun(run.id);
    await this.completeMilestoneRun(run);
  }

  private async completeMilestoneRun(run: RunState): Promise<void> {
    if (
      !run.milestoneId ||
      !run.featureId ||
      this.completingMilestoneRuns.has(run.id)
    ) {
      return;
    }
    this.completingMilestoneRuns.add(run.id);
    try {
      const milestone = this.milestones.get(run.milestoneId);
      const feature = milestone?.features.find(
        (candidate) => candidate.id === run.featureId,
      );
      if (!milestone || !feature) {
        return;
      }
      const now = nowIso();
      feature.status =
        run.status === "completed" ? "completed" : "needs_attention";
      if (run.closeout) {
        feature.findings = run.closeout.report.findings.map((finding) => ({
          ...finding,
          sourceRunId: run.id,
        }));
      }
      feature.updatedAt = now;
      if (feature.status === "completed") {
        feature.completedAt = now;
      } else {
        delete feature.completedAt;
      }
      milestone.updatedAt = now;
      await this.persistMilestone(milestone);

      if (
        !milestone.autoRunNext ||
        milestone.status !== "active" ||
        (run.status !== "completed" && run.status !== "needs_attention") ||
        !nextMilestoneFeature(milestone)
      ) {
        return;
      }
      await this.startNextMilestoneRun(
        this.registry.resolve(run.projectId),
        milestone.id,
        {
          engine: run.engine,
          model: run.model,
          permissionMode: this.enginePermissionModes.get(run.id),
        },
      );
    } finally {
      this.completingMilestoneRuns.delete(run.id);
    }
  }

  private repositoryFor(projectPath: ProjectPath): RunRepository {
    const existing = this.repositories.get(projectPath.id);
    if (existing) {
      return existing;
    }
    const repository = new RunRepository(projectPath);
    this.repositories.set(projectPath.id, repository);
    return repository;
  }

  private repositoryForRun(runId: string): RunRepository {
    const projectId = this.runs.get(runId)?.projectId;
    return this.repositoryFor(this.registry.resolve(projectId));
  }

  private takeRunNumber(projectId: string): number {
    const next = this.nextRunNumbers.get(projectId) ?? 1;
    this.nextRunNumbers.set(projectId, next + 1);
    return next;
  }

  private buildPersisted(runId: string): PersistedRun | undefined {
    const run = this.runs.get(runId);
    if (!run) {
      return undefined;
    }
    const persisted: PersistedRun = { version: 1, run: structuredClone(run) };
    const permissionMode = this.enginePermissionModes.get(runId);
    if (permissionMode) {
      persisted.permissionMode = permissionMode;
    }
    const openWorkflowRunId = this.openWorkflowRunIds.get(runId);
    if (openWorkflowRunId) {
      persisted.openWorkflowRunId = openWorkflowRunId;
    }
    return persisted;
  }

  private async flushPersist(runId: string): Promise<void> {
    const timer = this.persistTimers.get(runId);
    if (timer) {
      clearTimeout(timer);
      this.persistTimers.delete(runId);
    }
    const persisted = this.buildPersisted(runId);
    if (!persisted) {
      return;
    }
    try {
      await this.repositoryForRun(runId).writeState(runId, persisted);
    } catch (error) {
      console.warn(`Failed to persist run ${runId}:`, error);
    }
  }

  private schedulePersist(runId: string, immediate: boolean): void {
    if (immediate) {
      void this.flushPersist(runId);
      return;
    }
    if (this.persistTimers.has(runId)) {
      return;
    }
    const timer = setTimeout(() => {
      this.persistTimers.delete(runId);
      void this.flushPersist(runId);
    }, PERSIST_DEBOUNCE_MS);
    timer.unref();
    this.persistTimers.set(runId, timer);
  }
}
