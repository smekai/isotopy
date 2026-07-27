import { EASE, RADIUS } from "../theme";

const BAR_WIDTH = 3;
const BAR_GAP = 1;
const DEFAULT_HEIGHT = 14;

export interface WaveformProps {
  color: string;
  height?: number;
}

export function Waveform({ color, height = DEFAULT_HEIGHT }: WaveformProps) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: BAR_GAP, height }}>
      {[0.4, 0.8, 0.55, 1, 0.65, 0.85, 0.4].map((h, i) => (
        <div key={i} style={{
          background: color, width: BAR_WIDTH, borderRadius: RADIUS.xs,
          height: `${h * height}px`,
          animation: `adhd-wave ${0.38 + i * 0.07}s ${EASE.inOut} ${i * 0.05}s infinite alternate`,
        }} />
      ))}
    </div>
  );
}
