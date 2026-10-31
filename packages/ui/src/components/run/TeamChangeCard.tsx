import type { CSSProperties } from "react";
import { Users } from "lucide-react";
import { lineDiff } from "../../line-diff";
import type { DiffLine, DiffLineKind } from "../../line-diff";
import type { Dir } from "../../theme";
import { FAIL_RED, FONT, ICON, MONO, PASS_GREEN, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";

const DIFF_MAX_HEIGHT = 360;

const DIFF_MARK: Record<DiffLineKind, string> = { same: " ", added: "+", removed: "-" };

function card(d: Dir): CSSProperties {
  return {
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.lg,
    background: d.surface2,
    padding: SPACE.xl,
    display: "grid",
    gap: SPACE.md,
  };
}

function cardTitle(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.lg,
    fontWeight: WEIGHT.bold,
  };
}

function mutedText(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.md, lineHeight: 1.5 };
}

function diffBlock(d: Dir): CSSProperties {
  return {
    margin: 0,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    background: d.surface,
    padding: SPACE.md,
    maxHeight: DIFF_MAX_HEIGHT,
    overflow: "auto",
    fontFamily: MONO,
    fontSize: FONT.xs,
    lineHeight: 1.5,
  };
}

function diffLineColor(kind: DiffLineKind, d: Dir): string {
  switch (kind) {
    case "added":
      return PASS_GREEN;
    case "removed":
      return FAIL_RED;
    case "same":
      return d.textMid;
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

function approveButton(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    justifySelf: "start",
    border: `1px solid ${d.accent}`,
    borderRadius: RADIUS.md,
    background: d.accent,
    color: d.accentText,
    padding: `${SPACE.md}px ${SPACE.xl}px`,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
    cursor: "pointer",
  };
}

interface TeamDiffProps {
  lines: DiffLine[];
  d: Dir;
}

function TeamDiff({ lines, d }: TeamDiffProps) {
  return (
    <pre style={diffBlock(d)} data-testid="team-change-diff">
      {lines.map((line, index) => (
        <div key={index} data-kind={line.kind} style={{ color: diffLineColor(line.kind, d) }}>
          {DIFF_MARK[line.kind]} {line.text}
        </div>
      ))}
    </pre>
  );
}

export interface TeamChangeCardProps {
  rationale: string;
  proposed: string;
  current?: string;
  awaitingApproval: boolean;
  busy: boolean;
  d: Dir;
  onApprove: () => void;
}

export function TeamChangeCard({
  rationale,
  proposed,
  current,
  awaitingApproval,
  busy,
  d,
  onApprove,
}: TeamChangeCardProps) {
  return (
    <section style={card(d)} data-testid="orchestrator-team-change">
      <span style={cardTitle(d)}>
        <Users size={ICON.sm} /> A change to the team
      </span>
      <span style={mutedText(d)}>{rationale}</span>
      {awaitingApproval && <TeamDiff lines={lineDiff(current ?? "", proposed)} d={d} />}
      {awaitingApproval && (
        <button data-testid="approve-team-change" disabled={busy} onClick={onApprove} style={approveButton(d)}>
          Approve &amp; commit team.md
        </button>
      )}
    </section>
  );
}
