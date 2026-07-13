import type { Dir } from "../theme";
import { GOLD, GOLD_SOFT, MONO, SANS } from "../theme";

export function GateMarker({
  index, awaiting, onApprove,
}: {
  index: number; d: Dir; awaiting: boolean; onApprove?: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 52, flexShrink: 0 }}>
      {/* Diamond crystal */}
      <div style={{
        width: 22, height: 22,
        background: awaiting ? GOLD_SOFT : "rgba(0,0,0,0.03)",
        border: `2px solid ${awaiting ? GOLD : "rgba(0,0,0,0.12)"}`,
        transform: "rotate(45deg)",
        borderRadius: 4,
        boxShadow: awaiting ? `0 0 10px ${GOLD_SOFT}, 0 0 20px ${GOLD_SOFT}` : "none",
        animation: awaiting ? "adhd-pulse 1.4s ease-in-out infinite" : "none",
        transition: "all 0.3s",
        flexShrink: 0,
      }} />

      {/* Label */}
      <div style={{ color: awaiting ? GOLD : "#C0C0D8", fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", fontWeight: 600 }}>
        G{index}
      </div>

      {/* Approve button */}
      {awaiting && onApprove && (
        <button
          onClick={onApprove}
          style={{
            background: GOLD, color: "#FFF",
            borderRadius: 6, border: "none",
            padding: "2px 6px", fontSize: 9, fontFamily: SANS, fontWeight: 800,
            cursor: "pointer", letterSpacing: "0.06em",
            boxShadow: `0 2px 8px ${GOLD_SOFT}`,
          }}
        >
          APPROVE
        </button>
      )}
    </div>
  );
}
