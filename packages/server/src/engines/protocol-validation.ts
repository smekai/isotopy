import type { StageLogDraft, StageUsage } from "@adhd/core";
import type { ZodType } from "zod";
import { validationIssues } from "../domain/validation.ts";

export interface EngineProtocolUpdate {
  sessionId?: string;
  logs: StageLogDraft[];
  output?: string;
  error?: string;
  terminal?: "success" | "failure";
  terminalLabel?: string;
  usage?: StageUsage;
}

export interface ProtocolProblem {
  engine: "claude-code" | "codex" | "cursor";
  eventType: string;
  path: (string | number)[];
  message: string;
}

export type ProtocolResult<T> =
  | { ok: true; event: T }
  | { ok: false; problem: ProtocolProblem };

export function protocolJson(
  engine: ProtocolProblem["engine"],
  line: string,
): ProtocolResult<unknown> {
  try {
    return { ok: true, event: JSON.parse(line) };
  } catch {
    return {
      ok: false,
      problem: {
        engine,
        eventType: "<json>",
        path: [],
        message: "Line must be valid JSON",
      },
    };
  }
}

export function protocolEvent<T>(
  engine: ProtocolProblem["engine"],
  eventType: string,
  schema: ZodType<T>,
  input: unknown,
): ProtocolResult<T> {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return { ok: true, event: parsed.data };
  }
  const issue = validationIssues(parsed.error)[0] ?? {
    path: [],
    message: "Invalid event",
  };
  return {
    ok: false,
    problem: { engine, eventType, ...issue },
  };
}

export function protocolProblemMessage(problem: ProtocolProblem): string {
  const path = problem.path.length > 0 ? problem.path.join(".") : "event";
  return `Malformed ${problem.engine} event ${problem.eventType} at ${path}: ${problem.message}`;
}

export function applyProtocolUpdate(
  capture: EngineProtocolUpdate,
  update: EngineProtocolUpdate,
  onLog: (log: StageLogDraft) => void,
): void {
  for (const log of update.logs) {
    onLog(log);
  }
  capture.sessionId = update.sessionId ?? capture.sessionId;
  capture.output = update.output ?? capture.output;
  capture.error = update.error ?? capture.error;
  capture.terminal = update.terminal ?? capture.terminal;
  capture.terminalLabel = update.terminalLabel ?? capture.terminalLabel;
  capture.usage = update.usage ?? capture.usage;
}
