import type { CSSProperties } from "react";
import { FONT, SANS, SPACE, WEIGHT } from "../../theme";
import type { Dir } from "../../theme";

export const PAGE: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: SPACE.x4l,
  padding: `0 ${SPACE.x5l}px`,
};

export function headline(d: Dir): CSSProperties {
  return {
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.display,
    fontWeight: WEIGHT.heavy,
    letterSpacing: "-0.02em",
    marginBottom: SPACE.md,
  };
}

export function subtitle(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.xl };
}

export function linkButton(enabled: boolean, d: Dir): CSSProperties {
  return {
    alignSelf: "center",
    border: 0,
    background: "transparent",
    color: enabled ? d.accent : d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
    cursor: enabled ? "pointer" : "default",
    display: "flex",
    gap: SPACE.sm,
    alignItems: "center",
  };
}
