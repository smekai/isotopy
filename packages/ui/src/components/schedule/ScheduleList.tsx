import { CalendarClock, Plus } from "lucide-react";
import type { CSSProperties } from "react";
import type { ScheduleView } from "@isotopy/core";
import { formatNextFire } from "../../schedule-view";
import {
  RAIL_ROW_ICON,
  RAIL_ROW_NAME,
  RAIL_SECTION_LIST,
  railRowButton,
  railRowMeta,
  railSectionLabel,
} from "../rail-styles";
import type { Dir } from "../../theme";
import { ICON, RADIUS } from "../../theme";

function sectionHead(d: Dir): CSSProperties {
  return {
    ...railSectionLabel(d),
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  };
}

function addButton(d: Dir): CSSProperties {
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

function pausedName(paused: boolean): CSSProperties {
  return paused ? { ...RAIL_ROW_NAME, opacity: 0.6 } : RAIL_ROW_NAME;
}

export interface ScheduleListProps {
  schedules: ScheduleView[];
  selectedScheduleId: string | null;
  d: Dir;
  onOpenSchedule: (scheduleId: string) => void;
  onNewSchedule: () => void;
}

export function ScheduleList({
  schedules,
  selectedScheduleId,
  d,
  onOpenSchedule,
  onNewSchedule,
}: ScheduleListProps) {
  return (
    <>
      <div style={sectionHead(d)}>
        <span>Schedules</span>
        <button
          type="button"
          onClick={onNewSchedule}
          aria-label="New schedule"
          data-testid="new-schedule"
          style={addButton(d)}
        >
          <Plus size={ICON.sm} />
        </button>
      </div>
      <ul style={RAIL_SECTION_LIST}>
        {schedules.map((schedule) => {
          const selected = schedule.id === selectedScheduleId;
          return (
            <li key={schedule.id}>
              <button
                type="button"
                onClick={() => onOpenSchedule(schedule.id)}
                aria-current={selected ? "true" : undefined}
                data-testid="schedule-card"
                data-schedule-id={schedule.id}
                style={railRowButton(selected, d)}
              >
                <CalendarClock size={ICON.sm} style={RAIL_ROW_ICON} />
                <span style={pausedName(!schedule.enabled)}>{schedule.name}</span>
                <span data-testid="schedule-next-fire" style={railRowMeta(d)}>
                  {formatNextFire(schedule)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
