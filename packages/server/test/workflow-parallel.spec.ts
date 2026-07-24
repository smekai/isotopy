import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OpenWorkflow } from "openworkflow";
import { BackendSqlite } from "openworkflow/sqlite";
import { DEFAULT_PERMISSION_MODE, createInitialRunState } from "@adhd/core";
import type { PipelineDefinition, RunState, StageDefinition, StageVerdict } from "@adhd/core";
import { ProjectRegistry } from "../src/services/project-registry.ts";
import { SettingsStore } from "../src/services/settings-store.ts";
import { createPipelineWorkflow } from "../src/workflow/pipeline-workflow.ts";
import type { PipelineWorkflowInput, RunProjection, WorkflowDeps } from "../src/workflow/types.ts";

const PARALLEL_PIPELINE: PipelineDefinition = {
  id: "parallel-test",
  name: "Parallel test",
  description: "Two branches fan out over one shared workspace.",
  groups: [
    {
      mode: "parallel",
      stages: [
        { id: "branch-a", label: "Branch A" },
        { id: "branch-b", label: "Branch B" },
      ],
    },
  ],
};

class RecordingProjection implements RunProjection {
  readonly started: string[] = [];
  private readonly run: RunState;

  constructor(runId: string) {
    this.run = createInitialRunState({
      runId,
      number: 1,
      projectId: "test",
      pipeline: PARALLEL_PIPELINE,
    });
  }

  getRun(): RunState {
    return this.run;
  }
  bindOwRun(): void {}
  runStarted(): void {
    this.run.status = "running";
  }
  stageStarted(_runId: string, stageId: string): void {
    this.started.push(stageId);
    this.stage(stageId).status = "running";
  }
  log(): void {}
  stageAwaiting(): void {}
  gateApproved(): void {}
  stagePassed(_runId: string, stageId: string): void {
    this.stage(stageId).status = "passed";
  }
  stageFailed(_runId: string, stageId: string): void {
    this.stage(stageId).status = "failed";
  }
  stageSkipped(): void {}
  setVerdict(_runId: string, stageId: string, verdict: StageVerdict): void {
    this.stage(stageId).verdict = verdict;
  }
  captureStageOutput(_runId: string, stageDef: StageDefinition, output: string): void {
    this.run.stageOutputs = { ...this.run.stageOutputs, [stageDef.id]: output };
  }
  applySeededOutput(): void {}
  runCompleted(_runId: string, status: "completed" | "failed"): void {
    this.run.status = status;
  }

  private stage(stageId: string) {
    const stage = this.run.stages.find((s) => s.id === stageId);
    if (!stage) {
      throw new Error(`no stage ${stageId}`);
    }
    return stage;
  }
}

function makeDeps(projection: RunProjection): WorkflowDeps {
  return {
    projection,
    registry: new ProjectRegistry(),
    settings: new SettingsStore(),
    beginEngineStage: () => new AbortController(),
    endEngineStage: () => {},
    isCancelled: () => false,
  };
}

async function runToTerminal(
  dbPath: string,
  input: PipelineWorkflowInput,
  projection: RunProjection,
): Promise<{ status: string; output: unknown }> {
  const backend = BackendSqlite.connect(dbPath);
  const ow = new OpenWorkflow({ backend });
  const workflow = createPipelineWorkflow(makeDeps(projection));
  ow.implementWorkflow(workflow.spec, workflow.fn);
  const worker = ow.newWorker({ concurrency: 1 });
  await worker.start();
  const handle = await ow.runWorkflow(workflow.spec, input);
  const owRunId = handle.workflowRun.id;

  let run = await backend.getWorkflowRun({ workflowRunId: owRunId });
  const deadline = Date.now() + 10_000;
  while (run && !isTerminal(run.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    run = await backend.getWorkflowRun({ workflowRunId: owRunId });
  }
  await worker.stop();
  await backend.stop();
  return { status: run?.status ?? "unknown", output: run?.output };
}

function isTerminal(status: string): boolean {
  return ["succeeded", "completed", "failed", "canceled"].includes(status);
}

function inputFor(runId: string, failProbability: number): PipelineWorkflowInput {
  return {
    runId,
    projectId: "test",
    pipeline: PARALLEL_PIPELINE,
    permissionMode: DEFAULT_PERMISSION_MODE,
    simOptions: { minDurationMs: 10, maxDurationMs: 10, failProbability },
    startedMessage: "start",
  };
}

describe("G5 declared parallel branches", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "adhd-parallel-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(
      () => undefined,
    );
  });

  it("fans out both branches and joins on success", async () => {
    const projection = new RecordingProjection("par-ok");
    const result = await runToTerminal(
      path.join(dir, "runs.db"),
      inputFor("par-ok", 0),
      projection,
    );

    expect(projection.started.sort()).toEqual(["branch-a", "branch-b"]);
    expect(projection.getRun().stages.map((s) => s.status).sort()).toEqual([
      "passed",
      "passed",
    ]);
    expect((result.output as { status: string }).status).toBe("completed");
  });

  it("fails the group when a branch fails, without stranding its sibling", async () => {
    const projection = new RecordingProjection("par-fail");
    const result = await runToTerminal(
      path.join(dir, "runs.db"),
      inputFor("par-fail", 1),
      projection,
    );

    expect(projection.started.sort()).toEqual(["branch-a", "branch-b"]);
    expect((result.output as { status: string }).status).toBe("failed");
  });
});
