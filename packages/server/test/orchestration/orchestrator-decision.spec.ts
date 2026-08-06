import { describe, expect, it } from "vitest";
import { extractOrchestratorDecision } from "../../src/schemas/orchestrator-decision.ts";
import { formatValidationIssues } from "../../src/domain/validation.ts";

function fenced(decision: unknown): string {
  return `\`\`\`adhd-orchestrator-decision\n${JSON.stringify(decision)}\n\`\`\``;
}

describe("extractOrchestratorDecision", () => {
  it("reads the decision out of the prose the user is also shown", () => {
    const parsed = extractOrchestratorDecision(
      `A Developer alone can do this.\n\n${fenced({
        action: "ask_user",
        question: "Which database?",
      })}`,
    );

    expect(parsed.ok && parsed.value).toEqual({
      action: "ask_user",
      question: "Which database?",
    });
  });

  it("reports a missing fenced block rather than throwing", () => {
    const parsed = extractOrchestratorDecision("I think we should start with a PM.");

    expect(parsed.ok === false && formatValidationIssues(parsed.issues)).toContain(
      "Missing fenced adhd-orchestrator-decision JSON block",
    );
  });

  it("reports a block that is not valid JSON", () => {
    const parsed = extractOrchestratorDecision(
      "```adhd-orchestrator-decision\n{ action: stop }\n```",
    );

    expect(parsed.ok === false && formatValidationIssues(parsed.issues)).toContain(
      "valid JSON",
    );
  });

  it("names the offending field when a required one is missing", () => {
    const parsed = extractOrchestratorDecision(fenced({ action: "ask_user" }));

    expect(parsed.ok === false && formatValidationIssues(parsed.issues)).toContain(
      "question",
    );
  });

  it("stops at the first closing fence, so trailing prose is not swallowed", () => {
    const parsed = extractOrchestratorDecision(
      `${fenced({ action: "stop", reason: "goal met" })}\n\nLet me know if you want more.`,
    );

    expect(parsed.ok && parsed.value).toEqual({ action: "stop", reason: "goal met" });
  });
});
