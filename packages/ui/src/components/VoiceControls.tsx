import { Mic, Volume2 } from "lucide-react";
import type { Dir } from "../theme";
import { SANS } from "../theme";
import { Waveform } from "./Waveform";

// Voice UI is a visual mock: clicking the button cycles through the states.
export type VoiceState = "idle" | "listening" | "transcribing" | "speaking";

export function cycleVS(v: VoiceState): VoiceState {
  const cycle: VoiceState[] = ["idle", "listening", "transcribing", "speaking"];
  return cycle[(cycle.indexOf(v) + 1) % cycle.length];
}

export function VoiceBtn({
  vs, d, onCycle, large = false,
}: {
  vs: VoiceState; d: Dir; onCycle: () => void; large?: boolean;
}) {
  const listening = vs === "listening";
  const speaking = vs === "speaking";
  const active = vs !== "idle";
  const size = large ? 44 : 34;

  const bg = listening
    ? "rgba(239,68,68,0.10)"
    : active ? d.accentSoft : d.surface2;
  const border = listening ? "#EF4444" : active ? d.accent : d.border;
  const iconColor = listening ? "#EF4444" : active ? d.accent : d.textMuted;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      {/* Pulse ring */}
      {active && (
        <div style={{
          position: "absolute", inset: -4,
          borderRadius: "50%",
          border: `2px solid ${listening ? "#EF4444" : d.accent}`,
          animation: "adhd-ring 1.4s ease-out infinite",
          opacity: 0.5,
        }} />
      )}
      <button
        onClick={onCycle}
        style={{
          width: size, height: size, borderRadius: "50%",
          background: bg, border: `2px solid ${border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", transition: "all 0.2s",
          boxShadow: active ? `0 0 12px ${listening ? "rgba(239,68,68,0.25)" : d.accentSoft}` : d.shadowSm,
          flexShrink: 0,
        }}
      >
        {speaking
          ? <Volume2 style={{ width: large ? 18 : 14, height: large ? 18 : 14, color: iconColor }} />
          : <Mic style={{ width: large ? 18 : 14, height: large ? 18 : 14, color: iconColor }} />
        }
      </button>
    </div>
  );
}

export function VoiceStatus({ vs, d, agentName }: { vs: VoiceState; d: Dir; agentName?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 160 }}>
      {vs === "idle" && (
        <span style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12 }}>
          {agentName ? `Talk to the ${agentName}` : "Talk to the team"}
        </span>
      )}
      {vs === "listening" && (
        <>
          <Waveform color="#EF4444" />
          <span style={{ color: "#EF4444", fontFamily: SANS, fontSize: 12, fontWeight: 600 }} className="animate-pulse">
            Listening...
          </span>
        </>
      )}
      {vs === "transcribing" && (
        <span style={{ color: d.text, fontFamily: SANS, fontSize: 12, fontStyle: "italic" }}>
          "What's the status?"
        </span>
      )}
      {vs === "speaking" && (
        <>
          <Waveform color={d.accent} />
          <span style={{ color: d.accent, fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>
            {agentName ?? "Team"} responding...
          </span>
        </>
      )}
    </div>
  );
}
