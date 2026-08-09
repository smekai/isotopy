import { useState } from "react";
import type { CSSProperties } from "react";
import {
  MODEL_TIER_OPTIONS,
  isVerifiedModel,
  resolveTier,
  rosterAccepts,
  rosterOrigins,
} from "@adhd/core";
import type { EngineId, EngineModelOption, ModelTier, SelectableModelOrigin } from "@adhd/core";
import { useEngineRoster } from "../../hooks/useEngineRoster";
import { FONT, GOLD, MONO, RADIUS, SANS, SPACE } from "../../theme";
import type { Dir } from "../../theme";
import {
  ERROR_BORDER,
  ERROR_RED,
  ERROR_TINT,
  FLEX_FILL,
  OPTION_STACK,
  WHITE,
  fieldLabel,
  mutedCaption,
  optionCard,
  optionLabel,
  radioDot,
} from "./setup-styles";

// "static" is omitted: every roster ends with the bundled list, and the
// unverified optgroup right above already names it with its date.
const ORIGIN_LABEL: Partial<Record<SelectableModelOrigin, string>> = {
  live: "from the CLI",
  config: "from your CLI config",
};

function modelSelect(d: Dir): CSSProperties {
  return {
    width: "100%",
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.lg,
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
    fontFamily: MONO,
    fontSize: FONT.md,
    color: d.text,
    background: WHITE,
    outline: "none",
    marginBottom: SPACE.sm,
  };
}

function disclosureToggle(d: Dir): CSSProperties {
  return {
    border: "none",
    background: "transparent",
    padding: 0,
    color: d.accent,
    fontFamily: SANS,
    fontSize: FONT.sm,
    cursor: "pointer",
    marginTop: SPACE.md,
  };
}

function resolutionLine(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: MONO,
    fontSize: FONT.sm,
    marginTop: SPACE.md,
  };
}

const WARNING_BLOCK: CSSProperties = {
  border: `1px solid ${ERROR_BORDER}`,
  background: ERROR_TINT,
  borderRadius: RADIUS.lg,
  padding: `${SPACE.md}px ${SPACE.xl}px`,
  color: ERROR_RED,
  fontFamily: SANS,
  fontSize: FONT.sm,
  marginTop: SPACE.md,
};

const DEGRADED_NOTE: CSSProperties = {
  color: GOLD,
  fontFamily: SANS,
  fontSize: FONT.sm,
  marginTop: SPACE.md,
};

const SECTION_END: CSSProperties = { marginBottom: SPACE.xxxl };

export interface EngineModelPickerProps {
  d: Dir;
  engine: EngineId;
  tier: ModelTier;
  modelOverride?: string;
  refreshKey: number;
  onSelectTier: (tier: ModelTier) => void;
  onSelectModel: (modelId: string) => void;
}

export function EngineModelPicker({
  d,
  engine,
  tier,
  modelOverride,
  refreshKey,
  onSelectTier,
  onSelectModel,
}: EngineModelPickerProps) {
  const { roster, unavailable } = useEngineRoster(engine, refreshKey);
  const [showRoster, setShowRoster] = useState(modelOverride !== undefined);

  const resolved = resolveTier(engine, tier, roster);
  const overridden = modelOverride !== undefined;
  const retired = overridden && !rosterAccepts(roster, modelOverride);
  const verified = roster.options.filter(isVerifiedModel);
  const unverified = roster.options.filter((option) => !isVerifiedModel(option));

  return (
    <>
      <div style={fieldLabel(d)}>Model</div>
      <div style={OPTION_STACK}>
        {MODEL_TIER_OPTIONS.map((option) => {
          const selected = !overridden && option.id === tier;
          return (
            <button key={option.id} onClick={() => onSelectTier(option.id)} style={optionCard(selected, d)}>
              <div style={radioDot(selected, d)} />
              <div style={FLEX_FILL}>
                <div style={optionLabel(d)}>{option.label}</div>
                <div style={mutedCaption(d)}>{option.hint}</div>
              </div>
            </button>
          );
        })}
      </div>

      {!overridden && (
        <div style={resolutionLine(d)}>
          {unavailable
            ? "Model list unavailable — is the server running?"
            : `→ ${resolved.model || "the harness's own default"}${resolved.effort ? ` · effort ${resolved.effort}` : ""}`}
        </div>
      )}
      {!overridden && resolved.degraded && (
        <div style={DEGRADED_NOTE}>
          This harness offers nothing matching that preset right now, so the run falls back to
          its own default.
        </div>
      )}

      <button onClick={() => setShowRoster((on) => !on)} style={disclosureToggle(d)}>
        {showRoster ? "Hide exact models" : "Pick an exact model instead…"}
      </button>

      {showRoster && (
        <>
          <select data-testid="model-select"
            value={modelOverride ?? ""}
            onChange={(e) => onSelectModel(e.target.value)}
            style={{ ...modelSelect(d), marginTop: SPACE.md }}>
            {verified.length > 0 && (
              <optgroup label="Verified for your setup">
                {verified.map((option) => (
                  <option key={option.id} value={option.id}>{optionText(option)}</option>
                ))}
              </optgroup>
            )}
            {unverified.length > 0 && (
              <optgroup label={`Unverified — built-in list, checked ${roster.staticCheckedOn}`}>
                {unverified.map((option) => (
                  <option key={option.id} value={option.id}>{optionText(option)}</option>
                ))}
              </optgroup>
            )}
            {retired && <option value={modelOverride} disabled>{modelOverride} — no longer offered</option>}
          </select>
          <div style={mutedCaption(d)}>
            {rosterOrigins(roster.options).flatMap((origin) => ORIGIN_LABEL[origin] ?? []).join(" · ")}
            {roster.note ? ` · ${roster.note}` : ""}
          </div>
          {retired && (
            <div style={WARNING_BLOCK}>
              “{modelOverride}” is no longer offered for this harness — a run started with it
              will be refused. Pick another, or go back to a preset above.
            </div>
          )}
        </>
      )}
      <div style={SECTION_END} />
    </>
  );
}

function optionText(option: EngineModelOption): string {
  return option.hint ? `${option.label} — ${option.hint}` : option.label;
}
