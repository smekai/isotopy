import { randomUUID } from "node:crypto";
import type {
  PipelineDefinition,
  RunEvent,
  RunState,
  StageState,
} from "@adhd/core";
import {
  DEMO_PIPELINES,
  createInitialRunState,
} from "@adhd/core";

type RunListener = (event: RunEvent) => void;

interface SimulationOptions {
  minDurationMs?: number;
  maxDurationMs?: number;
  failProbability?: number;
}

const DEFAULT_OPTIONS: Required<SimulationOptions> = {
  minDurationMs: 2000,
  maxDurationMs: 8000,
  failProbability: 0.05,
};

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
    options: SimulationOptions = {},
  ): Promise<RunState> {
    const pipeline = this.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Unknown pipeline: ${pipelineId}`);
    }

    const runId = randomUUID().slice(0, 8);
    const run = createInitialRunState(runId, pipeline);
    this.runs.set(runId, run);

    const merged = { ...DEFAULT_OPTIONS, ...options };
    void this.simulateRun(runId, pipeline, merged);
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
    stageId: string,
    options: Required<SimulationOptions>,
  ): Promise<boolean> {
    const stage = this.getStage(runId, stageId);
    stage.status = "running";
    stage.startedAt = nowIso();

    this.emit({
      ts: nowIso(),
      type: "stage.started",
      runId,
      stageId,
      status: "running",
    });

    const logLines = [
      `${stage.label} agent starting...`,
      `Loading context for ${stageId}`,
      `Executing ${stage.label.toLowerCase()} workflow step`,
      `${stage.label} agent finishing up`,
    ];

    const duration = randomBetween(options.minDurationMs, options.maxDurationMs);
    const stepDelay = Math.max(300, Math.floor(duration / logLines.length));

    for (const line of logLines) {
      await sleep(stepDelay);
      stage.logs.push(line);
      this.emit({
        ts: nowIso(),
        type: "stage.log",
        runId,
        stageId,
        message: line,
      });
    }

    const failed = Math.random() < options.failProbability;
    stage.completedAt = nowIso();
    stage.status = failed ? "failed" : "passed";

    this.emit({
      ts: nowIso(),
      type: failed ? "stage.failed" : "stage.completed",
      runId,
      stageId,
      status: stage.status,
      message: failed
        ? `${stage.label} agent failed (simulated)`
        : `${stage.label} agent completed`,
    });

    return !failed;
  }

  private async simulateGroup(
    runId: string,
    group: PipelineDefinition["groups"][number],
    options: Required<SimulationOptions>,
  ): Promise<boolean> {
    if (group.mode === "parallel") {
      const results = await Promise.all(
        group.stages.map((stage) => this.simulateStage(runId, stage.id, options)),
      );
      return results.every(Boolean);
    }

    for (const stage of group.stages) {
      const ok = await this.simulateStage(runId, stage.id, options);
      if (!ok) {
        return false;
      }
    }
    return true;
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

    let success = true;
    for (const group of pipeline.groups) {
      const groupOk = await this.simulateGroup(runId, group, options);
      if (!groupOk) {
        success = false;
        break;
      }
    }

    this.updateRun(runId, (run) => {
      run.status = success ? "completed" : "failed";
      run.completedAt = nowIso();
    });

    this.emit({
      ts: nowIso(),
      type: "run.completed",
      runId,
      status: success ? "completed" : "failed",
      message: success ? "Run completed successfully" : "Run failed",
    });
  }
}

export const orchestrator = new MockOrchestrator();
