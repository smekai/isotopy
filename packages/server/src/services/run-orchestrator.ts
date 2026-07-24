import { randomUUID } from "node:crypto";
import type {
  EnginePermissionMode,
  LogLevel,
  PipelineDefinition,
  RunEvent,
  RunState,
  StageDefinition,
  StageState,
} from "@adhd/core";
import {
  DEFAULT_PERMISSION_MODE,
  DEMO_PIPELINES,
  ENGINES,
  agentForStage,
  createInitialRunState,
  flattenPipelineStages,
  isTerminalRunStatus,
  pipelineUsesEngine,
} from "@adhd/core";
import { config } from "../config.ts";
import { assertEngineId, getEngineAdapter } from "../engines/registry.ts";
import type { EngineRunResult } from "../engines/types.ts";
import { ensureProjectDataDir, resolveWorkspace } from "../paths.ts";
import type { ProjectPaths } from "../paths.ts";
import type { ProjectRegistry } from "./project-registry.ts";
import { RunRepository } from "../repository/run-repository.ts";
import type { PersistedRun } from "../repository/run-repository.ts";
import { SettingsStore } from "./settings-store.ts";
import { loadSkill } from "./skills.ts";
import { buildStagePrompt, formatHandoff, parseStageVerdict } from "../domain/stage-context.ts";
import type { UpstreamOutput } from "../domain/stage-context.ts";
import { nowIso, randomBetween, sleep } from "../utils.ts";

const PERSIST_DEBOUNCE_MS = 150;

const UNKNOWN_ENGINE_LABEL = "unknown";

type RunListener = (event: RunEvent) => void;

interface SimulationOptions {
  minDurationMs?: number;
  maxDurationMs?: number;
  failProbability?: number;
}

export interface StartRunOptions extends SimulationOptions {
  task?: string | undefined;
  disabledStages?: string[] | undefined;
  engine?: string | undefined;
  model?: string | undefined;
  permissionMode?: string | undefined;
}

const DEFAULT_OPTIONS: Required<SimulationOptions> = {
  minDurationMs: 2000,
  maxDurationMs: 8000,
  failProbability: 0.05,
};

type StageOutcome = "passed" | "failed" | "cancelled";

export interface RunOrchestratorDependencies {
  registry: ProjectRegistry;
  settings?: SettingsStore;
}

export class RunOrchestrator {
  private readonly runs = new Map<string, RunState>();
  private readonly listeners = new Map<string, Set<RunListener>>();
  private readonly runOptions = new Map<string, Required<SimulationOptions>>();
  private readonly cancelled = new Set<string>();
  private readonly gateWaiters = new Map<string, () => void>();
  private readonly engineAborts = new Map<string, AbortController>();
  private readonly enginePermissionModes = new Map<string, EnginePermissionMode>();
  private readonly persistTimers = new Map<string, NodeJS.Timeout>();
  private readonly repositories = new Map<string, RunRepository>();
  private readonly nextRunNumbers = new Map<string, number>();
  private readonly registry: ProjectRegistry;
  private readonly settings: SettingsStore;

  constructor({ registry, settings }: RunOrchestratorDependencies) {
    this.registry = registry;
    this.settings = settings ?? new SettingsStore();
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

  async init(): Promise<void> {
    for (const project of this.registry.all()) {
      await this.loadProject(this.registry.resolve(project.id));
    }
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
      if (persisted.simOptions) {
        this.runOptions.set(run.id, { ...DEFAULT_OPTIONS, ...persisted.simOptions });
      }
      maxNumber = Math.max(maxNumber, run.number + 1);
      if (!isTerminalRunStatus(run.status)) {
        this.reconcileInterrupted(run);
      }
    }
    this.nextRunNumbers.set(paths.id, maxNumber);
  }

  private takeRunNumber(projectId: string): number {
    const next = this.nextRunNumbers.get(projectId) ?? 1;
    this.nextRunNumbers.set(projectId, next + 1);
    return next;
  }

  async shutdown(): Promise<void> {
    for (const run of this.runs.values()) {
      if (!isTerminalRunStatus(run.status)) {
        this.abortRun(run.id);
      }
    }
    await Promise.all([...this.runs.keys()].map((runId) => this.flushPersist(runId)));
    await Promise.all(
      [...this.repositories.values()].map((repository) => repository.settle()),
    );
  }

  private reconcileInterrupted(run: RunState): void {
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
    void this.repositoryForRun(run.id).appendEvent(run.id, {
      ts,
      type: "run.completed",
      runId: run.id,
      status: "failed",
      message: "Interrupted by server restart",
    });
    void this.flushPersist(run.id);
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
    const simOptions = this.runOptions.get(runId);
    if (simOptions) {
      persisted.simOptions = simOptions;
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

  async startRun(
    paths: ProjectPaths,
    pipelineId: string,
    options: StartRunOptions = {},
  ): Promise<RunState> {
    const pipeline = this.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Unknown pipeline: ${pipelineId}`);
    }

    const { task, disabledStages, engine, model, permissionMode, ...simOptions } = options;

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
    const run = createInitialRunState({
      runId,
      number: this.takeRunNumber(paths.id),
      projectId: paths.id,
      pipeline,
      task,
      disabledStages,
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

    const merged = { ...DEFAULT_OPTIONS, ...simOptions };
    this.runOptions.set(runId, merged);
    await this.flushPersist(runId);
    void this.simulateRun(runId, pipeline, merged);
    return structuredClone(run);
  }

  approveGate(runId: string, stageId: string): RunState {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const stage = this.getStage(runId, stageId);
    if (stage.status !== "awaiting") {
      throw new Error(`Stage ${stageId} is not awaiting approval`);
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

    const waiterKey = `${runId}:${stageId}`;
    const resume = this.gateWaiters.get(waiterKey);
    this.gateWaiters.delete(waiterKey);
    resume?.();
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
    for (const [key, resume] of [...this.gateWaiters]) {
      if (key.startsWith(`${runId}:`)) {
        this.gateWaiters.delete(key);
        resume();
      }
    }

    for (const stage of run.stages) {
      if (
        stage.status === "pending" ||
        stage.status === "running" ||
        stage.status === "awaiting"
      ) {
        stage.status = "skipped";
        this.emit({
          ts: nowIso(),
          type: "stage.skipped",
          runId,
          stageId: stage.id,
          status: "skipped",
        });
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
    const pipeline = this.getPipeline(run.pipelineId);
    if (!pipeline) {
      throw new Error(`Unknown pipeline: ${run.pipelineId}`);
    }
    const startIndex = run.stages.findIndex((stage) => stage.id === stageId);
    if (startIndex === -1) {
      throw new Error(`Stage not found: ${stageId}`);
    }
    const disabled = new Set(run.disabledStages ?? []);
    if (disabled.has(stageId)) {
      throw new Error(`Stage ${stageId} is disabled for this run`);
    }

    this.cancelled.delete(runId);
    const outputs = { ...run.stageOutputs };
    for (const stage of run.stages.slice(startIndex)) {
      if (disabled.has(stage.id)) {
        continue;
      }
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

    const profession = agentForStage(stageId).profession;
    this.emit({
      ts: nowIso(),
      type: "run.started",
      runId,
      status: "running",
      message: `Restarted from ${profession}`,
    });

    const options = this.runOptions.get(runId) ?? DEFAULT_OPTIONS;
    void this.runStages(runId, pipeline, options, stageId);
    return structuredClone(run);
  }

  private emit(event: RunEvent): void {
    void this.repositoryForRun(event.runId).appendEvent(event.runId, event);
    this.schedulePersist(event.runId, event.type !== "stage.log");
    const listeners = this.listeners.get(event.runId);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      listener(event);
    }
  }

  private log(
    runId: string,
    stageId: string,
    level: LogLevel,
    message: string,
  ): void {
    const stage = this.getStage(runId, stageId);
    const ts = nowIso();
    stage.logs.push({ ts, level, message });
    this.emit({ ts, type: "stage.log", runId, stageId, message, level });
  }

  private updateRun(runId: string, updater: (run: RunState) => void): RunState {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    updater(run);
    return run;
  }

  private getStage(runId: string, stageId: string): StageState {
    const run = this.runs.get(runId);
    const stage = run?.stages.find((item) => item.id === stageId);
    if (!run || !stage) {
      throw new Error(`Stage not found: ${stageId}`);
    }
    return stage;
  }

  private async simulateStage(
    runId: string,
    stageDef: StageDefinition,
    options: Required<SimulationOptions>,
  ): Promise<StageOutcome> {
    const run = this.runs.get(runId);
    const stage = this.getStage(runId, stageDef.id);
    if (!run || stage.status === "skipped") {
      return "passed";
    }

    const profession = agentForStage(stageDef.id).profession;
    stage.status = "running";
    stage.startedAt = nowIso();

    this.emit({
      ts: nowIso(),
      type: "stage.started",
      runId,
      stageId: stageDef.id,
      status: "running",
    });

    const logLines: Array<[LogLevel, string]> = [
      ["info", `${profession} online · run #${run.number}`],
      ["info", `Reading context for ${stage.label.toLowerCase()}`],
      ["run", `▶ Executing ${stage.label.toLowerCase()} workflow`],
      ["info", `${profession} finishing up`],
    ];

    const duration = randomBetween(options.minDurationMs, options.maxDurationMs);
    const stepDelay = Math.max(1, Math.floor(duration / logLines.length));

    for (const [level, message] of logLines) {
      await sleep(stepDelay);
      if (this.cancelled.has(runId)) {
        return "cancelled";
      }
      this.log(runId, stageDef.id, level, message);
    }

    const failed = Math.random() < options.failProbability;
    if (failed) {
      stage.completedAt = nowIso();
      stage.status = "failed";
      this.log(runId, stageDef.id, "fail", `✗ ${profession} failed (simulated)`);
      this.emit({
        ts: nowIso(),
        type: "stage.failed",
        runId,
        stageId: stageDef.id,
        status: "failed",
        message: `${profession} failed (simulated)`,
      });
      return "failed";
    }

    if (stageDef.gateAfter) {
      stage.status = "awaiting";
      this.updateRun(runId, (current) => {
        current.status = "awaiting";
      });
      this.log(runId, stageDef.id, "warn", `${profession} is waiting for your approval`);
      this.emit({
        ts: nowIso(),
        type: "stage.awaiting",
        runId,
        stageId: stageDef.id,
        status: "awaiting",
        message: `${profession} is waiting for your approval`,
      });
      await new Promise<void>((resolve) => {
        this.gateWaiters.set(`${runId}:${stageDef.id}`, resolve);
      });
      if (this.cancelled.has(runId)) {
        return "cancelled";
      }
      return "passed";
    }

    stage.completedAt = nowIso();
    stage.status = "passed";
    this.log(runId, stageDef.id, "pass", `✓ ${profession} finished — ${stage.label.toLowerCase()} complete`);
    this.emit({
      ts: nowIso(),
      type: "stage.completed",
      runId,
      stageId: stageDef.id,
      status: "passed",
      message: `${profession} completed`,
    });
    return "passed";
  }

  private upstreamFor(run: RunState, stageId: string): UpstreamOutput[] {
    const index = run.stages.findIndex((stage) => stage.id === stageId);
    if (index <= 0) {
      return [];
    }
    const outputs = run.stageOutputs ?? {};
    return run.stages
      .slice(0, index)
      .map((stage) => ({ label: stage.label, output: outputs[stage.id] ?? "" }))
      .filter((entry) => entry.output !== "");
  }

  private engineLabel(run: RunState): string {
    return run.engine ? ENGINES[run.engine].label : UNKNOWN_ENGINE_LABEL;
  }

  private async resolveStageInputs(
    run: RunState,
    stageDef: StageDefinition,
  ): Promise<{ persona: string | undefined; prompt: string }> {
    const paths = this.registry.resolve(run.projectId);
    const persona = stageDef.skill ? await loadSkill(paths, stageDef.skill) : undefined;
    if (stageDef.skill && !persona) {
      this.log(
        run.id,
        stageDef.id,
        "warn",
        `No skill "${stageDef.skill}" found — running without a persona`,
      );
    }
    return {
      persona,
      prompt: buildStagePrompt(run.task ?? "", this.upstreamFor(run, stageDef.id)),
    };
  }

  private captureStageOutput(
    run: RunState,
    stageDef: StageDefinition,
    result: string | undefined,
  ): void {
    if (!result || result.trim() === "") {
      return;
    }
    run.stageOutputs = { ...run.stageOutputs, [stageDef.id]: result };
    void this.repositoryForRun(run.id).writeHandoff(
      run.id,
      stageDef.id,
      formatHandoff(
        {
          stageLabel: stageDef.label,
          profession: agentForStage(stageDef.id).profession,
          engine: this.engineLabel(run),
          model: run.model,
          completedAt: nowIso(),
        },
        result,
      ),
    );
  }

  private async executeEngineStage(
    runId: string,
    stageDef: StageDefinition,
  ): Promise<StageOutcome> {
    const run = this.runs.get(runId);
    const stage = this.getStage(runId, stageDef.id);
    if (!run || !run.engine || stage.status === "skipped") {
      return "passed";
    }

    const profession = agentForStage(stageDef.id).profession;
    stage.status = "running";
    stage.startedAt = nowIso();
    this.emit({
      ts: nowIso(),
      type: "stage.started",
      runId,
      stageId: stageDef.id,
      status: "running",
    });
    this.log(
      runId,
      stageDef.id,
      "info",
      `${profession} online · ${this.engineLabel(run)}${run.model ? ` · ${run.model}` : ""}`,
    );

    const controller = new AbortController();
    this.engineAborts.set(runId, controller);

    const { persona, prompt } = await this.resolveStageInputs(run, stageDef);

    if (this.cancelled.has(runId)) {
      this.engineAborts.delete(runId);
      return "cancelled";
    }

    let outcome: EngineRunResult;
    try {
      const adapter = getEngineAdapter(run.engine);
      outcome = await adapter.run({
        runId,
        prompt,
        cwd: run.workspacePath ?? process.cwd(),
        model: run.model,
        appendSystemPrompt: persona,
        permissionMode: this.enginePermissionModes.get(runId) ?? DEFAULT_PERMISSION_MODE,
        connection: this.settings.getEngineConnection(run.projectId, run.engine),
        timeoutMs: config.engineTimeoutMs,
        signal: controller.signal,
        onLog: (level, message) => this.log(runId, stageDef.id, level, message),
      });
    } catch (error) {
      outcome = {
        success: false,
        exitCode: null,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.engineAborts.delete(runId);
    }

    if (this.cancelled.has(runId)) {
      return "cancelled";
    }

    stage.completedAt = nowIso();
    if (outcome.success) {
      if (outcome.result !== undefined) {
        run.result = outcome.result;
      }
      this.captureStageOutput(run, stageDef, outcome.result);

      const verdict = parseStageVerdict(outcome.result);
      if (verdict !== undefined) {
        stage.verdict = verdict;
      }
      if (verdict === "FAIL") {
        stage.status = "failed";
        const message = `${profession} reported VERDICT: FAIL`;
        this.log(runId, stageDef.id, "fail", `✗ ${message}`);
        this.emit({
          ts: nowIso(),
          type: "stage.failed",
          runId,
          stageId: stageDef.id,
          status: "failed",
          message,
        });
        return "failed";
      }

      stage.status = "passed";
      if (verdict === "PASS") {
        this.log(runId, stageDef.id, "pass", `${profession} reported VERDICT: PASS`);
      }
      this.log(runId, stageDef.id, "pass", `✓ ${profession} finished — result ready`);
      this.emit({
        ts: nowIso(),
        type: "stage.completed",
        runId,
        stageId: stageDef.id,
        status: "passed",
        message: `${profession} completed`,
      });
      return "passed";
    }

    stage.status = "failed";
    this.log(runId, stageDef.id, "fail", `✗ ${outcome.errorMessage ?? `${profession} failed`}`);
    this.emit({
      ts: nowIso(),
      type: "stage.failed",
      runId,
      stageId: stageDef.id,
      status: "failed",
      message: outcome.errorMessage ?? `${profession} failed`,
    });
    return "failed";
  }

  private executeStage(
    runId: string,
    stageDef: StageDefinition,
    options: Required<SimulationOptions>,
  ): Promise<StageOutcome> {
    const run = this.runs.get(runId);
    const engineBacked = stageDef.skill !== undefined && run?.engine !== undefined;
    return engineBacked
      ? this.executeEngineStage(runId, stageDef)
      : this.simulateStage(runId, stageDef, options);
  }

  private async runStages(
    runId: string,
    pipeline: PipelineDefinition,
    options: Required<SimulationOptions>,
    startStageId?: string,
  ): Promise<void> {
    const stageDefs = flattenPipelineStages(pipeline);
    let started = startStageId == null;
    let success = true;

    for (const stageDef of stageDefs) {
      if (!started) {
        if (stageDef.id === startStageId) {
          started = true;
        } else {
          continue;
        }
      }
      const outcome = await this.executeStage(runId, stageDef, options);
      if (outcome === "cancelled") {
        return;
      }
      if (outcome === "failed") {
        success = false;
        break;
      }
    }

    if (this.cancelled.has(runId)) {
      return;
    }

    const finished = this.updateRun(runId, (run) => {
      run.status = success ? "completed" : "failed";
      run.completedAt = nowIso();
    });

    this.emit({
      ts: nowIso(),
      type: "run.completed",
      runId,
      status: success ? "completed" : "failed",
      message: success ? "Run completed successfully" : "Run failed",
      ...(finished.result !== undefined ? { result: finished.result } : {}),
    });
  }

  private async simulateRun(
    runId: string,
    pipeline: PipelineDefinition,
    options: Required<SimulationOptions>,
  ): Promise<void> {
    this.updateRun(runId, (run) => {
      run.status = "running";
    });

    this.emit({
      ts: nowIso(),
      type: "run.started",
      runId,
      status: "running",
      message: `Started pipeline: ${pipeline.name}`,
    });

    await this.runStages(runId, pipeline, options);
  }
}
