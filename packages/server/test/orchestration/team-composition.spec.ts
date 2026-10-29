import { assert, expect, test } from "vitest";
import type {
  PipelineDefinition,
  StageDefinition,
  TeamDefinition,
  TeamFlowStep,
  TeamRole,
} from "@isotopy/core";
import { composeFlowPipeline } from "../../src/domain/rules/team-composition.ts";
import type { KnownAgentIds } from "../../src/domain/rules/agent-catalog.ts";
import { formatValidationIssues } from "../../src/domain/validation.ts";

test("an agent and step only the project brings compose once its catalog names them", () => {
  const composed = composeFlowPipeline(
    team([role({ agent: "growth-marketer" })], [step({ step: "plan-campaign" })]),
    "work",
    known({ personas: ["growth-marketer"], steps: ["plan-campaign"] }),
  );

  expect(stagesOf(composed).map((stage) => stage.skill)).toEqual(["growth-marketer"]);
});

test("an invented agent id is rejected, rather than degrading the stage to no persona", () => {
  const composed = composeFlowPipeline(team([role({ agent: "wizard" })]), "work", KNOWN);

  expect(issuesOf(composed)).toBe("roster.0.agent: Unknown agent: wizard");
});

test("an invented step id is rejected on the flow entry that carries it", () => {
  const composed = composeFlowPipeline(team([role({})], [step({ step: "do-the-thing" })]), "work", KNOWN);

  expect(issuesOf(composed)).toBe("flows.work.0.step: Unknown step: do-the-thing");
});

test("a flow step that names a role off the roster is rejected, since nobody would take it", () => {
  const composed = composeFlowPipeline(team([role({})], [step({ role: "ghost" })]), "work", KNOWN);

  expect(issuesOf(composed)).toBe("flows.work.0.role: No role on the roster is called ghost");
});

test("a role that takes two steps in one flow is rejected, because its stage id would collide", () => {
  const composed = composeFlowPipeline(team([role({})], [step({}), step({})]), "work", KNOWN);

  expect(issuesOf(composed)).toBe("flows.work.1.role: implementation already has a step in this flow");
});

test("a flow the team does not have is refused and the ones it has are named", () => {
  const composed = composeFlowPipeline(team([role({})]), "release", KNOWN);

  expect(issuesOf(composed)).toBe("flow: team.md has no flow called release; it has work");
});

test("an invalid flow anywhere in the file refuses every flow, so a broken team.md never half-runs", () => {
  const broken: TeamDefinition = { ...team([role({})]), flows: { work: [step({})], other: [step({ role: "ghost" })] } };

  const composed = composeFlowPipeline(broken, "work", KNOWN);

  expect(issuesOf(composed)).toBe("flows.other.0.role: No role on the roster is called ghost");
});

test("the Orchestrator cannot be given a specialist's step", () => {
  const composed = composeFlowPipeline(team([role({ agent: "orchestrator" })]), "work", KNOWN);

  expect(issuesOf(composed)).toBe(
    "flows.work.0.step: The Orchestrator only closes a run out; it cannot take implement-feature",
  );
});

test("the Orchestrator can close the run out, because no specialist saw it all", () => {
  const composed = composeFlowPipeline(
    team([role({ agent: "orchestrator" })], [step({ step: "closeout-feature" })]),
    "work",
    KNOWN,
  );

  expect(stagesOf(composed)[0]).toMatchObject({ skill: "orchestrator", stepTask: "closeout-feature" });
});

// `CloseoutConsumer` fires on the step task alone, so if any persona could take
// `closeout-feature` the closeout would be back with whoever the team names.
test("a specialist cannot be given the closeout, whichever specialist it is", () => {
  const composed = composeFlowPipeline(
    team([role({ agent: "project-manager" })], [step({ step: "closeout-feature" })]),
    "work",
    KNOWN,
  );

  expect(issuesOf(composed)).toBe(
    "flows.work.0.role: Only the Orchestrator closes a run out; project-manager saw one step of it",
  );
});

test("a role id that would escape the run directory is rejected before it reaches a path", () => {
  const composed = composeFlowPipeline(team([role({ id: "../etc" })], [step({ role: "../etc" })]), "work", KNOWN);

  expect(issuesOf(composed)).toBe("roster.0.id: Role id must contain only lowercase letters, digits, and hyphens");
});

test("a flow name that would escape a path is rejected as well, since it names the pipeline", () => {
  const composed = composeFlowPipeline({ roster: [role({})], flows: { "../x": [step({})] } }, "../x", KNOWN);

  expect(issuesOf(composed)).toBe("flows.../x: Flow name must contain only lowercase letters, digits, and hyphens");
});

test("two roles sharing an id are rejected, because their outputs would collide", () => {
  const composed = composeFlowPipeline(team([role({}), role({})]), "work", KNOWN);

  expect(issuesOf(composed)).toBe("roster.1.id: Duplicate role id: implementation");
});

test("a role that declares no execution policy is composed as a standard stage", () => {
  const composed = composeFlowPipeline(team([role({})]), "work", KNOWN);

  expect(stagesOf(composed)[0]).toMatchObject({ executionPolicy: "standard" });
});

test("a declared execution policy survives composition, so quality stages still run after a failure", () => {
  const composed = composeFlowPipeline(team([role({ executionPolicy: "quality" })]), "work", KNOWN);

  expect(stagesOf(composed)[0]).toMatchObject({ executionPolicy: "quality" });
});

// A standard-policy stage is skipped once an earlier stage failed, and a failed
// run is exactly when its follow-up tasks and cleanup matter most.
test("a closeout runs after a failure, whatever policy the role asked for", () => {
  const composed = composeFlowPipeline(
    team([role({ agent: "orchestrator", executionPolicy: "standard" })], [step({ step: "closeout-feature" })]),
    "work",
    KNOWN,
  );

  expect(stagesOf(composed)[0]).toMatchObject({ executionPolicy: "closeout" });
});

test("stages follow the flow's order, not the roster's", () => {
  const roster = [role({ id: "first" }), role({ id: "second" })];
  const flow = [step({ role: "second" }), step({ role: "first" })];

  const composed = composeFlowPipeline(team(roster, flow), "work", KNOWN);

  expect(stagesOf(composed).map((stage) => stage.id)).toEqual(["second", "first"]);
});

test("a flow's pipeline is named for the flow, so gate preferences on it hold across initiatives", () => {
  const composed = composeFlowPipeline(team([role({})]), "work", KNOWN);

  expect(valueOf(composed).id).toBe("flow-work");
});

test("a role's model tier reaches the stage, which is the only place resolution reads it", () => {
  const composed = composeFlowPipeline(team([role({ modelTier: "deep" })]), "work", KNOWN);

  expect(stagesOf(composed)[0]?.modelTier).toBe("deep");
});

test("a review step runs on the secondary engine without the handoffs unless its role says otherwise", () => {
  const composed = composeFlowPipeline(
    team([role({ agent: "software-architect" })], [step({ step: "review-implementation" })]),
    "work",
    known({ personas: ["software-architect"], steps: ["review-implementation"] }),
  );

  expect(stagesOf(composed)[0]).toMatchObject({ engine: "secondary", context: "isolated" });
});

function role(overrides: Partial<TeamRole>): TeamRole {
  return {
    id: overrides.id ?? "implementation",
    label: overrides.label ?? "Implementing",
    agent: overrides.agent ?? "developer",
    engine: overrides.engine,
    modelTier: overrides.modelTier,
    executionPolicy: overrides.executionPolicy,
    interactive: overrides.interactive,
  };
}

function step(overrides: Partial<TeamFlowStep>): TeamFlowStep {
  return { role: overrides.role ?? "implementation", step: overrides.step ?? "implement-feature" };
}

function team(roster: TeamRole[], work: TeamFlowStep[] = [step({ role: roster[0]?.id })]): TeamDefinition {
  return { roster, flows: { work } };
}

interface KnownIds {
  personas: string[];
  steps: string[];
}

function known(overrides: Partial<KnownIds> = {}): KnownAgentIds {
  return {
    personas: new Set(overrides.personas ?? ["developer", "orchestrator", "project-manager"]),
    steps: new Set(overrides.steps ?? ["implement-feature", "closeout-feature"]),
  };
}

const KNOWN = known();

type Composed = ReturnType<typeof composeFlowPipeline>;

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
