import { z } from "zod";
import { truncate } from "./log-text.ts";
import {
  protocolEvent,
  protocolJson,
} from "./protocol-validation.ts";
import type {
  EngineProtocolUpdate,
  ProtocolResult,
} from "./protocol-validation.ts";

const envelopeSchema = z
  .object({ type: z.string(), subtype: z.string().optional() })
  .passthrough();
const initSchema = z
  .object({
    type: z.literal("system"),
    subtype: z.literal("init"),
    model: z.string().optional(),
  })
  .passthrough();
const assistantSchema = z
  .object({
    type: z.literal("assistant"),
    message: z
      .object({
        content: z.array(
          z
            .object({ type: z.string(), text: z.string().optional() })
            .passthrough(),
        ),
      })
      .passthrough(),
  })
  .passthrough();
const toolSchema = z
  .object({
    type: z.literal("tool_call"),
    subtype: z.literal("started"),
    tool_call: z.record(z.string(), z.unknown()),
  })
  .passthrough();
const resultSchema = z
  .object({
    type: z.literal("result"),
    subtype: z.string().optional(),
    result: z.string().optional(),
    is_error: z.boolean().optional(),
    duration_ms: z.number().nonnegative().optional(),
  })
  .passthrough();
const bagSchema = z.record(z.string(), z.unknown());

function toolSummary(toolCall: Record<string, unknown>): string {
  const [name = "tool", inner] = Object.entries(toolCall)[0] ?? [];
  const innerBag = bagSchema.safeParse(inner);
  const nestedArgs = innerBag.success
    ? bagSchema.safeParse(innerBag.data.args)
    : undefined;
  const args =
    nestedArgs?.success === true
      ? nestedArgs.data
      : innerBag.success
        ? innerBag.data
        : {};
  const detail =
    args.path ??
    args.file_path ??
    args.command ??
    args.pattern ??
    args.query ??
    "";
  return truncate(`▶ ${name} ${String(detail)}`);
}

export function parseCursorProtocolLine(
  line: string,
): ProtocolResult<EngineProtocolUpdate> {
  const json = protocolJson("cursor", line);
  if (!json.ok) {
    return json;
  }
  const envelope = protocolEvent("cursor", "<unknown>", envelopeSchema, json.event);
  if (!envelope.ok) {
    return envelope;
  }
  const { type, subtype } = envelope.event;

  if (type === "system" && subtype === "init") {
    const parsed = protocolEvent("cursor", "system.init", initSchema, json.event);
    return parsed.ok
      ? {
          ok: true,
          event: {
            logs: [
              {
                level: "run",
                message: truncate(
                  `Cursor agent online · ${parsed.event.model ?? "default model"}`,
                ),
              },
            ],
          },
        }
      : parsed;
  }
  if (type === "assistant") {
    const parsed = protocolEvent("cursor", type, assistantSchema, json.event);
    if (!parsed.ok) {
      return parsed;
    }
    const logs = [];
    for (const [index, item] of parsed.event.message.content.entries()) {
      if (item.type !== "text") {
        continue;
      }
      if (item.text === undefined) {
        return {
          ok: false,
          problem: {
            engine: "cursor",
            eventType: type,
            path: ["message", "content", index, "text"],
            message: "Text content requires text",
          },
        };
      }
      logs.push({ level: "info" as const, message: truncate(item.text) });
    }
    return { ok: true, event: { logs } };
  }
  if (type === "tool_call" && subtype === "started") {
    const parsed = protocolEvent("cursor", "tool_call.started", toolSchema, json.event);
    return parsed.ok
      ? {
          ok: true,
          event: {
            logs: [{ level: "run", message: toolSummary(parsed.event.tool_call) }],
          },
        }
      : parsed;
  }
  if (type === "result") {
    const parsed = protocolEvent("cursor", type, resultSchema, json.event);
    if (!parsed.ok) {
      return parsed;
    }
    const success = parsed.event.is_error !== true;
    return {
      ok: true,
      event: {
        logs: [],
        output: parsed.event.result,
        error: success ? undefined : parsed.event.result,
        terminal: success ? "success" : "failure",
        terminalLabel: parsed.event.subtype,
        usage: { durationMs: parsed.event.duration_ms, turns: 1 },
      },
    };
  }
  return { ok: true, event: { logs: [] } };
}
