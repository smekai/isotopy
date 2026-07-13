import { useEffect, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import type { RunState } from "@adhd/core";
import { fetchRuns } from "../api";
import { formatDuration } from "../hooks/useElapsed";
import { restartStageId } from "../run-utils";
import type { Dir } from "../theme";
import { MONO, RUN_PILL, SANS } from "../theme";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function HistoryDrawer({
  d, onClose, onView, onRestart,
}: {
  d: Dir;
  onClose: () => void;
  onView: (runId: string) => void;
  onRestart: (runId: string, stageId: string) => void;
}) {
  const [runs, setRuns] = useState<RunState[] | null>(null);

  useEffect(() => {
    void fetchRuns()
      .then(setRuns)
      .catch(() => setRuns([]));
  }, []);

  return (
    <div style={{ position: "fixed", inset: "0 0 0 auto", zIndex: 50, width: 360, background: "#FFF", borderLeft: `1px solid ${d.border}`, display: "flex", flexDirection: "column", boxShadow: d.shadowLg }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${d.border}` }}>
        <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700 }}>Run History</div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: d.textMuted }}><X size={16} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {runs === null && (
          <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, padding: 16 }}>Loading...</div>
        )}
        {runs?.length === 0 && (
          <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, padding: 16 }}>No runs yet.</div>
        )}
        {runs?.map((run) => {
          const pill = RUN_PILL[run.status];
          const failedStage = run.stages.find((stage) => stage.status === "failed");
          const restartId = run.status === "failed" || run.status === "cancelled"
            ? restartStageId(run)
            : null;
          const duration = run.completedAt
            ? formatDuration(new Date(run.completedAt).getTime() - new Date(run.createdAt).getTime())
            : "—";

          return (
            <div
              key={run.id}
              onClick={() => onView(run.id)}
              style={{ padding: "14px 16px", borderBottom: `1px solid ${d.border}`, cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10 }}>#{run.number}</span>
                <div style={{
                  background: pill.bg, color: pill.text,
                  borderRadius: 20, padding: "2px 8px", fontFamily: MONO, fontSize: 9, fontWeight: 700,
                }}>{run.status.toUpperCase()}</div>
                <span style={{ color: d.textMuted, fontFamily: SANS, fontSize: 10, marginLeft: "auto" }}>{formatDate(run.createdAt)}</span>
              </div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                {run.task ?? "Untitled run"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10 }}>{duration}</span>
                {failedStage && <span style={{ color: "#DC2626", fontFamily: SANS, fontSize: 10 }}>✗ {failedStage.label}</span>}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {restartId && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestart(run.id, restartId);
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${d.border}`, background: d.surface2, borderRadius: 8, padding: "4px 10px", fontFamily: SANS, fontSize: 11, color: d.textMid, cursor: "pointer" }}>
                    <RotateCcw size={10} /> Restart
                  </button>
                )}
                <button
                  disabled
                  title="Artifacts are not stored yet"
                  onClick={(e) => e.stopPropagation()}
                  style={{ border: `1px solid ${d.border}`, background: d.surface2, borderRadius: 8, padding: "4px 10px", fontFamily: SANS, fontSize: 11, color: d.textMid, cursor: "default", opacity: 0.5 }}>
                  Artifacts
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
