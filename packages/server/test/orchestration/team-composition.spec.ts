import { assert, expect, test } from "vitest";
import type {
  OrchestratorRole,
  OrchestratorTeamProposal,
  PipelineDefinition,
  StageDefinition,
} from "@isotopy/core";
import {
  composeTeamPipeline,
  composedPipelineId,
  generationOf,
  sameComposition,
  withRoleTiers,
} from "../../src/schemas/team-composition.ts";
import { formatValidationIssues } from "../../src/domain/validation.ts";

test("an invented persona id is rejected, rather than degrading the stage to no persona", () => {
  const composed = composeTeamPipeline(team([role({ skill: "wizard" })]), "abc123");

  expect(issuesOf(composed)).toContain("roles.0.skill: Unknown persona: wizard");
});

test("an invented step task id is rejected on the field that carries it", () => {
  const composed = composeTeamPipeline(
    team([role({ stepTask: "do-the-thing" })]),
    "abc123",
  );

  expect(issuesOf(composed)).toContain(
    "roles.0.stepTask: Unknown step task: do-the-thing",
  );
});

test("the Orchestrator cannot compose itself into the team it is proposing", () => {
  const composed = composeTeamPipeline(
    team([role({ skill: "orchestrator", stepTask: "orchestrate" })]),
    "abc123",
  );

  expect(issuesOf(composed)).toBe(
    "roles.0.skill: Unknown persona: orchestrator; roles.0.stepTask: Unknown step task: orchestrate",
  );
});

test("a role id that would escape the run directory is rejected before it reaches a path", () => {
  const composed = composeTeamPipeline(
    team([role({ id: "../../escape" })]),
    "abc123",
  );

  expect(issuesOf(composed)).toContain(
    "roles.0.id: Role id must contain only lowercase letters, digits, and hyphens",
  );
});

test("two roles sharing an id are rejected, because their outputs would collide", () => {
  const composed = composeTeamPipeline(
    team([role({ id: "build" }), role({ id: "build" })]),
    "abc123",
  );

  expect(issuesOf(composed)).toBe("roles.1.id: Duplicate role id: build");
});

test("a role that declares no execution policy is composed as a standard stage", () => {
  const composed = composeTeamPipeline(team([role({})]), "abc123");

  expect(stagesOf(composed)[0]).toMatchObject({ executionPolicy: "standard" });
});

// The Orchestrator decides its own team's gates, and TASK-148 makes fixed pipelines
// configurable without touching that. These two pin the composed side so the
// difference stays deliberate.
test("a role that asks for a gate is composed as a gated stage", () => {
  const composed = composeTeamPipeline(team([role({ id: "intake", gateAfter: true })]), "abc123");

  expect(stagesOf(composed)[0]).toMatchObject({ gateAfter: true });
});

test("a role that asks for no gate is composed without one, whatever the project prefers", () => {
  const composed = composeTeamPipeline(team([role({ id: "intake" })]), "abc123");

  const [stage] = stagesOf(composed);
  assert(stage, "expected the team to compose one stage");
  expect(stage.gateAfter).toBeUndefined();
});

test("a declared execution policy survives composition, so quality stages still run after a failure", () => {
  const composed = composeTeamPipeline(
    team([role({ id: "test", executionPolicy: "quality" })]),
    "abc123",
  );

  expect(stagesOf(composed)[0]).toMatchObject({ executionPolicy: "quality" });
});

test("stages are composed in the order the team proposed them", () => {
  const composed = composeTeamPipeline(
    team([role({ id: "first" }), role({ id: "second" }), role({ id: "third" })]),
    "abc123",
  );

  expect(stagesOf(composed).map((stage) => stage.id)).toEqual([
    "first",
    "second",
    "third",
  ]);
});

test("the composed pipeline is named for the orchestration that produced it", () => {
  const composed = composeTeamPipeline(team([role({})]), "abc123");

  expect(valueOf(composed).id).toBe("team-abc123-1");
});

// An initiative can compose more than one team, and a run has to be attributable
// to the team it actually ran with — which the shared `pipelineId`/`pipelineName`
// could not express while every generation was called the same thing.
test("a later team gets its own pipeline id, so two runs are not both team-abc123", () => {
  const first = composeTeamPipeline(team([role({})]), "abc123", 1);
  const second = composeTeamPipeline(team([role({})]), "abc123", 2);

  expect(valueOf(second).id).not.toBe(valueOf(first).id);
});

test("a later team says so in its name, because that is what every run list already shows", () => {
  const composed = composeTeamPipeline(team([role({})]), "abc123", 2);

  expect(valueOf(composed).name).toBe("Delivery pair (team 2)");
});

test("the first team is named plainly, so an initiative with one team reads as it always did", () => {
  const composed = composeTeamPipeline(team([role({})]), "abc123", 1);

  expect(valueOf(composed).name).toBe("Delivery pair");
});

test("a team whose roles are unchanged is the same composition, whatever generation it carries", () => {
  const first = composeTeamPipeline(team([role({})]), "abc123", 1);
  const second = composeTeamPipeline(team([role({})]), "abc123", 2);

  expect(sameComposition(valueOf(first), valueOf(second))).toBe(true);
});

test("a dropped role is a different composition, so the user is asked before it runs", () => {
  const pair = composeTeamPipeline(team([role({}), role({ id: "test" })]), "abc123");
  const solo = composeTeamPipeline(team([role({})]), "abc123");

  expect(sameComposition(valueOf(pair), valueOf(solo))).toBe(false);
});

test("a changed model tier is a different composition, because it changes what the run costs", () => {
  const balanced = composeTeamPipeline(team([role({ modelTier: "balanced" })]), "abc123");
  const deep = composeTeamPipeline(team([role({ modelTier: "deep" })]), "abc123");

  expect(sameComposition(valueOf(balanced), valueOf(deep))).toBe(false);
});

test("a role's model tier reaches the stage, which is the only place resolution reads it", () => {
  const composed = composeTeamPipeline(team([role({ modelTier: "deep" })]), "abc123");

  expect(stagesOf(composed)[0]).toMatchObject({ modelTier: "deep" });
});

test("a role that names no tier composes without one, so the stage falls back to the run's", () => {
  const composed = composeTeamPipeline(team([role({})]), "abc123");

  expect(stagesOf(composed)[0]?.modelTier).toBeUndefined();
});

test("the user's tier for a role replaces what the Orchestrator proposed for it", () => {
  const proposed = team([role({ id: "build", modelTier: "max" }), role({ id: "check" })]);

  const approved = withRoleTiers(proposed, { build: "fast" });

  expect(rolesOf(approved).map((entry) => entry.modelTier)).toEqual(["fast", undefined]);
});

test("a role the user did not touch keeps what the Orchestrator proposed", () => {
  const proposed = team([role({ id: "build", modelTier: "max" })]);

  const approved = withRoleTiers(proposed, {});

  expect(rolesOf(approved)[0]?.modelTier).toBe("max");
});

test("clearing a role back to the run default is a choice the user can express", () => {
  // null is the cleared state; absent means untouched, and cannot say this.
  const proposed = team([role({ id: "build", modelTier: "max" })]);

  const approved = withRoleTiers(proposed, { build: null });

  expect(rolesOf(approved)[0]?.modelTier).toBeUndefined();
});

test("a tier for a role that is not on the team is rejected rather than silently dropped", () => {
  const proposed = team([role({ id: "build" })]);

  const approved = withRoleTiers(proposed, { typo: "fast" });

  assert(!approved.ok, "expected an unknown role id to be rejected");
  expect(formatValidationIssues(approved.issues)).toBe("roleTiers.typo: Unknown role id: typo");
});

function rolesOf(approved: ReturnType<typeof withRoleTiers>): OrchestratorRole[] {
  assert(approved.ok, "expected the approved team to be valid");
  return approved.value.roles;
}

function role(overrides: Partial<OrchestratorRole>): OrchestratorRole {
  return {
    id: overrides.id ?? "implementation",
    label: overrides.label ?? "Developer",
    skill: overrides.skill ?? "developer",
    stepTask: overrides.stepTask ?? "implement-feature",
    rationale: overrides.rationale,
    modelTier: overrides.modelTier,
    executionPolicy: overrides.executionPolicy,
    gateAfter: overrides.gateAfter,
    interactive: overrides.interactive,
  };
}

function team(roles: OrchestratorRole[]): OrchestratorTeamProposal {
  return { name: "Delivery pair", summary: "Build it and verify it", roles };
}

type Composed = ReturnType<typeof composeTeamPipeline>;

function issuesOf(composed: Composed): string {
  assert(!composed.ok, "expected composition to be rejected");
  return formatValidationIssues(composed.issues);
}

function valueOf(composed: Composed): PipelineDefinition {
  assert(composed.ok, "expected composition to succeed");
  return composed.value;
}

function stagesOf(composed: Composed): StageDefinition[] {
  return valueOf(composed).groups.flatMap((group) => group.stages);
}

// An orchestration id is eight hex characters and can be all digits, so a legacy
// `team-12345678` must not read as generation 12345678 and mint `team-12345678-12345679`.
test("a legacy all-numeric pipeline id reads as no generation, not as a huge one", () => {
  expect(generationOf("team-12345678")).toBe(0);
});

test("a legacy pipeline id reads as no generation, so the next approval is the first", () => {
  expect(generationOf("team-abc12345")).toBe(0);
});

test("a composed pipeline id reads back the generation it carries", () => {
  expect(generationOf(composedPipelineId("abc12345", 3))).toBe(3);
});

test("a renamed team with the same roles is still the same composition", () => {
  const named = composeTeamPipeline({ ...team([role({})]), name: "Fix crew" }, "abc12345");
  const original = composeTeamPipeline(team([role({})]), "abc12345");

  expect(sameComposition(valueOf(named), valueOf(original))).toBe(true);
});
