import type { CSSProperties } from "react";
import type { RunState } from "@isotopy/core";
import { ENGINES, runUsage, spendLabel } from "@isotopy/core";
import { useElapsed } from "../hooks/useElapsed";
import type { Dir } from "../theme";
import {
  EASE,
  FONT,
  GOLD,
  GOLD_SOFT,
  MONO,
  MOTION,
  RADIUS,
  SANS,
  SPACE,
  WEIGHT,
  runDot,
  runStatusLabel,
} from "../theme";
import { FAIL_RED } from "./run/run-styles";

const BAR_HEIGHT = 36;
const DIVIDER_HEIGHT = 14;
const STATUS_DOT_SIZE = 7;

const STACK: CSSProperties = { display: "flex", flexDirection: "column", flexShrink: 0 };

function initiativePill(needsUser: boolean, d: Dir): CSSProperties {
  return {
    borderRadius: RADIUS.pill,
    padding: `${SPACE.xxs}px ${SPACE.md}px`,
    background: needsUser ? GOLD_SOFT : d.surface2,
    border: `1px solid ${needsUser ? GOLD : d.border}`,
    color: needsUser ? GOLD : d.textMid,
    fontFamily: MONO,
    fontSize: FONT.xxs,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
  };
}

function noteRow(d: Dir): CSSProperties {
  return {
    borderBottom: `1px solid ${d.border}`,
    padding: `${SPACE.xs}px ${SPACE.xxxl}px`,
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.xs,
  };
}

function errorRow(d: Dir): CSSProperties {
  return { ...noteRow(d), color: FAIL_RED };
}

function bar(d: Dir): CSSProperties {
  return {
    background: "rgba(255,255,255,0.85)",
    backdropFilter: "blur(8px)",
    borderBottom: `1px solid ${d.border}`,
    height: BAR_HEIGHT,
    display: "flex",
    alignItems: "center",
    padding: `0 ${SPACE.xxxl}px`,
    gap: SPACE.lg,
    flexShrink: 0,
  };
}

function divider(d: Dir): CSSProperties {
  return { width: 1, height: DIVIDER_HEIGHT, background: d.border };
}

function metaText(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: MONO, fontSize: FONT.xs };
}

function taskText(d: Dir): CSSProperties {
  return {
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

function engineText(d: Dir): CSSProperties {
  return { color: d.textMid, fontFamily: MONO, fontSize: FONT.xs, fontWeight: WEIGHT.semibold, whiteSpace: "nowrap" };
}

function spendText(d: Dir): CSSProperties {
  return { color: d.textMid, fontFamily: MONO, fontSize: FONT.xs, fontWeight: WEIGHT.semibold };
}

function statusDot(dot: string, running: boolean, d: Dir): CSSProperties {
  return {
    width: STATUS_DOT_SIZE,
    height: STATUS_DOT_SIZE,
    borderRadius: RADIUS.round,
    background: dot,
    ...(running
      ? {
          boxShadow: `0 0 7px ${d.accent}`,
          animation: `isotopy-pulse ${MOTION.pulse} ${EASE.inOut} infinite`,
        }
      : {}),
  };
}

function statusText(d: Dir): CSSProperties {
  return { color: d.textMid, fontFamily: MONO, fontSize: FONT.xs, fontWeight: WEIGHT.semibold };
}

export interface InitiativeChrome {
  statusLabel: string;
  needsUser: boolean;
  spend?: string;
  stopReason?: string;
  decisionError?: string;
}

export interface RunStatusBarProps {
  run: RunState;
  d: Dir;
  initiative?: InitiativeChrome;
}

export function RunStatusBar({ run, d, initiative }: RunStatusBarProps) {
  const elapsed = useElapsed(run.createdAt, run.completedAt);
  const running = run.status === "running";
  const dot = runDot(run.status, d);
  const spend = spendLabel(run.engine, runUsage(run));

  return (
    <div style={STACK}>
      <div style={bar(d)}>
      <span style={metaText(d)}>RUN <span style={{ color: d.textMid }}>#{run.number}</span></span>
      <div style={divider(d)} />
      <span style={taskText(d)}>{run.task ?? run.pipelineName}</span>
      {run.engine && (
        <>
          <div style={divider(d)} />
          <span style={engineText(d)}>
            ⬡ {ENGINES[run.engine].label}{run.model ? ` · ${run.model}` : ""}
          </span>
        </>
      )}
      <div style={divider(d)} />
      <span style={metaText(d)}>{elapsed}</span>
      {spend && (
        <>
          <div style={divider(d)} />
          <span data-testid="run-cost" style={spendText(d)}>{spend}</span>
        </>
      )}
      <div style={{ flex: 1 }} />
      {initiative && (
        <>
          <span
            data-testid="orchestrator-status"
            style={initiativePill(initiative.needsUser, d)}
          >
            {initiative.statusLabel}
          </span>
          {initiative.spend !== undefined && (
            <span data-testid="orchestrator-spend" style={metaText(d)}>
              {initiative.spend}
            </span>
          )}
          <div style={divider(d)} />
        </>
      )}
      <div style={statusDot(dot, running, d)} />
      <span data-testid="run-status" style={statusText(d)}>{runStatusLabel(run.status)}</span>
      </div>
      {initiative?.stopReason !== undefined && (
        <div style={noteRow(d)}>{initiative.stopReason}</div>
      )}
      {initiative?.decisionError !== undefined && (
        <div style={errorRow(d)} data-testid="orchestrator-decision-error">
          {initiative.decisionError}
        </div>
      )}
    </div>
  );
}
