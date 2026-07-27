import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { PlayCircle, Repeat, RotateCcw, X } from "lucide-react";
import type { RunState } from "@adhd/core";
import { fetchRuns } from "../api";
import { formatDuration } from "../hooks/useElapsed";
import { firstStageId, resumeStageId } from "../run-utils";
import type { Dir } from "../theme";
import { FONT, ICON, MONO, RADIUS, RUN_PILL, SANS, SPACE, WEIGHT, Z } from "../theme";

const PANEL_WIDTH = 360;
const FAIL_RED = "#DC2626";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function panel(d: Dir): CSSProperties {
  return {
    position: "fixed",
    inset: "0 0 0 auto",
    zIndex: Z.overlay,
    width: PANEL_WIDTH,
    background: "#FFF",
    borderLeft: `1px solid ${d.border}`,
    display: "flex",
    flexDirection: "column",
    boxShadow: d.elevation.lg,
  };
}

function header(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${SPACE.xxl}px ${SPACE.xxl}px`,
    borderBottom: `1px solid ${d.border}`,
  };
}

function headerTitle(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.xl, fontWeight: WEIGHT.bold };
}

function closeButton(d: Dir): CSSProperties {
  return { background: "none", border: "none", cursor: "pointer", color: d.textMuted };
}

function placeholder(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.md, padding: SPACE.xxl };
}

function card(d: Dir): CSSProperties {
  return {
    padding: `${SPACE.xxl}px ${SPACE.xxl}px`,
    borderBottom: `1px solid ${d.border}`,
    cursor: "pointer",
  };
}

function metaText(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: MONO, fontSize: FONT.xs };
}

function statusPill(pill: { text: string; bg: string }): CSSProperties {
  return {
    background: pill.bg,
    color: pill.text,
    borderRadius: RADIUS.pill,
    padding: `${SPACE.xxs}px ${SPACE.md}px`,
    fontFamily: MONO,
    fontSize: FONT.xxs,
    fontWeight: WEIGHT.bold,
  };
}

function dateText(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.xs, marginLeft: "auto" };
}

function taskText(d: Dir): CSSProperties {
  return {
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.lg,
    fontWeight: WEIGHT.semibold,
    marginBottom: SPACE.xs,
  };
}

const FAILED_STAGE: CSSProperties = { color: FAIL_RED, fontFamily: SANS, fontSize: FONT.xs };

function cardAction(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    border: `1px solid ${d.border}`,
    background: d.surface2,
    borderRadius: RADIUS.md,
    padding: `${SPACE.xs}px ${SPACE.lg}px`,
    fontFamily: SANS,
    fontSize: FONT.sm,
    color: d.textMid,
    cursor: "pointer",
  };
}

export interface HistoryDrawerProps {
  d: Dir;
  onClose: () => void;
  onView: (runId: string) => void;
  onRestart: (runId: string, stageId: string) => void;
  onRerun: (run: RunState) => void;
}

export function HistoryDrawer({ d, onClose, onView, onRestart, onRerun }: HistoryDrawerProps) {
  const [runs, setRuns] = useState<RunState[] | null>(null);

  useEffect(() => {
    void fetchRuns()
      .then(setRuns)
      .catch(() => setRuns([]));
  }, []);

  return (
    <div style={panel(d)}>
      <div style={header(d)}>
        <div style={headerTitle(d)}>Run History</div>
        <button onClick={onClose} style={closeButton(d)}><X size={ICON.lg} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {runs === null && <div style={placeholder(d)}>Loading...</div>}
        {runs?.length === 0 && <div style={placeholder(d)}>No runs yet.</div>}
        {runs?.map((run) => {
          const pill = RUN_PILL[run.status];
          const failedStage = run.stages.find((stage) => stage.status === "failed");
          const restartable = run.status === "failed" || run.status === "cancelled";
          const resumeId = restartable ? resumeStageId(run) : null;
          const restartId = restartable ? firstStageId(run) : null;
          const showResume = resumeId !== null && resumeId !== restartId;
          const duration = run.completedAt
            ? formatDuration(new Date(run.completedAt).getTime() - new Date(run.createdAt).getTime())
            : "—";

          return (
            <div
              key={run.id}
              onClick={() => onView(run.id)}
              data-testid="history-card"
              data-run-id={run.id}
              style={card(d)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: SPACE.md, marginBottom: SPACE.xs }}>
                <span style={metaText(d)}>#{run.number}</span>
                <div style={statusPill(pill)}>{run.status.toUpperCase()}</div>
                <span style={dateText(d)}>{formatDate(run.createdAt)}</span>
              </div>
              <div style={taskText(d)}>{run.task ?? "Untitled run"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: SPACE.lg }}>
                <span style={metaText(d)}>{duration}</span>
                {failedStage && <span style={FAILED_STAGE}>✗ {failedStage.label}</span>}
              </div>
              <div style={{ display: "flex", gap: SPACE.sm, marginTop: SPACE.md }}>
                {showResume && resumeId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestart(run.id, resumeId);
                    }}
                    data-testid="history-resume"
                    title="Continue from the stage that stopped — earlier stages keep their work"
                    style={cardAction(d)}>
                    <PlayCircle size={ICON.xs} /> Resume
                  </button>
                )}
                {restartId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestart(run.id, restartId);
                    }}
                    data-testid="history-restart"
                    title="Re-run the whole pipeline from the first stage"
                    style={cardAction(d)}>
                    <RotateCcw size={ICON.xs} /> Restart
                  </button>
                )}
                {run.task && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRerun(run);
                    }}
                    data-testid="history-rerun"
                    title="Load this run's task and settings into the composer — you can edit before starting"
                    style={cardAction(d)}>
                    <Repeat size={ICON.xs} /> Rerun
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
