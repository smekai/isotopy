import { useState } from "react";
import { Play } from "lucide-react";
import { ENGINES, LIFECYCLE_STAGES, agentForStage } from "@adhd/core";
import {
  loadEngine,
  loadEngineModel,
  loadPipelineId,
  loadWorkspaceDir,
  savePipelineId,
  saveWorkspaceDir,
} from "../settings";
import type { Dir } from "../theme";
import { SANS, specColor } from "../theme";

const PIPELINE_OPTIONS = [
  { id: "sequential", label: "Full team · mock" },
  { id: "one-box", label: "Single agent" },
];

export function EmptyState({
  d, onStart, starting = false,
}: {
  d: Dir;
  onStart: (task: string, pipelineId: string, workspaceDir?: string) => void;
  starting?: boolean;
}) {
  const [input, setInput] = useState("");
  const [pipelineId, setPipelineId] = useState(loadPipelineId);
  const [workspaceDir, setWorkspaceDir] = useState(loadWorkspaceDir);
  const canStart = input.trim().length > 0 && !starting;
  const oneBox = pipelineId === "one-box";
  const stages = oneBox
    ? LIFECYCLE_STAGES.filter((stage) => stage.id === "implementation")
    : LIFECYCLE_STAGES;
  const engine = ENGINES[loadEngine()];

  function selectPipeline(id: string) {
    setPipelineId(id);
    savePipelineId(id);
  }

  function start() {
    if (canStart) {
      onStart(input.trim(), pipelineId, oneBox ? workspaceDir.trim() : undefined);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: "0 40px" }}>
      {/* Ghost pipeline */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.18 }}>
        {stages.map((stage, i) => {
          const agent = agentForStage(stage.id);
          return (
            <div key={stage.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, border: `1.5px solid ${specColor(stage.id).main}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: d.text }}>{agent.glyph}</div>
                <div style={{ fontFamily: SANS, fontSize: 9, color: d.textMuted, whiteSpace: "nowrap" }}>{agent.profession}</div>
              </div>
              {i < stages.length - 1 && <div style={{ width: 16, height: 2, borderRadius: 1, background: d.border }} />}
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={{ color: d.text, fontFamily: SANS, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>
          {oneBox ? "What should the Developer build?" : "What should the team build?"}
        </div>
        <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 14 }}>
          {oneBox
            ? "One prompt, one agent, one result — powered by a real engine."
            : "Describe a feature, bug fix, or task. Your AI team will handle the rest."}
        </div>
      </div>

      {/* Pipeline picker */}
      <div style={{ display: "flex", background: d.surface2, border: `1px solid ${d.border}`, borderRadius: 12, padding: 3, gap: 2 }}>
        {PIPELINE_OPTIONS.map((opt) => {
          const sel = opt.id === pipelineId;
          return (
            <button
              key={opt.id}
              onClick={() => selectPipeline(opt.id)}
              style={{
                border: "none", borderRadius: 9, padding: "7px 16px",
                background: sel ? "#FFF" : "transparent",
                color: sel ? d.accent : d.textMuted,
                fontFamily: SANS, fontSize: 12, fontWeight: sel ? 700 : 500,
                cursor: "pointer", boxShadow: sel ? d.shadowSm : "none",
                transition: "all 0.15s",
              }}
            >{opt.label}</button>
          );
        })}
      </div>

      <div style={{ maxWidth: 540, width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ background: "#FFF", border: `1.5px solid ${d.border}`, borderRadius: 16, display: "flex", alignItems: "center", gap: 12, padding: "10px 10px 10px 18px", boxShadow: d.shadow }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
            placeholder="Describe the task..."
            autoFocus
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: d.text, fontFamily: SANS, fontSize: 14 }}
          />
          <button
            onClick={start}
            disabled={!canStart}
            style={{
              background: canStart ? `linear-gradient(135deg, ${d.accent}, ${d.accentDark})` : d.surface2,
              color: canStart ? "#FFF" : d.textMuted,
              border: "none", borderRadius: 12, padding: "10px 20px",
              fontFamily: SANS, fontSize: 13, fontWeight: 800,
              cursor: canStart ? "pointer" : "default",
              display: "flex", alignItems: "center", gap: 7,
              boxShadow: canStart ? `0 2px 10px ${d.accentMid}` : "none",
              transition: "all 0.2s",
            }}
          >
            <Play size={13} /> {starting ? "Starting..." : "Start run"}
          </button>
        </div>

        {oneBox && (
          <input
            value={workspaceDir}
            onChange={(e) => {
              setWorkspaceDir(e.target.value);
              saveWorkspaceDir(e.target.value);
            }}
            placeholder="Working directory — empty = scratch workspace per run"
            style={{
              border: `1px solid ${d.border}`, borderRadius: 12, padding: "9px 14px",
              background: "#FFF", color: d.text, fontFamily: SANS, fontSize: 12, outline: "none",
            }}
          />
        )}
      </div>

      <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12 }}>
        {oneBox
          ? <>Engine: {engine.label} · {loadEngineModel()} — change in Setup</>
          : <>↵ to start · ⌘⇧V for voice</>}
      </div>
    </div>
  );
}
