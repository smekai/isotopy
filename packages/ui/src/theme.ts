import type { LogLevel, RunStatus, StageStatus } from "@adhd/core";

export const SPACE = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 16,
  xxxl: 20,
  x4l: 24,
  x5l: 40,
} as const;

export const RADIUS = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 16,
  pill: 20,
  round: "50%",
} as const;

export const FONT = {
  xxs: 9,
  xs: 10,
  sm: 11,
  md: 12,
  lg: 13,
  xl: 14,
  xxl: 16,
  display: 26,
} as const;

export const WEIGHT = {
  medium: 500,
  semibold: 600,
  bold: 700,
  heavy: 800,
} as const;

export const ICON = { xs: 10, sm: 12, md: 14, lg: 16 } as const;

export const Z = {
  dropdown: 30,
  popover: 40,
  overlay: 50,
  overlayNested: 60,
} as const;

export const MOTION = {
  instant: "0.1s",
  fast: "0.15s",
  base: "0.2s",
  slow: "0.3s",
  spin: "1s",
  pulse: "1.2s",
  ring: "1.4s",
  shimmer: "1.6s",
} as const;

export const EASE = {
  linear: "linear",
  out: "ease-out",
  inOut: "ease-in-out",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

export const ELEVATION = {
  panelUp: "0 -4px 24px rgba(0,0,0,0.06)",
  barUp: "0 -2px 12px rgba(0,0,0,0.05)",
} as const;

export function focusRing(soft: string): string {
  return `0 0 0 3px ${soft}`;
}

export type DirId = "indigo" | "sakura" | "forest";

export interface Elevation {
  sm: string;
  md: string;
  lg: string;
}

export interface Dir {
  id: DirId;
  label: string;
  desc: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  accentMid: string;
  accentText: string;
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  borderStrong: string;
  text: string;
  textMid: string;
  textMuted: string;
  elevation: Elevation;
  runBorder: string;
}

export const DIRS: Record<DirId, Dir> = {
  indigo: {
    id: "indigo", label: "Indigo", desc: "Cool · Focused",
    accent: "#6366F1", accentDark: "#4F46E5",
    accentSoft: "rgba(99,102,241,0.09)", accentMid: "rgba(99,102,241,0.18)", accentText: "#FFFFFF",
    bg: "#EDEEFF", surface: "#FFFFFF", surface2: "#F5F5FF",
    border: "rgba(99,102,241,0.12)", borderStrong: "rgba(99,102,241,0.20)",
    text: "#1E1B4B", textMid: "#4C4899", textMuted: "#A5A8CF",
    elevation: {
      sm: "0 1px 4px rgba(99,102,241,0.08)",
      md: "0 2px 10px rgba(99,102,241,0.10), 0 1px 2px rgba(0,0,0,0.04)",
      lg: "0 8px 32px rgba(99,102,241,0.14), 0 2px 8px rgba(0,0,0,0.06)",
    },
    runBorder: "rgba(99,102,241,0.30)",
  },
  sakura: {
    id: "sakura", label: "Sakura", desc: "Soft · Playful",
    accent: "#E879A0", accentDark: "#D1548A",
    accentSoft: "rgba(232,121,160,0.09)", accentMid: "rgba(232,121,160,0.18)", accentText: "#FFFFFF",
    bg: "#FFF0F6", surface: "#FFFFFF", surface2: "#FFF5F9",
    border: "rgba(232,121,160,0.14)", borderStrong: "rgba(232,121,160,0.22)",
    text: "#3D1A2E", textMid: "#7A3D58", textMuted: "#C48AAA",
    elevation: {
      sm: "0 1px 4px rgba(232,121,160,0.08)",
      md: "0 2px 10px rgba(232,121,160,0.10), 0 1px 2px rgba(0,0,0,0.04)",
      lg: "0 8px 32px rgba(232,121,160,0.14), 0 2px 8px rgba(0,0,0,0.06)",
    },
    runBorder: "rgba(232,121,160,0.35)",
  },
  forest: {
    id: "forest", label: "Forest", desc: "Calm · Natural",
    accent: "#059669", accentDark: "#047857",
    accentSoft: "rgba(5,150,105,0.09)", accentMid: "rgba(5,150,105,0.18)", accentText: "#FFFFFF",
    bg: "#EDFAF4", surface: "#FFFFFF", surface2: "#F3FBF7",
    border: "rgba(5,150,105,0.12)", borderStrong: "rgba(5,150,105,0.20)",
    text: "#064E3B", textMid: "#2D6A4F", textMuted: "#86BBAD",
    elevation: {
      sm: "0 1px 4px rgba(5,150,105,0.08)",
      md: "0 2px 10px rgba(5,150,105,0.10), 0 1px 2px rgba(0,0,0,0.04)",
      lg: "0 8px 32px rgba(5,150,105,0.14), 0 2px 8px rgba(0,0,0,0.06)",
    },
    runBorder: "rgba(5,150,105,0.30)",
  },
};

export const SPEC_COLOR: Record<string, { main: string; soft: string; gradient: string }> = {
  intake:         { main: "#60A5FA", soft: "rgba(96,165,250,0.12)",  gradient: "linear-gradient(135deg,#60A5FA,#818CF8)" },
  requirements:   { main: "#818CF8", soft: "rgba(129,140,248,0.12)", gradient: "linear-gradient(135deg,#818CF8,#A78BFA)" },
  design:         { main: "#A78BFA", soft: "rgba(167,139,250,0.12)", gradient: "linear-gradient(135deg,#A78BFA,#C084FC)" },
  implementation: { main: "#34D399", soft: "rgba(52,211,153,0.12)",  gradient: "linear-gradient(135deg,#34D399,#6EE7B7)" },
  review:         { main: "#FBBF24", soft: "rgba(251,191,36,0.12)",  gradient: "linear-gradient(135deg,#FBBF24,#FCD34D)" },
  test:           { main: "#F87171", soft: "rgba(248,113,113,0.12)", gradient: "linear-gradient(135deg,#F87171,#FCA5A5)" },
  release:        { main: "#22D3EE", soft: "rgba(34,211,238,0.12)",  gradient: "linear-gradient(135deg,#22D3EE,#67E8F9)" },
  deploy:         { main: "#38BDF8", soft: "rgba(56,189,248,0.12)",  gradient: "linear-gradient(135deg,#38BDF8,#7DD3FC)" },
};

const FALLBACK_SPEC = { main: "#6366F1", soft: "rgba(99,102,241,0.12)", gradient: "linear-gradient(135deg,#6366F1,#818CF8)" };

export function specColor(stageId: string): { main: string; soft: string; gradient: string } {
  return SPEC_COLOR[stageId] ?? FALLBACK_SPEC;
}

export const SANS = "'Nunito', sans-serif";
export const MONO = "'JetBrains Mono', monospace";

export const GOLD = "#D97706";
export const GOLD_SOFT = "rgba(217,119,6,0.12)";

/** A question waiting on the user. Distinct from GOLD, which is gates only. */
export const ASK_VIOLET = "#7C3AED";

export const STATUS_COLORS: Record<StageStatus, { text: string; bg: string; dot: string }> = {
  running:  { text: "#6366F1", bg: "rgba(99,102,241,0.10)",  dot: "#6366F1" },
  passed:   { text: "#059669", bg: "rgba(5,150,105,0.10)",   dot: "#059669" },
  failed:   { text: "#DC2626", bg: "rgba(220,38,38,0.10)",   dot: "#DC2626" },
  awaiting: { text: "#D97706", bg: "rgba(217,119,6,0.10)",   dot: "#D97706" },
  asking:   { text: "#7C3AED", bg: "rgba(124,58,237,0.10)",  dot: "#7C3AED" },
  skipped:  { text: "#9CA3AF", bg: "rgba(156,163,175,0.10)", dot: "#9CA3AF" },
  pending:  { text: "#C0C0D8", bg: "rgba(192,192,216,0.10)", dot: "#D4D4E8" },
};

export function statusClr(s: StageStatus): { text: string; bg: string; dot: string } {
  return STATUS_COLORS[s] ?? STATUS_COLORS.pending;
}

export function sLabel(s: StageStatus): string {
  return {
    running: "RUNNING", passed: "PASSED", failed: "FAILED",
    awaiting: "AWAITING", asking: "ASKING", skipped: "SKIPPED", pending: "PENDING",
  }[s];
}

export const RUN_PILL: Record<RunStatus, { text: string; bg: string }> = {
  pending:   { text: "#9B9BC8", bg: "rgba(192,192,216,0.10)" },
  running:   { text: "#6366F1", bg: "rgba(99,102,241,0.10)" },
  awaiting:  { text: "#D97706", bg: "rgba(217,119,6,0.10)" },
  asking:    { text: "#7C3AED", bg: "rgba(124,58,237,0.10)" },
  completed: { text: "#059669", bg: "rgba(5,150,105,0.10)" },
  failed:    { text: "#DC2626", bg: "rgba(220,38,38,0.10)" },
  cancelled: { text: "#6B7280", bg: "rgba(156,163,175,0.12)" },
};

export const FAIL_RED = "#DC2626";
export const PASS_GREEN = "#059669";
export const WARN_AMBER = "#D97706";

export function logLevelColor(level: LogLevel, d: Dir): string {
  switch (level) {
    case "error":
    case "fail":
      return FAIL_RED;
    case "pass":
      return PASS_GREEN;
    case "warn":
      return WARN_AMBER;
    case "run":
      return d.accent;
    case "info":
      return d.textMid;
  }
}

export function runDot(status: RunStatus, d: Dir): string {
  if (status === "running" || status === "pending") return d.accent;
  if (status === "awaiting") return GOLD;
  if (status === "asking") return ASK_VIOLET;
  if (status === "failed") return "#DC2626";
  if (status === "cancelled") return "#9CA3AF";
  return "#059669";
}
