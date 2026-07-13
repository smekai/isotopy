import { useState } from "react";
import { Server, ToggleLeft, ToggleRight, X } from "lucide-react";
import { LIFECYCLE_STAGES, agentForStage } from "@adhd/core";
import { loadDisabledStages, saveDisabledStages } from "../settings";
import { useTheme } from "../ThemeContext";
import { DIRS, MONO, SANS, specColor } from "../theme";
import type { Dir } from "../theme";

const GATED_STAGES = LIFECYCLE_STAGES.filter((stage) => stage.gateAfter);

export function SetupModal({ d, onClose }: { d: Dir; onClose: () => void }) {
  const { dirId, setDirId } = useTheme();
  const [sec, setSec] = useState("appearance");
  const [disabledStages, setDisabledStages] = useState<string[]>(loadDisabledStages);
  // Harness, keys and deploy target are display-only mocks for now.
  const [harness, setHarness] = useState("claude-code");
  const [model, setModel] = useState("claude-opus-4-8");

  const sections = [
    { id: "appearance", label: "Appearance" },
    { id: "pipeline", label: "Pipeline" },
    { id: "gates", label: "Gates" },
    { id: "harness", label: "AI Harness" },
    { id: "keys", label: "API Keys" },
    { id: "deploy", label: "Deploy Target" },
  ];

  function toggleStage(stageId: string) {
    setDisabledStages((current) => {
      const next = current.includes(stageId)
        ? current.filter((id) => id !== stageId)
        : [...current, stageId];
      saveDisabledStages(next);
      return next;
    });
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(30,27,75,0.20)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#FFF", borderRadius: 20, width: 700, maxHeight: "82vh", display: "flex", overflow: "hidden", boxShadow: d.shadowLg }}
      >
        {/* Sidebar */}
        <div style={{ width: 160, background: d.surface2, borderRight: `1px solid ${d.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${d.border}` }}>
            <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 800 }}>Setup</div>
            <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11 }}>my-saas-app</div>
          </div>
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setSec(s.id)}
              style={{
                textAlign: "left", padding: "10px 16px", border: "none",
                background: sec === s.id ? d.accentSoft : "transparent",
                borderLeft: `3px solid ${sec === s.id ? d.accent : "transparent"}`,
                color: sec === s.id ? d.accent : d.textMid,
                fontFamily: SANS, fontSize: 12, fontWeight: sec === s.id ? 700 : 500,
                cursor: "pointer", transition: "all 0.15s",
              }}
            >{s.label}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={onClose}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", border: "none", borderTop: `1px solid ${d.border}`, background: "transparent", color: d.textMuted, fontFamily: SANS, fontSize: 12, cursor: "pointer" }}>
            <X size={12} /> Close
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {sec === "appearance" && (
            <div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Appearance</div>
              <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, marginBottom: 16 }}>
                Pick a visual direction for the workspace. Applies instantly.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Object.values(DIRS).map((dir) => {
                  const sel = dir.id === dirId;
                  return (
                    <button
                      key={dir.id}
                      onClick={() => setDirId(dir.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                        border: `2px solid ${sel ? dir.accent : d.border}`, borderRadius: 12,
                        background: sel ? dir.accentSoft : "transparent",
                        cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: `linear-gradient(135deg, ${dir.accent}, ${dir.accentDark})`,
                        boxShadow: sel ? `0 0 0 3px ${dir.accentSoft}` : "none",
                      }} />
                      <div>
                        <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>{dir.label}</div>
                        <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11 }}>{dir.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {sec === "pipeline" && (
            <div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Pipeline Stages</div>
              <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, marginBottom: 16 }}>
                Toggle which team members are active. Disabled agents are skipped on the next run.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {LIFECYCLE_STAGES.map((stage) => {
                  const agent = agentForStage(stage.id);
                  const sc = specColor(stage.id);
                  const enabled = !disabledStages.includes(stage.id);
                  return (
                    <div key={stage.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${d.border}`, borderRadius: 12, padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: sc.soft, color: sc.main, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{agent.glyph}</div>
                        <div>
                          <div style={{ color: d.text, fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>{agent.profession}</div>
                          <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 10 }}>{stage.label} stage</div>
                        </div>
                      </div>
                      <button onClick={() => toggleStage(stage.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: enabled ? d.accent : d.textMuted }}>
                        {enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {sec === "gates" && (
            <div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Human Gates</div>
              <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, marginBottom: 16 }}>Approval checkpoints that pause the pipeline until a human reviews.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {GATED_STAGES.map((stage, i) => (
                  <div key={stage.id} style={{ border: `1px solid ${d.border}`, borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>After {stage.label} · G{i + 1}</div>
                      <div style={{ background: d.accentSoft, color: d.accent, borderRadius: 20, padding: "2px 10px", fontFamily: MONO, fontSize: 9, fontWeight: 700 }}>ENABLED</div>
                    </div>
                    <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12 }}>
                      The {agentForStage(stage.id).profession}'s output needs your approval before the team continues.
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sec === "harness" && (
            <div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>AI Harness</div>
              <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, marginBottom: 16 }}>The implementation tool used by the Developer.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {[{ id: "claude-code", label: "Claude Code", desc: "Anthropic's agentic coding CLI" }, { id: "cursor", label: "Cursor", desc: "AI-first code editor" }].map((opt) => (
                  <button key={opt.id} onClick={() => setHarness(opt.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `2px solid ${harness === opt.id ? d.accent : d.border}`, borderRadius: 12, background: harness === opt.id ? d.accentSoft : "transparent", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${harness === opt.id ? d.accent : d.border}`, background: harness === opt.id ? d.accent : "transparent", flexShrink: 0 }} />
                    <div>
                      <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>{opt.label}</div>
                      <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11 }}>{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Model</div>
              <select value={model} onChange={(e) => setModel(e.target.value)}
                style={{ width: "100%", border: `1px solid ${d.border}`, borderRadius: 10, padding: "9px 12px", fontFamily: MONO, fontSize: 12, color: d.text, background: "#FFF", outline: "none" }}>
                <option value="claude-opus-4-8">claude-opus-4-8 (most capable)</option>
                <option value="claude-sonnet-4-6">claude-sonnet-4-6 (balanced)</option>
                <option value="claude-haiku-4-5">claude-haiku-4-5 (fastest)</option>
              </select>
            </div>
          )}

          {sec === "keys" && (
            <div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>API Keys</div>
              <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, marginBottom: 16 }}>Stored locally. Never transmitted to external servers.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[{ label: "Anthropic API Key", ph: "sk-ant-api03-...", desc: "Required for all AI stages" }, { label: "GitHub Client ID", ph: "Oauth_...", desc: "Optional — GitHub integration" }].map((f) => (
                  <div key={f.label}>
                    <div style={{ color: d.text, fontFamily: SANS, fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{f.label}</div>
                    <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11, marginBottom: 6 }}>{f.desc}</div>
                    <input type="password" placeholder={f.ph}
                      style={{ width: "100%", border: `1px solid ${d.border}`, borderRadius: 10, padding: "9px 12px", fontFamily: MONO, fontSize: 11, color: d.text, outline: "none", background: d.surface2 }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {sec === "deploy" && (
            <div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Deploy Target</div>
              <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, marginBottom: 16 }}>Where the SRE deploys your release.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[{ id: "vercel", label: "Vercel", desc: "Auto-detected from project" }, { id: "railway", label: "Railway", desc: "railway.app" }, { id: "fly", label: "Fly.io", desc: "fly.io" }, { id: "custom", label: "Custom script", desc: "Run ./scripts/deploy.sh" }].map((opt, i) => (
                  <button key={opt.id}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `2px solid ${i === 0 ? d.accent : d.border}`, borderRadius: 12, background: i === 0 ? d.accentSoft : "transparent", cursor: "pointer", textAlign: "left" }}>
                    <Server size={14} style={{ color: i === 0 ? d.accent : d.textMuted, flexShrink: 0 }} />
                    <div>
                      <div style={{ color: d.text, fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>{opt.label}</div>
                      <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11 }}>{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
