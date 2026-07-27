import type { CSSProperties } from "react";
import { PlayCircle, Repeat, RotateCcw } from "lucide-react";
import type { RunSummary } from "@adhd/core";
import { firstStageId, resumeStageId } from "../run-utils";
import type { Dir } from "../theme";
import {
  EASE,
  FONT,
  ICON,
  MONO,
  MOTION,
  RADIUS,
  RUN_PILL,
  SANS,
  SPACE,
  WEIGHT,
  runDot,
} from "../theme";

const DOT_SIZE = 7;
const TASK_LINES = 2;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shell(selected: boolean, d: Dir): CSSProperties {
  return {
    borderRadius: RADIUS.lg,
    background: selected ? d.surface : "transparent",
    border: `1px solid ${selected ? d.borderStrong : "transparent"}`,
    boxShadow: selected ? d.elevation.sm : "none",
    padding: SPACE.xs,
    transition: `background ${MOTION.fast} ${EASE.out}`,
  };
}

function openButton(d: Dir): CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "none",
    border: "none",
    borderRadius: RADIUS.md,
    padding: `${SPACE.md}px ${SPACE.lg}px`,
    cursor: "pointer",
    fontFamily: SANS,
    color: d.text,
  };
}

const TOP_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: SPACE.sm,
  marginBottom: SPACE.xs,
};

function dot(color: string): CSSProperties {
  return {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: RADIUS.round,
    background: color,
    flexShrink: 0,
  };
}

function numberText(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: MONO, fontSize: FONT.xs };
}

function statusText(pill: { text: string }): CSSProperties {
  return {
    color: pill.text,
    fontFamily: MONO,
    fontSize: FONT.xxs,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.04em",
  };
}

function dateText(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.xs,
    marginLeft: "auto",
    flexShrink: 0,
  };
}

function taskText(selected: boolean, d: Dir): CSSProperties {
  return {
    color: selected ? d.text : d.textMid,
    fontFamily: SANS,
    fontSize: FONT.lg,
    fontWeight: selected ? WEIGHT.semibold : WEIGHT.medium,
    lineHeight: 1.4,
    display: "-webkit-box",
    WebkitLineClamp: TASK_LINES,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  };
}

function pipelineText(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.xs,
    marginTop: SPACE.xxs,
  };
}

const ACTION_ROW: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: SPACE.xs,
  padding: `0 ${SPACE.lg}px ${SPACE.sm}px`,
};

function action(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.xs,
    border: `1px solid ${d.border}`,
    background: d.surface2,
    borderRadius: RADIUS.md,
    padding: `${SPACE.xxs}px ${SPACE.md}px`,
    fontFamily: SANS,
    fontSize: FONT.xs,
    color: d.textMid,
    cursor: "pointer",
    outlineOffset: 2,
  };
}

export interface RunCardProps {
  run: RunSummary;
  selected: boolean;
  d: Dir;
  onOpen: () => void;
  onRestart: (stageId: string) => void;
  onRerun: () => void;
}

export function RunCard({ run, selected, d, onOpen, onRestart, onRerun }: RunCardProps) {
  const pill = RUN_PILL[run.status];
  const restartable = run.status === "failed" || run.status === "cancelled";
  const resumeId = restartable ? resumeStageId(run) : null;
  const restartId = restartable ? firstStageId(run) : null;
  const showResume = resumeId !== null && resumeId !== restartId;
  const hasActions = showResume || restartId !== null || run.task !== undefined;

  return (
    <li style={shell(selected, d)}>
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? "true" : undefined}
        data-testid="run-card"
        data-run-id={run.id}
        style={openButton(d)}
      >
        <span style={TOP_ROW}>
          <span style={dot(runDot(run.status, d))} />
          <span style={numberText(d)}>#{run.number}</span>
          <span style={statusText(pill)}>{run.status.toUpperCase()}</span>
          <span style={dateText(d)}>{formatDate(run.createdAt)}</span>
        </span>
        <span style={taskText(selected, d)}>{run.task ?? "Untitled run"}</span>
        <span style={pipelineText(d)}>{run.pipelineName}</span>
      </button>

      {hasActions && (
        <div style={ACTION_ROW}>
          {showResume && resumeId && (
            <button
              type="button"
              onClick={() => onRestart(resumeId)}
              data-testid="run-resume"
              title="Continue from the stage that stopped — earlier stages keep their work"
              style={action(d)}
            >
              <PlayCircle size={ICON.xs} /> Resume
            </button>
          )}
          {restartId && (
            <button
              type="button"
              onClick={() => onRestart(restartId)}
              data-testid="run-restart"
              title="Re-run the whole pipeline from the first stage"
              style={action(d)}
            >
              <RotateCcw size={ICON.xs} /> Restart
            </button>
          )}
          {run.task !== undefined && (
            <button
              type="button"
              onClick={onRerun}
              data-testid="run-rerun"
              title="Load this run's task and settings into the composer — you can edit before starting"
              style={action(d)}
            >
              <Repeat size={ICON.xs} /> Rerun
            </button>
          )}
        </div>
      )}
    </li>
  );
}
