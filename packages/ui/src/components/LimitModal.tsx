import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { BellRing, Play, Plug, RotateCcw, Square, X } from "lucide-react";
import { ENGINES, modelOptionsFor } from "@adhd/core";
import type { EngineId, LimitResolution, RunLimit, RunState } from "@adhd/core";
import { useLimitNotification } from "../hooks/useLimitNotification";
import { useNow } from "../hooks/useNow";
import { formatCountdown, formatResetAt, limitHeadline, remainingMs } from "../limit";
import {
  FONT,
  ICON,
  LIMIT_CYAN,
  MONO,
  RADIUS,
  SANS,
  SPACE,
  WEIGHT,
  Z,
} from "../theme";
import type { Dir } from "../theme";
import { WHITE, mutedCaption, optionLabel } from "./setup/setup-styles";

const SCRIM = "rgba(30,27,75,0.20)";
const DIALOG_WIDTH = 560;
const LIMIT_SOFT = "rgba(8,145,178,0.10)";
const MODEL_CHIP_WIDTH = 140;
const NO_RESET_COPY = "The harness printed no reset time — retrying in 30 minutes.";

const BACKDROP: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: Z.overlay,
  background: SCRIM,
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: SPACE.x5l,
};

const BODY: CSSProperties = {
  padding: SPACE.x4l,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xxl,
};

const ROW: CSSProperties = { display: "flex", alignItems: "center", gap: SPACE.md };

const CHOICE_GRID: CSSProperties = { display: "flex", flexWrap: "wrap", gap: SPACE.md };

function dialog(d: Dir): CSSProperties {
  return {
    background: WHITE,
    borderRadius: RADIUS.xxl,
    width: DIALOG_WIDTH,
    maxWidth: "100%",
    maxHeight: "84vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: d.elevation.lg,
  };
}

function header(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "flex-start",
    gap: SPACE.xl,
    padding: `${SPACE.x4l}px ${SPACE.x4l}px ${SPACE.xxl}px`,
    borderBottom: `1px solid ${d.border}`,
    background: LIMIT_SOFT,
  };
}

function title(d: Dir): CSSProperties {
  return {
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.xxl,
    fontWeight: WEIGHT.bold,
    marginBottom: SPACE.xs,
  };
}

function countdown(): CSSProperties {
  return {
    color: LIMIT_CYAN,
    fontFamily: MONO,
    fontSize: FONT.display,
    fontWeight: WEIGHT.bold,
  };
}

function rawLine(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: MONO,
    fontSize: FONT.sm,
    background: d.surface2,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    padding: SPACE.lg,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };
}

function groupLabel(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: MONO,
    fontSize: FONT.xxs,
    fontWeight: WEIGHT.bold,
    letterSpacing: 0.6,
    marginBottom: SPACE.md,
  };
}

function chip(d: Dir, tone: "neutral" | "accent" | "danger" = "neutral"): CSSProperties {
  const color = tone === "danger" ? "#DC2626" : tone === "accent" ? LIMIT_CYAN : d.text;
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    padding: `${SPACE.md}px ${SPACE.xl}px`,
    border: `1px solid ${tone === "neutral" ? d.border : color}`,
    borderRadius: RADIUS.pill,
    background: tone === "accent" ? LIMIT_SOFT : "transparent",
    color,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
    cursor: "pointer",
    textAlign: "left",
  };
}

function closeButton(d: Dir): CSSProperties {
  return {
    ...chip(d),
    padding: SPACE.md,
    borderRadius: RADIUS.round,
    marginLeft: "auto",
    color: d.textMuted,
  };
}

function modelChip(d: Dir): CSSProperties {
  return {
    ...chip(d),
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 0,
    minWidth: MODEL_CHIP_WIDTH,
  };
}

function otherEngines(current: EngineId): EngineId[] {
  return Object.values(ENGINES)
    .filter((engine) => engine.available && engine.id !== current)
    .map((engine) => engine.id);
}

export interface LimitModalProps {
  d: Dir;
  run: RunState;
  limit: RunLimit;
  onResolve: (resolution: LimitResolution) => void;
  onAbort: () => void;
  onOpenConnection: () => void;
  onDismiss: () => void;
}

export function LimitModal({
  d,
  run,
  limit,
  onResolve,
  onAbort,
  onOpenConnection,
  onDismiss,
}: LimitModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<Element | null>(null);
  const notification = useLimitNotification(limit);
  const now = useNow(limit.resetAt !== undefined);
  const remaining = remainingMs(limit, now);
  const resetLabel = formatResetAt(limit.resetAt);
  const stageLabel = run.stages.find((stage) => stage.id === limit.stageId)?.label ?? limit.stageId;

  useEffect(() => {
    restoreFocusTo.current = document.activeElement;
    dialogRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const restore = restoreFocusTo.current;
      if (restore instanceof HTMLElement) {
        restore.focus();
      }
    };
  }, [onDismiss]);

  return (
    <div style={BACKDROP} onClick={onDismiss}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={limitHeadline(limit)}
        tabIndex={-1}
        data-testid="limit-modal"
        onClick={(event) => event.stopPropagation()}
        style={dialog(d)}
      >
        <div style={header(d)}>
          <div>
            <div style={title(d)}>{limitHeadline(limit)}</div>
            <div style={mutedCaption(d)}>
              {stageLabel} is paused — the run resumes on its own, nothing is lost.
            </div>
          </div>
          <button onClick={onDismiss} aria-label="Keep waiting" style={closeButton(d)}>
            <X size={ICON.md} />
          </button>
        </div>

        <div style={BODY}>
          <div>
            {remaining === undefined ? (
              <div style={mutedCaption(d)}>{NO_RESET_COPY}</div>
            ) : (
              <div style={ROW}>
                <span data-testid="limit-countdown" style={countdown()}>
                  {formatCountdown(remaining)}
                </span>
                <span style={mutedCaption(d)}>until it resets at {resetLabel}</span>
              </div>
            )}
          </div>

          <div style={rawLine(d)}>{limit.raw}</div>

          <div>
            <div style={groupLabel(d)}>SWITCH THE MODEL — RESUMES THIS STEP, KEEPS FINISHED WORK</div>
            <div style={CHOICE_GRID}>
              {modelOptionsFor(limit.engine)
                .filter(
                  (option) =>
                    option.id !== "" &&
                    option.id !== limit.model &&
                    option.requiresUsageCredits !== true,
                )
                .map((option) => (
                  <button
                    key={option.id}
                    onClick={() => onResolve({ choice: "switch-model", model: option.id })}
                    style={modelChip(d)}
                  >
                    <span style={optionLabel(d)}>{option.label}</span>
                    <span style={mutedCaption(d)}>{option.hint}</span>
                  </button>
                ))}
            </div>
          </div>

          <div>
            <div style={groupLabel(d)}>SWITCH THE HARNESS — A DIFFERENT PLAN, A DIFFERENT LIMIT</div>
            <div style={CHOICE_GRID}>
              {otherEngines(limit.engine).map((engineId) => (
                <button
                  key={engineId}
                  onClick={() => onResolve({ choice: "switch-engine", engine: engineId })}
                  style={chip(d)}
                >
                  {ENGINES[engineId].label}
                </button>
              ))}
              <button onClick={onOpenConnection} style={chip(d)}>
                <Plug size={ICON.sm} /> Connection & API key
              </button>
            </div>
          </div>

          <div>
            <div style={groupLabel(d)}>OR</div>
            <div style={CHOICE_GRID}>
              <button
                onClick={() => onResolve({ choice: "retry-now" })}
                style={chip(d, "accent")}
              >
                <RotateCcw size={ICON.sm} /> Retry now
              </button>
              <button onClick={onDismiss} style={chip(d)}>
                <Play size={ICON.sm} /> Keep waiting
              </button>
              {notification.access !== "granted" && notification.access !== "unsupported" && (
                <button onClick={notification.request} style={chip(d)}>
                  <BellRing size={ICON.sm} /> Enable notifications
                </button>
              )}
              <button onClick={onAbort} style={chip(d, "danger")}>
                <Square size={ICON.sm} /> Abort the run
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
