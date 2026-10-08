import { describe, expect, it } from "vitest";
import { extractOrchestratorDecision } from "../../src/schemas/orchestrator-decision.ts";
import { extractRunArtifacts } from "../../src/schemas/run-artifacts.ts";

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
