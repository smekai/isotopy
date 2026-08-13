import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { formatUsage, isTerminalRunStatus, summariseChanges } from "@isotopy/core";
import type { LogLevel, RunState, RunSummary, StageState, StageStatus } from "@isotopy/core";
import { OpenProjectFolder } from "./OpenProjectFolder";
import { TeamProposalCard } from "./TeamProposalCard";
import { answerableQuestion } from "../../orchestration";
import type { OrchestratorView } from "../../orchestration";
import { renderInlineMarkdown } from "../../inline-md";
import { runThread } from "../../run-thread";
import type { ThreadItem } from "../../run-thread";
import { formatDateTime } from "../../format";
import { useFollowScroll } from "../../hooks/useFollowScroll";
import type { Dir } from "../../theme";
import {
  ASK_VIOLET,
  FONT,
  ICON,
  RADIUS,
  RUN_PILL,
  SANS,
  SPACE,
  WEIGHT,
  MONO,
  logLevelColor,
  runDot,
  runStatusLabel,
  statusClr,
} from "../../theme";
import { PANEL, SCROLL_BODY, stageGlyph, stageHeadingText, stageSpendText } from "./run-styles";

const BUBBLE_MAX_WIDTH = "76%";
const THREAD_MAX_WIDTH = 860;
const GLYPH_SIZE = 22;
const COMPOSER_MIN_ROWS = 1;
const CHILD_RUN_DOT_SIZE = 7;

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
    display: "grid",
    gap: SPACE.lg,
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

function resultRow(d: Dir): CSSProperties {
  return {
    maxWidth: THREAD_MAX_WIDTH,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: SPACE.lg,
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.md,
  };
}

function showChangesButton(d: Dir): CSSProperties {
  return {
    border: "none",
    background: "none",
    padding: 0,
    cursor: "pointer",
    color: d.accent,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.bold,
  };
}

function verdictRow(d: Dir): CSSProperties {
  return {
    display: "grid",
    gap: SPACE.xxs,
    borderLeft: `2px solid ${d.border}`,
    paddingLeft: SPACE.lg,
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.md,
    lineHeight: 1.5,
  };
}

function verdictTitle(d: Dir): CSSProperties {
  return { color: d.textMid, fontWeight: WEIGHT.semibold };
}

function elsewhereBlock(d: Dir): CSSProperties {
  return {
    display: "grid",
    gap: SPACE.sm,
    textAlign: "left",
    width: "100%",
    border: `1px solid ${ASK_VIOLET}`,
    borderRadius: RADIUS.lg,
    background: d.surface,
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.md,
    lineHeight: 1.5,
    cursor: "pointer",
  };
}

function elsewhereLead(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.xs };
}

function childRunButton(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.md,
    width: "100%",
    textAlign: "left",
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    background: d.surface,
    padding: `${SPACE.md}px ${SPACE.lg}px`,
    cursor: "pointer",
    fontFamily: SANS,
    color: d.text,
  };
}

function childRunDot(color: string): CSSProperties {
  return {
    width: CHILD_RUN_DOT_SIZE,
    height: CHILD_RUN_DOT_SIZE,
    borderRadius: RADIUS.round,
    background: color,
    flexShrink: 0,
  };
}

function childRunNumber(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: MONO, fontSize: FONT.xs, flexShrink: 0 };
}

const CHILD_RUN_NAME: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: FONT.md,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function childRunStatusText(pill: { text: string }): CSSProperties {
  return {
    color: pill.text,
    fontFamily: MONO,
    fontSize: FONT.xxs,
    fontWeight: WEIGHT.bold,
    flexShrink: 0,
  };
}

function childRunDate(d: Dir): CSSProperties {
  return { color: d.textMuted, fontSize: FONT.xs, flexShrink: 0 };
}

interface ChildRunLinkProps {
  run: RunSummary;
  onOpen: () => void;
  d: Dir;
}

function ChildRunLink({ run, onOpen, d }: ChildRunLinkProps) {
  const pill = RUN_PILL[run.status];
  return (
    <button
      data-testid="orchestrator-run"
      data-run-id={run.id}
      onClick={onOpen}
      style={childRunButton(d)}
    >
      <span style={childRunDot(runDot(run.status, d))} />
      <span style={childRunNumber(d)}>#{run.number}</span>
      <span style={CHILD_RUN_NAME}>{run.pipelineName}</span>
      <span style={childRunStatusText(pill)}>{runStatusLabel(run.status)}</span>
      <span style={childRunDate(d)}>{formatDateTime(run.createdAt)}</span>
    </button>
  );
}

interface TranscriptRowProps {
  item: ThreadItem;
  spend?: string;
  orchestrator?: OrchestratorView;
  d: Dir;
}

function TranscriptRow({ item, spend, orchestrator, d }: TranscriptRowProps) {
  if (item.kind === "proposal") {
    return (
      <TeamProposalCard
        team={item.team}
        awaitingApproval={item.awaitingApproval}
        busy={orchestrator?.busy ?? false}
        roleTiers={orchestrator?.roleTiers ?? {}}
        d={d}
        onApprove={() => orchestrator?.onApprove()}
        onRoleTierChange={(roleId, tier) => orchestrator?.onRoleTierChange(roleId, tier)}
      />
    );
  }
  if (item.kind === "child-run") {
    return (
      <ChildRunLink run={item.run} onOpen={() => orchestrator?.onOpenRun(item.run.id)} d={d} />
    );
  }
  if (item.kind === "elsewhere") {
    return (
      <button
        data-testid="orchestrator-question-elsewhere"
        data-run-id={item.runId}
        onClick={() => orchestrator?.onOpenRun(item.runId)}
        style={elsewhereBlock(d)}
      >
        <span style={elsewhereLead(d)}>A question is waiting on another run</span>
        <span>{item.question}</span>
        <span style={elsewhereLead(d)}>Open that run to answer it →</span>
      </button>
    );
  }
  if (item.kind === "verdict") {
    return (
      <div style={verdictRow(d)} data-testid="orchestrator-verdict">
        <span style={verdictTitle(d)}>{item.title}</span>
        <span>{item.detail}</span>
      </div>
    );
  }
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
  orchestrator?: OrchestratorView;
  onSend: (text: string) => void;
  onShowChanges?: () => void;
}

export function ChatPanel({
  run,
  d,
  sending,
  orchestrator,
  onSend,
  onShowChanges,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const items = runThread(run, orchestrator?.orchestration, orchestrator?.runs ?? []);
  const closed = isTerminalRunStatus(run.status);
  const asking = run.status === "asking";
  const answering =
    answerableQuestion(orchestrator?.orchestration, run.status) !== undefined;

  useEffect(() => {
    if (asking || answering) {
      inputRef.current?.focus();
    }
  }, [asking, answering]);
  const follow = useFollowScroll({ length: items.length, resetKey: run.id });
  const canSend = draft.trim() !== "" && !sending && (!closed || answering);

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
              orchestrator={orchestrator}
              d={d}
            />
          ))}
        </div>
      </div>

      <div style={composerBar(d)}>
        {closed && (
          <div style={resultRow(d)} data-testid="run-result">
            {run.changes ? (
              <>
                <span>{summariseChanges(run.changes)}</span>
                {onShowChanges && (
                  <button type="button" onClick={onShowChanges} style={showChangesButton(d)}>
                    See what was built
                  </button>
                )}
              </>
            ) : (
              <span style={closedHint(d)}>
                {answering
                  ? "This run has finished — the Orchestrator is waiting on your answer."
                  : "This run has finished — start a new run to say more."}
              </span>
            )}
            <OpenProjectFolder runId={run.id} d={d} />
          </div>
        )}
        {(!closed || answering) && (
          <div style={composerInner(d)}>
            <textarea
              ref={inputRef}
              value={draft}
              rows={COMPOSER_MIN_ROWS}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                asking || answering ? "Answer the question…" : "Message the team…"
              }
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
