import type { RunState, StageDefinition, StageLogDraft } from "@isotopy/core";
import { config } from "../config.ts";
import { buildProductEnvironment } from "../domain/markdown/product-environment.ts";
import {
  buildContinuationPrompt,
  buildResumePrompt,
  buildStagePrompt,
  buildTimeBudget,
} from "../domain/markdown/stage.ts";
import type { UpstreamOutput } from "../domain/markdown/stage.ts";
import { formatValidationIssues } from "../domain/validation.ts";
import type { ProjectPath } from "../paths.ts";
import type { StepTaskContext } from "../schemas/step-task.ts";
import { loadSkill } from "../services/skills.ts";
import { loadStepTask } from "../services/step-tasks.ts";
import type { StepTask } from "../services/step-tasks.ts";
import type { PipelineWorkflowInput, StageTurn, WorkflowDeps } from "./types.ts";

export interface StageInputs {
  persona?: string;
  stepTask?: StepTask;
  prompt: string;
  notices: StageLogDraft[];
}

const PRODUCT_ENVIRONMENT: StepTaskContext = "product-environment";

export async function resolveStageInputs(
  deps: WorkflowDeps,
  input: PipelineWorkflowInput,
  run: RunState,
  stageDef: StageDefinition,
  turn: StageTurn,
): Promise<StageInputs> {
  const projectPath = deps.registry.resolve(run.projectId);
  const persona = stageDef.skill ? await loadSkill(projectPath, stageDef.skill) : undefined;
  const loaded = stageDef.stepTask
    ? await loadStepTask(projectPath, stageDef.stepTask)
    : undefined;
  const stepTask = loaded?.ok ? loaded.value : undefined;
  const environment = await stageEnvironment(deps, run, stepTask);
  return {
    persona,
    stepTask,
    prompt: turnPrompt(input, run, stageDef, turn, stepTask?.assignment, environment),
    notices: [...personaNotices(stageDef, persona), ...stepTaskNotices(stageDef, loaded)],
  };
}

export async function loadInternalStepTask(
  projectPath: ProjectPath,
  id: string,
): Promise<StepTask | undefined> {
  const loaded = await loadStepTask(projectPath, id);
  return loaded?.ok ? loaded.value : undefined;
}

function personaNotices(
  stageDef: StageDefinition,
  persona: string | undefined,
): StageLogDraft[] {
  return stageDef.skill && persona === undefined
    ? [
        {
          level: "warn",
          message: `No skill "${stageDef.skill}" found — running without a persona`,
        },
      ]
    : [];
}

function stepTaskNotices(
  stageDef: StageDefinition,
  loaded: Awaited<ReturnType<typeof loadStepTask>>,
): StageLogDraft[] {
  if (!stageDef.stepTask) {
    return [];
  }
  if (loaded === undefined) {
    return [
      {
        level: "warn",
        message: `No step task "${stageDef.stepTask}" found — running without assignment instructions`,
      },
    ];
  }
  return loaded.ok
    ? []
    : [
        {
          level: "warn",
          message: `Step task "${stageDef.stepTask}" is malformed (${formatValidationIssues(loaded.issues)}) — running without assignment instructions`,
        },
      ];
}

function turnPrompt(
  input: PipelineWorkflowInput,
  run: RunState,
  stageDef: StageDefinition,
  turn: StageTurn,
  assignment: string | undefined,
  environment: string | undefined,
): string {
  if (turn.resumeSessionId !== undefined) {
    return turn.answer ?? buildResumePrompt(assignment);
  }
  const task = input.task ?? "";
  const upstream = upstreamFor(run, stageDef.id);
  return turn.exchanges === undefined || turn.exchanges.length === 0
    ? buildStagePrompt(task, upstream, assignment, environment)
    : buildContinuationPrompt({
        task,
        upstream,
        exchanges: turn.exchanges,
        stepTask: assignment,
        environment,
      });
}

async function stageEnvironment(
  deps: WorkflowDeps,
  run: RunState,
  stepTask: StepTask | undefined,
): Promise<string> {
  const product = await productEnvironment(deps, run, stepTask);
  return [buildTimeBudget(config.engineTimeoutMs), product].filter(Boolean).join("\n\n");
}

async function productEnvironment(
  deps: WorkflowDeps,
  run: RunState,
  stepTask: StepTask | undefined,
): Promise<string | undefined> {
  if (!stepTask?.context.includes(PRODUCT_ENVIRONMENT)) {
    return undefined;
  }
  const project = deps.registry.resolve(run.projectId);
  if ((await deps.automation.get(project)).ui === undefined) {
    return undefined;
  }
  return buildProductEnvironment({
    apiBaseUrl: `http://localhost:${config.port}`,
    projectId: run.projectId,
    runningUrl: deps.product?.urlFor(run.projectId),
  });
}

function upstreamFor(run: RunState, stageId: string): UpstreamOutput[] {
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
