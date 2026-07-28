import type { CSSProperties } from "react";
import { Play, RotateCcw, Square, UserCheck } from "lucide-react";
import type { RunState } from "@adhd/core";
import { useElapsed } from "../hooks/useElapsed";
import { resumeStageId } from "../run-utils";
import type { Dir } from "../theme";
import { EASE, ELEVATION, FONT, GOLD, ICON, MONO, MOTION, RADIUS, SANS, SPACE, WEIGHT, runDot } from "../theme";
import { VoiceBtn, VoiceStatus } from "./VoiceControls";
import type { VoiceState } from "./VoiceControls";

const BAR_HEIGHT = 58;
const LOGO_SIZE = 28;
const DIVIDER_HEIGHT = 20;
const STATUS_DOT_SIZE = 6;
const TASK_MAX_WIDTH = 220;

const FAIL_RED = "#DC2626";

function bar(d: Dir): CSSProperties {
  return {
    background: d.surface,
    borderTop: `1px solid ${d.border}`,
    height: BAR_HEIGHT,
    display: "flex",
    alignItems: "center",
    padding: `0 ${SPACE.xxxl}px`,
    gap: SPACE.xxl,
    flexShrink: 0,
    boxShadow: ELEVATION.barUp,
  };
}

function appLogo(): CSSProperties {
  return {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: RADIUS.md,
    display: "block",
    flexShrink: 0,
  };
}

function wordmark(d: Dir): CSSProperties {
  return {
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.lg,
    fontWeight: WEIGHT.heavy,
    letterSpacing: "-0.02em",
  };
}

function divider(d: Dir): CSSProperties {
  return { width: 1, height: DIVIDER_HEIGHT, background: d.border };
}

function metaText(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: MONO, fontSize: FONT.xs };
}

function taskText(d: Dir): CSSProperties {
  return {
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.md,
    maxWidth: TASK_MAX_WIDTH,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

function statusDot(status: RunState["status"], d: Dir): CSSProperties {
  const running = status === "running";
  return {
    width: STATUS_DOT_SIZE,
    height: STATUS_DOT_SIZE,
    borderRadius: RADIUS.round,
    flexShrink: 0,
    background: runDot(status, d),
    ...(running
      ? {
          boxShadow: `0 0 6px ${d.accent}`,
          animation: `adhd-pulse ${MOTION.pulse} ${EASE.inOut} infinite`,
        }
      : {}),
  };
}

function idleText(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.md };
}

const ACTION_BASE: CSSProperties = {
  borderRadius: RADIUS.lg,
  fontFamily: SANS,
  fontSize: FONT.md,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: SPACE.sm,
};

const APPROVE_BUTTON: CSSProperties = {
  ...ACTION_BASE,
  background: GOLD,
  color: "#FFF",
  border: "none",
  padding: `${SPACE.md}px ${SPACE.xxl}px`,
  fontWeight: WEIGHT.heavy,
  boxShadow: "0 2px 8px rgba(217,119,6,0.30)",
};

const RESUME_BUTTON: CSSProperties = {
  ...ACTION_BASE,
  background: "rgba(220,38,38,0.08)",
  color: FAIL_RED,
  border: "1px solid rgba(220,38,38,0.20)",
  padding: `${SPACE.md}px ${SPACE.xxl}px`,
  fontWeight: WEIGHT.semibold,
};

function abortButton(d: Dir): CSSProperties {
  return {
    ...ACTION_BASE,
    background: d.surface2,
    color: d.textMid,
    border: `1px solid ${d.border}`,
    padding: `${SPACE.md}px ${SPACE.xxl}px`,
    fontWeight: WEIGHT.semibold,
  };
}

function newRunButton(d: Dir): CSSProperties {
  return {
    ...ACTION_BASE,
    background: `linear-gradient(135deg, ${d.accent}, ${d.accentDark})`,
    color: "#FFF",
    border: "none",
    padding: `${SPACE.md}px ${SPACE.xxxl}px`,
    fontWeight: WEIGHT.heavy,
    boxShadow: `0 2px 10px ${d.accentSoft}`,
  };
}

export interface TeamControllerProps {
  d: Dir;
  run: RunState | null;
  pipeVs: VoiceState;
  onCycleVoice: () => void;
  onApprove: () => void;
  onAbort: () => void;
  onRestart: (stageId: string) => void;
  onNewRun: () => void;
}

export function TeamController({
  d, run, pipeVs, onCycleVoice, onApprove, onAbort, onRestart, onNewRun,
}: TeamControllerProps) {
  const elapsed = useElapsed(run?.createdAt, run?.completedAt);
  const resumeId = run && (run.status === "failed" || run.status === "cancelled")
    ? resumeStageId(run)
    : null;
  const resumeLabel = resumeId
    ? run?.stages.find((stage) => stage.id === resumeId)?.label
    : null;
  const terminal = run !== null &&
    (run.status === "completed" || run.status === "failed" || run.status === "cancelled");

  return (
    <div style={bar(d)}>
      <div style={{ display: "flex", alignItems: "center", gap: SPACE.md }}>
        <img src="/adhd-icon.png" alt="" width={LOGO_SIZE} height={LOGO_SIZE} style={appLogo()} />
        <span style={wordmark(d)}>ADHD</span>
      </div>

      <div style={divider(d)} />

      {run ? (
        <div style={{ display: "flex", alignItems: "center", gap: SPACE.lg, minWidth: 0 }}>
          <span style={metaText(d)}>#{run.number}</span>
          <span style={taskText(d)}>{run.task ?? run.pipelineName}</span>
          <span style={metaText(d)}>{elapsed}</span>
          <div style={statusDot(run.status, d)} />
        </div>
      ) : (
        <span style={idleText(d)}>No active run</span>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ display: "flex", alignItems: "center", gap: SPACE.md }}>
        {run?.status === "awaiting" && (
          <button onClick={onApprove} style={APPROVE_BUTTON}>
            <UserCheck size={ICON.md} /> Approve Gate
          </button>
        )}
        {resumeId && resumeLabel && (
          <button onClick={() => onRestart(resumeId)} style={RESUME_BUTTON}>
            <RotateCcw size={ICON.sm} /> Resume from {resumeLabel}
          </button>
        )}
        {(run?.status === "running" || run?.status === "awaiting") && (
          <button onClick={onAbort} style={abortButton(d)}>
            <Square size={ICON.sm} /> Abort
          </button>
        )}
        {terminal && (
          <button onClick={onNewRun} style={newRunButton(d)}>
            <Play size={ICON.sm} /> New run
          </button>
        )}
      </div>

      <div style={divider(d)} />

      <div style={{ display: "flex", alignItems: "center", gap: SPACE.lg }}>
        <VoiceStatus vs={pipeVs} d={d} />
        <VoiceBtn vs={pipeVs} d={d} onCycle={onCycleVoice} large />
      </div>
    </div>
  );
}
