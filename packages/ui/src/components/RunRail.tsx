import type { CSSProperties } from "react";
import { Flag, Plus } from "lucide-react";
import type { Milestone, RunSummary } from "@isotopy/core";
import { milestoneProgress } from "@isotopy/core";
import { RunCard } from "./RunCard";
import type { Dir } from "../theme";
import { FONT, ICON, RADIUS, SANS, SPACE, WEIGHT } from "../theme";

const RAIL_WIDTH = 280;
const MILESTONE_LIST_MAX_HEIGHT = 200;

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

function sectionLabel(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.xs,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    padding: `${SPACE.xl}px ${SPACE.xl}px ${SPACE.sm}px`,
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

const MILESTONE_LIST: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: `0 ${SPACE.md}px`,
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xxs,
  maxHeight: MILESTONE_LIST_MAX_HEIGHT,
  overflowY: "auto",
  flexShrink: 0,
};

function milestoneButton(selected: boolean, d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    width: "100%",
    textAlign: "left",
    background: selected ? d.surface : "transparent",
    border: `1px solid ${selected ? d.borderStrong : "transparent"}`,
    borderRadius: RADIUS.md,
    padding: `${SPACE.md}px ${SPACE.lg}px`,
    cursor: "pointer",
    fontFamily: SANS,
    color: selected ? d.text : d.textMid,
  };
}

const MILESTONE_NAME: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: FONT.md,
  fontWeight: WEIGHT.semibold,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "inherit",
};

const MILESTONE_ICON: CSSProperties = { flexShrink: 0 };

function milestoneCount(d: Dir): CSSProperties {
  return { color: d.textMuted, fontSize: FONT.xs, flexShrink: 0 };
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
      <div style={sectionLabel(d)}>Milestones</div>
      <ul style={MILESTONE_LIST}>
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
                style={milestoneButton(selected, d)}
              >
                <Flag size={ICON.sm} style={MILESTONE_ICON} />
                <span style={MILESTONE_NAME}>{milestone.name}</span>
                <span style={milestoneCount(d)}>
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
  milestones: Milestone[];
  ready: boolean;
  selectedRunId: string | null;
  selectedMilestoneId: string | null;
  composing: boolean;
  onNewRun: () => void;
  onOpen: (runId: string) => void;
  onOpenMilestone: (milestoneId: string) => void;
  onRestart: (runId: string, stageId: string) => void;
  onRerun: (run: RunSummary) => void;
}

export function RunRail({
  d,
  runs,
  milestones,
  ready,
  selectedRunId,
  selectedMilestoneId,
  composing,
  onNewRun,
  onOpen,
  onOpenMilestone,
  onRestart,
  onRerun,
}: RunRailProps) {
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

      <div style={sectionLabel(d)}>Runs</div>

      {!ready && <div style={placeholder(d)}>Loading…</div>}
      {ready && runs.length === 0 && <div style={placeholder(d)}>No runs yet.</div>}

      <ul style={LIST}>
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
    </nav>
  );
}
