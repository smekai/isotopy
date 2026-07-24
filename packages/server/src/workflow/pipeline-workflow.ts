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

/** One durable step per stage keeps today's no-retry behaviour by default. */
const STAGE_RETRY = { maximumAttempts: 1 } as const;

/** A human gate waits effectively forever; a decade is our "never times out". */
const GATE_TIMEOUT = "3650d";

export interface PipelineWorkflowResult {
  status: "completed" | "failed" | "cancelled";
}

/** The signal string a gate parks on; `approveGate` sends the same one. */
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

/**
 * A stage step, then — if the stage gates — a durable wait for the approval
 * signal. Returns the stage's aggregate outcome for the loop to act on.
 */
async function runOneStage(
  step: StepApiLike,
  deps: WorkflowDeps,
  input: PipelineWorkflowInput,
  stageDef: StageDefinition,
): Promise<StageOutcome> {
  const { runId } = input;
  // The stage step owns the "passed" transition for non-gated stages (and the
  // work + failure emit for every stage); a gated stage stops short of passed
  // and this function drives it to awaiting → approved instead.
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

/**
 * Run one pipeline group. Sequential groups run in order; a `parallel` group
 * (G5) fans out over durable steps and joins with `allSettled` so one failing
 * branch does not strand its siblings — the run fails only after they settle.
 */
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

/**
 * Build the durable pipeline workflow. `RunOrchestrator` *is* this workflow;
 * each stage step *is* the old `executeStage()`. The body stays pure
 * orchestration — every non-deterministic effect lives inside a step.
 */
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
