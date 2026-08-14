import type { CSSProperties } from "react";
import { agentForStage, formatUsage } from "@isotopy/core";
import type { LogLevel, RunState, StageState } from "@isotopy/core";
import { renderInlineMarkdown } from "../../inline-md";
import { useFollowScroll } from "../../hooks/useFollowScroll";
import type { Dir } from "../../theme";
import { EASE, FONT, ICON, MONO, MOTION, SPACE, WEIGHT, logLevelColor, sLabel, statusClr } from "../../theme";
import { StatusIcon } from "../StatusIcon";
import { stagePresentation } from "../../run-utils";
import type { StagePresentation } from "../../run-utils";
import {
  PANEL,
  SCROLL_BODY,
  emptyNote,
  personaPill,
  stageGlyph,
  stageHeadingText,
  stageSpendText,
  verdictPill,
} from "./run-styles";

const GLYPH_SIZE = 22;

function formatTs(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour12: false });
}

const BODY: CSSProperties = { padding: `${SPACE.xl}px ${SPACE.xxl}px` };

function stageHeader(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.md,
    marginTop: SPACE.xxl,
    marginBottom: SPACE.lg,
    ...stageHeadingText(d),
  };
}

function stageRule(d: Dir): CSSProperties {
  return { flex: 1, height: 1, background: d.border };
}

const LOG_ROW: CSSProperties = { display: "flex", gap: SPACE.xl, marginBottom: SPACE.sm };

function logTimestamp(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: MONO,
    fontSize: FONT.xs,
    flexShrink: 0,
    paddingTop: SPACE.xxs,
  };
}

function logMessage(color: string): CSSProperties {
  return { color, fontFamily: MONO, fontSize: FONT.sm, lineHeight: 1.6 };
}

function caret(d: Dir): CSSProperties {
  return {
    color: d.accent,
    fontFamily: MONO,
    fontSize: FONT.md,
    animation: `isotopy-fade-pulse ${MOTION.shimmer} ${EASE.inOut} infinite`,
  };
}

function statusText(status: StagePresentation): CSSProperties {
  return {
    color: statusClr(status).text,
    fontFamily: MONO,
    fontSize: FONT.xxs,
    fontWeight: WEIGHT.bold,
    display: "flex",
    alignItems: "center",
    gap: SPACE.xs,
  };
}

function StageLog({ stage, d }: { stage: StageState; d: Dir }) {
  const agent = agentForStage(stage);
  const presentation = stagePresentation(stage);
  const spend = stage.usage ? formatUsage(stage.usage) : undefined;
  const level = (entry: LogLevel) => logLevelColor(entry, d);

  return (
    <>
      <div style={stageHeader(d)}>
        <span style={stageGlyph(d, GLYPH_SIZE)}>{agent.glyph}</span>
        <span data-testid="stage-profession">{agent.profession}</span>
        {stage.skill && (
          <span
            data-testid="stage-persona"
            title={`Persona: .isotopy/skills/${stage.skill}.md`}
            style={personaPill(d)}
          >
            {stage.skill.toUpperCase()}
          </span>
        )}
        {stage.verdict && (
          <span
            data-testid="stage-verdict"
            title={`This box reported VERDICT: ${stage.verdict}`}
            style={verdictPill(stage.verdict)}
          >
            {stage.verdict}
          </span>
        )}
        <span style={statusText(presentation)}>
          <StatusIcon s={presentation} size={ICON.sm} />
          {sLabel(presentation)}
        </span>
        {spend && <span style={stageSpendText(d)}>{spend}</span>}
        <span style={stageRule(d)} />
      </div>
      {stage.logs.map((entry, i) => (
        <div key={i} style={LOG_ROW}>
          <span style={logTimestamp(d)}>{formatTs(entry.ts)}</span>
          <span style={logMessage(level(entry.level))}>{renderInlineMarkdown(entry.message)}</span>
        </div>
      ))}
      {stage.status === "running" && <span style={caret(d)}>▊</span>}
    </>
  );
}

export interface LogsPanelProps {
  run: RunState;
  focusedStageId: string | null;
  d: Dir;
}

export function LogsPanel({ run, focusedStageId, d }: LogsPanelProps) {
  const stages = run.stages.filter(
    (stage) =>
      (focusedStageId === null || stage.id === focusedStageId) && stage.startedAt !== undefined,
  );
  const lines = stages.reduce((total, stage) => total + stage.logs.length, 0);
  const follow = useFollowScroll({ length: lines, resetKey: `${run.id}:${focusedStageId ?? "all"}` });

  return (
    <div style={PANEL}>
      <div ref={follow.ref} onScroll={follow.onScroll} data-testid="stage-scroll" style={SCROLL_BODY}>
        <div style={BODY}>
          {stages.length === 0 ? (
            <div style={emptyNote(d)}>Nothing has run yet.</div>
          ) : (
            stages.map((stage) => <StageLog key={stage.id} stage={stage} d={d} />)
          )}
        </div>
      </div>
    </div>
  );
}
