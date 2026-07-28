import type { CSSProperties } from "react";
import type { RunState } from "@adhd/core";
import { ENGINES, formatUsage, runUsage } from "@adhd/core";
import { useElapsed } from "../hooks/useElapsed";
import type { Dir } from "../theme";
import { EASE, FONT, MONO, MOTION, RADIUS, SANS, SPACE, WEIGHT, runDot } from "../theme";

const BAR_HEIGHT = 36;
const DIVIDER_HEIGHT = 14;
const STATUS_DOT_SIZE = 7;

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
          animation: `adhd-pulse ${MOTION.pulse} ${EASE.inOut} infinite`,
        }
      : {}),
  };
}

function statusText(d: Dir): CSSProperties {
  return { color: d.textMid, fontFamily: MONO, fontSize: FONT.xs, fontWeight: WEIGHT.semibold };
}

export interface RunStatusBarProps {
  run: RunState;
  d: Dir;
}

export function RunStatusBar({ run, d }: RunStatusBarProps) {
  const elapsed = useElapsed(run.createdAt, run.completedAt);
  const running = run.status === "running";
  const dot = runDot(run.status, d);
  const spend = formatUsage(runUsage(run));

  return (
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
      <div style={statusDot(dot, running, d)} />
      <span data-testid="run-status" style={statusText(d)}>{run.status.toUpperCase()}</span>
    </div>
  );
}
