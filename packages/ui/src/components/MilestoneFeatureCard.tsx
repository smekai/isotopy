import type { CSSProperties } from "react";
import { canAcceptMilestoneFeature } from "@isotopy/core";
import type {
  MilestoneFeature,
  MilestoneFeatureStatus,
  MilestoneFinding,
  RunSummary,
} from "@isotopy/core";
import { formatDateTime } from "../format";
import { runsForFeature } from "../run-list";
import type { Dir } from "../theme";
import {
  FAIL_RED,
  FONT,
  MONO,
  PASS_GREEN,
  RADIUS,
  SANS,
  SPACE,
  WARN_AMBER,
  WEIGHT,
  runDot,
  runStatusLabel,
} from "../theme";

const FEATURE_STATUS_COLOR: Record<MilestoneFeatureStatus, string> = {
  ready: "#9B9BC8",
  in_progress: "#6366F1",
  needs_attention: WARN_AMBER,
  completed: PASS_GREEN,
};

function card(d: Dir): CSSProperties {
  return {
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.lg,
    background: d.surface,
    padding: SPACE.xxl,
    display: "flex",
    flexDirection: "column",
    gap: SPACE.md,
    boxShadow: d.elevation.sm,
  };
}

const HEADER_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: SPACE.md,
};

function title(d: Dir): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.xl,
    fontWeight: WEIGHT.bold,
  };
}

function featureStatusText(status: MilestoneFeatureStatus): CSSProperties {
  return {
    color: FEATURE_STATUS_COLOR[status],
    fontFamily: MONO,
    fontSize: FONT.xxs,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.06em",
    flexShrink: 0,
  };
}

function description(d: Dir): CSSProperties {
  return { color: d.textMid, fontFamily: SANS, fontSize: FONT.md };
}

function subheading(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.xs,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };
}

function criteriaList(d: Dir): CSSProperties {
  return {
    margin: 0,
    paddingLeft: SPACE.xxl,
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.md,
    lineHeight: 1.6,
  };
}

const CHIP_ROW: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: SPACE.xs,
};

function taskChip(d: Dir): CSSProperties {
  return {
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    background: d.surface2,
    padding: `${SPACE.xxs}px ${SPACE.md}px`,
    color: d.textMid,
    fontFamily: MONO,
    fontSize: FONT.xxs,
  };
}

function runButton(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    background: d.surface2,
    padding: `${SPACE.xs}px ${SPACE.md}px`,
    cursor: "pointer",
    fontFamily: SANS,
    fontSize: FONT.xs,
    color: d.textMid,
  };
}

const RUN_DOT_SIZE = 6;

function runDotStyle(color: string): CSSProperties {
  return {
    width: RUN_DOT_SIZE,
    height: RUN_DOT_SIZE,
    borderRadius: RADIUS.round,
    background: color,
    flexShrink: 0,
  };
}

function findingRow(blocking: boolean, d: Dir): CSSProperties {
  return {
    borderLeft: `3px solid ${blocking ? FAIL_RED : WARN_AMBER}`,
    paddingLeft: SPACE.lg,
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.md,
  };
}

function findingSeverity(blocking: boolean): CSSProperties {
  return {
    color: blocking ? FAIL_RED : WARN_AMBER,
    fontFamily: MONO,
    fontSize: FONT.xxs,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.06em",
  };
}

function evidenceText(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.sm };
}

function acceptButton(d: Dir): CSSProperties {
  return {
    alignSelf: "flex-start",
    border: `1px solid ${d.borderStrong}`,
    borderRadius: RADIUS.md,
    background: d.surface2,
    padding: `${SPACE.xs}px ${SPACE.lg}px`,
    cursor: "pointer",
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
    color: d.text,
  };
}

function acceptedStamp(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.sm };
}

const FINDING_LIST: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: SPACE.md,
};

interface FindingItemProps {
  finding: MilestoneFinding;
  d: Dir;
}

function FindingItem({ finding, d }: FindingItemProps) {
  const blocking = finding.severity === "blocking";
  return (
    <li style={findingRow(blocking, d)}>
      <span style={findingSeverity(blocking)}>
        {blocking ? "BLOCKING" : "NON-BLOCKING"}
      </span>{" "}
      {finding.title}
      {finding.evidence && <div style={evidenceText(d)}>{finding.evidence}</div>}
    </li>
  );
}

export interface MilestoneFeatureCardProps {
  feature: MilestoneFeature;
  runs: RunSummary[];
  busy: boolean;
  d: Dir;
  onOpenRun: (runId: string) => void;
  onAccept: (featureId: string) => void;
}

export function MilestoneFeatureCard({
  feature,
  runs,
  busy,
  d,
  onOpenRun,
  onAccept,
}: MilestoneFeatureCardProps) {
  const history = runsForFeature(runs, feature.id);

  return (
    <li style={card(d)} data-testid="milestone-feature" data-feature-id={feature.id}>
      <div style={HEADER_ROW}>
        <span style={title(d)}>{feature.title}</span>
        <span style={featureStatusText(feature.status)}>
          {feature.status.replace("_", " ").toUpperCase()}
        </span>
      </div>

      {feature.description && <div style={description(d)}>{feature.description}</div>}

      {feature.acceptanceCriteria.length > 0 && (
        <>
          <div style={subheading(d)}>Acceptance criteria</div>
          <ul style={criteriaList(d)}>
            {feature.acceptanceCriteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </>
      )}

      {feature.taskIds.length > 0 && (
        <>
          <div style={subheading(d)}>Tasks</div>
          <div style={CHIP_ROW}>
            {feature.taskIds.map((taskId) => (
              <span key={taskId} style={taskChip(d)}>
                {taskId}
              </span>
            ))}
          </div>
        </>
      )}

      {history.length > 0 && (
        <>
          <div style={subheading(d)}>Runs</div>
          <div style={CHIP_ROW}>
            {history.map((run) => (
              <button
                key={run.id}
                type="button"
                data-testid="milestone-feature-run"
                onClick={() => onOpenRun(run.id)}
                style={runButton(d)}
              >
                <span style={runDotStyle(runDot(run.status, d))} />#{run.number}{" "}
                {runStatusLabel(run.status)}
              </button>
            ))}
          </div>
        </>
      )}

      {feature.findings.length > 0 && (
        <>
          <div style={subheading(d)}>Findings</div>
          <ul style={FINDING_LIST}>
            {feature.findings.map((finding) => (
              <FindingItem key={finding.id} finding={finding} d={d} />
            ))}
          </ul>
        </>
      )}

      {canAcceptMilestoneFeature(feature) && (
        <button
          type="button"
          data-testid="milestone-feature-accept"
          disabled={busy}
          onClick={() => onAccept(feature.id)}
          style={acceptButton(d)}
        >
          Accept findings &amp; complete
        </button>
      )}

      {feature.acceptedAt && (
        <div style={acceptedStamp(d)}>
          Accepted {formatDateTime(feature.acceptedAt)} — completed by hand, not
          by a passing run.
        </div>
      )}
    </li>
  );
}
