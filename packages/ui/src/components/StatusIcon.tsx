import { CheckCircle2, Circle, Loader2, SkipForward, UserCheck, XCircle } from "lucide-react";
import type { StageStatus } from "@adhd/core";
import { statusClr } from "../theme";

export interface StatusIconProps {
  s: StageStatus;
  size?: number;
}

export function StatusIcon({ s, size = 13 }: StatusIconProps) {
  const c = statusClr(s);
  const style = { color: c.text, width: size, height: size };
  if (s === "passed") return <CheckCircle2 style={style} />;
  if (s === "failed") return <XCircle style={style} />;
  if (s === "running") return <Loader2 style={style} className="animate-spin" />;
  if (s === "awaiting") return <UserCheck style={style} />;
  if (s === "skipped") return <SkipForward style={style} />;
  return <Circle style={style} />;
}
