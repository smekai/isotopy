import { agentForStage } from "@adhd/core";
import type { LogLevel, RunState, StageActivity, StageStatus } from "@adhd/core";

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
  | {
      kind: "tool";
      key: string;
      ts: string;
      stageId: string;
      text: string;
      name: string;
      detail?: string;
      failed: boolean;
    }
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
  activity?: StageActivity;
  key: string;
}

function itemForLog({
  stageId,
  ts,
  level,
  message,
  activity,
  key,
}: LogSource): TranscriptItem {
  if (activity) {
    return {
      kind: "tool",
      key,
      ts,
      stageId,
      text: message,
      name: activity.name,
      detail: activity.detail,
      failed: activity.kind === "tool-error",
    };
  }
  if (level === "info") {
    return { kind: "agent", key, ts, stageId, text: message };
  }
  return { kind: "notice", key, ts, stageId, text: message, level };
}

export function buildTranscript(run: RunState): TranscriptItem[] {
  const ordered: Ordered[] = [];
  let seq = 0;

  for (const stage of run.stages) {
    if (stage.startedAt) {
      const agent = agentForStage(stage);
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
          activity: entry.activity,
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

// Trailing `$` alternative catches a fence still streaming in, which has no closer yet.
const MACHINERY_FENCE = /```adhd-[a-z-]+[\s\S]*?(?:```|$)/g;

function withoutMachinery(text: string): string {
  return text.replace(MACHINERY_FENCE, "").replace(/\n{3,}/g, "\n\n").trim();
}

function spoken(item: ConversationItem): ConversationItem | undefined {
  if (item.kind !== "agent") {
    return item;
  }
  const text = withoutMachinery(item.text);
  return text === "" ? undefined : { ...item, text };
}

/**
 * The conversation is the transcript minus the machinery: tool calls, tool
 * errors and engine chatter all arrive as `tool` items and belong in the log,
 * and a protocol block an agent emitted for the server to parse is addressed to
 * the server, not to the user. The log keeps both, verbatim.
 */
export function conversationOnly(items: TranscriptItem[]): ConversationItem[] {
  return items
    .filter((item): item is ConversationItem => item.kind !== "tool")
    .map(spoken)
    .filter((item): item is ConversationItem => item !== undefined);
}
