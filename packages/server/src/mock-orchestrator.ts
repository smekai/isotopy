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
  ONE_BOX_PIPELINE,
  agentForStage,
  createInitialRunState,
  flattenPipelineStages,
} from "@adhd/core";
import { assertEngineId, getEngineAdapter } from "./engines/registry.js";
import type { EngineRunResult } from "./engines/types.js";
import { resolveWorkspace } from "./paths.js";
import { getEngineConnection } from "./settings.js";

type RunListener = (event: RunEvent) => void;

interface SimulationOptions {
  minDurationMs?: number;
  maxDurationMs?: number;
  failProbability?: number;
}

export interface StartRunOptions extends SimulationOptions {
  task?: string;
  disabledStages?: string[];
  engine?: string;
  model?: string;
  workspaceDir?: string;
  permissionMode?: string;
}

const ENGINE_TIMEOUT_MS = Number(process.env.ADHD_ENGINE_TIMEOUT_MS ?? 600000);

const DEFAULT_OPTIONS: Required<SimulationOptions> = {
  minDurationMs: 2000,
  maxDurationMs: 8000,
  failProbability: 0.05,
};

type StageOutcome = "passed" | "failed" | "cancelled";

function nowIso(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class MockOrchestrator {
  private readonly runs = new Map<string, RunState>();
  private readonly listeners = new Map<string, Set<RunListener>>();
  private readonly runOptions = new Map<string, Required<SimulationOptions>>();
  private readonly cancelled = new Set<string>();
  private readonly gateWaiters = new Map<string, () => void>();
  private readonly engineAborts = new Map<string, AbortController>();
  private readonly enginePermissionModes = new Map<string, EnginePermissionMode>();
  private nextRunNumber = 1;

  listPipelines(): PipelineDefinition[] {
    return DEMO_PIPELINES;
  }

  getPipeline(pipelineId: string): PipelineDefinition | undefined {
    return DEMO_PIPELINES.find((pipeline) => pipeline.id === pipelineId);
  }

  listRuns(): RunState[] {
    return [...this.runs.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
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
    pipelineId: string,
    options: StartRunOptions = {},
  ): Promise<RunState> {
    const pipeline = this.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Unknown pipeline: ${pipelineId}`);
    }

    const { task, disabledStages, engine, model, workspaceDir, permissionMode, ...simOptions } =
      options;

    const isOneBox = pipeline.id === ONE_BOX_PIPELINE.id;
    if (isOneBox) {
      // Validate the engine before the run exists so bad requests fail fast.
      const engineId = engine ?? "claude-code";
      getEngineAdapter(engineId);
      assertEngineId(engineId);
      const connection = getEngineConnection(engineId);
      const mode = ENGINES[engineId].connections.find((m) => m.id === connection.mode);
      if (mode?.requiresApiKey && !connection.apiKey) {
        throw new Error(
          `Connection mode "${mode.label}" needs an API key — add one in Setup → Connection, or switch back to subscription.`,
        );
      }
    }

    const runId = randomUUID().slice(0, 8);
    const run = createInitialRunState(
      runId,
      this.nextRunNumber++,
      pipeline,
      task,
      disabledStages,
    );

    if (isOneBox) {
      const engineId = engine ?? "claude-code";
      assertEngineId(engineId);
      run.engine = engineId;
      run.model = model;
      run.workspacePath = await resolveWorkspace(runId, workspaceDir);
      this.enginePermissionModes.set(
        runId,
        permissionMode === "acceptEdits" ? "acceptEdits" : DEFAULT_PERMISSION_MODE,
      );
    }

    this.runs.set(runId, run);

    const merged = { ...DEFAULT_OPTIONS, ...simOptions };
    this.runOptions.set(runId, merged);
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
    if (
      run.status === "completed" ||
      run.status === "failed" ||
      run.status === "cancelled"
    ) {
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
    for (const stage of run.stages.slice(startIndex)) {
      if (disabled.has(stage.id)) {
        continue;
      }
      stage.status = "pending";
      stage.logs = [];
      stage.startedAt = undefined;
      stage.completedAt = undefined;
    }
    run.status = "running";
    run.completedAt = undefined;

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
    const stepDelay = Math.max(300, Math.floor(duration / logLines.length));

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
      `${profession} online · ${ENGINES[run.engine].label}${run.model ? ` · ${run.model}` : ""}`,
    );

    const controller = new AbortController();
    this.engineAborts.set(runId, controller);
    let outcome: EngineRunResult;
    try {
      const adapter = getEngineAdapter(run.engine);
      outcome = await adapter.run({
        runId,
        prompt: run.task ?? "",
        cwd: run.workspacePath ?? process.cwd(),
        model: run.model,
        permissionMode: this.enginePermissionModes.get(runId) ?? DEFAULT_PERMISSION_MODE,
        // Read fresh per stage so settings changes apply to restarted runs.
        connection: getEngineConnection(run.engine),
        timeoutMs: ENGINE_TIMEOUT_MS,
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
      // abortRun already marked the stage skipped — don't overwrite it.
      return "cancelled";
    }

    stage.completedAt = nowIso();
    if (outcome.success) {
      run.result = outcome.result;
      stage.status = "passed";
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
      const outcome = this.runs.get(runId)?.engine
        ? await this.executeEngineStage(runId, stageDef)
        : await this.simulateStage(runId, stageDef, options);
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

export const orchestrator = new MockOrchestrator();
