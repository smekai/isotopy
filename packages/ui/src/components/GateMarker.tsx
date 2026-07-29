import type { CSSProperties } from "react";
import type { Dir } from "../theme";
import { EASE, FONT, GOLD, GOLD_SOFT, MONO, MOTION, RADIUS, SANS, SPACE, WEIGHT } from "../theme";

const COLUMN_WIDTH = 52;
const DIAMOND_SIZE = 22;
const PENDING_LABEL = "#C0C0D8";

function diamond(awaiting: boolean): CSSProperties {
  return {
    width: DIAMOND_SIZE,
    height: DIAMOND_SIZE,
    background: awaiting ? GOLD_SOFT : "rgba(0,0,0,0.03)",
    border: `2px solid ${awaiting ? GOLD : "rgba(0,0,0,0.12)"}`,
    transform: "rotate(45deg)",
    borderRadius: RADIUS.sm,
    boxShadow: awaiting ? `0 0 10px ${GOLD_SOFT}, 0 0 20px ${GOLD_SOFT}` : "none",
    animation: awaiting ? `adhd-pulse ${MOTION.pulse} ${EASE.inOut} infinite` : "none",
    transition: `all ${MOTION.slow}`,
    flexShrink: 0,
  };
}

function gateLabel(awaiting: boolean): CSSProperties {
  return {
    color: awaiting ? GOLD : PENDING_LABEL,
    fontFamily: MONO,
    fontSize: FONT.xxs,
    letterSpacing: "0.1em",
    fontWeight: WEIGHT.semibold,
  };
}

const APPROVE_BUTTON: CSSProperties = {
  background: GOLD,
  color: "#FFF",
  borderRadius: RADIUS.md,
  border: "none",
  padding: `${SPACE.xxs}px ${SPACE.sm}px`,
  fontSize: FONT.xxs,
  fontFamily: SANS,
  fontWeight: WEIGHT.heavy,
  cursor: "pointer",
  letterSpacing: "0.06em",
  boxShadow: `0 2px 8px ${GOLD_SOFT}`,
};

export interface GateMarkerProps {
  index: number;
  d: Dir;
  awaiting: boolean;
  onApprove?: () => void;
}

export function GateMarker({ index, awaiting, onApprove }: GateMarkerProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: SPACE.xs, width: COLUMN_WIDTH, flexShrink: 0 }}>
      <div style={diamond(awaiting)} />

      <div style={gateLabel(awaiting)}>G{index}</div>

      {awaiting && onApprove && (
        <button onClick={onApprove} style={APPROVE_BUTTON}>APPROVE</button>
      )}
    </div>
  );
}
