import { useState } from "react";
import type { CSSProperties } from "react";
import { Flag, Plus } from "lucide-react";
import type { Milestone, Orchestration, RunSummary, ScheduleView } from "@isotopy/core";
import { milestoneProgress } from "@isotopy/core";
import { railItems } from "../run-list";
import { InitiativeGroup } from "./InitiativeGroup";
import { ScheduleGroup } from "./schedule/ScheduleGroup";
import { ScheduleList } from "./schedule/ScheduleList";
import { RunCard } from "./RunCard";
import {
  RAIL_ROW_ICON,
  RAIL_ROW_NAME,
  RAIL_SECTION_LIST,
  railRowButton,
  railRowMeta,
  railSectionLabel,
} from "./rail-styles";
import type { Dir } from "../theme";
import { FONT, ICON, RADIUS, SANS, SPACE, WEIGHT } from "../theme";

const RAIL_WIDTH = 280;

function rail(d: Dir): CSSProperties {
  return {
    width: RAIL_WIDTH,
    flexShrink: 0,
    background: d.surface2,
    borderRight: `1px solid ${d.border}`,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };
}

function head(d: Dir): CSSProperties {
  return {
    padding: `${SPACE.xl}px ${SPACE.xl}px ${SPACE.md}px`,
    borderBottom: `1px solid ${d.border}`,
    flexShrink: 0,
  };
}

function newRunButton(active: boolean, d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.sm,
    width: "100%",
    background: active ? d.accent : d.surface,
    color: active ? d.accentText : d.textMid,
    border: `1px solid ${active ? d.accent : d.border}`,
    borderRadius: RADIUS.lg,
    padding: `${SPACE.md}px 0`,
    cursor: "pointer",
    fontFamily: SANS,
    fontSize: FONT.lg,
    fontWeight: WEIGHT.semibold,
  };
}

const LIST: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: `0 ${SPACE.md}px ${SPACE.xl}px`,
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xxs,
  overflowY: "auto",
  flex: 1,
};

function placeholder(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.md,
    padding: `0 ${SPACE.xl}px`,
  };
}

interface MilestoneListProps {
  milestones: Milestone[];
  selectedMilestoneId: string | null;
  onOpenMilestone: (milestoneId: string) => void;
  d: Dir;
}

function MilestoneList({
  milestones,
  selectedMilestoneId,
  onOpenMilestone,
  d,
}: MilestoneListProps) {
  return (
    <>
      <div style={railSectionLabel(d)}>Milestones</div>
      <ul style={RAIL_SECTION_LIST}>
        {milestones.map((milestone) => {
          const { completed, total } = milestoneProgress(milestone);
          const selected = milestone.id === selectedMilestoneId;
          return (
            <li key={milestone.id}>
              <button
                type="button"
                onClick={() => onOpenMilestone(milestone.id)}
                aria-current={selected ? "true" : undefined}
                data-testid="milestone-card"
                data-milestone-id={milestone.id}
                style={railRowButton(selected, d)}
              >
                <Flag size={ICON.sm} style={RAIL_ROW_ICON} />
                <span style={RAIL_ROW_NAME}>{milestone.name}</span>
                <span style={railRowMeta(d)}>
                  {completed}/{total}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export interface RunRailProps {
  d: Dir;
  runs: RunSummary[];
  orchestrations: Orchestration[];
  milestones: Milestone[];
  schedules: ScheduleView[];
  ready: boolean;
  selectedRunId: string | null;
  selectedMilestoneId: string | null;
  selectedScheduleId: string | null;
  composing: boolean;
  onNewRun: () => void;
  onOpen: (runId: string) => void;
  onOpenMilestone: (milestoneId: string) => void;
  onOpenSchedule: (scheduleId: string) => void;
  onNewSchedule: () => void;
  onRestart: (runId: string, stageId: string) => void;
  onRerun: (run: RunSummary) => void;
}

export function RunRail({
  d,
  runs,
  orchestrations,
  milestones,
  schedules,
  ready,
  selectedRunId,
  selectedMilestoneId,
  selectedScheduleId,
  composing,
  onNewRun,
  onOpen,
  onOpenMilestone,
  onOpenSchedule,
  onNewSchedule,
  onRestart,
  onRerun,
}: RunRailProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  function toggleGroup(groupId: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(groupId)) {
        next.add(groupId);
      }
      return next;
    });
  }

  return (
    <nav aria-label="Runs" style={rail(d)}>
      <div style={head(d)}>
        <button type="button" onClick={onNewRun} style={newRunButton(composing, d)}>
          <Plus size={ICON.md} /> New run
        </button>
      </div>

      {milestones.length > 0 && (
        <MilestoneList
          milestones={milestones}
          selectedMilestoneId={selectedMilestoneId}
          onOpenMilestone={onOpenMilestone}
          d={d}
        />
      )}

      <ScheduleList
        schedules={schedules}
        selectedScheduleId={selectedScheduleId}
        d={d}
        onOpenSchedule={onOpenSchedule}
        onNewSchedule={onNewSchedule}
      />

      <div style={railSectionLabel(d)}>Runs</div>

      {!ready && <div style={placeholder(d)}>Loading…</div>}
      {ready && runs.length === 0 && <div style={placeholder(d)}>No runs yet.</div>}

      <ul style={LIST}>
        {railItems(runs, orchestrations, schedules).map((item) => {
          if (item.kind === "initiative") {
            return (
              <InitiativeGroup
                key={item.orchestration.id}
                orchestration={item.orchestration}
                runs={item.runs}
                collapsed={collapsed.has(item.orchestration.id)}
                selectedRunId={selectedRunId}
                d={d}
                onToggle={() => toggleGroup(item.orchestration.id)}
                onOpen={onOpen}
                onRestart={onRestart}
                onRerun={onRerun}
              />
            );
          }
          if (item.kind === "schedule") {
            return (
              <ScheduleGroup
                key={item.schedule.id}
                schedule={item.schedule}
                runs={item.runs}
                totalRuns={item.totalRuns}
                collapsed={collapsed.has(item.schedule.id)}
                selectedRunId={selectedRunId}
                d={d}
                onToggle={() => toggleGroup(item.schedule.id)}
                onOpen={onOpen}
                onOpenSchedule={onOpenSchedule}
                onRestart={onRestart}
                onRerun={onRerun}
              />
            );
          }
          return (
            <RunCard
              key={item.run.id}
              run={item.run}
              selected={item.run.id === selectedRunId}
              d={d}
              onOpen={() => onOpen(item.run.id)}
              onRestart={(stageId) => onRestart(item.run.id, stageId)}
              onRerun={() => onRerun(item.run)}
            />
          );
        })}
      </ul>
    </nav>
  );
}
