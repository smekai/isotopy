import { CalendarClock, Plus } from "lucide-react";
import type { CSSProperties } from "react";
import type { ScheduleView } from "@isotopy/core";
import { formatNextFire } from "../../schedule-view";
import type { Dir } from "../../theme";
import { FONT, ICON, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import {
  SCHEDULE_ICON,
  SCHEDULE_LIST,
  SCHEDULE_NAME,
  nextFireText,
  scheduleButton,
} from "./schedule-styles";

function sectionHead(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.xs,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    padding: `${SPACE.xl}px ${SPACE.xl}px ${SPACE.sm}px`,
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
  return paused ? { ...SCHEDULE_NAME, opacity: 0.6 } : SCHEDULE_NAME;
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
      <ul style={SCHEDULE_LIST}>
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
                style={scheduleButton(selected, d)}
              >
                <CalendarClock size={ICON.sm} style={SCHEDULE_ICON} />
                <span style={pausedName(!schedule.enabled)}>{schedule.name}</span>
                <span data-testid="schedule-next-fire" style={nextFireText(d)}>
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
