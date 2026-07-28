import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { formatUsage, isTerminalRunStatus } from "@adhd/core";
import type { LogLevel, RunState, StageState, StageStatus } from "@adhd/core";
import { renderInlineMarkdown } from "../../inline-md";
import { buildTranscript, conversationOnly } from "../../transcript";
import type { ConversationItem } from "../../transcript";
import { useFollowScroll } from "../../hooks/useFollowScroll";
import type { Dir } from "../../theme";
import {
  ASK_VIOLET,
  FONT,
  ICON,
  RADIUS,
  SANS,
  SPACE,
  WEIGHT,
  MONO,
  logLevelColor,
  statusClr,
} from "../../theme";
import { PANEL, SCROLL_BODY, stageGlyph, stageHeadingText, stageSpendText } from "./run-styles";

const BUBBLE_MAX_WIDTH = "76%";
const THREAD_MAX_WIDTH = 860;
const GLYPH_SIZE = 22;
const COMPOSER_MIN_ROWS = 1;

const THREAD: CSSProperties = {
  maxWidth: THREAD_MAX_WIDTH,
  margin: "0 auto",
  padding: `${SPACE.x4l}px ${SPACE.x4l}px ${SPACE.xxl}px`,
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xl,
};

function emptyHint(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.md,
    textAlign: "center",
    padding: `${SPACE.x5l}px 0`,
  };
}

function stageRow(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.md,
    marginTop: SPACE.md,
    ...stageHeadingText(d),
  };
}

function stageRule(d: Dir): CSSProperties {
  return { flex: 1, height: 1, background: d.border };
}

function stageStatusText(status: StageStatus): CSSProperties {
  return {
    color: statusClr(status).text,
    fontFamily: MONO,
    fontSize: FONT.xxs,
    fontWeight: WEIGHT.bold,
  };
}

function agentText(d: Dir): CSSProperties {
  return {
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.lg,
    lineHeight: 1.65,
    whiteSpace: "pre-wrap",
  };
}

function questionBlock(d: Dir): CSSProperties {
  return {
    ...agentText(d),
    borderLeft: `3px solid ${ASK_VIOLET}`,
    background: "rgba(124,58,237,0.06)",
    borderRadius: `0 ${RADIUS.md}px ${RADIUS.md}px 0`,
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
  };
}

function noticeRow(level: LogLevel, d: Dir): CSSProperties {
  return {
    color: logLevelColor(level, d),
    fontFamily: MONO,
    fontSize: FONT.sm,
    lineHeight: 1.5,
  };
}

const USER_ROW: CSSProperties = { display: "flex", justifyContent: "flex-end" };

function userBubble(d: Dir): CSSProperties {
  return {
    maxWidth: BUBBLE_MAX_WIDTH,
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
    borderRadius: `${RADIUS.xl}px ${RADIUS.xl}px ${RADIUS.sm}px ${RADIUS.xl}px`,
    background: d.accentSoft,
    border: `1px solid ${d.border}`,
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.lg,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  };
}

function composerBar(d: Dir): CSSProperties {
  return {
    borderTop: `1px solid ${d.border}`,
    background: d.surface,
    padding: `${SPACE.lg}px ${SPACE.x4l}px`,
    flexShrink: 0,
  };
}

function composerInner(d: Dir): CSSProperties {
  return {
    maxWidth: THREAD_MAX_WIDTH,
    margin: "0 auto",
    display: "flex",
    alignItems: "flex-end",
    gap: SPACE.md,
    background: d.surface2,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.xl,
    padding: `${SPACE.md}px ${SPACE.lg}px`,
  };
}

function composerInput(d: Dir): CSSProperties {
  return {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    resize: "none",
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.lg,
    lineHeight: 1.5,
    maxHeight: 140,
  };
}

function sendButton(enabled: boolean, d: Dir): CSSProperties {
  return {
    background: "none",
    border: "none",
    cursor: enabled ? "pointer" : "default",
    color: enabled ? d.accent : d.textMuted,
    padding: SPACE.xs,
    flexShrink: 0,
  };
}

function closedHint(d: Dir): CSSProperties {
  return {
    maxWidth: THREAD_MAX_WIDTH,
    margin: "0 auto",
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.md,
    textAlign: "center",
  };
}

interface TranscriptRowProps {
  item: ConversationItem;
  spend?: string | undefined;
  d: Dir;
}

function TranscriptRow({ item, spend, d }: TranscriptRowProps) {
  if (item.kind === "stage") {
    return (
      <div style={stageRow(d)}>
        <span style={stageGlyph(d, GLYPH_SIZE)}>{item.glyph}</span>
        <span>{item.profession}</span>
        <span style={stageStatusText(item.status)}>{item.status.toUpperCase()}</span>
        {spend && <span style={stageSpendText(d)}>{spend}</span>}
        <span style={stageRule(d)} />
      </div>
    );
  }
  if (item.kind === "user") {
    return (
      <div style={USER_ROW}>
        <div style={userBubble(d)}>{renderInlineMarkdown(item.text)}</div>
      </div>
    );
  }
  if (item.kind === "notice") {
    return <div style={noticeRow(item.level, d)}>{item.text}</div>;
  }
  return (
    <div
      style={item.question ? questionBlock(d) : agentText(d)}
      data-testid={item.question ? "chat-question" : undefined}
    >
      {renderInlineMarkdown(item.text)}
    </div>
  );
}

function spendOf(stages: StageState[], stageId: string): string | undefined {
  const usage = stages.find((stage) => stage.id === stageId)?.usage;
  return usage ? formatUsage(usage) : undefined;
}

export interface ChatPanelProps {
  run: RunState;
  d: Dir;
  sending: boolean;
  onSend: (text: string) => void;
}

export function ChatPanel({ run, d, sending, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const items = conversationOnly(buildTranscript(run));
  const closed = isTerminalRunStatus(run.status);
  const asking = run.status === "asking";

  useEffect(() => {
    if (asking) {
      inputRef.current?.focus();
    }
  }, [asking]);
  const follow = useFollowScroll({ length: items.length, resetKey: run.id });
  const canSend = draft.trim() !== "" && !sending && !closed;

  function send() {
    if (!canSend) {
      return;
    }
    onSend(draft.trim());
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  return (
    <div style={PANEL}>
      <div ref={follow.ref} onScroll={follow.onScroll} style={SCROLL_BODY} data-testid="chat-thread">
        <div style={THREAD}>
          {items.length === 0 && (
            <div style={emptyHint(d)}>The team has not said anything yet.</div>
          )}
          {items.map((item) => (
            <TranscriptRow
              key={item.key}
              item={item}
              spend={item.kind === "stage" ? spendOf(run.stages, item.stageId) : undefined}
              d={d}
            />
          ))}
        </div>
      </div>

      <div style={composerBar(d)}>
        {closed ? (
          <div style={closedHint(d)}>This run has finished — start a new run to say more.</div>
        ) : (
          <div style={composerInner(d)}>
            <textarea
              ref={inputRef}
              value={draft}
              rows={COMPOSER_MIN_ROWS}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={asking ? "Answer the question…" : "Message the team…"}
              aria-label="Message the team"
              data-testid="chat-composer"
              style={composerInput(d)}
            />
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              aria-label="Send message"
              style={sendButton(canSend, d)}
            >
              <Send size={ICON.md} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
