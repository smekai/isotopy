import { useState } from "react";
import type { CSSProperties } from "react";
import { Send } from "lucide-react";
import { agentForStage } from "@adhd/core";
import type { Dir } from "../theme";
import { EASE, FONT, ICON, MOTION, RADIUS, SANS, SPACE } from "../theme";
import { VoiceBtn } from "./VoiceControls";
import type { VoiceState } from "./VoiceControls";
import { Waveform } from "./Waveform";

const LISTENING_RED = "#EF4444";
const BUBBLE_MAX_WIDTH = "78%";
const AGENT_REPLY_DELAY_MS = 700;

const TRANSCRIPT: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: SPACE.xxl,
  display: "flex",
  flexDirection: "column",
  gap: SPACE.lg,
};

function emptyHint(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.md,
    textAlign: "center",
    marginTop: SPACE.xxl,
  };
}

function bubble(mine: boolean, d: Dir): CSSProperties {
  const round = `${RADIUS.xl}px`;
  const tail = `${RADIUS.sm}px`;
  return {
    maxWidth: BUBBLE_MAX_WIDTH,
    padding: `${SPACE.md}px ${SPACE.xl}px`,
    borderRadius: mine
      ? `${round} ${round} ${tail} ${round}`
      : `${round} ${round} ${round} ${tail}`,
    background: mine ? d.accentSoft : d.surface2,
    border: `1px solid ${mine ? d.border : "rgba(0,0,0,0.06)"}`,
    color: mine ? d.accent : d.text,
    fontSize: FONT.md,
    fontFamily: SANS,
    lineHeight: 1.6,
  };
}

function voiceBar(d: Dir): CSSProperties {
  return {
    borderTop: `1px solid ${d.border}`,
    padding: `${SPACE.md}px ${SPACE.xxl}px`,
    display: "flex",
    alignItems: "center",
    gap: SPACE.lg,
    background: d.surface2,
  };
}

const LISTENING_LABEL: CSSProperties = {
  color: LISTENING_RED,
  fontSize: FONT.md,
  fontFamily: SANS,
  animation: `adhd-fade-pulse ${MOTION.shimmer} ${EASE.inOut} infinite`,
};

function transcribingLabel(d: Dir): CSSProperties {
  return { color: d.text, fontSize: FONT.md, fontStyle: "italic", fontFamily: SANS };
}

function speakingLabel(d: Dir): CSSProperties {
  return { color: d.accent, fontSize: FONT.md, fontFamily: SANS };
}

function composer(d: Dir): CSSProperties {
  return {
    borderTop: `1px solid ${d.border}`,
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
    display: "flex",
    alignItems: "center",
    gap: SPACE.lg,
  };
}

function composerInput(d: Dir): CSSProperties {
  return {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.md,
  };
}

function sendButton(d: Dir): CSSProperties {
  return { background: "none", border: "none", cursor: "pointer", color: d.accent, padding: SPACE.xs };
}

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
    }, AGENT_REPLY_DELAY_MS);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={TRANSCRIPT}>
        {chat.length === 0 && (
          <div style={emptyHint(d)}>
            Steer the {profession} mid-run — type below or use voice.
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={bubble(m.role === "user", d)}>{m.text}</div>
          </div>
        ))}
      </div>

      {vs !== "idle" && (
        <div style={voiceBar(d)}>
          {vs === "listening" && <><Waveform color={LISTENING_RED} /><span style={LISTENING_LABEL}>Listening...</span></>}
          {vs === "transcribing" && <span style={transcribingLabel(d)}>"Focus on making the API stateless..."</span>}
          {vs === "speaking" && <><Waveform color={d.accent} /><span style={speakingLabel(d)}>{profession} is responding...</span></>}
        </div>
      )}

      <div style={composer(d)}>
        <VoiceBtn vs={vs} d={d} onCycle={onCycle} />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={`Direct the ${profession}...`}
          style={composerInput(d)}
        />
        <button onClick={send} style={sendButton(d)}>
          <Send size={ICON.md} />
        </button>
      </div>
    </div>
  );
}
