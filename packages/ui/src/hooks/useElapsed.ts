import { useEffect, useState } from "react";

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function useElapsed(startIso?: string, endIso?: string): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startIso || endIso) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startIso, endIso]);

  if (!startIso) {
    return "0m 00s";
  }
  const end = endIso ? new Date(endIso).getTime() : now;
  return formatDuration(end - new Date(startIso).getTime());
}
