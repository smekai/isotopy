import {
  AGENTS,
  MODEL_TIERS,
  STAGE_EXECUTION_POLICIES,
  orchestratorDecisionSchema,
} from "@isotopy/core";
import { expect, test } from "vitest";
import { loadBundledStepTask } from "../../src/services/skills.ts";

const PROFESSIONS = Object.values(AGENTS).map((agent) => agent.profession);

const START_RUN_FIELDS = startRunFields();

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

test.each(PROFESSIONS)(
  "no example labels a role %s, because the model copies the example and the label must name the work",
  async (profession) => {
    const assignment = await loadBundledStepTask("orchestrate");

    expect(assignment).not.toContain(`"label": "${profession}"`);
  },
);

test.each(START_RUN_FIELDS)(
  "the assignment names the start_run field %s, because a field it never shows is a field the model never sends",
  async (field) => {
    const assignment = await loadBundledStepTask("orchestrate");

    expect(assignment).toContain(`"${field}"`);
  },
);

test("every start_run field is accounted for, so the sweep above cannot silently cover none", () => {
  expect(START_RUN_FIELDS.length).toBeGreaterThan(1);
});

function startRunFields(): string[] {
  const option = orchestratorDecisionSchema.options.find(
    (candidate) => candidate.shape.action.value === "start_run",
  );
  return Object.keys(option?.shape ?? {}).filter((field) => field !== "action");
}
