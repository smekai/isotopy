import type { CSSProperties } from "react";
import { CalendarClock, ChevronDown, ChevronRight } from "lucide-react";
import type { RunSummary, ScheduleView } from "@isotopy/core";
import { scheduleFireEcho } from "../../schedule-view";
import { RunCard } from "../RunCard";
import type { Dir } from "../../theme";
import { FONT, ICON, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import { mutedLine } from "./schedule-styles";

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
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <li style={shell(d)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        data-testid="schedule-toggle"
        data-schedule-id={schedule.id}
        style={toggle(d)}
      >
        <Chevron size={ICON.md} style={chevron(d)} />
        <span style={HEADING}>
          <span data-testid="schedule-group-name" style={nameText(d)}>
            <CalendarClock size={ICON.sm} />
            {schedule.name}
          </span>
          <span style={mutedLine(d)}>{scheduleFireEcho(schedule)}</span>
        </span>
        <span data-testid="schedule-group-count" style={countText(d)}>
          {totalRuns}
        </span>
      </button>

      {!collapsed && (
        <>
          <ul style={NESTED}>
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
        </>
      )}
    </li>
  );
}
