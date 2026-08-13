import type { CSSProperties } from "react";
import { Mic, Volume2 } from "lucide-react";
import type { Dir } from "../theme";
import { EASE, FONT, ICON, MOTION, RADIUS, SANS, SPACE, WEIGHT } from "../theme";
import { Waveform } from "./Waveform";

export type VoiceState = "idle" | "listening" | "transcribing" | "speaking";

const VOICE_STATE_CYCLE: VoiceState[] = ["idle", "listening", "transcribing", "speaking"];

const LISTENING_RED = "#EF4444";
const LISTENING_TINT = "rgba(239,68,68,0.10)";
const LISTENING_GLOW = "rgba(239,68,68,0.25)";

const BUTTON_SIZE = 34;
const BUTTON_SIZE_LARGE = 44;
const STATUS_MIN_WIDTH = 160;

export function cycleVS(v: VoiceState): VoiceState {
  const next = VOICE_STATE_CYCLE[(VOICE_STATE_CYCLE.indexOf(v) + 1) % VOICE_STATE_CYCLE.length];
  return next ?? "idle";
}

function pulseRing(listening: boolean, d: Dir): CSSProperties {
  return {
    position: "absolute",
    inset: -SPACE.xs,
    borderRadius: RADIUS.round,
    border: `2px solid ${listening ? LISTENING_RED : d.accent}`,
    animation: `isotopy-ring ${MOTION.ring} ${EASE.out} infinite`,
    opacity: 0.5,
  };
}

function micButton(vs: VoiceState, large: boolean, d: Dir): CSSProperties {
  const listening = vs === "listening";
  const active = vs !== "idle";
  const size = large ? BUTTON_SIZE_LARGE : BUTTON_SIZE;
  return {
    width: size,
    height: size,
    borderRadius: RADIUS.round,
    background: listening ? LISTENING_TINT : active ? d.accentSoft : d.surface2,
    border: `2px solid ${listening ? LISTENING_RED : active ? d.accent : d.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: `all ${MOTION.base}`,
    boxShadow: active ? `0 0 12px ${listening ? LISTENING_GLOW : d.accentSoft}` : d.elevation.sm,
    flexShrink: 0,
  };
}

function micIcon(vs: VoiceState, large: boolean, d: Dir): CSSProperties {
  const listening = vs === "listening";
  const active = vs !== "idle";
  const size = large ? ICON.lg : ICON.md;
  return {
    width: size,
    height: size,
    color: listening ? LISTENING_RED : active ? d.accent : d.textMuted,
  };
}

export interface VoiceBtnProps {
  vs: VoiceState;
  d: Dir;
  onCycle: () => void;
  large?: boolean;
}

export function VoiceBtn({ vs, d, onCycle, large = false }: VoiceBtnProps) {
  const speaking = vs === "speaking";
  const active = vs !== "idle";

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      {active && <div style={pulseRing(vs === "listening", d)} />}
      <button onClick={onCycle} style={micButton(vs, large, d)}>
        {speaking
          ? <Volume2 style={micIcon(vs, large, d)} />
          : <Mic style={micIcon(vs, large, d)} />
        }
      </button>
    </div>
  );
}

function idleLabel(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.md };
}

const LISTENING_LABEL: CSSProperties = {
  color: LISTENING_RED,
  fontFamily: SANS,
  fontSize: FONT.md,
  fontWeight: WEIGHT.semibold,
  animation: `isotopy-fade-pulse ${MOTION.shimmer} ${EASE.inOut} infinite`,
};

function transcribingLabel(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.md, fontStyle: "italic" };
}

function speakingLabel(d: Dir): CSSProperties {
  return { color: d.accent, fontFamily: SANS, fontSize: FONT.md, fontWeight: WEIGHT.semibold };
}

export interface VoiceStatusProps {
  vs: VoiceState;
  d: Dir;
  agentName?: string;
}

export function VoiceStatus({ vs, d, agentName }: VoiceStatusProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: SPACE.md, minWidth: STATUS_MIN_WIDTH }}>
      {vs === "idle" && (
        <span style={idleLabel(d)}>
          {agentName ? `Talk to the ${agentName}` : "Talk to the team"}
        </span>
      )}
      {vs === "listening" && (
        <>
          <Waveform color={LISTENING_RED} />
          <span style={LISTENING_LABEL}>Listening...</span>
        </>
      )}
      {vs === "transcribing" && (
        <span style={transcribingLabel(d)}>"What's the status?"</span>
      )}
      {vs === "speaking" && (
        <>
          <Waveform color={d.accent} />
          <span style={speakingLabel(d)}>{agentName ?? "Team"} responding...</span>
        </>
      )}
    </div>
  );
}
