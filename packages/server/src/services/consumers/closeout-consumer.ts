import { rm } from "node:fs/promises";
import path from "node:path";
import { agentForStage } from "@isotopy/core";
import type {
  CleanupResult,
  CloseoutReport,
  RunCloseoutRecord,
  RunState,
  StageDefinition,
} from "@isotopy/core";
import {
  parseCloseoutReport,
  validateSourceTaskOutcome,
} from "../../domain/rules/closeout.ts";
import { runsDir } from "../../paths.ts";
import type { ProjectPath } from "../../paths.ts";
import { nowIso } from "../../utils/time.ts";
import type { ProjectRegistry } from "../project-registry.ts";
import { persistRunCloseout } from "../run-evidence.ts";
import { taskBoardFor } from "../task-board-adapter.ts";
import type { StageOutputRejection } from "../../domain/rules/stage-context.ts";
import type { StageOutputConsumer } from "./stage-output-consumer.ts";

export interface CloseoutApplication {
  record: RunCloseoutRecord;
  reportErrors: string[];
}

export class CloseoutConsumer implements StageOutputConsumer {
  constructor(private readonly registry: ProjectRegistry) {}

  async consume(
    run: RunState,
    stageDef: StageDefinition,
    output: string,
  ): Promise<StageOutputRejection | undefined> {
    if (stageDef.stepTask !== CLOSEOUT_STEP_TASK) {
      return undefined;
    }
    const applied = await applyCloseoutReport(
      this.registry.resolve(run.projectId),
      run,
      output,
    );
    run.closeout = applied.record;
    if (applied.reportErrors.length === 0) {
      return undefined;
    }
    return {
      reason: `${agentForStage(stageDef).profession} produced no usable closeout — ${applied.reportErrors.join("; ")}`,
    };
  }
}

export async function applyCloseoutReport(
  projectPath: ProjectPath,
  run: RunState,
  output: string,
): Promise<CloseoutApplication> {
  const parsed = parseCloseoutReport(output);
  const review = validateSourceTaskOutcome(run, parsed.report);
  const reportErrors = [...parsed.validationErrors, ...review.contradictions];
  const sideEffectErrors: string[] = [];
  const taskBoard = taskBoardFor(projectPath);
  const createdTasks = await taskBoard
    .createFollowUpTasks(run, parsed.report.tasks)
    .catch((error: unknown) => {
      sideEffectErrors.push(
        `Task creation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    });
  await taskBoard
    .transitionTasks(parsed.report.completedTaskIds, "Done", run.id)
    .catch((error: unknown) => {
      sideEffectErrors.push(
        `Task transition failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  const cleanup = await cleanupRunTemp(
    projectPath,
    run.id,
    parsed.report,
  ).catch((error: unknown) => {
    sideEffectErrors.push(
      `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      removed: [],
      rejected: parsed.report.cleanup.map((item) => item.relativePath),
    };
  });
  const record: RunCloseoutRecord = {
    report: parsed.report,
    createdTasks,
    cleanup,
    validationErrors: [
      ...reportErrors,
      ...review.recoveries,
      ...sideEffectErrors,
    ],
    completedAt: nowIso(),
  };
  await persistRunCloseout(projectPath, run.id, record);
  return { record, reportErrors };
}

const CLOSEOUT_STEP_TASK = "closeout-feature";

async function cleanupRunTemp(
  projectPath: ProjectPath,
  runId: string,
  report: CloseoutReport,
): Promise<CleanupResult> {
  const tempRoot = path.resolve(runsDir(projectPath), runId, "tmp");
  const removed: string[] = [];
  const rejected: string[] = [];
  for (const candidate of report.cleanup) {
    const relative = candidate.relativePath;
    const allowed =
      relative === "." ||
      (!path.isAbsolute(relative) &&
        relative !== "" &&
        relative !== ".." &&
        path.basename(relative) === relative);
    if (!allowed) {
      rejected.push(relative);
      continue;
    }
    const target = relative === "." ? tempRoot : path.join(tempRoot, relative);
    if (target !== tempRoot && !target.startsWith(`${tempRoot}${path.sep}`)) {
      rejected.push(relative);
      continue;
    }
    await rm(target, { recursive: true, force: true, maxRetries: 3 });
    removed.push(relative);
  }
  return { removed, rejected };
}
