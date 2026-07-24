import { defineWorkflow } from "openworkflow";
import type { Workflow } from "openworkflow";
import { agentForStage } from "@adhd/core";
import type { PipelineGroup, StageDefinition } from "@adhd/core";
import { runStageWork } from "./stage-execution.ts";
import type {
  PipelineWorkflowInput,
  StageOutcome,
  WorkflowDeps,
} from "./types.ts";

export const PIPELINE_WORKFLOW_NAME = "adhd-pipeline";

const STAGE_RETRY = { maximumAttempts: 1 } as const;

const GATE_TIMEOUT = "3650d";

export interface PipelineWorkflowResult {
  status: "completed" | "failed" | "cancelled";
}

export function gateSignal(runId: string, stageId: string): string {
  return `gate:${runId}:${stageId}`;
}

interface StepApiLike {
  run<Output>(config: { name: string }, fn: () => Promise<Output> | Output): Promise<Output>;
  waitForSignal<Output>(options: {
    signal: string;
    timeout?: string;
  }): Promise<{ data: Output } | null>;
}

async function runOneStage(
  step: StepApiLike,
  deps: WorkflowDeps,
  input: PipelineWorkflowInput,
  stageDef: StageDefinition,
): Promise<StageOutcome> {
  const { runId } = input;
  const result = await step.run({ name: stageDef.id }, () =>
    runStageWork(deps, input, stageDef),
  );
  if (result.outcome !== "passed") {
    return result.outcome;
  }

  if (!stageDef.gateAfter) {
    return "passed";
  }

  await step.run({ name: `${stageDef.id}:gate:awaiting` }, () => {
    deps.projection.log(
      runId,
      stageDef.id,
      "warn",
      `${agentForStage(stageDef.id).profession} is waiting for your approval`,
    );
    deps.projection.stageAwaiting(runId, stageDef.id);
    return null;
  });

  const signal = await step.waitForSignal({
    signal: gateSignal(runId, stageDef.id),
    timeout: GATE_TIMEOUT,
  });
  if (deps.isCancelled(runId)) {
    return "cancelled";
  }
  if (signal === null) {
    await step.run({ name: `${stageDef.id}:gate:timeout` }, () => {
      deps.projection.stageFailed(runId, stageDef.id, "Gate approval timed out");
      return null;
    });
    return "failed";
  }

  await step.run({ name: `${stageDef.id}:gate:approved` }, () => {
    deps.projection.gateApproved(runId, stageDef.id);
    return null;
  });
  return "passed";
}

interface WalkState {
  reached: boolean;
}

async function runGroup(
  step: StepApiLike,
  deps: WorkflowDeps,
  input: PipelineWorkflowInput,
  group: PipelineGroup,
  walk: WalkState,
): Promise<StageOutcome> {
  const disabled = new Set(input.disabledStages ?? []);
  const seeded = input.seededOutputs ?? {};
  const runnable: StageDefinition[] = [];

  for (const stageDef of group.stages) {
    if (!walk.reached) {
      if (stageDef.id === input.startStageId) {
        walk.reached = true;
      } else {
        const seededOutput = seeded[stageDef.id];
        if (seededOutput !== undefined && !disabled.has(stageDef.id)) {
          await step.run({ name: `${stageDef.id}:seeded` }, () => {
            deps.projection.applySeededOutput(input.runId, stageDef, seededOutput);
            return null;
          });
        }
        continue;
      }
    }
    if (disabled.has(stageDef.id)) {
      continue;
    }
    runnable.push(stageDef);
  }

  if (group.mode === "parallel") {
    const settled = await Promise.allSettled(
      runnable.map((stageDef) => runOneStage(step, deps, input, stageDef)),
    );
    if (settled.some((r) => r.status === "fulfilled" && r.value === "cancelled")) {
      return "cancelled";
    }
    if (settled.some((r) => r.status === "rejected" || r.value !== "passed")) {
      return "failed";
    }
    return "passed";
  }

  for (const stageDef of runnable) {
    const outcome = await runOneStage(step, deps, input, stageDef);
    if (outcome !== "passed") {
      return outcome;
    }
  }
  return "passed";
}

export function createPipelineWorkflow(
  deps: WorkflowDeps,
): Workflow<PipelineWorkflowInput, PipelineWorkflowResult, PipelineWorkflowInput> {
  return defineWorkflow<PipelineWorkflowInput, PipelineWorkflowResult>(
    { name: PIPELINE_WORKFLOW_NAME, retryPolicy: STAGE_RETRY },
    async ({ input, step }) => {
      const { runId, pipeline } = input;

      await step.run({ name: "run:started" }, () => {
        deps.projection.runStarted(runId, input.startedMessage);
        return null;
      });

      const walk: WalkState = { reached: input.startStageId == null };
      let terminal: PipelineWorkflowResult["status"] = "completed";

      for (const group of pipeline.groups) {
        const outcome = await runGroup(step, deps, input, group, walk);
        if (outcome === "cancelled") {
          return { status: "cancelled" };
        }
        if (outcome === "failed") {
          terminal = "failed";
          break;
        }
      }

      if (deps.isCancelled(runId)) {
        return { status: "cancelled" };
      }

      const status = terminal;
      await step.run({ name: "run:completed" }, () => {
        deps.projection.runCompleted(runId, status);
        return null;
      });
      return { status };
    },
  );
}
