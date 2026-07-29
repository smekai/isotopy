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

const envelopeSchema = z.object({ type: z.string() }).passthrough();
const errorSchema = z.union([
  z.string(),
  z.object({ message: z.string().optional() }).passthrough(),
]);
const itemSchema = z
  .object({
    type: z.string(),
    text: z.string().optional(),
    command: z.union([z.string(), z.array(z.string())]).optional(),
    name: z.string().optional(),
    query: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();
const itemEventSchema = z
  .object({
    type: z.enum(["item.started", "item.completed"]),
    item: itemSchema,
  })
  .passthrough();
const threadStartedSchema = z
  .object({
    type: z.literal("thread.started"),
    thread_id: z.string().min(1),
  })
  .passthrough();
const turnCompletedSchema = z
  .object({
    type: z.literal("turn.completed"),
    usage: z
      .object({
        input_tokens: z.number().int().nonnegative().optional(),
        cached_input_tokens: z.number().int().nonnegative().optional(),
        output_tokens: z.number().int().nonnegative().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
const failureSchema = z
  .object({
    type: z.enum(["turn.failed", "error"]),
    error: errorSchema.optional(),
    message: z.string().optional(),
  })
  .passthrough();

function errorMessage(
  error: z.infer<typeof errorSchema> | undefined,
  fallback: string | undefined,
): string {
  if (typeof error === "string") {
    return error;
  }
  return error?.message ?? fallback ?? "Codex error";
}

function startedLog(
  item: z.infer<typeof itemSchema>,
): ProtocolResult<EngineProtocolUpdate> {
  let log: ProtocolLog | undefined;
  if (item.type === "command_execution") {
    if (item.command === undefined) {
      return missingItemField(item.type, "command");
    }
    const command = Array.isArray(item.command)
      ? item.command.join(" ")
      : item.command;
    log = { level: "run", message: truncate(`▶ ${command}`) };
  } else if (item.type === "file_change") {
    log = { level: "run", message: "✎ file change" };
  } else if (item.type === "mcp_tool_call") {
    if (item.name === undefined) {
      return missingItemField(item.type, "name");
    }
    log = { level: "run", message: truncate(`▶ ${item.name}`) };
  } else if (item.type === "web_search") {
    if (item.query === undefined) {
      return missingItemField(item.type, "query");
    }
    log = { level: "run", message: truncate(`🔍 ${item.query}`) };
  }
  return { ok: true, event: { logs: log ? [log] : [] } };
}

function completedUpdate(
  item: z.infer<typeof itemSchema>,
): ProtocolResult<EngineProtocolUpdate> {
  if (item.type === "agent_message") {
    if (item.text === undefined) {
      return missingItemField(item.type, "text");
    }
    return {
      ok: true,
      event: {
        logs: [{ level: "info", message: truncate(item.text) }],
        output: item.text,
      },
    };
  }
  if (item.type === "error") {
    const message = item.message ?? "Codex reported an error";
    return {
      ok: true,
      event: {
        logs: [{ level: "warn", message: truncate(message) }],
        error: message,
      },
    };
  }
  return { ok: true, event: { logs: [] } };
}

function missingItemField(
  eventType: string,
  field: string,
): ProtocolResult<EngineProtocolUpdate> {
  return {
    ok: false,
    problem: {
      engine: "codex",
      eventType,
      path: ["item", field],
      message: `${eventType} requires ${field}`,
    },
  };
}

export function parseCodexProtocolLine(
  line: string,
): ProtocolResult<EngineProtocolUpdate> {
  const json = protocolJson("codex", line);
  if (!json.ok) {
    return json;
  }
  const envelope = protocolEvent("codex", "<unknown>", envelopeSchema, json.event);
  if (!envelope.ok) {
    return envelope;
  }
  const { type } = envelope.event;

  if (type === "thread.started") {
    const parsed = protocolEvent("codex", type, threadStartedSchema, json.event);
    return parsed.ok
      ? {
          ok: true,
          event: {
            sessionId: parsed.event.thread_id,
            logs: [{ level: "info", message: "Codex agent online" }],
          },
        }
      : parsed;
  }
  if (type === "item.started" || type === "item.completed") {
    const parsed = protocolEvent("codex", type, itemEventSchema, json.event);
    if (!parsed.ok) {
      return parsed;
    }
    return type === "item.started"
      ? startedLog(parsed.event.item)
      : completedUpdate(parsed.event.item);
  }
  if (type === "turn.completed") {
    const parsed = protocolEvent("codex", type, turnCompletedSchema, json.event);
    if (!parsed.ok) {
      return parsed;
    }
    return {
      ok: true,
      event: {
        logs: [{ level: "run", message: "turn complete" }],
        terminal: "success",
        usage: parsed.event.usage
          ? {
              tokensIn: parsed.event.usage.input_tokens,
              cachedTokensIn: parsed.event.usage.cached_input_tokens,
              tokensOut: parsed.event.usage.output_tokens,
            }
          : undefined,
      },
    };
  }
  if (type === "turn.failed" || type === "error") {
    const parsed = protocolEvent("codex", type, failureSchema, json.event);
    if (!parsed.ok) {
      return parsed;
    }
    const message = errorMessage(parsed.event.error, parsed.event.message);
    return {
      ok: true,
      event: {
        logs:
          type === "error"
            ? [{ level: "warn", message: truncate(message) }]
            : [],
        terminal: "failure",
        error: message,
      },
    };
  }
  return { ok: true, event: { logs: [] } };
}
