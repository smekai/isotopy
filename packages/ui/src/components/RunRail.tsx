import type { CSSProperties } from "react";
import { Plus } from "lucide-react";
import type { RunSummary } from "@adhd/core";
import { RunCard } from "./RunCard";
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

export interface RunRailProps {
  d: Dir;
  runs: RunSummary[];
  ready: boolean;
  selectedRunId: string | null;
  composing: boolean;
  onNewRun: () => void;
  onOpen: (runId: string) => void;
  onRestart: (runId: string, stageId: string) => void;
  onRerun: (run: RunSummary) => void;
}

export function RunRail({
  d,
  runs,
  ready,
  selectedRunId,
  composing,
  onNewRun,
  onOpen,
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
