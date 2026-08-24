import type { CSSProperties } from "react";
import { CalendarClock } from "lucide-react";
import type { RunSummary, ScheduleView } from "@isotopy/core";
import { scheduleFireEcho } from "../../schedule-view";
import { RailGroup, RAIL_GROUP_NESTED } from "../RailGroup";
import { mutedLine } from "../rail-styles";
import { RunCard } from "../RunCard";
import type { Dir } from "../../theme";
import { FONT, ICON, SANS, SPACE, WEIGHT } from "../../theme";

function nameText(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.xs,
    color: d.text,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
  };
}

function historyLink(d: Dir): CSSProperties {
  return {
    background: "none",
    border: "none",
    padding: `${SPACE.xs}px ${SPACE.lg}px`,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: SANS,
    fontSize: FONT.xs,
    color: d.accent,
  };
}

export interface ScheduleGroupProps {
  schedule: ScheduleView;
  runs: RunSummary[];
  totalRuns: number;
  collapsed: boolean;
  selectedRunId: string | null;
  d: Dir;
  onToggle: () => void;
  onOpen: (runId: string) => void;
  onOpenSchedule: (scheduleId: string) => void;
  onRestart: (runId: string, stageId: string) => void;
  onRerun: (run: RunSummary) => void;
}

export function ScheduleGroup({
  schedule,
  runs,
  totalRuns,
  collapsed,
  selectedRunId,
  d,
  onToggle,
  onOpen,
  onOpenSchedule,
  onRestart,
  onRerun,
}: ScheduleGroupProps) {
  return (
    <RailGroup
      heading={
        <>
          <span data-testid="schedule-group-name" style={nameText(d)}>
            <CalendarClock size={ICON.sm} />
            {schedule.name}
          </span>
          <span style={mutedLine(d)}>{scheduleFireEcho(schedule)}</span>
        </>
      }
      count={totalRuns}
      countTestId="schedule-group-count"
      toggleTestId="schedule-toggle"
      toggleAttributes={{ "data-schedule-id": schedule.id }}
      collapsed={collapsed}
      d={d}
      onToggle={onToggle}
    >
      <ul style={RAIL_GROUP_NESTED}>
        {runs.map((run) => (
          <RunCard
            key={run.id}
            run={run}
            selected={run.id === selectedRunId}
            d={d}
            onOpen={() => onOpen(run.id)}
            onRestart={(stageId) => onRestart(run.id, stageId)}
            onRerun={() => onRerun(run)}
          />
        ))}
      </ul>
      {totalRuns > runs.length && (
        <button
          type="button"
          onClick={() => onOpenSchedule(schedule.id)}
          data-testid="schedule-history-link"
          style={historyLink(d)}
        >
          All {totalRuns} runs
        </button>
      )}
    </RailGroup>
  );
}
