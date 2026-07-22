export interface WaveformProps {
  color: string;
  height?: number;
}

export function Waveform({ color, height = 14 }: WaveformProps) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height }}>
      {[0.4, 0.8, 0.55, 1, 0.65, 0.85, 0.4].map((h, i) => (
        <div key={i} style={{
          background: color, width: 3, borderRadius: 2,
          height: `${h * height}px`,
          animation: `adhd-wave ${0.38 + i * 0.07}s ease-in-out ${i * 0.05}s infinite alternate`,
        }} />
      ))}
    </div>
  );
}
