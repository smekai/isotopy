import type { CSSProperties } from "react";
import { FONT, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import type { Dir } from "../../theme";

export const FIELD_STACK: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: SPACE.lg,
  marginTop: SPACE.xl,
};

export const BLOCK_ROW: CSSProperties = {
  display: "flex",
  gap: SPACE.md,
  marginBottom: SPACE.xl,
};

export const BUTTON_ROW: CSSProperties = {
  display: "flex",
  gap: SPACE.md,
  marginTop: SPACE.xxl,
  flexWrap: "wrap",
};

export function blockTitle(d: Dir): CSSProperties {
  return {
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.lg,
    fontWeight: WEIGHT.bold,
    marginTop: SPACE.x4l,
    marginBottom: SPACE.xs,
  };
}

export function inputStyle(d: Dir): CSSProperties {
  return {
    boxSizing: "border-box",
    width: "100%",
    border: `1px solid ${d.borderStrong}`,
    borderRadius: RADIUS.md,
    background: d.surface,
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.md,
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
  };
}

export function statusStyle(color: string): CSSProperties {
  return { color, fontFamily: SANS, fontSize: FONT.md, marginTop: SPACE.lg };
}

export function actionButton(background: string, d: Dir): CSSProperties {
  return {
    border: "none",
    borderRadius: RADIUS.md,
    background,
    color: d.accentText,
    cursor: "pointer",
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.bold,
    padding: `${SPACE.lg}px ${SPACE.xxl}px`,
  };
}

export function toggleButton(selected: boolean, d: Dir): CSSProperties {
  return {
    border: `1px solid ${selected ? d.accent : d.border}`,
    borderRadius: RADIUS.md,
    background: selected ? d.accentSoft : "transparent",
    color: selected ? d.accent : d.textMid,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
    padding: `${SPACE.md}px ${SPACE.xl}px`,
    cursor: "pointer",
  };
}
