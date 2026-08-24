import type { CSSProperties, ReactNode } from "react";
import type { Dir } from "../theme";
import { ICON, RADIUS } from "../theme";
import {
  RAIL_ROW_ICON,
  RAIL_ROW_NAME,
  RAIL_SECTION_LIST,
  railRowButton,
  railRowMeta,
  railSectionLabel,
} from "./rail-styles";

function sectionHead(d: Dir): CSSProperties {
  return {
    ...railSectionLabel(d),
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  };
}

function actionButton(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    background: "none",
    border: "none",
    borderRadius: RADIUS.sm,
    padding: 0,
    cursor: "pointer",
    color: d.textMuted,
  };
}

export interface RailSectionAction {
  label: string;
  testId: string;
  icon: ReactNode;
  onClick: () => void;
}

export interface RailSectionProps {
  label: string;
  action?: RailSectionAction;
  d: Dir;
  children: ReactNode;
}

export function RailSection({ label, action, d, children }: RailSectionProps) {
  return (
    <>
      <div style={action ? sectionHead(d) : railSectionLabel(d)}>
        <span>{label}</span>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            aria-label={action.label}
            data-testid={action.testId}
            style={actionButton(d)}
          >
            {action.icon}
          </button>
        )}
      </div>
      <ul style={RAIL_SECTION_LIST}>{children}</ul>
    </>
  );
}

export interface RailRowProps {
  name: string;
  nameStyle?: CSSProperties;
  meta: ReactNode;
  metaTestId?: string;
  icon: ReactNode;
  selected: boolean;
  testId: string;
  idAttributes: Record<string, string>;
  d: Dir;
  onOpen: () => void;
}

export function RailRow({
  name,
  nameStyle,
  meta,
  metaTestId,
  icon,
  selected,
  testId,
  idAttributes,
  d,
  onOpen,
}: RailRowProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? "true" : undefined}
        data-testid={testId}
        {...idAttributes}
        style={railRowButton(selected, d)}
      >
        <span style={RAIL_ROW_ICON}>{icon}</span>
        <span style={nameStyle ?? RAIL_ROW_NAME}>{name}</span>
        <span data-testid={metaTestId} style={railRowMeta(d)}>
          {meta}
        </span>
      </button>
    </li>
  );
}

export const RAIL_ROW_ICON_SIZE = ICON.sm;
