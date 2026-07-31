import type { CSSProperties } from "react";
import { agentForStage } from "@adhd/core";
import type { StagePresentation } from "../run-utils";
import type { Dir } from "../theme";
import { EASE, FONT, MONO, MOTION, RADIUS, SANS, SPACE, WEIGHT, focusRing, sLabel, specColor, statusClr } from "../theme";

type SpecColor = ReturnType<typeof specColor>;
type StatusColor = ReturnType<typeof statusClr>;

const NODE_WIDTH = 124;
const GLYPH_SIZE = 36;
const ACCENT_BAR_HEIGHT = 4;
const ACCENT_BAR_HEIGHT_RUNNING = 5;
const PROFESSION_MIN_HEIGHT = 28;
const STATUS_DOT_SIZE = 5;

const NODE_TEXT = "#1E1B4B";
const LABEL_TEXT = "#9B9BC8";

function node(focused: boolean, running: boolean, isDim: boolean, sc: SpecColor, d: Dir): CSSProperties {
  return {
    background: "#FFFFFF",
    borderRadius: RADIUS.xl,
    border: `2px solid ${focused ? sc.main : running ? d.runBorder : "rgba(0,0,0,0.06)"}`,
    boxShadow: focused
      ? `${focusRing(sc.soft)}, ${d.elevation.lg}`
      : running ? `0 0 16px ${sc.soft}, ${d.elevation.md}` : d.elevation.md,
    width: NODE_WIDTH,
    padding: 0,
    overflow: "hidden",
    cursor: "pointer",
    transition: `all ${MOTION.base} ${EASE.spring}`,
    opacity: isDim && !focused ? 0.72 : 1,
    transform: focused ? "scale(1.03)" : "scale(1)",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    fontFamily: SANS,
    position: "relative",
  };
}

function accentBar(running: boolean, sc: SpecColor): CSSProperties {
  return {
    background: sc.gradient,
    height: running ? ACCENT_BAR_HEIGHT_RUNNING : ACCENT_BAR_HEIGHT,
    transition: `height ${MOTION.slow}`,
    position: "relative",
    overflow: "hidden",
    alignSelf: "stretch",
  };
}

const SHIMMER: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
  animation: `adhd-shimmer ${MOTION.shimmer} ${EASE.linear} infinite`,
};

const BODY: CSSProperties = {
  padding: `${SPACE.lg}px ${SPACE.md}px ${SPACE.xl}px`,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: SPACE.xs,
  width: "100%",
};

function agentGlyph(sc: SpecColor): CSSProperties {
  return {
    width: GLYPH_SIZE,
    height: GLYPH_SIZE,
    borderRadius: RADIUS.lg,
    background: sc.soft,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: FONT.xxl,
    color: sc.main,
    lineHeight: 1,
    marginBottom: SPACE.xxs,
  };
}

const PROFESSION: CSSProperties = {
  color: NODE_TEXT,
  fontSize: FONT.md,
  fontWeight: WEIGHT.bold,
  lineHeight: 1.2,
  textAlign: "center",
  minHeight: PROFESSION_MIN_HEIGHT,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const STAGE_LABEL: CSSProperties = {
  color: LABEL_TEXT,
  fontSize: FONT.xs,
  fontWeight: WEIGHT.medium,
  lineHeight: 1.2,
};

function statusPill(st: StatusColor): CSSProperties {
  return {
    marginTop: SPACE.sm,
    background: st.bg,
    borderRadius: RADIUS.pill,
    padding: `${SPACE.xxs}px ${SPACE.md}px`,
    display: "flex",
    alignItems: "center",
    gap: SPACE.xs,
  };
}

function statusDot(running: boolean, st: StatusColor): CSSProperties {
  return {
    width: STATUS_DOT_SIZE,
    height: STATUS_DOT_SIZE,
    borderRadius: RADIUS.round,
    background: st.dot,
    ...(running ? { animation: `adhd-pulse ${MOTION.pulse} ${EASE.inOut} infinite` } : {}),
  };
}

function statusLabel(st: StatusColor): CSSProperties {
  return {
    color: st.text,
    fontFamily: MONO,
    fontSize: FONT.xxs,
    fontWeight: WEIGHT.semibold,
    letterSpacing: "0.06em",
  };
}

export interface StageNodeProps {
  stageId: string;
  label: string;
  status: StagePresentation;
  d: Dir;
  focused: boolean;
  onClick: () => void;
}

export function StageNode({ stageId, label, status, d, focused, onClick }: StageNodeProps) {
  const agent = agentForStage(stageId);
  const sc = specColor(stageId);
  const st = statusClr(status);
  const running = status === "running";
  const isDim = status === "pending" || status === "skipped";

  return (
    <button
      onClick={onClick}
      data-testid={`stage-node-${stageId}`}
      style={node(focused, running, isDim, sc, d)}
    >
      <div style={accentBar(running, sc)}>
        {running && <div style={SHIMMER} />}
      </div>

      <div style={BODY}>
        <div style={agentGlyph(sc)}>{agent.glyph}</div>

        <div style={PROFESSION}>{agent.profession}</div>

        <div style={STAGE_LABEL}>{label}</div>

        <div style={statusPill(st)}>
          <div style={statusDot(running, st)} />
          <span style={statusLabel(st)}>{sLabel(status)}</span>
        </div>
      </div>
    </button>
  );
}
