import type { CSSProperties } from "react";
import { CircleStop, Users } from "lucide-react";
import type {
  Orchestration,
  OrchestratorDecision,
  OrchestratorRole,
  RunSummary,
} from "@adhd/core";
import {
  decisionPresentation,
  orchestrationNeedsUser,
  orchestrationStatusLabel,
  teamAwaitingApproval,
} from "../../orchestration";
import { formatDateTime } from "../../format";
import type { Dir } from "../../theme";
import {
  FONT,
  GOLD,
  GOLD_SOFT,
  ICON,
  MONO,
  RADIUS,
  RUN_PILL,
  SANS,
  SPACE,
  WEIGHT,
  runDot,
  runStatusLabel,
} from "../../theme";
import { FAIL_RED, SCROLL_BODY, emptyNote } from "./run-styles";

const MAX_WIDTH = 900;
const DOT_SIZE = 7;

const BODY: CSSProperties = {
  maxWidth: MAX_WIDTH,
  margin: "0 auto",
  padding: SPACE.x4l,
  display: "grid",
  gap: SPACE.xxl,
};

function goalText(d: Dir): CSSProperties {
  return {
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.xl,
    fontWeight: WEIGHT.semibold,
    lineHeight: 1.4,
  };
}

function statusPill(needsUser: boolean, d: Dir): CSSProperties {
  return {
    justifySelf: "start",
    borderRadius: RADIUS.pill,
    padding: `${SPACE.xs}px ${SPACE.lg}px`,
    background: needsUser ? GOLD_SOFT : d.surface2,
    border: `1px solid ${needsUser ? GOLD : d.border}`,
    color: needsUser ? GOLD : d.textMid,
    fontFamily: MONO,
    fontSize: FONT.xxs,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.06em",
  };
}

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
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.lg,
    fontWeight: WEIGHT.bold,
  };
}

function mutedText(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.md, lineHeight: 1.5 };
}

function sectionLabel(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.xs,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };
}

function roleRow(d: Dir): CSSProperties {
  return {
    display: "grid",
    gap: SPACE.xxs,
    borderTop: `1px solid ${d.border}`,
    paddingTop: SPACE.md,
  };
}

function roleName(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.md, fontWeight: WEIGHT.semibold };
}

function roleSkill(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: MONO, fontSize: FONT.xxs };
}

function button(d: Dir, primary = false): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    border: `1px solid ${primary ? d.accent : d.border}`,
    borderRadius: RADIUS.md,
    background: primary ? d.accent : d.surface,
    color: primary ? d.accentText : d.textMid,
    padding: `${SPACE.md}px ${SPACE.xl}px`,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
    cursor: "pointer",
  };
}

function errorText(): CSSProperties {
  return { color: FAIL_RED, fontFamily: SANS, fontSize: FONT.md };
}

const TIMELINE: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: SPACE.xs,
};

function timelineButton(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.md,
    width: "100%",
    textAlign: "left",
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    background: d.surface,
    padding: `${SPACE.md}px ${SPACE.lg}px`,
    cursor: "pointer",
    fontFamily: SANS,
    color: d.text,
  };
}

function dot(color: string): CSSProperties {
  return {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: RADIUS.round,
    background: color,
    flexShrink: 0,
  };
}

function runNumber(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: MONO, fontSize: FONT.xs, flexShrink: 0 };
}

const RUN_NAME: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: FONT.md,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function runStatusText(pill: { text: string }): CSSProperties {
  return {
    color: pill.text,
    fontFamily: MONO,
    fontSize: FONT.xxs,
    fontWeight: WEIGHT.bold,
    flexShrink: 0,
  };
}

function runDate(d: Dir): CSSProperties {
  return { color: d.textMuted, fontSize: FONT.xs, flexShrink: 0 };
}

interface RoleListProps {
  roles: OrchestratorRole[];
  d: Dir;
}

function RoleList({ roles, d }: RoleListProps) {
  return (
    <>
      {roles.map((role) => (
        <div key={role.id} style={roleRow(d)}>
          <span style={roleName(d)}>{role.label}</span>
          <span style={roleSkill(d)}>
            {role.skill} · {role.stepTask}
          </span>
          {role.rationale && <span style={mutedText(d)}>{role.rationale}</span>}
        </div>
      ))}
    </>
  );
}

interface LatestDecisionProps {
  decision: OrchestratorDecision;
  d: Dir;
}

function LatestDecision({ decision, d }: LatestDecisionProps) {
  const { title, detail } = decisionPresentation(decision);
  return (
    <section style={card(d)} data-testid="orchestrator-decision">
      <span style={cardTitle(d)}>{title}</span>
      <span style={mutedText(d)}>{detail}</span>
      {decision.action === "ask_user" && (
        <span style={mutedText(d)}>Answer in the Chat tab to continue.</span>
      )}
    </section>
  );
}

interface RunTimelineProps {
  runs: RunSummary[];
  onOpenRun: (runId: string) => void;
  d: Dir;
}

function RunTimeline({ runs, onOpenRun, d }: RunTimelineProps) {
  if (runs.length === 0) {
    return <div style={emptyNote(d)}>No runs yet in this initiative.</div>;
  }
  return (
    <ul style={TIMELINE}>
      {runs.map((run) => (
        <li key={run.id}>
          <button
            type="button"
            onClick={() => onOpenRun(run.id)}
            data-testid="orchestrator-run"
            data-run-id={run.id}
            style={timelineButton(d)}
          >
            <span style={dot(runDot(run.status, d))} />
            <span style={runNumber(d)}>#{run.number}</span>
            <span style={RUN_NAME}>{run.pipelineName}</span>
            <span style={runStatusText(RUN_PILL[run.status])}>
              {runStatusLabel(run.status)}
            </span>
            <span style={runDate(d)}>{formatDateTime(run.createdAt)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export interface OrchestratorView {
  orchestration: Orchestration;
  runs: RunSummary[];
  busy: boolean;
  onApprove: () => void;
  onStop: () => void;
  onOpenRun: (runId: string) => void;
}

export interface OrchestratorPanelProps extends OrchestratorView {
  d: Dir;
}

export function OrchestratorPanel({
  orchestration,
  runs,
  busy,
  onApprove,
  onStop,
  onOpenRun,
  d,
}: OrchestratorPanelProps) {
  const team = teamAwaitingApproval(orchestration);
  const decision = orchestration.latestDecision;
  const stoppable = orchestration.status !== "stopped";

  return (
    <div style={SCROLL_BODY}>
      <div style={BODY} data-testid="orchestrator-panel">
        <div style={{ display: "grid", gap: SPACE.md }}>
          <span style={sectionLabel(d)}>Goal</span>
          <span style={goalText(d)}>{orchestration.goal}</span>
          <span
            data-testid="orchestrator-status"
            style={statusPill(orchestrationNeedsUser(orchestration.status), d)}
          >
            {orchestrationStatusLabel(orchestration.status)}
          </span>
          {orchestration.stopReason && (
            <span style={mutedText(d)}>{orchestration.stopReason}</span>
          )}
          {orchestration.decisionError && (
            <span style={errorText()}>{orchestration.decisionError}</span>
          )}
        </div>

        {team ? (
          <section style={card(d)} data-testid="orchestrator-team">
            <span style={cardTitle(d)}>{team.name}</span>
            <span style={mutedText(d)}>{team.summary}</span>
            <RoleList roles={team.roles} d={d} />
            <div style={{ display: "flex", gap: SPACE.md, paddingTop: SPACE.md }}>
              <button
                type="button"
                disabled={busy}
                onClick={onApprove}
                data-testid="approve-team"
                style={button(d, true)}
              >
                <Users size={ICON.md} /> Approve &amp; start
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onStop}
                data-testid="stop-orchestrator"
                style={button(d)}
              >
                <CircleStop size={ICON.md} /> Stop
              </button>
            </div>
          </section>
        ) : (
          decision && (
            <LatestDecision decision={decision} d={d} />
          )
        )}

        <div style={{ display: "grid", gap: SPACE.md }}>
          <span style={sectionLabel(d)}>Runs in this initiative</span>
          <RunTimeline runs={runs} onOpenRun={onOpenRun} d={d} />
        </div>

        {!team && stoppable && (
          <button
            type="button"
            disabled={busy}
            onClick={onStop}
            data-testid="stop-orchestrator"
            style={{ ...button(d), justifySelf: "start" }}
          >
            <CircleStop size={ICON.md} /> Stop the Orchestrator
          </button>
        )}
      </div>
    </div>
  );
}
