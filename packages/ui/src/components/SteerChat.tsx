import { useState } from "react";
import { Send } from "lucide-react";
import { agentForStage } from "@adhd/core";
import type { Dir } from "../theme";
import { SANS } from "../theme";
import { VoiceBtn } from "./VoiceControls";
import type { VoiceState } from "./VoiceControls";
import { Waveform } from "./Waveform";

export interface SteerChatProps {
  stageId: string;
  stageLabel: string;
  d: Dir;
  vs: VoiceState;
  onCycle: () => void;
}

export function SteerChat({ stageId, stageLabel, d, vs, onCycle }: SteerChatProps) {
  const profession = agentForStage(stageId).profession;
  const [input, setInput] = useState("");
  const [chat, setChat] = useState<Array<{ role: "user" | "agent"; text: string }>>([]);

  function send() {
    const text = input.trim();
    if (!text) return;
    setChat((c) => [...c, { role: "user", text }]);
    setInput("");
    setTimeout(() => {
      setChat((c) => [...c, { role: "agent", text: `Got it — I'll adjust the ${stageLabel.toLowerCase()} work.` }]);
    }, 700);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {chat.length === 0 && (
          <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, textAlign: "center", marginTop: 16 }}>
            Steer the {profession} mid-run — type below or use voice.
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "78%", padding: "8px 12px", borderRadius: m.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
              background: m.role === "user" ? d.accentSoft : d.surface2,
              border: `1px solid ${m.role === "user" ? d.border : "rgba(0,0,0,0.06)"}`,
              color: m.role === "user" ? d.accent : d.text,
              fontSize: 12, fontFamily: SANS, lineHeight: 1.6,
            }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {vs !== "idle" && (
        <div style={{ borderTop: `1px solid ${d.border}`, padding: "8px 16px", display: "flex", alignItems: "center", gap: 10, background: d.surface2 }}>
          {vs === "listening" && <><Waveform color="#EF4444" /><span style={{ color: "#EF4444", fontSize: 12, fontFamily: SANS }} className="animate-pulse">Listening...</span></>}
          {vs === "transcribing" && <span style={{ color: d.text, fontSize: 12, fontStyle: "italic", fontFamily: SANS }}>"Focus on making the API stateless..."</span>}
          {vs === "speaking" && <><Waveform color={d.accent} /><span style={{ color: d.accent, fontSize: 12, fontFamily: SANS }}>{profession} is responding...</span></>}
        </div>
      )}

      <div style={{ borderTop: `1px solid ${d.border}`, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
        <VoiceBtn vs={vs} d={d} onCycle={onCycle} />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={`Direct the ${profession}...`}
          style={{
            flex: 1, border: "none", outline: "none",
            background: "transparent", color: d.text,
            fontFamily: SANS, fontSize: 12,
          }}
        />
        <button onClick={send} style={{ background: "none", border: "none", cursor: "pointer", color: d.accent, padding: 4 }}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
