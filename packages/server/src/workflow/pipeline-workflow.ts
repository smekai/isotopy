import { defineWorkflow } from "openworkflow";
import type { Workflow } from "openworkflow";
import {
  STAGE_EXECUTION_POLICIES,
  STAGE_OUTCOMES,
  agentForStage,
} from "@adhd/core";
import type {
  PipelineGroup,
  StageDefinition,
  StageExecutionPolicy,
} from "@adhd/core";
import { runStageWork } from "./stage-execution.ts";
import type {
  PipelineWorkflowInput,
  RunCompletionStatus,
  StageOutcome,
  StageTurn,
  WorkflowDeps,
} from "./types.ts";

export const PIPELINE_WORKFLOW_NAME = "adhd-pipeline";

const STAGE_RETRY = { maximumAttempts: 1 } as const;

const GATE_TIMEOUT = "3650d";

const ANSWER_TIMEOUT = "3650d";

export interface PipelineWorkflowResult {
  status: RunCompletionStatus | "cancelled";
}

export function gateSignal(runId: string, stageId: string): string {
  return `gate:${runId}:${stageId}`;
}

export function answerSignal(runId: string, stageId: string): string {
  return `answer:${runId}:${stageId}`;
}

export interface AnswerSignalPayload {
  text: string;
}

interface StepApiLike {
  run<Output>(config: { name: string }, fn: () => Promise<Output> | Output): Promise<Output>;
  waitForSignal<Output>(options: {
    signal: string;
    timeout?: string;
  }): Promise<{ data: Output } | null>;
}

async function runStageTurns(
  step: StepApiLike,
  deps: WorkflowDeps,
  input: PipelineWorkflowInput,
  stageDef: StageDefinition,
): Promise<StageOutcome> {
  const { runId } = input;
  let turn: StageTurn = { index: 0 };

  for (;;) {
    const result = await step.run({ name: `${stageDef.id}:turn:${turn.index}` }, () =>
      runStageWork(deps, input, stageDef, turn),
    );
    if (result.outcome !== STAGE_OUTCOMES.ASKING) {
      return result.outcome;
    }

    const signal = await step.waitForSignal<AnswerSignalPayload>({
      signal: answerSignal(runId, stageDef.id),
      timeout: ANSWER_TIMEOUT,
    });
    if (deps.isCancelled(runId)) {
      return STAGE_OUTCOMES.CANCELLED;
    }
    if (signal === null) {
      await step.run({ name: `${stageDef.id}:answer:timeout:${turn.index}` }, () => {
        deps.projection.stageFailed(runId, stageDef.id, "Nobody answered the question");
        return null;
      });
      return STAGE_OUTCOMES.FAILED;
    }

    turn = {
      index: turn.index + 1,
      resumeSessionId: result.sessionId,
      answer: signal.data.text,
    };
  }
}

async function runOneStage(
  step: StepApiLike,
  deps: WorkflowDeps,
  input: PipelineWorkflowInput,
  stageDef: StageDefinition,
): Promise<StageOutcome> {
  const { runId } = input;
  const outcome = await runStageTurns(step, deps, input, stageDef);
  if (outcome !== STAGE_OUTCOMES.PASSED) {
    return outcome;
  }

  if (!stageDef.gateAfter) {
    return STAGE_OUTCOMES.PASSED;
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
    return STAGE_OUTCOMES.CANCELLED;
  }
  if (signal === null) {
    await step.run({ name: `${stageDef.id}:gate:timeout` }, () => {
      deps.projection.stageFailed(runId, stageDef.id, "Gate approval timed out");
      return null;
    });
    return STAGE_OUTCOMES.FAILED;
  }

  await step.run({ name: `${stageDef.id}:gate:approved` }, () => {
    deps.projection.gateApproved(runId, stageDef.id);
    return null;
  });
  return STAGE_OUTCOMES.PASSED;
}

interface WalkState {
  reached: boolean;
  status: RunCompletionStatus;
}

function executionPolicy(stageDef: StageDefinition): StageExecutionPolicy {
  return stageDef.executionPolicy ?? STAGE_EXECUTION_POLICIES.STANDARD;
}

function canRunStage(stageDef: StageDefinition, status: RunCompletionStatus): boolean {
  if (status === "completed") {
    return true;
  }
  const policy = executionPolicy(stageDef);
  if (status === "needs_attention") {
    return (
      policy === STAGE_EXECUTION_POLICIES.QUALITY ||
      policy === STAGE_EXECUTION_POLICIES.CLOSEOUT
    );
  }
  return policy === STAGE_EXECUTION_POLICIES.CLOSEOUT;
}

function mergeOutcome(status: RunCompletionStatus, outcome: StageOutcome): RunCompletionStatus {
  if (outcome === STAGE_OUTCOMES.FAILED) {
    return "failed";
  }
  if (outcome === STAGE_OUTCOMES.NEEDS_ATTENTION && status !== "failed") {
    return "needs_attention";
  }
  return status;
}

async function suppressStage(
  step: StepApiLike,
  deps: WorkflowDeps,
  runId: string,
  stageDef: StageDefinition,
  status: RunCompletionStatus,
): Promise<void> {
  await step.run({ name: `${stageDef.id}:suppressed:${status}` }, () => {
    const reason =
      status === "failed"
        ? "an earlier engine or runtime failure"
        : "blocking quality findings";
    deps.projection.log(
      runId,
      stageDef.id,
      "warn",
      `${agentForStage(stageDef.id).profession} suppressed because of ${reason}`,
    );
    deps.projection.stageSkipped(runId, stageDef.id);
    return null;
  });
}

async function runGroup(
  step: StepApiLike,
  deps: WorkflowDeps,
  input: PipelineWorkflowInput,
  group: PipelineGroup,
  walk: WalkState,
): Promise<boolean> {
  const seeded = input.seededOutputs ?? {};
  const seededOutcomes = input.seededOutcomes ?? {};

  for (const stageDef of group.stages) {
    if (!walk.reached) {
      if (stageDef.id === input.startStageId) {
        walk.reached = true;
      } else {
        const seededOutput = seeded[stageDef.id];
        if (seededOutput !== undefined) {
          await step.run({ name: `${stageDef.id}:seeded` }, () => {
            deps.projection.applySeededOutput(input.runId, stageDef, seededOutput);
            return null;
          });
        }
        const seededOutcome = seededOutcomes[stageDef.id];
        if (seededOutcome !== undefined) {
          walk.status = mergeOutcome(walk.status, seededOutcome);
        }
        continue;
      }
    }
    if (!canRunStage(stageDef, walk.status)) {
      await suppressStage(step, deps, input.runId, stageDef, walk.status);
      continue;
    }
    const outcome = await runOneStage(step, deps, input, stageDef);
    if (outcome === STAGE_OUTCOMES.CANCELLED) {
      return true;
    }
    walk.status = mergeOutcome(walk.status, outcome);
  }
  return false;
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

      const walk: WalkState = {
        reached: input.startStageId == null,
        status: "completed",
      };

      for (const group of pipeline.groups) {
        const cancelled = await runGroup(step, deps, input, group, walk);
        if (cancelled) {
          return { status: "cancelled" };
        }
      }

      if (deps.isCancelled(runId)) {
        return { status: "cancelled" };
      }

      const status = walk.status;
      await step.run({ name: "run:completed" }, () => {
        deps.projection.runCompleted(runId, status);
        return null;
      });
      return { status };
    },
  );
}
