import { MODEL_TIERS, STAGE_EXECUTION_POLICIES } from "@adhd/core";
import { expect, test } from "vitest";
import { loadBundledStepTask } from "../../src/services/skills.ts";

test.each(Object.values(STAGE_EXECUTION_POLICIES))(
  "the assignment names the %s policy, because a value it omits gets invented and rejected",
  async (policy) => {
    const assignment = await loadBundledStepTask("orchestrate");

    expect(assignment).toContain(`\`${policy}\``);
  },
);

test.each(MODEL_TIERS)(
  "the assignment names the %s tier, because a value it omits gets invented and rejected",
  async (tier) => {
    const assignment = await loadBundledStepTask("orchestrate");

    expect(assignment).toContain(`\`${tier}\``);
  },
);
