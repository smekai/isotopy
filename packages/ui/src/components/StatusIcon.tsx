import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  SkipForward,
  UserCheck,
  XCircle,
} from "lucide-react";
import type { StagePresentation } from "../run-utils";
import { EASE, ICON, MOTION, statusClr } from "../theme";

const SPIN = `adhd-spin ${MOTION.spin} ${EASE.linear} infinite`;

export interface StatusIconProps {
  s: StagePresentation;
  size?: number;
}

export function StatusIcon({ s, size = ICON.md }: StatusIconProps) {
  const c = statusClr(s);
  const style = { color: c.text, width: size, height: size };
  if (s === "passed") return <CheckCircle2 style={style} />;
  if (s === "failed") return <XCircle style={style} />;
  if (s === "needs_attention") return <AlertTriangle style={style} />;
  if (s === "running") return <Loader2 style={{ ...style, animation: SPIN }} />;
  if (s === "awaiting") return <UserCheck style={style} />;
  if (s === "skipped") return <SkipForward style={style} />;
  return <Circle style={style} />;
}
