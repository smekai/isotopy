import type { CSSProperties } from "react";
import { FONT, MONO, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import type { Dir } from "../../theme";

export const WHITE = "#FFF";
export const OK_GREEN = "#059669";
export const ERROR_RED = "#DC2626";

export interface Accent {
  accent: string;
  accentSoft: string;
}

export const FLEX_FILL: CSSProperties = { flex: 1 };

export const OPTION_STACK: CSSProperties = { display: "flex", flexDirection: "column", gap: SPACE.md };

export function sectionTitle(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.xl, fontWeight: WEIGHT.bold, marginBottom: SPACE.xs };
}

export function sectionSubtitle(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.md, marginBottom: SPACE.xxl };
}

export function fieldLabel(d: Dir, marginBottom: number = SPACE.md): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.lg, fontWeight: WEIGHT.semibold, marginBottom };
}

export function mutedBody(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.md };
}

export function mutedCaption(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.sm };
}

export function optionCard(selected: boolean, d: Dir, accent: Accent = d): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.xl,
    padding: `${SPACE.xl}px ${SPACE.xxl}px`,
    border: `2px solid ${selected ? accent.accent : d.border}`,
    borderRadius: RADIUS.xl,
    background: selected ? accent.accentSoft : "transparent",
    cursor: "pointer",
    textAlign: "left",
  };
}

export function radioDot(selected: boolean, d: Dir): CSSProperties {
  return {
    width: 12,
    height: 12,
    borderRadius: RADIUS.round,
    border: `2px solid ${selected ? d.accent : d.border}`,
    background: selected ? d.accent : "transparent",
    flexShrink: 0,
  };
}

export function optionLabel(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.lg, fontWeight: WEIGHT.semibold };
}

export function accentBadge(d: Dir): CSSProperties {
  return {
    background: d.accentSoft,
    color: d.accent,
    borderRadius: RADIUS.pill,
    padding: `${SPACE.xxs}px ${SPACE.lg}px`,
    fontFamily: MONO,
    fontSize: FONT.xxs,
    fontWeight: WEIGHT.bold,
  };
}
