import { assert, describe, expect, test } from "vitest";
import { parseClaudeProtocolLine } from "../../src/engines/claude-protocol.ts";
import { parseCodexProtocolLine } from "../../src/engines/codex-protocol.ts";
import { parseCursorProtocolLine } from "../../src/engines/cursor-protocol.ts";
import { protocolProblemMessage } from "../../src/engines/protocol-validation.ts";

describe("Claude protocol", () => {
  test("normalizes a valid terminal event", () => {
    const parsed = parseClaudeProtocolLine(
      JSON.stringify({
        type: "result",
        subtype: "success",
        session_id: "session-1",
        result: "Done",
        total_cost_usd: 0.12,
        duration_ms: 900,
        num_turns: 2,
      }),
    );

    expect(parsed).toEqual({
      ok: true,
      event: {
        sessionId: "session-1",
        logs: [],
        output: "Done",
        error: undefined,
        terminal: "success",
        terminalLabel: "success",
        usage: { costUsd: 0.12, durationMs: 900, turns: 2 },
      },
    });
  });

  test("rejects a malformed known event with its vendor path", () => {
    const parsed = parseClaudeProtocolLine(
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: 7 }] },
      }),
    );

    expect(parsed).toMatchObject({
      ok: false,
      problem: {
        engine: "claude-code",
        eventType: "assistant",
        path: ["message", "content", 0, "text"],
      },
    });
  });
});

describe("Codex protocol", () => {
  test("normalizes CRLF-terminated JSON and usage", () => {
    const parsed = parseCodexProtocolLine(
      `${JSON.stringify({
        type: "turn.completed",
        usage: {
          input_tokens: 10,
          cached_input_tokens: 4,
          output_tokens: 3,
        },
      })}\r\n`,
    );

    expect(parsed).toEqual({
      ok: true,
      event: {
        logs: [
          {
            level: "run",
            message: "turn complete",
            activity: { kind: "engine", name: "codex" },
          },
        ],
        terminal: "success",
        usage: { tokensIn: 10, cachedTokensIn: 4, tokensOut: 3 },
      },
    });
  });

  test("rejects a malformed known event", () => {
    const parsed = parseCodexProtocolLine(
      JSON.stringify({ type: "thread.started" }),
    );

    expect(parsed).toMatchObject({
      ok: false,
      problem: {
        engine: "codex",
        eventType: "thread.started",
        path: ["thread_id"],
      },
    });
  });
});

describe("Cursor protocol", () => {
  test("normalizes a tool call without leaking vendor records", () => {
    const parsed = parseCursorProtocolLine(
      JSON.stringify({
        type: "tool_call",
        subtype: "started",
        tool_call: {
          read_file: { args: { path: "src/index.ts" } },
        },
      }),
    );

    expect(parsed).toEqual({
      ok: true,
      event: {
        logs: [
          {
            level: "run",
            message: "▶ read_file src/index.ts",
            activity: {
              kind: "tool",
              name: "read_file",
              detail: "src/index.ts",
            },
          },
        ],
      },
    });
  });

  test("rejects malformed known tool calls", () => {
    const parsed = parseCursorProtocolLine(
      JSON.stringify({
        type: "tool_call",
        subtype: "started",
        tool_call: "read_file",
      }),
    );

    expect(parsed).toMatchObject({
      ok: false,
      problem: {
        engine: "cursor",
        eventType: "tool_call.started",
        path: ["tool_call"],
      },
    });
  });
});

test("unhandled vendor events produce no update and cannot complete a run", () => {
  const results = [
    parseClaudeProtocolLine(JSON.stringify({ type: "future.claude" })),
    parseCodexProtocolLine(JSON.stringify({ type: "future.codex" })),
    parseCursorProtocolLine(JSON.stringify({ type: "future.cursor" })),
  ];

  expect(results).toEqual([
    {
      ok: true,
      event: { sessionId: undefined, logs: [] },
    },
    { ok: true, event: { logs: [] } },
    { ok: true, event: { logs: [] } },
  ]);
});

test("invalid JSON produces a log-ready diagnostic", () => {
  const parsed = parseCodexProtocolLine("{");

  assert(!parsed.ok, "expected invalid JSON to fail validation");
  expect(protocolProblemMessage(parsed.problem)).toBe(
    "Malformed codex event <json> at event: Line must be valid JSON",
  );
});
