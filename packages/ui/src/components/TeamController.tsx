import { Play, RotateCcw, Sparkles, Square, UserCheck } from "lucide-react";
import type { RunState } from "@adhd/core";
import { useElapsed } from "../hooks/useElapsed";
import { resumeStageId } from "../run-utils";
import type { Dir } from "../theme";
import { GOLD, MONO, SANS, runDot } from "../theme";
import { VoiceBtn, VoiceStatus } from "./VoiceControls";
import type { VoiceState } from "./VoiceControls";

export interface TeamControllerProps {
  d: Dir;
  run: RunState | null;
  pipeVs: VoiceState;
  onCycleVoice: () => void;
  onApprove: () => void;
  onAbort: () => void;
  onRestart: (stageId: string) => void;
  onNewRun: () => void;
}

export function TeamController({
  d, run, pipeVs, onCycleVoice, onApprove, onAbort, onRestart, onNewRun,
}: TeamControllerProps) {
  const elapsed = useElapsed(run?.createdAt, run?.completedAt);
  const resumeId = run && (run.status === "failed" || run.status === "cancelled")
    ? resumeStageId(run)
    : null;
  const resumeLabel = resumeId
    ? run?.stages.find((stage) => stage.id === resumeId)?.label
    : null;
  const terminal = run !== null &&
    (run.status === "completed" || run.status === "failed" || run.status === "cancelled");

  return (
    <div style={{
      background: d.surface, borderTop: `1px solid ${d.border}`,
      height: 58, display: "flex", alignItems: "center",
      padding: "0 20px", gap: 16, flexShrink: 0,
      boxShadow: "0 -2px 12px rgba(0,0,0,0.05)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: `linear-gradient(135deg, ${d.accent}, ${d.accentDark})`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Sparkles size={14} style={{ color: "#FFF" }} />
        </div>
        <span style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 800, letterSpacing: "-0.02em" }}>ADHD</span>
      </div>

      <div style={{ width: 1, height: 20, background: d.border }} />

      {run ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10 }}>#{run.number}</span>
          <span style={{ color: d.text, fontFamily: SANS, fontSize: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {run.task ?? run.pipelineName}
          </span>
          <span style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10 }}>{elapsed}</span>
          <div style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: runDot(run.status, d),
            boxShadow: run.status === "running" ? `0 0 6px ${d.accent}` : undefined,
            animation: run.status === "running" ? "adhd-pulse 1.2s ease-in-out infinite" : undefined,
          }} />
        </div>
      ) : (
        <span style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12 }}>No active run</span>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {run?.status === "awaiting" && (
          <button
            onClick={onApprove}
            style={{
              background: GOLD, color: "#FFF",
              border: "none", borderRadius: 10, padding: "7px 16px",
              fontFamily: SANS, fontSize: 12, fontWeight: 800, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              boxShadow: "0 2px 8px rgba(217,119,6,0.30)",
            }}
          >
            <UserCheck size={13} /> Approve Gate
          </button>
        )}
        {resumeId && resumeLabel && (
          <button
            onClick={() => onRestart(resumeId)}
            style={{
              background: "rgba(220,38,38,0.08)", color: "#DC2626",
              border: "1px solid rgba(220,38,38,0.20)", borderRadius: 10, padding: "7px 14px",
              fontFamily: SANS, fontSize: 12, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}>
            <RotateCcw size={12} /> Resume from {resumeLabel}
          </button>
        )}
        {(run?.status === "running" || run?.status === "awaiting") && (
          <button
            onClick={onAbort}
            style={{
              background: d.surface2, color: d.textMid,
              border: `1px solid ${d.border}`, borderRadius: 10, padding: "7px 14px",
              fontFamily: SANS, fontSize: 12, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}>
            <Square size={11} /> Abort
          </button>
        )}
        {terminal && (
          <button
            onClick={onNewRun}
            style={{
              background: `linear-gradient(135deg, ${d.accent}, ${d.accentDark})`, color: "#FFF",
              border: "none", borderRadius: 10, padding: "8px 18px",
              fontFamily: SANS, fontSize: 12, fontWeight: 800, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              boxShadow: `0 2px 10px ${d.accentSoft}`,
            }}>
            <Play size={12} /> New run
          </button>
        )}
      </div>

      <div style={{ width: 1, height: 20, background: d.border }} />

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <VoiceStatus vs={pipeVs} d={d} />
        <VoiceBtn vs={pipeVs} d={d} onCycle={onCycleVoice} large />
      </div>
    </div>
  );
}
