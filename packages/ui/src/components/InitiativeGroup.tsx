import { Fragment } from "react";
import type { CSSProperties } from "react";
import { ChevronDown, ChevronRight, CornerDownRight } from "lucide-react";
import type { Orchestration, RunSummary } from "@isotopy/core";
import { orchestrationStatusLabel, startReasonFor } from "../orchestration";
import { RunCard } from "./RunCard";
import type { Dir } from "../theme";
import { FONT, ICON, RADIUS, SANS, SPACE, WEIGHT } from "../theme";

const GOAL_LINES = 2;

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

function goalText(d: Dir): CSSProperties {
  return {
    color: d.text,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
    display: "-webkit-box",
    WebkitLineClamp: GOAL_LINES,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  };
}

function statusText(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontSize: FONT.xs,
    fontWeight: WEIGHT.medium,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  };
}

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

const NESTED: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: `0 0 ${SPACE.xs}px ${SPACE.lg}px`,
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xxs,
};

function reasonText(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "flex-start",
    gap: SPACE.xs,
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.xs,
    lineHeight: 1.4,
    padding: `${SPACE.xs}px ${SPACE.lg}px 0`,
  };
}

const REASON_ICON: CSSProperties = { flexShrink: 0, marginTop: SPACE.xxs };

export interface InitiativeGroupProps {
  orchestration: Orchestration;
  runs: RunSummary[];
  collapsed: boolean;
  selectedRunId: string | null;
  d: Dir;
  onToggle: () => void;
  onOpen: (runId: string) => void;
  onRestart: (runId: string, stageId: string) => void;
  onRerun: (run: RunSummary) => void;
}

export function InitiativeGroup({
  orchestration,
  runs,
  collapsed,
  selectedRunId,
  d,
  onToggle,
  onOpen,
  onRestart,
  onRerun,
}: InitiativeGroupProps) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <li style={shell(d)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        data-testid="initiative-toggle"
        data-orchestration-id={orchestration.id}
        style={toggle(d)}
      >
        <Chevron size={ICON.md} style={chevron(d)} />
        <span style={HEADING}>
          <span data-testid="initiative-goal" style={goalText(d)}>
            {orchestration.goal}
          </span>
          <span style={statusText(d)}>
            {orchestrationStatusLabel(orchestration.status)}
          </span>
        </span>
        <span data-testid="initiative-count" style={countText(d)}>
          {runs.length}
        </span>
      </button>

      {!collapsed && (
        <ul style={NESTED}>
          {runs.map((run) => {
            const reason = startReasonFor(orchestration, run);
            return (
              <Fragment key={run.id}>
                {reason !== undefined && (
                  <li data-testid={`run-reason-${run.id}`} style={reasonText(d)}>
                    <CornerDownRight size={ICON.xs} style={REASON_ICON} />
                    <span>{reason}</span>
                  </li>
                )}
                <RunCard
                  run={run}
                  selected={run.id === selectedRunId}
                  d={d}
                  onOpen={() => onOpen(run.id)}
                  onRestart={(stageId) => onRestart(run.id, stageId)}
                  onRerun={() => onRerun(run)}
                />
              </Fragment>
            );
          })}
        </ul>
      )}
    </li>
  );
}
