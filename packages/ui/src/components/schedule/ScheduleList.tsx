import { CalendarClock, Plus } from "lucide-react";
import type { CSSProperties } from "react";
import type { ScheduleView } from "@isotopy/core";
import { formatNextFire } from "../../schedule-view";
import { RailRow, RailSection, RAIL_ROW_ICON_SIZE } from "../RailSection";
import { RAIL_ROW_NAME } from "../rail-styles";
import type { Dir } from "../../theme";
import { ICON } from "../../theme";

const PAUSED_NAME: CSSProperties = { ...RAIL_ROW_NAME, opacity: 0.6 };

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
    <RailSection
      label="Schedules"
      action={{
        label: "New schedule",
        testId: "new-schedule",
        icon: <Plus size={ICON.sm} />,
        onClick: onNewSchedule,
      }}
      d={d}
    >
      {schedules.map((schedule) => (
        <RailRow
          key={schedule.id}
          name={schedule.name}
          nameStyle={schedule.enabled ? undefined : PAUSED_NAME}
          meta={formatNextFire(schedule)}
          metaTestId="schedule-next-fire"
          icon={<CalendarClock size={RAIL_ROW_ICON_SIZE} />}
          selected={schedule.id === selectedScheduleId}
          testId="schedule-card"
          idAttributes={{ "data-schedule-id": schedule.id }}
          d={d}
          onOpen={() => onOpenSchedule(schedule.id)}
        />
      ))}
    </RailSection>
  );
}
