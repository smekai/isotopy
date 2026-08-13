import { describe, expect, it } from "vitest";
import { extractOrchestratorDecision } from "../../src/schemas/orchestrator-decision.ts";
import { extractRunArtifacts } from "../../src/schemas/run-artifacts.ts";
import { formatValidationIssues } from "../../src/domain/validation.ts";

const ARTIFACTS = {
  summary: "Search shipped behind a flag",
  deliveredScope: ["Query parsing"],
  decisions: ["Postgres full-text over a separate index"],
  knowledge: ["The seed script needs the extension installed first"],
  findings: [],
  nextRecommendation: "Warm the index on startup",
};

const DECISION = { action: "stop", reason: "goal met" };

function artifactsBlock(payload: unknown): string {
  return `\`\`\`isotopy-run-artifacts\n${JSON.stringify(payload)}\n\`\`\``;
}

function decisionBlock(payload: unknown): string {
  return `\`\`\`isotopy-orchestrator-decision\n${JSON.stringify(payload)}\n\`\`\``;
}

describe("extractRunArtifacts", () => {
  it("reads the report out of the prose the user is also shown", () => {
    const parsed = extractRunArtifacts(
      `The team delivered the flag.\n\n${artifactsBlock(ARTIFACTS)}`,
    );

    expect(parsed.ok && parsed.value).toEqual(ARTIFACTS);
  });

  it("reports a missing fenced block rather than throwing", () => {
    const parsed = extractRunArtifacts("The run went fine, nothing to add.");

    expect(parsed.ok === false && formatValidationIssues(parsed.issues)).toContain(
      "Missing fenced isotopy-run-artifacts JSON block",
    );
  });

  it("reports a block that is not valid JSON", () => {
    const parsed = extractRunArtifacts(
      "```isotopy-run-artifacts\n{ summary: done }\n```",
    );

    expect(parsed.ok === false && formatValidationIssues(parsed.issues)).toContain(
      "valid JSON",
    );
  });

  it("rejects a report carrying closeout's task-board fields", () => {
    const parsed = extractRunArtifacts(
      artifactsBlock({ ...ARTIFACTS, completedTaskIds: ["TASK-001"] }),
    );

    expect(parsed.ok === false && formatValidationIssues(parsed.issues)).toContain(
      "completedTaskIds",
    );
  });

  it("names the offending field when a required one is missing", () => {
    const { summary: _omitted, ...withoutSummary } = ARTIFACTS;
    const parsed = extractRunArtifacts(artifactsBlock(withoutSummary));

    expect(parsed.ok === false && formatValidationIssues(parsed.issues)).toContain(
      "summary",
    );
  });
});

describe("a review turn carrying both blocks", () => {
  it("reads each block on its own, so one output yields a report and a decision", () => {
    const output = `Reviewed it.\n\n${artifactsBlock(ARTIFACTS)}\n\n${decisionBlock(DECISION)}`;

    expect([
      extractRunArtifacts(output).ok,
      extractOrchestratorDecision(output).ok,
    ]).toEqual([true, true]);
  });

  it("keeps a sound decision usable when the report alongside it is malformed", () => {
    const output = `${artifactsBlock({ summary: "" })}\n\n${decisionBlock(DECISION)}`;

    expect([
      extractRunArtifacts(output).ok,
      extractOrchestratorDecision(output).ok,
    ]).toEqual([false, true]);
  });

  it("keeps a sound report usable when the decision alongside it is malformed", () => {
    const output = `${artifactsBlock(ARTIFACTS)}\n\n${decisionBlock({ action: "fire_everyone" })}`;

    expect([
      extractRunArtifacts(output).ok,
      extractOrchestratorDecision(output).ok,
    ]).toEqual([true, false]);
  });
});
