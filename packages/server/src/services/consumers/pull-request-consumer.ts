import { PULL_REQUEST_STEP_TASK, stageTitleIn } from "@isotopy/core";
import type { RunState, StageDefinition } from "@isotopy/core";
import { formatValidationIssues } from "../../domain/validation.ts";
import type { StageOutputRejection } from "../../domain/rules/stage-context.ts";
import { extractPullRequestReport } from "../../schemas/pull-request-report.ts";
import type { StageOutputConsumer } from "./stage-output-consumer.ts";

export class PullRequestConsumer implements StageOutputConsumer {
  async consume(
    run: RunState,
    stageDef: StageDefinition,
    output: string,
  ): Promise<StageOutputRejection | undefined> {
    if (stageDef.stepTask !== PULL_REQUEST_STEP_TASK) {
      return undefined;
    }
    const parsed = extractPullRequestReport(output);
    if (!parsed.ok) {
      return {
        reason: `${stageTitleIn(run, stageDef.id)} produced no usable pull request report — ${formatValidationIssues(parsed.issues)}`,
      };
    }
    run.pullRequest = parsed.value;
    return undefined;
  }
}
