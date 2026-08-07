import { agentForStage, toMilestoneProposal } from "@adhd/core";
import type { RunState, StageDefinition } from "@adhd/core";
import { extractMilestonePlan } from "../../schemas/milestone-plan.ts";
import { formatValidationIssues } from "../../domain/validation.ts";
import { nowIso } from "../../utils/time.ts";
import type { MilestoneService } from "../milestone-service.ts";
import type {
  StageOutputConsumer,
  StageOutputRejection,
} from "./stage-output-consumer.ts";

export class MilestonePlanConsumer implements StageOutputConsumer {
  constructor(private readonly milestones: MilestoneService) {}

  async consume(
    run: RunState,
    stageDef: StageDefinition,
    output: string,
  ): Promise<StageOutputRejection | undefined> {
    if (
      run.pipelineId !== PIPELINE_ID ||
      stageDef.id !== STAGE_ID ||
      !run.milestoneId
    ) {
      return undefined;
    }
    const milestone = this.milestones.mutableMilestone(run.milestoneId);
    if (!milestone) {
      return rejection(stageDef, `milestone ${run.milestoneId} is no longer loaded`);
    }
    const parsed = extractMilestonePlan(output);
    const unusable = parsed.ok ? undefined : formatValidationIssues(parsed.issues);
    if (parsed.ok) {
      milestone.proposal = toMilestoneProposal(
        parsed.value,
        (milestone.proposal?.revision ?? 0) + 1,
        nowIso(),
      );
      milestone.name = parsed.value.name;
      milestone.goal = parsed.value.goal;
      delete milestone.approvalError;
    } else {
      milestone.approvalError = unusable;
    }
    milestone.updatedAt = nowIso();
    await this.milestones.saveMilestone(milestone);
    return unusable === undefined ? undefined : rejection(stageDef, unusable);
  }
}

function rejection(stageDef: StageDefinition, detail: string): StageOutputRejection {
  return {
    reason: `${agentForStage(stageDef.id).profession} produced no usable milestone plan — ${detail}`,
  };
}

const PIPELINE_ID = "milestone-planning";

const STAGE_ID = "milestone-plan";
