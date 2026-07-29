import { agentForStage } from "@adhd/core";
import type { LogLevel, RunState, StageStatus } from "@adhd/core";

export type TranscriptItem =
  | {
      kind: "stage";
      key: string;
      ts: string;
      stageId: string;
      label: string;
      profession: string;
      glyph: string;
      status: StageStatus;
    }
  | {
      kind: "agent";
      key: string;
      ts: string;
      stageId?: string;
      text: string;
      question?: boolean;
    }
  | { kind: "tool"; key: string; ts: string; stageId: string; text: string; failed: boolean }
  | { kind: "notice"; key: string; ts: string; stageId: string; text: string; level: LogLevel }
  | { kind: "user"; key: string; ts: string; text: string };

interface Ordered {
  item: TranscriptItem;
  seq: number;
}

interface LogSource {
  stageId: string;
  ts: string;
  level: LogLevel;
  message: string;
  key: string;
}

function itemForLog({ stageId, ts, level, message, key }: LogSource): TranscriptItem {
  switch (level) {
    case "info":
      return { kind: "agent", key, ts, stageId, text: message };
    case "run":
    case "warn":
      return { kind: "tool", key, ts, stageId, text: message, failed: level === "warn" };
    case "pass":
    case "fail":
    case "error":
      return { kind: "notice", key, ts, stageId, text: message, level };
  }
}

export function buildTranscript(run: RunState): TranscriptItem[] {
  const ordered: Ordered[] = [];
  let seq = 0;

  for (const stage of run.stages) {
    if (stage.startedAt) {
      const agent = agentForStage(stage.id);
      ordered.push({
        seq: seq++,
        item: {
          kind: "stage",
          key: `stage:${stage.id}`,
          ts: stage.startedAt,
          stageId: stage.id,
          label: stage.label,
          profession: agent.profession,
          glyph: agent.glyph,
          status: stage.status,
        },
      });
    }
    stage.logs.forEach((entry, index) => {
      ordered.push({
        seq: seq++,
        item: itemForLog({
          stageId: stage.id,
          ts: entry.ts,
          level: entry.level,
          message: entry.message,
          key: `log:${stage.id}:${index}`,
        }),
      });
    });
  }

  for (const message of run.messages) {
    ordered.push({
      seq: seq++,
      item:
        message.role === "user"
          ? { kind: "user", key: `msg:${message.id}`, ts: message.ts, text: message.text }
          : {
              kind: "agent",
              key: `msg:${message.id}`,
              ts: message.ts,
              stageId: message.stageId,
              question: message.kind === "question" || undefined,
              text: message.text,
            },
    });
  }

  return ordered
    .sort((a, b) => a.item.ts.localeCompare(b.item.ts) || a.seq - b.seq)
    .map((entry) => entry.item);
}

export type ConversationItem = Exclude<TranscriptItem, { kind: "tool" }>;

/**
 * The conversation is the transcript minus the machinery: tool calls, tool
 * errors and engine chatter all arrive as `tool` items, and belong in the log.
 */
export function conversationOnly(items: TranscriptItem[]): ConversationItem[] {
  return items.filter((item): item is ConversationItem => item.kind !== "tool");
}
