import { assert, expect, test } from "vitest";
import type {
  OrchestratorRole,
  OrchestratorTeamProposal,
  PipelineDefinition,
  StageDefinition,
} from "@adhd/core";
import { composeTeamPipeline, withRoleTiers } from "../../src/schemas/team-composition.ts";
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

  expect(valueOf(composed).id).toBe("team-abc123");
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
