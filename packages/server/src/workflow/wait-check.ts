import { stageTitleIn } from "@isotopy/core";
import type { StageDefinition } from "@isotopy/core";
import type { StageWaitCheck, WaitCheckResult } from "../domain/rules/stage-wait.ts";
import { runSubprocess } from "../engines/subprocess.ts";
import type { SubprocessResult } from "../engines/subprocess.ts";
import type { StageWorkContext, WorkflowDeps } from "./types.ts";

export interface WaitCheckWork {
  context: StageWorkContext;
  stageDef: StageDefinition;
  check: StageWaitCheck;
  attempt: number;
  attempts: number;
}

const OUTPUT_TAIL_LINES = 40;

function outputTail(result: SubprocessResult): string {
  const lines = [...result.stdout.split(/\r?\n/), ...result.stderrTail, result.errorMessage ?? ""];
  return lines
    .filter((line) => line.trim() !== "")
    .slice(-OUTPUT_TAIL_LINES)
    .join("\n");
}

export async function runWaitCheckWork(
  deps: WorkflowDeps,
  { context, stageDef, check, attempt, attempts }: WaitCheckWork,
): Promise<WaitCheckResult> {
  const run = deps.projection.getRun(context.runId);
  if (run === undefined) {
    return { met: false, exitCode: null, outputTail: "" };
  }
  const result = await runSubprocess({
    command: check.executable,
    args: check.args,
    cwd: run.workspacePath ?? deps.registry.resolve(run.projectId).root,
    timeoutMs: check.timeoutMs,
  });
  const exit = result.exitCode ?? "none";
  deps.projection.log(run.id, stageDef.id, {
    level: result.success ? "pass" : "info",
    message: `${stageTitleIn(run, stageDef.id)} wait check ${attempt + 1}/${attempts}: exit ${exit}`,
  });
  return { met: result.success, exitCode: result.exitCode, outputTail: outputTail(result) };
}
