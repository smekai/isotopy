import type { RunState } from "@adhd/core";
import { useElapsed } from "../hooks/useElapsed";
import type { Dir } from "../theme";
import { MONO, SANS, runDot } from "../theme";

export function RunStatusBar({ run, d }: { run: RunState; d: Dir }) {
  const elapsed = useElapsed(run.createdAt, run.completedAt);
  const running = run.status === "running";
  const dot = runDot(run.status, d);

  return (
    <div style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${d.border}`, height: 36, display: "flex", alignItems: "center", padding: "0 20px", gap: 10, flexShrink: 0 }}>
      <span style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10 }}>RUN <span style={{ color: d.textMid }}>#{run.number}</span></span>
      <div style={{ width: 1, height: 14, background: d.border }} />
      <span style={{ color: d.text, fontFamily: SANS, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {run.task ?? run.pipelineName}
      </span>
      <div style={{ width: 1, height: 14, background: d.border }} />
      <span style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10 }}>{elapsed}</span>
      <div style={{ flex: 1 }} />
      <div style={{
        width: 7, height: 7, borderRadius: "50%",
        background: dot,
        boxShadow: running ? `0 0 7px ${d.accent}` : undefined,
        animation: running ? "adhd-pulse 1.2s ease-in-out infinite" : undefined,
      }} />
      <span style={{ color: d.textMid, fontFamily: MONO, fontSize: 10, fontWeight: 600 }}>{run.status.toUpperCase()}</span>
    </div>
  );
}
