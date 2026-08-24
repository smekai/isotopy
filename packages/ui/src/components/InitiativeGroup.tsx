import { Fragment } from "react";
import type { CSSProperties } from "react";
import { CornerDownRight } from "lucide-react";
import type { Orchestration, RunSummary } from "@isotopy/core";
import { orchestrationStatusLabel, startReasonFor } from "../orchestration";
import { RailGroup, RAIL_GROUP_NESTED } from "./RailGroup";
import { RunCard } from "./RunCard";
import type { Dir } from "../theme";
import { FONT, ICON, SANS, SPACE, WEIGHT } from "../theme";

const GOAL_LINES = 2;

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
  return (
    <RailGroup
      heading={
        <>
          <span data-testid="initiative-goal" style={goalText(d)}>
            {orchestration.goal}
          </span>
          <span style={statusText(d)}>
            {orchestrationStatusLabel(orchestration.status)}
          </span>
        </>
      }
      count={runs.length}
      countTestId="initiative-count"
      toggleTestId="initiative-toggle"
      toggleAttributes={{ "data-orchestration-id": orchestration.id }}
      collapsed={collapsed}
      d={d}
      onToggle={onToggle}
    >
      <ul style={RAIL_GROUP_NESTED}>
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
    </RailGroup>
  );
}
