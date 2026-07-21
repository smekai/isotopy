import type { StageStatus } from "@adhd/core";
import { agentForStage } from "@adhd/core";
import type { Dir } from "../theme";
import { MONO, SANS, sLabel, specColor, statusClr } from "../theme";

export function StageNode({
  stageId, label, status, d, focused, onClick,
}: {
  stageId: string;
  label: string;
  status: StageStatus;
  d: Dir;
  focused: boolean;
  onClick: () => void;
}) {
  const agent = agentForStage(stageId);
  const sc = specColor(stageId);
  const st = statusClr(status);
  const running = status === "running";
  const isDim = status === "pending" || status === "skipped";

  return (
    <button
      onClick={onClick}
      data-testid={`stage-node-${stageId}`}
      style={{
        background: "#FFFFFF",
        borderRadius: 14,
        border: `2px solid ${focused ? sc.main : running ? d.runBorder : "rgba(0,0,0,0.06)"}`,
        boxShadow: focused ? `0 0 0 3px ${sc.soft}, ${d.shadowLg}` : running ? `0 0 16px ${sc.soft}, ${d.shadow}` : d.shadow,
        width: 124,
        padding: 0,
        overflow: "hidden",
        cursor: "pointer",
        transition: "all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)",
        opacity: isDim && !focused ? 0.72 : 1,
        transform: focused ? "scale(1.03)" : "scale(1)",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        fontFamily: SANS,
        position: "relative",
      }}
    >
      {/* Top gradient band */}
      <div style={{
        background: sc.gradient,
        height: running ? 5 : 4,
        transition: "height 0.3s",
        position: "relative",
        overflow: "hidden",
        alignSelf: "stretch",
      }}>
        {running && (
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
            animation: "adhd-shimmer 1.6s linear infinite",
          }} />
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: "10px 8px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: "100%" }}>
        {/* Glyph in the agent's signature color */}
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: sc.soft,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, color: sc.main, lineHeight: 1,
          marginBottom: 2,
        }}>
          {agent.glyph}
        </div>

        {/* Profession — the agent's primary identity */}
        <div style={{
          color: "#1E1B4B", fontSize: 11.5, fontWeight: 700, lineHeight: 1.2,
          textAlign: "center", minHeight: 28,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {agent.profession}
        </div>

        {/* Pipeline stage */}
        <div style={{ color: "#9B9BC8", fontSize: 10, fontWeight: 500, lineHeight: 1.2 }}>
          {label}
        </div>

        {/* Status gem pill */}
        <div style={{
          marginTop: 6,
          background: st.bg,
          borderRadius: 20,
          padding: "2px 8px",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <div style={{
            width: 5, height: 5, borderRadius: "50%",
            background: st.dot,
            animation: running ? "adhd-pulse 1.2s ease-in-out infinite" : undefined,
          }} />
          <span style={{ color: st.text, fontFamily: MONO, fontSize: 9, fontWeight: 600, letterSpacing: "0.06em" }}>
            {sLabel(status)}
          </span>
        </div>
      </div>
    </button>
  );
}
