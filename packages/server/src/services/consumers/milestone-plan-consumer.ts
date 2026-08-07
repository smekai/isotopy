import { toMilestoneProposal } from "@adhd/core";
import type { RunState, StageDefinition } from "@adhd/core";
import { extractMilestonePlan } from "../../schemas/milestone-plan.ts";
import { formatValidationIssues } from "../../domain/validation.ts";
import { nowIso } from "../../utils/time.ts";
import type { MilestoneService } from "../milestone-service.ts";
import type { StageOutputConsumer } from "./stage-output-consumer.ts";

export class MilestonePlanConsumer implements StageOutputConsumer {
  constructor(private readonly milestones: MilestoneService) {}

  async consume(
    run: RunState,
    stageDef: StageDefinition,
    output: string,
  ): Promise<void> {
    if (
      run.pipelineId !== PIPELINE_ID ||
      stageDef.id !== STAGE_ID ||
      !run.milestoneId
    ) {
      return;
    }
    const milestone = this.milestones.mutableMilestone(run.milestoneId);
    if (!milestone) {
      return;
    }
    const parsed = extractMilestonePlan(output);
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
      milestone.approvalError = formatValidationIssues(parsed.issues);
    }
    milestone.updatedAt = nowIso();
    await this.milestones.saveMilestone(milestone);
  }
}

const PIPELINE_ID = "milestone-planning";

const STAGE_ID = "milestone-plan";
