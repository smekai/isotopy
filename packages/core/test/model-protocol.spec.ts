import { describe, expect, test } from "vitest";
import {
  extractModelProtocolBlock,
  MODEL_PROTOCOL_FENCE,
} from "../src/model-protocol.ts";

const FORMER_PROTOCOLS = [
  ["adhd-closeout", MODEL_PROTOCOL_FENCE.closeout],
  ["adhd-milestone-plan", MODEL_PROTOCOL_FENCE.milestonePlan],
  ["adhd-orchestrator-decision", MODEL_PROTOCOL_FENCE.orchestratorDecision],
  ["adhd-release", MODEL_PROTOCOL_FENCE.release],
  ["adhd-run-artifacts", MODEL_PROTOCOL_FENCE.runArtifacts],
] as const;

describe("extractModelProtocolBlock", () => {
  test("extracts a current protocol block with CRLF line endings", () => {
    const payload = '{"action":"stop","reason":"complete"}';
    const output = `Summary\r\n\r\n\`\`\`${MODEL_PROTOCOL_FENCE.orchestratorDecision}\r\n${payload}\r\n\`\`\``;

    expect(
      extractModelProtocolBlock(
        output,
        MODEL_PROTOCOL_FENCE.orchestratorDecision,
      ),
    ).toBe(`${payload}\r\n`);
  });

  test.each(FORMER_PROTOCOLS)(
    "does not accept the former %s fence as %s",
    (formerFence, currentFence) => {
      const output = `\`\`\`${formerFence}\n{}\n\`\`\``;

      expect(extractModelProtocolBlock(output, currentFence)).toBeUndefined();
    },
  );
});
