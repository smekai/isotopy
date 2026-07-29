import type { StageUsage } from "@adhd/core";
import { z } from "zod";
import { truncate } from "./log-text.ts";
import {
  protocolEvent,
  protocolJson,
} from "./protocol-validation.ts";
import type {
  EngineProtocolUpdate,
  ProtocolLog,
  ProtocolResult,
} from "./protocol-validation.ts";

const envelopeSchema = z
  .object({
    type: z.string(),
    subtype: z.string().optional(),
    session_id: z.string().optional(),
  })
  .passthrough();

const contentSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
    name: z.string().optional(),
    input: z.record(z.string(), z.unknown()).optional(),
    is_error: z.boolean().optional(),
    content: z.unknown().optional(),
  })
  .passthrough();

const messageEventSchema = z
  .object({
    type: z.enum(["assistant", "user"]),
    session_id: z.string().optional(),
    message: z
      .object({ content: z.array(contentSchema) })
      .passthrough(),
  })
  .passthrough();

const initSchema = z
  .object({
    type: z.literal("system"),
    subtype: z.literal("init"),
    session_id: z.string().optional(),
    model: z.string().optional(),
    tools: z.array(z.unknown()).optional(),
  })
  .passthrough();

const resultSchema = z
  .object({
    type: z.literal("result"),
    subtype: z.string(),
    session_id: z.string().optional(),
    result: z.string().optional(),
    is_error: z.boolean().optional(),
    total_cost_usd: z.number().nonnegative().optional(),
    duration_ms: z.number().nonnegative().optional(),
    num_turns: z.number().int().nonnegative().optional(),
  })
  .passthrough();

function detailOf(input: Record<string, unknown> | undefined): string {
  if (!input) {
    return "";
  }
  return String(
    input.file_path ??
      input.command ??
      input.pattern ??
      input.path ??
      "",
  );
}

function usageOf(result: z.infer<typeof resultSchema>): StageUsage | undefined {
  const usage: StageUsage = {
    costUsd: result.total_cost_usd,
    durationMs: result.duration_ms,
    turns: result.num_turns,
  };
  return Object.values(usage).some((value) => value !== undefined)
    ? usage
    : undefined;
}

function messageLogs(
  event: z.infer<typeof messageEventSchema>,
): ProtocolResult<EngineProtocolUpdate> {
  const logs: ProtocolLog[] = [];
  for (const [index, item] of event.message.content.entries()) {
    if (item.type === "text") {
      if (item.text === undefined) {
        return {
          ok: false,
          problem: {
            engine: "claude-code",
            eventType: event.type,
            path: ["message", "content", index, "text"],
            message: "Text content requires text",
          },
        };
      }
      logs.push({ level: "info", message: truncate(item.text) });
    } else if (item.type === "tool_use") {
      if (item.name === undefined) {
        return {
          ok: false,
          problem: {
            engine: "claude-code",
            eventType: event.type,
            path: ["message", "content", index, "name"],
            message: "Tool use requires a name",
          },
        };
      }
      logs.push({
        level: "run",
        message: truncate(`▶ ${item.name} ${detailOf(item.input)}`),
      });
    } else if (item.type === "tool_result" && item.is_error) {
      logs.push({
        level: "warn",
        message: truncate(`Tool error: ${JSON.stringify(item.content)}`),
      });
    }
  }
  return {
    ok: true,
    event: { sessionId: event.session_id, logs },
  };
}

export function parseClaudeProtocolLine(
  line: string,
): ProtocolResult<EngineProtocolUpdate> {
  const json = protocolJson("claude-code", line);
  if (!json.ok) {
    return json;
  }
  const envelope = protocolEvent(
    "claude-code",
    "<unknown>",
    envelopeSchema,
    json.event,
  );
  if (!envelope.ok) {
    return envelope;
  }
  const { type, subtype, session_id: sessionId } = envelope.event;

  if (type === "system" && subtype === "init") {
    const parsed = protocolEvent("claude-code", "system.init", initSchema, json.event);
    return parsed.ok
      ? {
          ok: true,
          event: {
            sessionId: parsed.event.session_id,
            logs: [
              {
                level: "run",
                message: truncate(
                  `Claude Code online · ${parsed.event.model ?? "default model"} · ${parsed.event.tools?.length ?? 0} tools`,
                ),
              },
            ],
          },
        }
      : parsed;
  }
  if (type === "assistant" || type === "user") {
    const parsed = protocolEvent("claude-code", type, messageEventSchema, json.event);
    return parsed.ok ? messageLogs(parsed.event) : parsed;
  }
  if (type === "result") {
    const parsed = protocolEvent("claude-code", type, resultSchema, json.event);
    if (!parsed.ok) {
      return parsed;
    }
    const success =
      parsed.event.subtype === "success" && parsed.event.is_error !== true;
    return {
      ok: true,
      event: {
        sessionId: parsed.event.session_id,
        logs: [],
        output: parsed.event.result,
        error: success ? undefined : parsed.event.result,
        terminal: success ? "success" : "failure",
        terminalLabel: parsed.event.subtype,
        usage: usageOf(parsed.event),
      },
    };
  }
  return { ok: true, event: { sessionId, logs: [] } };
}
