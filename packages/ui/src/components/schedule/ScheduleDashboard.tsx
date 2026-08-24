import type { CSSProperties } from "react";
import { CalendarClock, Pencil, Trash2 } from "lucide-react";
import type { Orchestration, RunSummary, ScheduleView } from "@isotopy/core";
import { runsForSchedule } from "../../run-list";
import { formatNextFire, lastOutcomeLabel, scheduleStatusLabel } from "../../schedule-view";
import { RunCard } from "../RunCard";
import type { Dir } from "../../theme";
import { FONT, ICON, MONO, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import { mutedLine } from "../rail-styles";

function pane(d: Dir): CSSProperties {
  return {
    flex: 1,
    overflowY: "auto",
    padding: SPACE.x4l,
    display: "flex",
    flexDirection: "column",
    gap: SPACE.xxl,
    fontFamily: SANS,
    color: d.text,
  };
}

function head(): CSSProperties {
  return { display: "flex", alignItems: "flex-start", gap: SPACE.xl };
}

function title(d: Dir): CSSProperties {
  return {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: SPACE.md,
    color: d.text,
    fontSize: FONT.display,
    fontWeight: WEIGHT.semibold,
  };
}

function iconButton(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.xs,
    background: "none",
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.lg,
    padding: `${SPACE.md}px ${SPACE.xl}px`,
    cursor: "pointer",
    fontFamily: SANS,
    fontSize: FONT.md,
    color: d.textMid,
  };
}

function facts(): CSSProperties {
  return { display: "flex", flexDirection: "column", gap: SPACE.md };
}

function factRow(d: Dir): CSSProperties {
  return {
    display: "flex",
    gap: SPACE.xl,
    fontSize: FONT.lg,
    color: d.textMid,
  };
}

function factName(d: Dir): CSSProperties {
  return { width: 120, flexShrink: 0, color: d.textMuted, fontSize: FONT.md };
}

function cronText(d: Dir): CSSProperties {
  return { fontFamily: MONO, color: d.text };
}

function toggleButton(enabled: boolean, d: Dir): CSSProperties {
  return {
    background: enabled ? d.accent : "none",
    color: enabled ? d.accentText : d.textMid,
    border: `1px solid ${enabled ? d.accent : d.border}`,
    borderRadius: RADIUS.pill,
    padding: `${SPACE.sm}px ${SPACE.xl}px`,
    cursor: "pointer",
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
  };
}

function sectionLabel(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontSize: FONT.xs,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };
}

const HISTORY: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xs,
};

export interface ScheduleDashboardProps {
  schedule: ScheduleView;
  runs: RunSummary[];
  orchestrations: Orchestration[];
  d: Dir;
  onToggleEnabled: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenRun: (runId: string) => void;
  onRestartRun: (runId: string, stageId: string) => void;
  onRerunRun: (run: RunSummary) => void;
}

export function ScheduleDashboard({
  schedule,
  runs,
  orchestrations,
  d,
  onToggleEnabled,
  onEdit,
  onDelete,
  onOpenRun,
  onRestartRun,
  onRerunRun,
}: ScheduleDashboardProps) {
  const fires = runsForSchedule(runs, orchestrations, schedule.id);
  return (
    <div data-testid="schedule-dashboard" style={pane(d)}>
      <div style={head()}>
        <div style={title(d)}>
          <CalendarClock size={ICON.lg} />
          {schedule.name}
        </div>
        <button type="button" onClick={onEdit} data-testid="edit-schedule" style={iconButton(d)}>
          <Pencil size={ICON.sm} /> Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          data-testid="delete-schedule"
          style={iconButton(d)}
        >
          <Trash2 size={ICON.sm} /> Delete
        </button>
      </div>

      <div style={facts()}>
        <div style={factRow(d)}>
          <span style={factName(d)}>Runs</span>
          <span style={cronText(d)}>{schedule.cron}</span>
          <span style={mutedLine(d)}>{schedule.timezone}</span>
        </div>
        <div style={factRow(d)}>
          <span style={factName(d)}>Next</span>
          <span data-testid="schedule-detail-next">{formatNextFire(schedule)}</span>
        </div>
        <div style={factRow(d)}>
          <span style={factName(d)}>Last</span>
          <span data-testid="schedule-detail-last">{lastOutcomeLabel(schedule)}</span>
        </div>
        <div style={factRow(d)}>
          <span style={factName(d)}>Task</span>
          <span>{schedule.task}</span>
        </div>
        <div style={factRow(d)}>
          <span style={factName(d)}>State</span>
          <button
            type="button"
            onClick={() => onToggleEnabled(!schedule.enabled)}
            aria-pressed={schedule.enabled}
            data-testid="toggle-schedule"
            style={toggleButton(schedule.enabled, d)}
          >
            {scheduleStatusLabel(schedule)}
          </button>
        </div>
      </div>

      <div style={sectionLabel(d)}>Every run this schedule started</div>
      {fires.length === 0 ? (
        <div style={mutedLine(d)}>It has not run yet.</div>
      ) : (
        <ul style={HISTORY}>
          {fires.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              selected={false}
              d={d}
              onOpen={() => onOpenRun(run.id)}
              onRestart={(stageId) => onRestartRun(run.id, stageId)}
              onRerun={() => onRerunRun(run)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
