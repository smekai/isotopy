import type { CSSProperties } from "react";
import { Flag, Play } from "lucide-react";
import {
  canFinalizeMilestone,
  canStartNextFeature,
  milestoneProgress,
} from "@isotopy/core";
import type { Milestone, RunSummary } from "@isotopy/core";
import { MilestoneFeatureCard } from "./MilestoneFeatureCard";
import type { Dir } from "../theme";
import { FONT, ICON, RADIUS, SANS, SPACE, WEIGHT } from "../theme";

const CONTENT_MAX_WIDTH = 900;
const PROGRESS_BAR_HEIGHT = 8;

const SCROLL_BODY: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
};

const CONTENT: CSSProperties = {
  maxWidth: CONTENT_MAX_WIDTH,
  margin: "0 auto",
  padding: SPACE.x4l,
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xxl,
};

function heading(d: Dir): CSSProperties {
  return {
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.display,
    fontWeight: WEIGHT.heavy,
    letterSpacing: "-0.02em",
    margin: 0,
  };
}

function goalText(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.lg };
}

function statusPill(d: Dir): CSSProperties {
  return {
    alignSelf: "flex-start",
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.pill,
    padding: `${SPACE.xxs}px ${SPACE.lg}px`,
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.xs,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };
}

function progressTrack(d: Dir): CSSProperties {
  return {
    flex: 1,
    height: PROGRESS_BAR_HEIGHT,
    borderRadius: RADIUS.pill,
    background: d.surface2,
    border: `1px solid ${d.border}`,
    overflow: "hidden",
  };
}

function progressFill(fraction: number, d: Dir): CSSProperties {
  return {
    width: `${Math.round(fraction * 100)}%`,
    height: "100%",
    background: `linear-gradient(90deg, ${d.accent}, ${d.accentDark})`,
  };
}

function progressText(d: Dir): CSSProperties {
  return {
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
    flexShrink: 0,
  };
}

const CONTROL_ROW: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: SPACE.lg,
};

const TITLE_BLOCK: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: SPACE.sm,
};

const PROGRESS_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: SPACE.lg,
};

function autoRunLabel(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.medium,
    cursor: "pointer",
  };
}

function actionButton(enabled: boolean, primary: boolean, d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    border: `1px solid ${enabled && primary ? d.accent : d.border}`,
    borderRadius: RADIUS.lg,
    background: enabled && primary ? d.accent : d.surface2,
    color: enabled ? (primary ? d.accentText : d.textMid) : d.textMuted,
    padding: `${SPACE.md}px ${SPACE.xxl}px`,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
    cursor: enabled ? "pointer" : "default",
  };
}

const FEATURE_LIST: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: SPACE.lg,
};

function emptyNote(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.md };
}

export interface MilestoneDashboardProps {
  milestone: Milestone;
  runs: RunSummary[];
  busy: boolean;
  d: Dir;
  onToggleAutoRun: (autoRunNext: boolean) => void;
  onStartNext: () => void;
  onFinalize: () => void;
  onOpenRun: (runId: string) => void;
  onAcceptFeature: (featureId: string) => void;
}

export function MilestoneDashboard({
  milestone,
  runs,
  busy,
  d,
  onToggleAutoRun,
  onStartNext,
  onFinalize,
  onOpenRun,
  onAcceptFeature,
}: MilestoneDashboardProps) {
  const { completed, total } = milestoneProgress(milestone);
  const canStart = !busy && canStartNextFeature(milestone);
  const canFinalize = !busy && canFinalizeMilestone(milestone);

  return (
    <div style={SCROLL_BODY}>
      <div style={CONTENT} data-testid="milestone-dashboard">
        <div style={TITLE_BLOCK}>
          <span style={statusPill(d)}>{milestone.status}</span>
          <h1 style={heading(d)}>{milestone.name}</h1>
          {milestone.goal && <div style={goalText(d)}>{milestone.goal}</div>}
        </div>

        <div style={PROGRESS_ROW}>
          <div style={progressTrack(d)}>
            <div style={progressFill(total === 0 ? 0 : completed / total, d)} />
          </div>
          <span data-testid="milestone-progress" style={progressText(d)}>
            {completed}/{total} features
          </span>
        </div>

        <div style={CONTROL_ROW}>
          <label style={autoRunLabel(d)}>
            <input
              type="checkbox"
              data-testid="milestone-autorun"
              checked={milestone.autoRunNext}
              disabled={busy}
              onChange={(event) => onToggleAutoRun(event.target.checked)}
            />
            Auto-run next feature
          </label>
          <button
            type="button"
            data-testid="milestone-start-next"
            disabled={!canStart}
            onClick={onStartNext}
            style={actionButton(canStart, true, d)}
          >
            <Play size={ICON.md} /> Start next feature
          </button>
          <button
            type="button"
            data-testid="milestone-finalize"
            disabled={!canFinalize}
            onClick={onFinalize}
            style={actionButton(canFinalize, false, d)}
          >
            <Flag size={ICON.md} /> Finalize milestone
          </button>
        </div>

        {milestone.features.length === 0 ? (
          <div style={emptyNote(d)}>
            This milestone has no features yet. Approve a plan to fill it in.
          </div>
        ) : (
          <ul style={FEATURE_LIST}>
            {milestone.features.map((feature) => (
              <MilestoneFeatureCard
                key={feature.id}
                feature={feature}
                runs={runs}
                busy={busy}
                d={d}
                onOpenRun={onOpenRun}
                onAccept={onAcceptFeature}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
