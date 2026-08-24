import type { CSSProperties } from "react";
import type { Dir } from "../theme";
import { FONT, RADIUS, SANS, SPACE, WEIGHT } from "../theme";

const SECTION_LIST_MAX_HEIGHT = 200;

export function railSectionLabel(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.xs,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    padding: `${SPACE.xl}px ${SPACE.xl}px ${SPACE.sm}px`,
  };
}

export const RAIL_SECTION_LIST: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: `0 ${SPACE.md}px`,
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xxs,
  maxHeight: SECTION_LIST_MAX_HEIGHT,
  overflowY: "auto",
  flexShrink: 0,
};

export function railRowButton(selected: boolean, d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    width: "100%",
    textAlign: "left",
    background: selected ? d.surface : "transparent",
    border: `1px solid ${selected ? d.borderStrong : "transparent"}`,
    borderRadius: RADIUS.md,
    padding: `${SPACE.md}px ${SPACE.lg}px`,
    cursor: "pointer",
    fontFamily: SANS,
    color: selected ? d.text : d.textMid,
  };
}

export const RAIL_ROW_NAME: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: FONT.md,
  fontWeight: WEIGHT.semibold,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "inherit",
};

export const RAIL_ROW_ICON: CSSProperties = { flexShrink: 0 };

export function railRowMeta(d: Dir): CSSProperties {
  return { color: d.textMuted, fontSize: FONT.xs, flexShrink: 0 };
}

export function mutedLine(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.xs,
    lineHeight: 1.4,
  };
}
