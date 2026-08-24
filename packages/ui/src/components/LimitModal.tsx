import { useMemo } from "react";
import type { CSSProperties } from "react";
import { BellRing, Play, Plug, RotateCcw, Square, X } from "lucide-react";
import { DEFAULT_ENGINE_ID, ENGINES, MODEL_TIER_OPTIONS, resolveTier } from "@isotopy/core";
import type {
  EngineId,
  EngineModelRoster,
  LimitResolution,
  ModelTier,
  ModelTierDefinition,
  RunLimit,
  RunState,
} from "@isotopy/core";
import { Dialog } from "./Dialog";
import { useEngineRoster } from "../hooks/useEngineRoster";
import { useLimitNotification } from "../hooks/useLimitNotification";
import { useNow } from "../hooks/useNow";
import { formatCountdown, formatResetAt, remainingMs } from "../limit";
import { LIMIT_COPY } from "../limit-copy";
import {
  FONT,
  ICON,
  LIMIT_CYAN,
  LIMIT_CYAN_SOFT,
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
const MODEL_CHIP_WIDTH = 140;

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
    background: LIMIT_CYAN_SOFT,
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
    background: tone === "accent" ? LIMIT_CYAN_SOFT : "transparent",
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

const PRICED_TIERS = MODEL_TIER_OPTIONS.filter((option) => option.id !== "auto");

interface TierEscape {
  tier: ModelTierDefinition;
  model: string;
}

function cheaperTiers(
  engineId: EngineId,
  currentModel: string,
  currentTier: ModelTier | undefined,
  roster: EngineModelRoster,
): TierEscape[] {
  const resolved = PRICED_TIERS.map((tier) => ({ tier, ...resolveTier(engineId, tier.id, roster) }));
  const current = currentTier === undefined
    ? resolved.findIndex((candidate) => candidate.model === currentModel)
    : currentTier === "auto"
      ? 0
      : PRICED_TIERS.findIndex((tier) => tier.id === currentTier);
  const candidates = resolved.slice(0, current === -1 ? resolved.length : current);
  if (currentTier !== undefined) {
    return candidates.map(({ tier, model }) => ({ tier, model }));
  }
  const seen = new Set<string>();
  return candidates.flatMap(
    ({ tier, model, effort }) => {
      const rung = `${model}·${effort ?? ""}`;
      if (model === currentModel || seen.has(rung)) {
        return [];
      }
      seen.add(rung);
      return [{ tier, model }];
    },
  );
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
  const engineId = limit.engine ?? DEFAULT_ENGINE_ID;
  const { roster } = useEngineRoster(engineId);
  const blockedStage = run.stages.find((stage) => stage.id === limit.stageId);
  const currentTier =
    run.model === undefined ? (blockedStage?.modelTier ?? run.modelTier) : undefined;
  // The countdown re-renders this modal every second for the whole reset window.
  const escapes = useMemo(
    () => cheaperTiers(engineId, limit.model ?? "", currentTier, roster),
    [currentTier, engineId, limit.model, roster],
  );
  const notification = useLimitNotification(limit);
  const now = useNow(limit.resetAt !== undefined);
  const remaining = remainingMs(limit, now);
  const resetLabel = formatResetAt(limit.resetAt);
  const stageLabel = blockedStage?.label ?? limit.stageId;

  return (
    <Dialog
      label={LIMIT_COPY.headline(limit)}
      testId="limit-modal"
      panelStyle={dialog(d)}
      backdropStyle={BACKDROP}
      onDismiss={onDismiss}
    >
        <div style={header(d)}>
          <div>
            <div style={title(d)}>{LIMIT_COPY.headline(limit)}</div>
            <div style={mutedCaption(d)}>
              {LIMIT_COPY.subtitle(stageLabel)}
            </div>
          </div>
          <button onClick={onDismiss} aria-label={LIMIT_COPY.keepWaiting} style={closeButton(d)}>
            <X size={ICON.md} />
          </button>
        </div>

        <div style={BODY}>
          <div>
            {remaining === undefined ? (
              <div style={mutedCaption(d)}>{LIMIT_COPY.noResetTime}</div>
            ) : (
              <div style={ROW}>
                <span data-testid="limit-countdown" style={countdown()}>
                  {formatCountdown(remaining)}
                </span>
                <span style={mutedCaption(d)}>{LIMIT_COPY.countdownSuffix(resetLabel ?? "")}</span>
              </div>
            )}
          </div>

          <div style={rawLine(d)}>{limit.raw}</div>

          <div>
            <div style={groupLabel(d)}>{LIMIT_COPY.switchModelHeading}</div>
            <div style={CHOICE_GRID}>
              {escapes.map(({ tier, model }) => (
                <button
                  key={tier.id}
                  onClick={() => onResolve({ choice: "switch-tier", tier: tier.id })}
                  style={modelChip(d)}
                >
                  <span style={optionLabel(d)}>{tier.label}</span>
                  <span style={mutedCaption(d)}>{model || "the harness's own default"}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={groupLabel(d)}>{LIMIT_COPY.switchHarnessHeading}</div>
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
                <Plug size={ICON.sm} /> {LIMIT_COPY.connection}
              </button>
            </div>
          </div>

          <div>
            <div style={groupLabel(d)}>{LIMIT_COPY.otherHeading}</div>
            <div style={CHOICE_GRID}>
              <button
                onClick={() => onResolve({ choice: "retry-now" })}
                style={chip(d, "accent")}
              >
                <RotateCcw size={ICON.sm} /> {LIMIT_COPY.retryNow}
              </button>
              <button onClick={onDismiss} style={chip(d)}>
                <Play size={ICON.sm} /> {LIMIT_COPY.keepWaiting}
              </button>
              {notification.access !== "granted" && notification.access !== "unsupported" && (
                <button onClick={notification.request} style={chip(d)}>
                  <BellRing size={ICON.sm} /> {LIMIT_COPY.enableNotifications}
                </button>
              )}
              <button onClick={onAbort} style={chip(d, "danger")}>
                <Square size={ICON.sm} /> {LIMIT_COPY.abort}
              </button>
            </div>
          </div>
        </div>
    </Dialog>
  );
}
