import { useState, useEffect } from "react";
import {
  Mic, Volume2, Settings, CheckCircle2, XCircle, Circle,
  Loader2, Send, X, FileText, Terminal, Brain, MessageSquare,
  RotateCcw, UserCheck, History, Play, Square, SkipForward,
  ChevronDown, ToggleLeft, ToggleRight, Server, Sparkles,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type DirId = "indigo" | "sakura" | "forest";
type ScenId = "empty" | "idle" | "running" | "gate" | "failed";
type SS = "pending" | "running" | "passed" | "failed" | "awaiting" | "skipped";
type VS = "idle" | "listening" | "transcribing" | "speaking";
type FT = "artifacts" | "log" | "reasoning" | "steer";

interface Dir {
  id: DirId; label: string; desc: string;
  accent: string; accentDark: string;
  accentSoft: string; accentMid: string; accentText: string;
  bg: string; surface: string; surface2: string;
  border: string; text: string; textMid: string; textMuted: string;
  shadow: string; shadowSm: string; shadowLg: string;
  runBorder: string;
}

// ─── Direction palettes (3 accent variations, same white/game base) ────────────

const DIRS: Record<DirId, Dir> = {
  indigo: {
    id: "indigo", label: "Indigo", desc: "Cool · Focused",
    accent: "#6366F1", accentDark: "#4F46E5",
    accentSoft: "rgba(99,102,241,0.09)", accentMid: "rgba(99,102,241,0.18)", accentText: "#FFFFFF",
    bg: "#EDEEFF", surface: "#FFFFFF", surface2: "#F5F5FF",
    border: "rgba(99,102,241,0.12)", text: "#1E1B4B", textMid: "#4C4899", textMuted: "#A5A8CF",
    shadow: "0 2px 10px rgba(99,102,241,0.10), 0 1px 2px rgba(0,0,0,0.04)",
    shadowSm: "0 1px 4px rgba(99,102,241,0.08)",
    shadowLg: "0 8px 32px rgba(99,102,241,0.14), 0 2px 8px rgba(0,0,0,0.06)",
    runBorder: "rgba(99,102,241,0.30)",
  },
  sakura: {
    id: "sakura", label: "Sakura", desc: "Soft · Playful",
    accent: "#E879A0", accentDark: "#D1548A",
    accentSoft: "rgba(232,121,160,0.09)", accentMid: "rgba(232,121,160,0.18)", accentText: "#FFFFFF",
    bg: "#FFF0F6", surface: "#FFFFFF", surface2: "#FFF5F9",
    border: "rgba(232,121,160,0.14)", text: "#3D1A2E", textMid: "#7A3D58", textMuted: "#C48AAA",
    shadow: "0 2px 10px rgba(232,121,160,0.10), 0 1px 2px rgba(0,0,0,0.04)",
    shadowSm: "0 1px 4px rgba(232,121,160,0.08)",
    shadowLg: "0 8px 32px rgba(232,121,160,0.14), 0 2px 8px rgba(0,0,0,0.06)",
    runBorder: "rgba(232,121,160,0.35)",
  },
  forest: {
    id: "forest", label: "Forest", desc: "Calm · Natural",
    accent: "#059669", accentDark: "#047857",
    accentSoft: "rgba(5,150,105,0.09)", accentMid: "rgba(5,150,105,0.18)", accentText: "#FFFFFF",
    bg: "#EDFAF4", surface: "#FFFFFF", surface2: "#F3FBF7",
    border: "rgba(5,150,105,0.12)", text: "#064E3B", textMid: "#2D6A4F", textMuted: "#86BBAD",
    shadow: "0 2px 10px rgba(5,150,105,0.10), 0 1px 2px rgba(0,0,0,0.04)",
    shadowSm: "0 1px 4px rgba(5,150,105,0.08)",
    shadowLg: "0 8px 32px rgba(5,150,105,0.14), 0 2px 8px rgba(0,0,0,0.06)",
    runBorder: "rgba(5,150,105,0.30)",
  },
};

// ─── Per-specialist signature colors ─────────────────────────────────────────

const SPEC_COLOR: Record<string, { main: string; soft: string; gradient: string }> = {
  intake:         { main: "#60A5FA", soft: "rgba(96,165,250,0.12)",  gradient: "linear-gradient(135deg,#60A5FA,#818CF8)" },
  requirements:   { main: "#818CF8", soft: "rgba(129,140,248,0.12)", gradient: "linear-gradient(135deg,#818CF8,#A78BFA)" },
  design:         { main: "#A78BFA", soft: "rgba(167,139,250,0.12)", gradient: "linear-gradient(135deg,#A78BFA,#C084FC)" },
  implementation: { main: "#34D399", soft: "rgba(52,211,153,0.12)",  gradient: "linear-gradient(135deg,#34D399,#6EE7B7)" },
  review:         { main: "#FBBF24", soft: "rgba(251,191,36,0.12)",  gradient: "linear-gradient(135deg,#FBBF24,#FCD34D)" },
  test:           { main: "#F87171", soft: "rgba(248,113,113,0.12)", gradient: "linear-gradient(135deg,#F87171,#FCA5A5)" },
  release:        { main: "#22D3EE", soft: "rgba(34,211,238,0.12)",  gradient: "linear-gradient(135deg,#22D3EE,#67E8F9)" },
  deploy:         { main: "#38BDF8", soft: "rgba(56,189,248,0.12)",  gradient: "linear-gradient(135deg,#38BDF8,#7DD3FC)" },
};

// ─── Pipeline stages ──────────────────────────────────────────────────────────

const STAGES = [
  { id: "intake",         name: "Intake",          specialist: "Scout",   role: "Intake Analyst",    glyph: "◈", gateAfter: false },
  { id: "requirements",  name: "Requirements",    specialist: "Sage",    role: "Requirements Eng.", glyph: "◉", gateAfter: true  },
  { id: "design",        name: "Design",          specialist: "Muse",    role: "System Designer",   glyph: "◇", gateAfter: true  },
  { id: "implementation",name: "Implementation",  specialist: "Builder", role: "Lead Engineer",     glyph: "⬡", gateAfter: false },
  { id: "review",        name: "Review",          specialist: "Critic",  role: "Code Reviewer",     glyph: "◎", gateAfter: false },
  { id: "test",          name: "Test",            specialist: "Guardian",role: "QA Engineer",       glyph: "⊕", gateAfter: false },
  { id: "release",       name: "Release",         specialist: "Herald",  role: "Release Mgr.",      glyph: "◆", gateAfter: true  },
  { id: "deploy",        name: "Deploy",          specialist: "Pilot",   role: "Deploy Engineer",   glyph: "▲", gateAfter: false },
] as const;

type StageId = typeof STAGES[number]["id"];

// ─── Scenarios ────────────────────────────────────────────────────────────────

const SCENS: Record<ScenId, {
  label: string;
  statuses: Partial<Record<StageId, SS>>;
  run: { id: number; task: string; elapsed: string; state: string } | null;
  defaultFocus: StageId | null;
}> = {
  empty: { label: "First Run", statuses: {}, run: null, defaultFocus: null },
  idle: {
    label: "Idle",
    statuses: { intake:"pending", requirements:"pending", design:"pending", implementation:"pending", review:"pending", test:"pending", release:"pending", deploy:"pending" },
    run: null, defaultFocus: null,
  },
  running: {
    label: "Running",
    statuses: { intake:"passed", requirements:"passed", design:"running", implementation:"pending", review:"pending", test:"pending", release:"pending", deploy:"pending" },
    run: { id: 14, task: "Add OAuth2 login flow", elapsed: "4m 22s", state: "running" },
    defaultFocus: "design",
  },
  gate: {
    label: "Gate",
    statuses: { intake:"passed", requirements:"awaiting", design:"pending", implementation:"pending", review:"pending", test:"pending", release:"pending", deploy:"pending" },
    run: { id: 14, task: "Add OAuth2 login flow", elapsed: "1m 18s", state: "awaiting" },
    defaultFocus: "requirements",
  },
  failed: {
    label: "Failed",
    statuses: { intake:"passed", requirements:"passed", design:"passed", implementation:"failed", review:"pending", test:"pending", release:"pending", deploy:"pending" },
    run: { id: 14, task: "Add OAuth2 login flow", elapsed: "8m 05s", state: "failed" },
    defaultFocus: "implementation",
  },
};

// ─── Sample data ──────────────────────────────────────────────────────────────

const LOGS: Record<string, Array<{ t: string; lv: "info"|"warn"|"error"|"pass"|"fail"|"run"; msg: string }>> = {
  design: [
    { t: "14:22:01", lv: "info", msg: "Agent Muse activated · run #14" },
    { t: "14:22:01", lv: "info", msg: "Reading requirements.md (3.2 KB)" },
    { t: "14:22:05", lv: "info", msg: "Analysing ./src — Express · TypeScript · Prisma" },
    { t: "14:22:09", lv: "info", msg: "Planning PKCE OAuth2 architecture..." },
    { t: "14:22:14", lv: "run",  msg: "▶ Writing architecture.md" },
    { t: "14:22:21", lv: "run",  msg: "▶ Writing api-spec.yaml" },
  ],
  requirements: [
    { t: "14:17:44", lv: "info", msg: "Agent Sage activated · run #14" },
    { t: "14:17:47", lv: "info", msg: "Parsing task: \"Add OAuth2 login flow\"" },
    { t: "14:17:50", lv: "warn", msg: "No auth layer found — noting migration need" },
    { t: "14:17:52", lv: "info", msg: "Drafting requirements.md + acceptance-criteria.md" },
    { t: "14:18:01", lv: "pass", msg: "✓ Requirements complete — awaiting approval" },
  ],
  implementation: [
    { t: "14:29:03", lv: "info",  msg: "Agent Builder activated · run #14" },
    { t: "14:29:08", lv: "run",   msg: "▶ npm install passport passport-google-oauth20" },
    { t: "14:29:15", lv: "run",   msg: "▶ Writing src/auth/oauth.ts" },
    { t: "14:29:22", lv: "error", msg: "TypeError: Type 'undefined' not assignable to 'string'" },
    { t: "14:29:22", lv: "error", msg: "  src/auth/oauth.ts:47 — req.session.userId" },
    { t: "14:29:23", lv: "fail",  msg: "✗ Build failed · 1 error" },
  ],
};

const REASONING: Record<string, string[]> = {
  design: [
    "Requirements call for Google + GitHub OAuth2 with CSRF protection (state param). Choosing PKCE authorization code flow — correct for a server-rendered app.",
    "No auth layer in codebase. User model has email/name but missing externalId and provider fields. Noting as migration requirement.",
    "Session strategy: stateless JWT rather than server-side sessions. Satisfies the stateless NFR and horizontal-scaling requirement.",
    "API surface: /auth/{provider} (initiate), /auth/{provider}/callback, /auth/me, /auth/logout.",
  ],
  requirements: [
    "Parsing task. 'OAuth2 login flow' with Google and GitHub. Checking for existing auth primitives — none found.",
    "User model exists (email, name) but missing externalId and provider. Must call this out as a migration need.",
    "Drafting FR-01 through FR-04. CSRF state parameter (FR-03) is the key safety requirement here.",
    "Propagating project README constraint: 'zero third-party analytics'. OAuth providers OK; tracking pixels are not.",
  ],
  implementation: [
    "Reading architecture doc. PKCE flow, TypeScript strict, Passport.js strategies. Installing passport + passport-google-oauth20.",
    "Writing oauth.ts. Google strategy callback receives (accessToken, refreshToken, profile, done). Upserting user by email.",
    "TypeScript error at line 47: req.session.userId — express-session SessionData doesn't include userId. Need to extend the namespace.",
    "Attempting fix via session.d.ts declaration. Build still fails — Prisma upsert return type mismatch. Need to check the schema.",
  ],
};

const ARTIFACTS: Record<string, Array<{ name: string; size: string; preview: string }>> = {
  requirements: [
    { name: "requirements.md", size: "3.2 KB",
      preview: "# Requirements: OAuth2 Login Flow\n\n## Summary\nAdd OAuth2 authentication with Google and GitHub.\n\n## Functional Requirements\n- **FR-01** Sign in with Google OAuth2\n- **FR-02** Sign in with GitHub OAuth2\n- **FR-03** State param validated to prevent CSRF\n- **FR-04** Sessions expire after 24 hours\n\n## Non-functional\n- Token validation < 200ms\n- Zero third-party analytics" },
    { name: "acceptance-criteria.md", size: "1.1 KB",
      preview: "# Acceptance Criteria\n\n- [ ] Google SSO button on /login\n- [ ] GitHub SSO button on /login\n- [ ] Success → redirect to /dashboard\n- [ ] Failed auth → error toast\n- [ ] Expired session → redirect to /login" },
  ],
  design: [
    { name: "architecture.md", size: "4.8 KB",
      preview: "# System Architecture: OAuth2 Flow\n\n## Overview\nStateless OAuth2 with PKCE authorization code flow.\n\n## Components\n**AuthController** — /auth/{provider} routes, generates state token in Redis (10m TTL).\n\n**TokenService** — validates callback, exchanges code, issues session JWT.\n\n**SessionMiddleware** — validates JWT on protected routes, refreshes within 5m of expiry." },
    { name: "api-spec.yaml", size: "2.1 KB",
      preview: "openapi: 3.0.0\npaths:\n  /auth/{provider}:\n    get:\n      summary: Initiate OAuth flow\n  /auth/{provider}/callback:\n    get:\n      summary: Handle OAuth callback\n  /auth/me:\n    get:\n      summary: Get current session\n  /auth/logout:\n    post:\n      summary: Invalidate session" },
  ],
  implementation: [
    { name: "src/auth/oauth.ts", size: "2.8 KB", preview: "// ✗ Build error at line 47\n// req.session.userId — type not declared\n// Fix: extend express-session SessionData\n// interface SessionData { userId: string; }" },
    { name: "src/auth/session.ts", size: "0.4 KB", preview: "// Partial — blocked by TypeScript error" },
  ],
};

const HISTORY = [
  { id: 14, task: "Add OAuth2 login flow",        date: "Today 14:17",     status: "failed",   dur: "8m 05s",  failAt: "Implementation" },
  { id: 13, task: "Implement user profile page",  date: "Today 11:42",     status: "complete", dur: "12m 33s", failAt: null },
  { id: 12, task: "Set up Prisma ORM + migrations",date: "Yesterday 16:05",status: "complete", dur: "6m 18s",  failAt: null },
  { id: 11, task: "Configure CI pipeline",         date: "Yesterday 09:31", status: "complete", dur: "3m 47s",  failAt: null },
  { id: 10, task: "Add dark mode toggle",          date: "2 days ago",      status: "failed",   dur: "5m 12s",  failAt: "Test" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SANS = "'Nunito', sans-serif";
const MONO = "'JetBrains Mono', monospace";

const STATUS_COLORS = {
  running:  { text: "#6366F1", bg: "rgba(99,102,241,0.10)",  dot: "#6366F1" },
  passed:   { text: "#059669", bg: "rgba(5,150,105,0.10)",   dot: "#059669" },
  failed:   { text: "#DC2626", bg: "rgba(220,38,38,0.10)",   dot: "#DC2626" },
  awaiting: { text: "#D97706", bg: "rgba(217,119,6,0.10)",   dot: "#D97706" },
  skipped:  { text: "#9CA3AF", bg: "rgba(156,163,175,0.10)", dot: "#9CA3AF" },
  pending:  { text: "#C0C0D8", bg: "rgba(192,192,216,0.10)", dot: "#D4D4E8" },
};

function statusClr(s: SS) { return STATUS_COLORS[s] ?? STATUS_COLORS.pending; }
function sLabel(s: SS) {
  return { running:"RUNNING", passed:"PASSED", failed:"FAILED", awaiting:"AWAITING", skipped:"SKIPPED", pending:"PENDING" }[s];
}

function SIcon({ s, size = 13 }: { s: SS; size?: number }) {
  const c = statusClr(s);
  const p = { style: { color: c.text, width: size, height: size } };
  if (s === "passed")  return <CheckCircle2 {...p} />;
  if (s === "failed")  return <XCircle {...p} />;
  if (s === "running") return <Loader2 {...p} className="animate-spin" />;
  if (s === "awaiting") return <UserCheck {...p} />;
  if (s === "skipped") return <SkipForward {...p} />;
  return <Circle {...p} />;
}

function Waveform({ color, height = 14 }: { color: string; height?: number }) {
  return (
    <div className="flex items-end gap-px" style={{ height }}>
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

// ─── Direction Picker ─────────────────────────────────────────────────────────

function DirPicker({ cur, onChange, d }: { cur: DirId; onChange: (id: DirId) => void; d: Dir }) {
  return (
    <div className="flex items-center gap-2 px-5 py-2 flex-shrink-0"
      style={{ background: d.surface, borderBottom: `1px solid ${d.border}` }}>
      <span style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em" }}>
        DIRECTION
      </span>
      {(Object.values(DIRS) as Dir[]).map(dir => {
        const sel = dir.id === cur;
        return (
          <button
            key={dir.id}
            onClick={() => onChange(dir.id)}
            style={{
              background: sel ? dir.accentSoft : "transparent",
              border: `1.5px solid ${sel ? dir.accent : "rgba(0,0,0,0.08)"}`,
              borderRadius: 20,
              padding: "3px 12px 3px 8px",
              display: "flex", alignItems: "center", gap: 6,
              cursor: "pointer", transition: "all 0.18s",
            }}
          >
            <span style={{ background: dir.accent, width: 8, height: 8, borderRadius: "50%", flexShrink: 0 }} />
            <span style={{ color: sel ? dir.accent : d.textMid, fontFamily: SANS, fontSize: 12, fontWeight: sel ? 700 : 500 }}>
              {dir.label}
            </span>
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      <span style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11 }}>
        3 visual directions · switch anytime
      </span>
    </div>
  );
}

// ─── Stage Node Card ──────────────────────────────────────────────────────────

function StageNode({
  stage, status, d, focused, onClick,
}: {
  stage: typeof STAGES[number];
  status: SS;
  d: Dir;
  focused: boolean;
  onClick: () => void;
}) {
  const sc = SPEC_COLOR[stage.id];
  const st = statusClr(status);
  const running = status === "running";
  const isDim = status === "pending";

  return (
    <button
      onClick={onClick}
      style={{
        background: "#FFFFFF",
        borderRadius: 14,
        border: `2px solid ${focused ? sc.main : running ? d.runBorder : "rgba(0,0,0,0.06)"}`,
        boxShadow: focused ? `0 0 0 3px ${sc.soft}, ${d.shadowLg}` : running ? `0 0 16px ${sc.soft}, ${d.shadow}` : d.shadow,
        width: 118,
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
      <div style={{ padding: "10px 10px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        {/* Glyph in specialist color */}
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: sc.soft,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, color: sc.main, lineHeight: 1,
          marginBottom: 2,
        }}>
          {stage.glyph}
        </div>

        {/* Name */}
        <div style={{ color: "#1E1B4B", fontSize: 11.5, fontWeight: 700, lineHeight: 1.2, textAlign: "center" }}>
          {stage.name}
        </div>

        {/* Specialist */}
        <div style={{ color: "#9B9BC8", fontSize: 10, fontWeight: 500, lineHeight: 1.2 }}>
          {stage.specialist}
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

// ─── Gate Marker ─────────────────────────────────────────────────────────────

function GateMarker({
  index, d, awaiting, onApprove,
}: {
  index: number; d: Dir; awaiting: boolean; onApprove?: () => void;
}) {
  const goldColor = "#D97706";
  const goldSoft = "rgba(217,119,6,0.12)";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 52, flexShrink: 0 }}>
      {/* Diamond crystal */}
      <div style={{
        width: 22, height: 22,
        background: awaiting ? goldSoft : "rgba(0,0,0,0.03)",
        border: `2px solid ${awaiting ? goldColor : "rgba(0,0,0,0.12)"}`,
        transform: "rotate(45deg)",
        borderRadius: 4,
        boxShadow: awaiting ? `0 0 10px ${goldSoft}, 0 0 20px ${goldSoft}` : "none",
        animation: awaiting ? "adhd-pulse 1.4s ease-in-out infinite" : "none",
        transition: "all 0.3s",
        flexShrink: 0,
      }} />

      {/* Label */}
      <div style={{ color: awaiting ? goldColor : "#C0C0D8", fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em", fontWeight: 600 }}>
        G{index}
      </div>

      {/* Approve button */}
      {awaiting && onApprove && (
        <button
          onClick={onApprove}
          style={{
            background: goldColor, color: "#FFF",
            borderRadius: 6, border: "none",
            padding: "2px 6px", fontSize: 9, fontFamily: SANS, fontWeight: 800,
            cursor: "pointer", letterSpacing: "0.06em",
            boxShadow: `0 2px 8px ${goldSoft}`,
          }}
        >
          APPROVE
        </button>
      )}
    </div>
  );
}

// ─── Connector ───────────────────────────────────────────────────────────────

function Connector({ d, dim }: { d: Dir; dim?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", width: 20, flexShrink: 0 }}>
      <div style={{ flex: 1, height: 2, borderRadius: 1, background: dim ? "rgba(0,0,0,0.07)" : d.accentMid }} />
    </div>
  );
}

// ─── Voice Control ────────────────────────────────────────────────────────────

function VoiceBtn({
  vs, d, onCycle, large = false,
}: {
  vs: VS; d: Dir; onCycle: () => void; large?: boolean;
}) {
  const listening = vs === "listening";
  const speaking = vs === "speaking";
  const active = vs !== "idle";
  const size = large ? 44 : 34;

  const bg = listening
    ? "rgba(239,68,68,0.10)"
    : active ? d.accentSoft : d.surface2;
  const border = listening ? "#EF4444" : active ? d.accent : d.border;
  const iconColor = listening ? "#EF4444" : active ? d.accent : d.textMuted;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      {/* Pulse ring */}
      {active && (
        <div style={{
          position: "absolute", inset: -4,
          borderRadius: "50%",
          border: `2px solid ${listening ? "#EF4444" : d.accent}`,
          animation: "adhd-ring 1.4s ease-out infinite",
          opacity: 0.5,
        }} />
      )}
      <button
        onClick={onCycle}
        style={{
          width: size, height: size, borderRadius: "50%",
          background: bg, border: `2px solid ${border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", transition: "all 0.2s",
          boxShadow: active ? `0 0 12px ${listening ? "rgba(239,68,68,0.25)" : d.accentSoft}` : d.shadowSm,
          flexShrink: 0,
        }}
      >
        {speaking
          ? <Volume2 style={{ width: large ? 18 : 14, height: large ? 18 : 14, color: iconColor }} />
          : <Mic style={{ width: large ? 18 : 14, height: large ? 18 : 14, color: iconColor }} />
        }
      </button>
    </div>
  );
}

function VoiceStatus({ vs, d, agentName }: { vs: VS; d: Dir; agentName?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 160 }}>
      {vs === "idle" && (
        <span style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12 }}>
          {agentName ? `Talk to ${agentName}` : "Talk to the team"}
        </span>
      )}
      {vs === "listening" && (
        <>
          <Waveform color="#EF4444" />
          <span style={{ color: "#EF4444", fontFamily: SANS, fontSize: 12, fontWeight: 600 }} className="animate-pulse">
            Listening...
          </span>
        </>
      )}
      {vs === "transcribing" && (
        <span style={{ color: d.text, fontFamily: SANS, fontSize: 12, fontStyle: "italic" }}>
          "What's the status?"
        </span>
      )}
      {vs === "speaking" && (
        <>
          <Waveform color={d.accent} />
          <span style={{ color: d.accent, fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>
            {agentName ?? "Team"} responding...
          </span>
        </>
      )}
    </div>
  );
}

// ─── Stage Focus Panel ────────────────────────────────────────────────────────

function StageVoiceChat({
  stage, d, vs, onCycle,
}: {
  stage: typeof STAGES[number]; d: Dir; vs: VS; onCycle: () => void;
}) {
  const [input, setInput] = useState("");
  const [chat, setChat] = useState([
    { role: "user", text: "Focus on making the API stateless" },
    { role: "agent", text: "Understood — all endpoints will be stateless. Designing JWT-based auth so session state lives in the database, not in memory." },
  ]);

  function send() {
    if (!input.trim()) return;
    setChat(c => [...c, { role: "user", text: input }]);
    setInput("");
    setTimeout(() => setChat(c => [...c, { role: "agent", text: "Got it, adjusting the implementation plan." }]), 700);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {chat.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "78%", padding: "8px 12px", borderRadius: m.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
              background: m.role === "user" ? d.accentSoft : d.surface2,
              border: `1px solid ${m.role === "user" ? d.border : "rgba(0,0,0,0.06)"}`,
              color: m.role === "user" ? d.accent : d.text,
              fontSize: 12, fontFamily: SANS, lineHeight: 1.6,
            }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {/* Voice state */}
      {vs !== "idle" && (
        <div style={{ borderTop: `1px solid ${d.border}`, padding: "8px 16px", display: "flex", alignItems: "center", gap: 10, background: d.surface2 }}>
          {vs === "listening" && <><Waveform color="#EF4444" /><span style={{ color: "#EF4444", fontSize: 12, fontFamily: SANS }} className="animate-pulse">Listening...</span></>}
          {vs === "transcribing" && <span style={{ color: d.text, fontSize: 12, fontStyle: "italic", fontFamily: SANS }}>"Focus on making the API stateless..."</span>}
          {vs === "speaking" && <><Waveform color={d.accent} /><span style={{ color: d.accent, fontSize: 12, fontFamily: SANS }}>{stage.specialist} is responding...</span></>}
        </div>
      )}

      {/* Input row */}
      <div style={{ borderTop: `1px solid ${d.border}`, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
        <VoiceBtn vs={vs} d={d} onCycle={onCycle} />
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder={`Direct ${stage.specialist}...`}
          style={{
            flex: 1, border: "none", outline: "none",
            background: "transparent", color: d.text,
            fontFamily: SANS, fontSize: 12,
          }}
        />
        <button onClick={send} style={{ background: "none", border: "none", cursor: "pointer", color: d.accent, padding: 4 }}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

function StageFocusPanel({
  stageId, d, scenario, tab, onTabChange, vs, onCycleVoice, onClose,
}: {
  stageId: StageId; d: Dir; scenario: typeof SCENS[ScenId];
  tab: FT; onTabChange: (t: FT) => void;
  vs: VS; onCycleVoice: () => void; onClose: () => void;
}) {
  const stage = STAGES.find(s => s.id === stageId)!;
  const sc = SPEC_COLOR[stage.id];
  const status: SS = scenario.statuses[stageId] ?? "pending";
  const st = statusClr(status);
  const artifacts = ARTIFACTS[stageId] ?? [];
  const logs = LOGS[stageId] ?? [];
  const reasoning = REASONING[stageId] ?? [];
  const [artIdx, setArtIdx] = useState(0);

  const tabs: { id: FT; label: string; ico: React.ReactNode }[] = [
    { id: "artifacts", label: "Artifacts",  ico: <FileText size={12} /> },
    { id: "log",       label: "Live Log",   ico: <Terminal size={12} /> },
    { id: "reasoning", label: "Reasoning",  ico: <Brain size={12} /> },
    { id: "steer",     label: "Steer",      ico: <MessageSquare size={12} /> },
  ];

  const logColor = (lv: string) => {
    if (lv === "error" || lv === "fail") return "#DC2626";
    if (lv === "pass") return "#059669";
    if (lv === "run") return d.accent;
    if (lv === "warn") return "#D97706";
    return d.textMid;
  };

  return (
    <div style={{
      flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
      background: d.surface,
      borderTop: `3px solid ${sc.main}`,
      boxShadow: "0 -4px 24px rgba(0,0,0,0.06)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${d.border}`, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: sc.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
          {stage.glyph}
        </div>
        <div>
          <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700 }}>{stage.name}</div>
          <div style={{ color: d.textMuted, fontSize: 11, fontFamily: SANS }}>{stage.specialist} · {stage.role}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: st.bg, borderRadius: 20, padding: "3px 10px" }}>
          <SIcon s={status} size={11} />
          <span style={{ color: st.text, fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em" }}>{sLabel(status)}</span>
        </div>
        <div style={{ flex: 1 }} />
        <button style={{
          display: "flex", alignItems: "center", gap: 6,
          background: d.surface2, border: `1px solid ${d.border}`,
          borderRadius: 8, padding: "5px 10px", cursor: "pointer",
          color: d.textMid, fontFamily: SANS, fontSize: 11, fontWeight: 600,
        }}>
          <RotateCcw size={11} /> Restart here
        </button>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: d.textMuted, padding: 4 }}>
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${d.border}`, padding: "0 16px", flexShrink: 0 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 14px", marginBottom: -1,
              border: "none", borderBottom: `2px solid ${tab === t.id ? sc.main : "transparent"}`,
              background: "none", cursor: "pointer",
              color: tab === t.id ? sc.main : d.textMuted,
              fontFamily: SANS, fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
              transition: "all 0.18s",
            }}
          >
            {t.ico}{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: tab === "steer" ? "hidden" : "auto" }}>
        {tab === "artifacts" && (
          <div style={{ display: "flex", height: "100%" }}>
            <div style={{ width: 180, borderRight: `1px solid ${d.border}`, overflowY: "auto", flexShrink: 0 }}>
              {artifacts.length === 0
                ? <div style={{ color: d.textMuted, padding: 16, fontSize: 12, fontFamily: SANS }}>No artifacts yet.</div>
                : artifacts.map((a, i) => (
                  <button
                    key={a.name}
                    onClick={() => setArtIdx(i)}
                    style={{
                      width: "100%", display: "flex", alignItems: "flex-start", gap: 8,
                      padding: "10px 12px", border: "none", borderBottom: `1px solid ${d.border}`,
                      background: i === artIdx ? d.accentSoft : "transparent",
                      cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <FileText size={11} style={{ color: i === artIdx ? d.accent : d.textMuted, marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <div style={{ color: i === artIdx ? d.accent : d.text, fontFamily: MONO, fontSize: 10, lineHeight: 1.4 }}>{a.name}</div>
                      <div style={{ color: d.textMuted, fontSize: 9 }}>{a.size}</div>
                    </div>
                  </button>
                ))
              }
            </div>
            <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
              {artifacts[artIdx] && (
                <pre style={{ color: d.text, fontFamily: MONO, fontSize: 11, lineHeight: 1.75, whiteSpace: "pre-wrap", margin: 0 }}>
                  {artifacts[artIdx].preview}
                </pre>
              )}
            </div>
          </div>
        )}

        {tab === "log" && (
          <div style={{ padding: "12px 16px" }}>
            {logs.length === 0
              ? <span style={{ color: d.textMuted, fontSize: 12, fontFamily: SANS }}>No log entries.</span>
              : logs.map((e, i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 5 }}>
                  <span style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10, flexShrink: 0, paddingTop: 2 }}>{e.t}</span>
                  <span style={{ color: logColor(e.lv), fontFamily: MONO, fontSize: 11, lineHeight: 1.6 }}>{e.msg}</span>
                </div>
              ))
            }
            {status === "running" && (
              <span style={{ color: d.accent, fontFamily: MONO, fontSize: 12 }} className="animate-pulse">▊</span>
            )}
          </div>
        )}

        {tab === "reasoning" && (
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            {reasoning.length === 0
              ? <span style={{ color: d.textMuted, fontSize: 12, fontFamily: SANS }}>No reasoning trace available.</span>
              : reasoning.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 12 }}>
                  <div style={{ width: 2, background: sc.soft, borderRadius: 1, flexShrink: 0, alignSelf: "stretch" }} />
                  <p style={{ color: d.textMid, fontSize: 12, lineHeight: 1.75, fontFamily: SANS, margin: 0 }}>{t}</p>
                </div>
              ))
            }
          </div>
        )}

        {tab === "steer" && (
          <StageVoiceChat stage={stage} d={d} vs={vs} onCycle={onCycleVoice} />
        )}
      </div>
    </div>
  );
}

// ─── Team Controller ──────────────────────────────────────────────────────────

function TeamController({
  d, scenId, run, pipeVs, onCycleVoice, onApprove,
}: {
  d: Dir; scenId: ScenId;
  run: typeof SCENS[ScenId]["run"];
  pipeVs: VS; onCycleVoice: () => void; onApprove: () => void;
}) {
  return (
    <div style={{
      background: d.surface, borderTop: `1px solid ${d.border}`,
      height: 58, display: "flex", alignItems: "center",
      padding: "0 20px", gap: 16, flexShrink: 0,
      boxShadow: "0 -2px 12px rgba(0,0,0,0.05)",
    }}>
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: `linear-gradient(135deg, ${d.accent}, ${d.accentDark})`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Sparkles size={14} style={{ color: "#FFF" }} />
        </div>
        <span style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 800, letterSpacing: "-0.02em" }}>ADHD</span>
      </div>

      <div style={{ width: 1, height: 20, background: d.border }} />

      {/* Run info */}
      {run ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10 }}>#{run.id}</span>
          <span style={{ color: d.text, fontFamily: SANS, fontSize: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{run.task}</span>
          <span style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10 }}>{run.elapsed}</span>
          <div style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: run.state === "running" ? d.accent : run.state === "awaiting" ? "#D97706" : run.state === "failed" ? "#DC2626" : "#059669",
            boxShadow: run.state === "running" ? `0 0 6px ${d.accent}` : undefined,
            animation: run.state === "running" ? "adhd-pulse 1.2s ease-in-out infinite" : undefined,
          }} />
        </div>
      ) : (
        <span style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12 }}>No active run</span>
      )}

      <div style={{ flex: 1 }} />

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {scenId === "gate" && (
          <button
            onClick={onApprove}
            style={{
              background: "#D97706", color: "#FFF",
              border: "none", borderRadius: 10, padding: "7px 16px",
              fontFamily: SANS, fontSize: 12, fontWeight: 800, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              boxShadow: "0 2px 8px rgba(217,119,6,0.30)",
            }}
          >
            <UserCheck size={13} /> Approve Gate
          </button>
        )}
        {scenId === "failed" && (
          <button style={{
            background: "rgba(220,38,38,0.08)", color: "#DC2626",
            border: "1px solid rgba(220,38,38,0.20)", borderRadius: 10, padding: "7px 14px",
            fontFamily: SANS, fontSize: 12, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <RotateCcw size={12} /> Restart from Implementation
          </button>
        )}
        {scenId === "running" && (
          <button style={{
            background: d.surface2, color: d.textMid,
            border: `1px solid ${d.border}`, borderRadius: 10, padding: "7px 14px",
            fontFamily: SANS, fontSize: 12, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <Square size={11} /> Abort
          </button>
        )}
        {(scenId === "idle" || scenId === "empty") && (
          <button style={{
            background: `linear-gradient(135deg, ${d.accent}, ${d.accentDark})`, color: "#FFF",
            border: "none", borderRadius: 10, padding: "8px 18px",
            fontFamily: SANS, fontSize: 12, fontWeight: 800, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
            boxShadow: `0 2px 10px ${d.accentSoft}`,
          }}>
            <Play size={12} /> Start run
          </button>
        )}
      </div>

      <div style={{ width: 1, height: 20, background: d.border }} />

      {/* Team voice */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <VoiceStatus vs={pipeVs} d={d} />
        <VoiceBtn vs={pipeVs} d={d} onCycle={onCycleVoice} large />
      </div>
    </div>
  );
}

// ─── Setup Panel ──────────────────────────────────────────────────────────────

function SetupPanel({ d, onClose }: { d: Dir; onClose: () => void }) {
  const [sec, setSec] = useState("pipeline");
  const [stageOn, setStageOn] = useState<Record<string, boolean>>(
    Object.fromEntries(STAGES.map(s => [s.id, true]))
  );
  const [harness, setHarness] = useState("claude-code");
  const [model, setModel] = useState("claude-opus-4-8");

  const sections = [
    { id: "pipeline", label: "Pipeline" },
    { id: "gates",    label: "Gates" },
    { id: "harness",  label: "AI Harness" },
    { id: "keys",     label: "API Keys" },
    { id: "deploy",   label: "Deploy Target" },
  ];

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(30,27,75,0.20)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: "#FFF", borderRadius: 20, width: 700, maxHeight: "82vh", display: "flex", overflow: "hidden", boxShadow: d.shadowLg }}
      >
        {/* Sidebar */}
        <div style={{ width: 160, background: d.surface2, borderRight: `1px solid ${d.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${d.border}` }}>
            <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 800 }}>Setup</div>
            <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11 }}>my-saas-app</div>
          </div>
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setSec(s.id)}
              style={{
                textAlign: "left", padding: "10px 16px", border: "none",
                background: sec === s.id ? d.accentSoft : "transparent",
                borderLeft: `3px solid ${sec === s.id ? d.accent : "transparent"}`,
                color: sec === s.id ? d.accent : d.textMid,
                fontFamily: SANS, fontSize: 12, fontWeight: sec === s.id ? 700 : 500,
                cursor: "pointer", transition: "all 0.15s",
              }}
            >{s.label}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={onClose}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", border: "none", borderTop: `1px solid ${d.border}`, background: "transparent", color: d.textMuted, fontFamily: SANS, fontSize: 12, cursor: "pointer" }}>
            <X size={12} /> Close
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {sec === "pipeline" && (
            <div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Pipeline Stages</div>
              <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, marginBottom: 16 }}>
                Toggle which stages are active. Disabled stages are skipped.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {STAGES.map(stage => {
                  const sc = SPEC_COLOR[stage.id];
                  return (
                    <div key={stage.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${d.border}`, borderRadius: 12, padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: sc.soft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{stage.glyph}</div>
                        <div>
                          <div style={{ color: d.text, fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>{stage.name}</div>
                          <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 10 }}>{stage.specialist} · {stage.role}</div>
                        </div>
                      </div>
                      <button onClick={() => setStageOn(s => ({ ...s, [stage.id]: !s[stage.id] }))}
                        style={{ background: "none", border: "none", cursor: "pointer", color: stageOn[stage.id] ? d.accent : d.textMuted }}>
                        {stageOn[stage.id] ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {sec === "harness" && (
            <div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>AI Harness</div>
              <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, marginBottom: 16 }}>The implementation tool used by the Builder stage.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {[{ id: "claude-code", label: "Claude Code", desc: "Anthropic\'s agentic coding CLI" }, { id: "cursor", label: "Cursor", desc: "AI-first code editor" }].map(opt => (
                  <button key={opt.id} onClick={() => setHarness(opt.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `2px solid ${harness === opt.id ? d.accent : d.border}`, borderRadius: 12, background: harness === opt.id ? d.accentSoft : "transparent", cursor: "pointer", textAlign: "left" }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${harness === opt.id ? d.accent : d.border}`, background: harness === opt.id ? d.accent : "transparent", flexShrink: 0 }} />
                    <div>
                      <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>{opt.label}</div>
                      <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11 }}>{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Model</div>
              <select value={model} onChange={e => setModel(e.target.value)}
                style={{ width: "100%", border: `1px solid ${d.border}`, borderRadius: 10, padding: "9px 12px", fontFamily: MONO, fontSize: 12, color: d.text, background: "#FFF", outline: "none" }}>
                <option value="claude-opus-4-8">claude-opus-4-8 (most capable)</option>
                <option value="claude-sonnet-4-6">claude-sonnet-4-6 (balanced)</option>
                <option value="claude-haiku-4-5">claude-haiku-4-5 (fastest)</option>
              </select>
            </div>
          )}

          {sec === "gates" && (
            <div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Human Gates</div>
              <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, marginBottom: 16 }}>Approval checkpoints that pause the pipeline until a human reviews.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {["After Requirements · G1", "After Design · G2", "After Release · G3"].map(g => (
                  <div key={g} style={{ border: `1px solid ${d.border}`, borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>{g}</div>
                      <div style={{ background: d.accentSoft, color: d.accent, borderRadius: 20, padding: "2px 10px", fontFamily: MONO, fontSize: 9, fontWeight: 700 }}>ENABLED</div>
                    </div>
                    <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12 }}>Manual approval required before proceeding.</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sec === "keys" && (
            <div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>API Keys</div>
              <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, marginBottom: 16 }}>Stored locally. Never transmitted to external servers.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[{ label: "Anthropic API Key", ph: "sk-ant-api03-...", desc: "Required for all AI stages" }, { label: "GitHub Client ID", ph: "Oauth_...", desc: "Optional — GitHub integration" }].map(f => (
                  <div key={f.label}>
                    <div style={{ color: d.text, fontFamily: SANS, fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{f.label}</div>
                    <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11, marginBottom: 6 }}>{f.desc}</div>
                    <input type="password" placeholder={f.ph}
                      style={{ width: "100%", border: `1px solid ${d.border}`, borderRadius: 10, padding: "9px 12px", fontFamily: MONO, fontSize: 11, color: d.text, outline: "none", background: d.surface2 }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {sec === "deploy" && (
            <div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Deploy Target</div>
              <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, marginBottom: 16 }}>Where the Pilot stage deploys your release.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[{ id: "vercel", label: "Vercel", desc: "Auto-detected from project" }, { id: "railway", label: "Railway", desc: "railway.app" }, { id: "fly", label: "Fly.io", desc: "fly.io" }, { id: "custom", label: "Custom script", desc: "Run ./scripts/deploy.sh" }].map((opt, i) => (
                  <button key={opt.id}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `2px solid ${i === 0 ? d.accent : d.border}`, borderRadius: 12, background: i === 0 ? d.accentSoft : "transparent", cursor: "pointer", textAlign: "left" }}>
                    <Server size={14} style={{ color: i === 0 ? d.accent : d.textMuted, flexShrink: 0 }} />
                    <div>
                      <div style={{ color: d.text, fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>{opt.label}</div>
                      <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11 }}>{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── History Panel ────────────────────────────────────────────────────────────

function HistoryPanel({ d, onClose }: { d: Dir; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: "0 0 0 auto", zIndex: 50, width: 360, background: "#FFF", borderLeft: `1px solid ${d.border}`, display: "flex", flexDirection: "column", boxShadow: d.shadowLg }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${d.border}` }}>
        <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700 }}>Run History</div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: d.textMuted }}><X size={16} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {HISTORY.map(run => (
          <div key={run.id} style={{ padding: "14px 16px", borderBottom: `1px solid ${d.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10 }}>#{run.id}</span>
              <div style={{
                background: run.status === "complete" ? "rgba(5,150,105,0.10)" : "rgba(220,38,38,0.10)",
                color: run.status === "complete" ? "#059669" : "#DC2626",
                borderRadius: 20, padding: "2px 8px", fontFamily: MONO, fontSize: 9, fontWeight: 700,
              }}>{run.status.toUpperCase()}</div>
              <span style={{ color: d.textMuted, fontFamily: SANS, fontSize: 10, marginLeft: "auto" }}>{run.date}</span>
            </div>
            <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{run.task}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10 }}>{run.dur}</span>
              {run.failAt && <span style={{ color: "#DC2626", fontFamily: SANS, fontSize: 10 }}>✗ {run.failAt}</span>}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${d.border}`, background: d.surface2, borderRadius: 8, padding: "4px 10px", fontFamily: SANS, fontSize: 11, color: d.textMid, cursor: "pointer" }}>
                <RotateCcw size={10} /> Restart
              </button>
              <button style={{ border: `1px solid ${d.border}`, background: d.surface2, borderRadius: 8, padding: "4px 10px", fontFamily: SANS, fontSize: 11, color: d.textMid, cursor: "pointer" }}>
                Artifacts
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ d, onStart }: { d: Dir; onStart: () => void }) {
  const [input, setInput] = useState("Add OAuth2 login flow with Google and GitHub");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 32, padding: "0 40px" }}>
      {/* Ghost pipeline */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.18 }}>
        {STAGES.map((st, i) => (
          <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, border: `1.5px solid ${SPEC_COLOR[st.id].main}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{st.glyph}</div>
              <div style={{ fontFamily: SANS, fontSize: 9, color: d.textMuted }}>{st.name}</div>
            </div>
            {i < STAGES.length - 1 && <div style={{ width: 16, height: 2, borderRadius: 1, background: d.border }} />}
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={{ color: d.text, fontFamily: SANS, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>
          What should the team build?
        </div>
        <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 14 }}>
          Describe a feature, bug fix, or task. Your AI team will handle the rest.
        </div>
      </div>

      <div style={{ maxWidth: 540, width: "100%", background: "#FFF", border: `1.5px solid ${d.border}`, borderRadius: 16, display: "flex", alignItems: "center", gap: 12, padding: "10px 10px 10px 18px", boxShadow: d.shadow }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onStart()}
          placeholder="Describe the task..."
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: d.text, fontFamily: SANS, fontSize: 14 }}
        />
        <button
          onClick={onStart}
          style={{
            background: `linear-gradient(135deg, ${d.accent}, ${d.accentDark})`, color: "#FFF",
            border: "none", borderRadius: 12, padding: "10px 20px",
            fontFamily: SANS, fontSize: 13, fontWeight: 800, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 7,
            boxShadow: `0 2px 10px ${d.accentMid}`,
          }}
        >
          <Play size={13} /> Start run
        </button>
      </div>

      <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12 }}>
        ↵ to start · ⌘⇧V for voice
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

function cycleVS(v: VS): VS {
  const c: VS[] = ["idle", "listening", "transcribing", "speaking"];
  return c[(c.indexOf(v) + 1) % c.length];
}

export default function App() {
  const [dirId, setDirId] = useState<DirId>("indigo");
  const [scenId, setScenId] = useState<ScenId>("running");
  const [focused, setFocused] = useState<StageId | null>("design");
  const [focusTab, setFocusTab] = useState<FT>("log");
  const [pipeVs, setPipeVs] = useState<VS>("idle");
  const [stageVs, setStageVs] = useState<VS>("idle");
  const [showSetup, setShowSetup] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const d = DIRS[dirId];
  const scen = SCENS[scenId];

  useEffect(() => {
    setFocused(scen.defaultFocus);
    setFocusTab("log");
  }, [scenId]);

  function handleNodeClick(id: StageId) {
    if (focused === id) { setFocused(null); return; }
    setFocused(id);
    setFocusTab("log");
  }

  const approveGate = () => setScenId("running");

  let gateCounter = 0;
  const gateAwaiting = [
    scen.statuses.requirements === "awaiting",
    scen.statuses.design === "awaiting",
    scen.statuses.release === "awaiting",
  ];

  // Dot-grid background pattern
  const dotGrid = `radial-gradient(circle, ${d.border.replace("0.12","0.20")} 1px, transparent 1px)`;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: SANS, background: d.bg }}>
      <style>{`
        @keyframes adhd-wave {
          from { transform: scaleY(0.2); }
          to   { transform: scaleY(1); }
        }
        @keyframes adhd-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.7; transform: scale(0.88); }
        }
        @keyframes adhd-ring {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(1.7); opacity: 0; }
        }
        @keyframes adhd-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.15); border-radius: 4px; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background: d.surface, borderBottom: `1px solid ${d.border}`, height: 50, display: "flex", alignItems: "center", padding: "0 20px", gap: 14, flexShrink: 0, boxShadow: d.shadowSm }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: `linear-gradient(135deg, ${d.accent}, ${d.accentDark})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles size={15} style={{ color: "#FFF" }} />
          </div>
          <span style={{ color: d.text, fontFamily: SANS, fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}>ADHD</span>
        </div>

        <div style={{ width: 1, height: 22, background: d.border }} />

        {/* Project */}
        <button style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: d.textMid, fontFamily: SANS, fontSize: 13, fontWeight: 500 }}>
          my-saas-app <ChevronDown size={13} style={{ color: d.textMuted }} />
        </button>

        <div style={{ flex: 1 }} />

        {/* Scenario switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: d.surface2, borderRadius: 12, padding: 3, border: `1px solid ${d.border}` }}>
          {(Object.entries(SCENS) as [ScenId, typeof SCENS[ScenId]][]).map(([id, s]) => (
            <button key={id} onClick={() => setScenId(id)}
              style={{
                padding: "4px 12px", borderRadius: 9, border: "none", cursor: "pointer",
                background: scenId === id ? d.accent : "transparent",
                color: scenId === id ? "#FFF" : d.textMuted,
                fontFamily: SANS, fontSize: 11, fontWeight: scenId === id ? 700 : 500,
                transition: "all 0.18s",
              }}
            >{s.label}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setShowHistory(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: d.surface2, border: `1px solid ${d.border}`, borderRadius: 10, padding: "6px 12px", cursor: "pointer", color: d.textMid, fontFamily: SANS, fontSize: 12, fontWeight: 500 }}>
            <History size={13} /> History
          </button>
          <button onClick={() => setShowSetup(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: d.surface2, border: `1px solid ${d.border}`, borderRadius: 10, padding: "6px 12px", cursor: "pointer", color: d.textMid, fontFamily: SANS, fontSize: 12, fontWeight: 500 }}>
            <Settings size={13} /> Setup
          </button>
        </div>
      </div>

      {/* ── Direction picker ── */}
      <DirPicker cur={dirId} onChange={setDirId} d={d} />

      {/* ── Main canvas ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", backgroundImage: dotGrid, backgroundSize: "26px 26px" }}>
        {scenId === "empty" ? (
          <EmptyState d={d} onStart={() => setScenId("running")} />
        ) : (
          <>
            {/* Run status bar */}
            {scen.run && (
              <div style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${d.border}`, height: 36, display: "flex", alignItems: "center", padding: "0 20px", gap: 10, flexShrink: 0 }}>
                <span style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10 }}>RUN <span style={{ color: d.textMid }}>#{scen.run.id}</span></span>
                <div style={{ width: 1, height: 14, background: d.border }} />
                <span style={{ color: d.text, fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>{scen.run.task}</span>
                <div style={{ width: 1, height: 14, background: d.border }} />
                <span style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10 }}>{scen.run.elapsed}</span>
                <div style={{ flex: 1 }} />
                <div style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: scen.run.state === "running" ? d.accent : scen.run.state === "awaiting" ? "#D97706" : scen.run.state === "failed" ? "#DC2626" : "#059669",
                  boxShadow: scen.run.state === "running" ? `0 0 7px ${d.accent}` : undefined,
                  animation: scen.run.state === "running" ? "adhd-pulse 1.2s ease-in-out infinite" : undefined,
                }} />
                <span style={{ color: d.textMid, fontFamily: MONO, fontSize: 10, fontWeight: 600 }}>{scen.run.state.toUpperCase()}</span>
              </div>
            )}

            {/* Pipeline row */}
            <div style={{ flexShrink: 0, overflowX: "auto", padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", minWidth: "max-content" }}>
                {STAGES.map((stage, i) => {
                  const status: SS = scen.statuses[stage.id as StageId] ?? "pending";
                  const isLast = i === STAGES.length - 1;

                  const node = (
                    <StageNode
                      key={stage.id}
                      stage={stage}
                      status={status}
                      d={d}
                      focused={focused === stage.id}
                      onClick={() => handleNodeClick(stage.id as StageId)}
                    />
                  );

                  if (isLast) return node;

                  if (!stage.gateAfter) {
                    return (
                      <div key={stage.id} style={{ display: "flex", alignItems: "center" }}>
                        {node}
                        <Connector d={d} dim={status === "pending"} />
                      </div>
                    );
                  }

                  const gi = ++gateCounter;
                  const gw = gateAwaiting[gi - 1] ?? false;

                  return (
                    <div key={stage.id} style={{ display: "flex", alignItems: "center" }}>
                      {node}
                      <div style={{ width: 12, height: 2, borderRadius: 1, background: gw ? "#D97706" : d.border }} />
                      <GateMarker index={gi} d={d} awaiting={gw} onApprove={gw ? approveGate : undefined} />
                      <div style={{ width: 12, height: 2, borderRadius: 1, background: gw ? "#D97706" : d.border }} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stage focus panel */}
            {focused && (
              <StageFocusPanel
                stageId={focused}
                d={d}
                scenario={scen}
                tab={focusTab}
                onTabChange={setFocusTab}
                vs={stageVs}
                onCycleVoice={() => setStageVs(v => cycleVS(v))}
                onClose={() => setFocused(null)}
              />
            )}
          </>
        )}
      </div>

      {/* ── Team controller ── */}
      <TeamController d={d} scenId={scenId} run={scen.run} pipeVs={pipeVs} onCycleVoice={() => setPipeVs(v => cycleVS(v))} onApprove={approveGate} />

      {/* ── Overlays ── */}
      {showSetup && <SetupPanel d={d} onClose={() => setShowSetup(false)} />}
      {showHistory && <HistoryPanel d={d} onClose={() => setShowHistory(false)} />}
    </div>
  );
}
