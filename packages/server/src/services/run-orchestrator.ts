import { randomUUID } from "node:crypto";
import type {
  EnginePermissionMode,
  LogLevel,
  PipelineDefinition,
  RunEvent,
  RunState,
  StageDefinition,
  StageState,
  StageVerdict,
} from "@adhd/core";
import {
  DEFAULT_PERMISSION_MODE,
  DEMO_PIPELINES,
  ENGINES,
  agentForStage,
  createInitialRunState,
  isTerminalRunStatus,
  pipelineUsesEngine,
} from "@adhd/core";
import { assertEngineId, getEngineAdapter } from "../engines/registry.ts";
import { ensureProjectDataDir, resolveWorkspace } from "../paths.ts";
import type { ProjectPaths } from "../paths.ts";
import type { ProjectRegistry } from "./project-registry.ts";
import { RunRepository } from "../repository/run-repository.ts";
import type { PersistedRun } from "../repository/run-repository.ts";
import { SettingsStore } from "./settings-store.ts";
import { formatHandoff } from "../domain/stage-context.ts";
import { nowIso } from "../utils.ts";
import { WorkflowRuntimeRegistry } from "../workflow/workflow-runtime.ts";
import type {
  PipelineWorkflowInput,
  RunProjection,
  WorkflowDeps,
} from "../workflow/types.ts";

const PERSIST_DEBOUNCE_MS = 150;

const UNKNOWN_ENGINE_LABEL = "unknown";

const TERMINAL_OPENWORKFLOW_STATUSES = new Set([
  "succeeded",
  "completed",
  "failed",
  "canceled",
]);

type RunListener = (event: RunEvent) => void;

export interface StartRunOptions {
  task?: string | undefined;
  engine?: string | undefined;
  model?: string | undefined;
  permissionMode?: string | undefined;
}

export interface RunOrchestratorDependencies {
  registry: ProjectRegistry;
  settings?: SettingsStore;
}

interface InputExtras {
  startedMessage: string;
  seededOutputs?: Record<string, string>;
  startStageId?: string;
}

export class RunOrchestrator implements RunProjection {
  private readonly runs = new Map<string, RunState>();
  private readonly listeners = new Map<string, Set<RunListener>>();
  private readonly cancelled = new Set<string>();
  private readonly engineAborts = new Map<string, AbortController>();
  private readonly enginePermissionModes = new Map<string, EnginePermissionMode>();
  private readonly persistTimers = new Map<string, NodeJS.Timeout>();
  private readonly repositories = new Map<string, RunRepository>();
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
      const paths = this.registry.resolve(project.id);
      await this.loadProject(paths);
      await this.runtimes.for(paths).start();
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
  }

  private async loadProject(paths: ProjectPaths): Promise<void> {
    const loaded = await this.repositoryFor(paths).loadAll();
    let maxNumber = this.nextRunNumbers.get(paths.id) ?? 1;
    for (const persisted of loaded) {
      const { run } = persisted;
      run.projectId = paths.id;
      this.runs.set(run.id, run);
      if (persisted.permissionMode) {
        this.enginePermissionModes.set(run.id, persisted.permissionMode);
      }
      if (persisted.openWorkflowRunId) {
        this.openWorkflowRunIds.set(run.id, persisted.openWorkflowRunId);
      }
      maxNumber = Math.max(maxNumber, run.number + 1);
      if (!isTerminalRunStatus(run.status)) {
        await this.reconcileOnLoad(paths, run);
      }
    }
    this.nextRunNumbers.set(paths.id, maxNumber);
  }

  private async reconcileOnLoad(paths: ProjectPaths, run: RunState): Promise<void> {
    const openWorkflowRunId = this.openWorkflowRunIds.get(run.id);
    if (!openWorkflowRunId) {
      this.markInterrupted(run.id);
      return;
    }
    let status: string | undefined;
    try {
      status = await this.runtimes.for(paths).runStatus(openWorkflowRunId);
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
  }

  listPipelines(): PipelineDefinition[] {
    return DEMO_PIPELINES;
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

  subscribe(runId: string, listener: RunListener): () => void {
    const bucket = this.listeners.get(runId) ?? new Set<RunListener>();
    bucket.add(listener);
    this.listeners.set(runId, bucket);
    return () => {
      bucket.delete(listener);
      if (bucket.size === 0) {
        this.listeners.delete(runId);
      }
    };
  }

  async replayEvents(runId: string): Promise<RunEvent[]> {
    return this.repositoryForRun(runId).loadEvents(runId);
  }

  async startRun(
    paths: ProjectPaths,
    pipelineId: string,
    options: StartRunOptions = {},
  ): Promise<RunState> {
    const pipeline = this.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Unknown pipeline: ${pipelineId}`);
    }

    const { task, engine, model, permissionMode } = options;

    const usesEngine = pipelineUsesEngine(pipeline);
    if (usesEngine) {
      const engineId = engine ?? "claude-code";
      getEngineAdapter(engineId);
      assertEngineId(engineId);
      const connection = this.settings.getEngineConnection(paths.id, engineId);
      const mode = ENGINES[engineId].connections.find((m) => m.id === connection.mode);
      if (mode?.requiresApiKey && !connection.apiKey) {
        throw new Error(
          `Connection mode "${mode.label}" needs an API key — add one in Setup → Connection, or switch back to subscription.`,
        );
      }
    }

    await ensureProjectDataDir(paths);

    const runId = randomUUID().slice(0, 8);
    const admitted = await this.repositoryFor(paths).admitRun(runId);
    if (!admitted) {
      throw new Error(
        "A run is already active in this project — wait for it to finish or abort it before starting another.",
      );
    }

    const run = createInitialRunState({
      runId,
      number: this.takeRunNumber(paths.id),
      projectId: paths.id,
      pipeline,
      task,
    });

    if (usesEngine) {
      const engineId = engine ?? "claude-code";
      assertEngineId(engineId);
      run.engine = engineId;
      if (model !== undefined) {
        run.model = model;
      }
      run.workspacePath = await resolveWorkspace(paths, runId);
      this.enginePermissionModes.set(
        runId,
        permissionMode === "acceptEdits" ? "acceptEdits" : DEFAULT_PERMISSION_MODE,
      );
    }

    this.runs.set(runId, run);
    await this.flushPersist(runId);

    await this.launch(paths, run, { startedMessage: `Started pipeline: ${pipeline.name}` });
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
    void this.repositoryForRun(runId).releaseRun(runId);
    return structuredClone(run);
  }

  restartRun(runId: string, stageId: string): RunState {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    if (run.status !== "failed" && run.status !== "cancelled") {
      throw new Error(`Run ${runId} can only be restarted after failing or being aborted`);
    }
    const startIndex = run.stages.findIndex((stage) => stage.id === stageId);
    if (startIndex === -1) {
      throw new Error(`Stage not found: ${stageId}`);
    }

    const outputs = { ...run.stageOutputs };
    const seededOutputs: Record<string, string> = {};
    for (const stage of run.stages.slice(0, startIndex)) {
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
      startStageId: stageId,
    });
    return structuredClone(run);
  }

  private async launch(
    paths: ProjectPaths,
    run: RunState,
    extras: InputExtras,
  ): Promise<void> {
    if (extras.startStageId !== undefined) {
      const admitted = await this.repositoryFor(paths).admitRun(run.id);
      if (!admitted) {
        this.markInterrupted(run.id);
        return;
      }
    }
    const runtime = this.runtimes.for(paths);
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
      ...(run.task !== undefined ? { task: run.task } : {}),
      ...(run.engine !== undefined ? { engine: run.engine } : {}),
      ...(run.model !== undefined ? { model: run.model } : {}),
      permissionMode: this.enginePermissionModes.get(run.id) ?? DEFAULT_PERMISSION_MODE,
      ...(run.workspacePath !== undefined ? { workspacePath: run.workspacePath } : {}),
      startedMessage: extras.startedMessage,
      ...(extras.seededOutputs !== undefined ? { seededOutputs: extras.seededOutputs } : {}),
      ...(extras.startStageId !== undefined ? { startStageId: extras.startStageId } : {}),
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

  captureStageOutput(runId: string, stageDef: StageDefinition, output: string): void {
    const run = this.live(runId);
    if (!run || output.trim() === "") {
      return;
    }
    run.stageOutputs = { ...run.stageOutputs, [stageDef.id]: output };
    run.result = output;
    void this.repositoryForRun(runId).writeHandoff(
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
    this.schedulePersist(runId, true);
  }

  applySeededOutput(runId: string, stageDef: StageDefinition, output: string): void {
    const run = this.live(runId);
    const stage = this.findStage(runId, stageDef.id);
    if (!run || !stage) {
      return;
    }
    stage.status = "passed";
    stage.completedAt = nowIso();
    run.stageOutputs = { ...run.stageOutputs, [stageDef.id]: output };
    run.result = output;
    this.emit({
      ts: nowIso(),
      type: "stage.completed",
      runId,
      stageId: stageDef.id,
      status: "passed",
      message: `Reused ${agentForStage(stageDef.id).profession} output from the previous run`,
    });
  }

  runCompleted(runId: string, status: "completed" | "failed"): void {
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
      message: status === "completed" ? "Run completed successfully" : "Run failed",
      ...(run.result !== undefined ? { result: run.result } : {}),
    });
    void this.repositoryForRun(runId).releaseRun(runId);
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
        stage.status === "awaiting"
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
      if (stage.status === "running" || stage.status === "awaiting") {
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
    void this.repositoryForRun(runId).releaseRun(runId);
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
    const listeners = this.listeners.get(event.runId);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      listener(event);
    }
  }

  private repositoryFor(paths: ProjectPaths): RunRepository {
    const existing = this.repositories.get(paths.id);
    if (existing) {
      return existing;
    }
    const repository = new RunRepository(paths);
    this.repositories.set(paths.id, repository);
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
