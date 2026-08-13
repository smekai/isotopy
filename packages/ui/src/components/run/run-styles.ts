import type { CSSProperties } from "react";
import { STAGE_VERDICTS } from "@isotopy/core";
import type { StageVerdict } from "@isotopy/core";
import { FONT, MONO, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import type { Dir } from "../../theme";

export const PASS_GREEN = "#059669";
export const FAIL_RED = "#DC2626";
export const SKIP_AMBER = "#D97706";

interface VerdictPalette {
  color: string;
  rgb: string;
}

const VERDICT_PALETTE: Record<StageVerdict, VerdictPalette> = {
  [STAGE_VERDICTS.PASS]: { color: PASS_GREEN, rgb: "5,150,105" },
  [STAGE_VERDICTS.FAIL]: { color: FAIL_RED, rgb: "220,38,38" },
  [STAGE_VERDICTS.SKIP]: { color: SKIP_AMBER, rgb: "217,119,6" },
};

export const PANEL: CSSProperties = { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" };
export const SCROLL_BODY: CSSProperties = { flex: 1, minHeight: 0, overflowY: "auto" };
export const SPLIT_PANE: CSSProperties = { display: "flex", flex: 1, minHeight: 0 };
export const READING_PANE: CSSProperties = { flex: 1, padding: SPACE.xxl, overflowY: "auto" };

export const filePreview: CSSProperties = {
  color: "inherit",
  fontFamily: MONO,
  fontSize: FONT.sm,
  lineHeight: 1.75,
  whiteSpace: "pre-wrap",
  margin: 0,
};

const pillBase: CSSProperties = {
  borderRadius: RADIUS.pill,
  padding: `${SPACE.xs}px ${SPACE.lg}px`,
  fontFamily: MONO,
  fontSize: FONT.xxs,
  fontWeight: WEIGHT.bold,
  letterSpacing: "0.06em",
};

export function verdictPill(verdict: StageVerdict): CSSProperties {
  const palette = VERDICT_PALETTE[verdict];
  return {
    ...pillBase,
    background: `rgba(${palette.rgb},0.10)`,
    border: `1px solid rgba(${palette.rgb},0.35)`,
    color: palette.color,
  };
}

export function personaPill(d: Dir): CSSProperties {
  return {
    ...pillBase,
    background: d.surface2,
    border: `1px solid ${d.border}`,
    color: d.textMid,
  };
}

export function sidebar(width: number, d: Dir): CSSProperties {
  return {
    width,
    borderRight: `1px solid ${d.border}`,
    overflowY: "auto",
    flexShrink: 0,
  };
}

export function listButton(active: boolean, d: Dir): CSSProperties {
  return {
    width: "100%",
    display: "flex",
    alignItems: "flex-start",
    gap: SPACE.md,
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
    border: "none",
    borderBottom: `1px solid ${d.border}`,
    background: active ? d.accentSoft : "transparent",
    cursor: "pointer",
    textAlign: "left",
  };
}

export function listItemName(active: boolean, d: Dir): CSSProperties {
  return {
    color: active ? d.accent : d.text,
    fontFamily: MONO,
    fontSize: FONT.xs,
    lineHeight: 1.4,
  };
}

export function listItemSize(d: Dir): CSSProperties {
  return { color: d.textMuted, fontSize: FONT.xxs };
}

export function listItemIcon(active: boolean, d: Dir): CSSProperties {
  return { color: active ? d.accent : d.textMuted, marginTop: SPACE.xxs, flexShrink: 0 };
}

export function emptyNote(d: Dir): CSSProperties {
  return { color: d.textMuted, padding: SPACE.xxl, fontSize: FONT.md, fontFamily: SANS };
}

export function stageGlyph(d: Dir, size: number): CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: RADIUS.round,
    background: d.surface2,
    border: `1px solid ${d.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: FONT.md,
    color: d.accent,
    flexShrink: 0,
  };
}

export function stageHeadingText(d: Dir): CSSProperties {
  return { color: d.textMid, fontFamily: SANS, fontSize: FONT.md, fontWeight: WEIGHT.bold };
}

export function stageSpendText(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: MONO, fontSize: FONT.xxs };
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
