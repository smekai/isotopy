import type { CSSProperties, ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Dir } from "../theme";
import { FONT, ICON, RADIUS, SANS, SPACE, WEIGHT } from "../theme";

function shell(d: Dir): CSSProperties {
  return {
    borderRadius: RADIUS.lg,
    border: `1px solid ${d.border}`,
    background: d.surface,
    padding: SPACE.xxs,
    marginBottom: SPACE.xs,
  };
}

function toggle(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "flex-start",
    gap: SPACE.sm,
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

function chevron(d: Dir): CSSProperties {
  return { flexShrink: 0, marginTop: SPACE.xxs, color: d.textMuted };
}

const HEADING: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xxs,
};

function countText(d: Dir): CSSProperties {
  return {
    flexShrink: 0,
    color: d.textMid,
    fontSize: FONT.xs,
    fontWeight: WEIGHT.bold,
    background: d.surface2,
    borderRadius: RADIUS.pill,
    padding: `${SPACE.xxs}px ${SPACE.sm}px`,
  };
}

export const RAIL_GROUP_NESTED: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: `0 0 ${SPACE.xs}px ${SPACE.lg}px`,
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xxs,
};

export interface RailGroupProps {
  heading: ReactNode;
  count: number;
  countTestId: string;
  toggleTestId: string;
  toggleAttributes: Record<string, string>;
  collapsed: boolean;
  d: Dir;
  onToggle: () => void;
  children: ReactNode;
}

export function RailGroup({
  heading,
  count,
  countTestId,
  toggleTestId,
  toggleAttributes,
  collapsed,
  d,
  onToggle,
  children,
}: RailGroupProps) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <li style={shell(d)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        data-testid={toggleTestId}
        {...toggleAttributes}
        style={toggle(d)}
      >
        <Chevron size={ICON.md} style={chevron(d)} />
        <span style={HEADING}>{heading}</span>
        <span data-testid={countTestId} style={countText(d)}>
          {count}
        </span>
      </button>
      {!collapsed && children}
    </li>
  );
}
