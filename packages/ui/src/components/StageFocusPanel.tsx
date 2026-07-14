import { useState } from "react";
import { Brain, FileText, MessageSquare, RotateCcw, Terminal, X } from "lucide-react";
import type { LogLevel, RunState, StageState } from "@adhd/core";
import { agentForStage } from "@adhd/core";
import { ARTIFACTS, REASONING } from "../mock-content";
import type { Dir } from "../theme";
import { MONO, SANS, sLabel, specColor, statusClr } from "../theme";
import { StatusIcon } from "./StatusIcon";
import { SteerChat } from "./SteerChat";
import type { VoiceState } from "./VoiceControls";

export type FocusTab = "artifacts" | "log" | "reasoning" | "steer";

function formatTs(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour12: false });
}

export function StageFocusPanel({
  stage, run, d, tab, onTabChange, vs, onCycleVoice, onClose, onRestartHere,
}: {
  stage: StageState;
  run: RunState;
  d: Dir;
  tab: FocusTab;
  onTabChange: (t: FocusTab) => void;
  vs: VoiceState;
  onCycleVoice: () => void;
  onClose: () => void;
  onRestartHere: (stageId: string) => void;
}) {
  const agent = agentForStage(stage.id);
  const sc = specColor(stage.id);
  const st = statusClr(stage.status);
  // Engine runs show the real result; mock runs still show static design samples.
  const isEngineRun = run.engine != null;
  const artifacts = isEngineRun
    ? run.result
      ? [{ name: "result.md", size: `${new Blob([run.result]).size} B`, preview: run.result }]
      : []
    : (ARTIFACTS[stage.id] ?? []);
  const reasoning = isEngineRun ? [] : (REASONING[stage.id] ?? []);
  const [artIdx, setArtIdx] = useState(0);

  const restartable =
    (run.status === "failed" || run.status === "cancelled") &&
    !(run.disabledStages ?? []).includes(stage.id);

  const tabs: { id: FocusTab; label: string; ico: React.ReactNode }[] = [
    { id: "artifacts", label: "Artifacts", ico: <FileText size={12} /> },
    { id: "log", label: "Live Log", ico: <Terminal size={12} /> },
    { id: "reasoning", label: "Reasoning", ico: <Brain size={12} /> },
    { id: "steer", label: "Steer", ico: <MessageSquare size={12} /> },
  ];

  const logColor = (level: LogLevel) => {
    if (level === "error" || level === "fail") return "#DC2626";
    if (level === "pass") return "#059669";
    if (level === "run") return d.accent;
    if (level === "warn") return "#D97706";
    return d.textMid;
  };

  return (
    <div style={{
      flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
      background: d.surface,
      borderTop: `3px solid ${sc.main}`,
      boxShadow: "0 -4px 24px rgba(0,0,0,0.06)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${d.border}`, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: sc.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
          {agent.glyph}
        </div>
        <div>
          <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700 }}>{agent.profession}</div>
          <div style={{ color: d.textMuted, fontSize: 11, fontFamily: SANS }}>{stage.label} stage</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: st.bg, borderRadius: 20, padding: "3px 10px" }}>
          <StatusIcon s={stage.status} size={11} />
          <span style={{ color: st.text, fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em" }}>{sLabel(stage.status)}</span>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => restartable && onRestartHere(stage.id)}
          disabled={!restartable}
          title={restartable ? undefined : "Available after a failed or aborted run"}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: d.surface2, border: `1px solid ${d.border}`,
            borderRadius: 8, padding: "5px 10px",
            cursor: restartable ? "pointer" : "default",
            opacity: restartable ? 1 : 0.45,
            color: d.textMid, fontFamily: SANS, fontSize: 11, fontWeight: 600,
          }}>
          <RotateCcw size={11} /> Restart here
        </button>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: d.textMuted, padding: 4 }}>
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${d.border}`, padding: "0 16px", flexShrink: 0 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 14px", marginBottom: -1,
              border: "none", borderBottom: `2px solid ${tab === t.id ? sc.main : "transparent"}`,
              background: "none", cursor: "pointer",
              color: tab === t.id ? sc.main : d.textMuted,
              fontFamily: SANS, fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
              transition: "all 0.18s",
            }}
          >
            {t.ico}{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: tab === "steer" ? "hidden" : "auto" }}>
        {tab === "artifacts" && (
          <div style={{ display: "flex", height: "100%" }}>
            <div style={{ width: 180, borderRight: `1px solid ${d.border}`, overflowY: "auto", flexShrink: 0 }}>
              {artifacts.length === 0
                ? <div style={{ color: d.textMuted, padding: 16, fontSize: 12, fontFamily: SANS }}>No artifacts yet.</div>
                : artifacts.map((a, i) => (
                  <button
                    key={a.name}
                    onClick={() => setArtIdx(i)}
                    style={{
                      width: "100%", display: "flex", alignItems: "flex-start", gap: 8,
                      padding: "10px 12px", border: "none", borderBottom: `1px solid ${d.border}`,
                      background: i === artIdx ? d.accentSoft : "transparent",
                      cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <FileText size={11} style={{ color: i === artIdx ? d.accent : d.textMuted, marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <div style={{ color: i === artIdx ? d.accent : d.text, fontFamily: MONO, fontSize: 10, lineHeight: 1.4 }}>{a.name}</div>
                      <div style={{ color: d.textMuted, fontSize: 9 }}>{a.size}</div>
                    </div>
                  </button>
                ))
              }
            </div>
            <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
              {artifacts[artIdx] && (
                <pre style={{ color: d.text, fontFamily: MONO, fontSize: 11, lineHeight: 1.75, whiteSpace: "pre-wrap", margin: 0 }}>
                  {artifacts[artIdx].preview}
                </pre>
              )}
            </div>
          </div>
        )}

        {tab === "log" && (
          <div style={{ padding: "12px 16px" }}>
            {stage.logs.length === 0
              ? <span style={{ color: d.textMuted, fontSize: 12, fontFamily: SANS }}>No log entries.</span>
              : stage.logs.map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 5 }}>
                  <span style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10, flexShrink: 0, paddingTop: 2 }}>{formatTs(entry.ts)}</span>
                  <span style={{ color: logColor(entry.level), fontFamily: MONO, fontSize: 11, lineHeight: 1.6 }}>{entry.message}</span>
                </div>
              ))
            }
            {stage.status === "running" && (
              <span style={{ color: d.accent, fontFamily: MONO, fontSize: 12 }} className="animate-pulse">▊</span>
            )}
          </div>
        )}

        {tab === "reasoning" && (
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            {reasoning.length === 0
              ? <span style={{ color: d.textMuted, fontSize: 12, fontFamily: SANS }}>No reasoning trace available.</span>
              : reasoning.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 12 }}>
                  <div style={{ width: 2, background: sc.soft, borderRadius: 1, flexShrink: 0, alignSelf: "stretch" }} />
                  <p style={{ color: d.textMid, fontSize: 12, lineHeight: 1.75, fontFamily: SANS, margin: 0 }}>{t}</p>
                </div>
              ))
            }
          </div>
        )}

        {tab === "steer" && (
          <SteerChat stageId={stage.id} stageLabel={stage.label} d={d} vs={vs} onCycle={onCycleVoice} />
        )}
      </div>
    </div>
  );
}
