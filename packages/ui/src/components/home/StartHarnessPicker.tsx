import type { CSSProperties } from "react";
import { ENGINES, MODEL_TIER_OPTIONS, defaultModelTierFor } from "@isotopy/core";
import type { EngineId, ModelTier } from "@isotopy/core";
import { FONT, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import type { Dir } from "../../theme";

const ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexWrap: "wrap",
  gap: SPACE.lg,
};

const FIELD: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: SPACE.sm,
};

function fieldLabel(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.md,
  };
}

function select(d: Dir): CSSProperties {
  return {
    background: d.surface2,
    color: d.textMid,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.lg,
    padding: `${SPACE.xs}px ${SPACE.md}px`,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
    cursor: "pointer",
  };
}

function tierHint(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.sm,
    width: "100%",
    textAlign: "center",
  };
}

export interface StartHarnessPickerProps {
  d: Dir;
  engine: EngineId;
  modelTier: ModelTier;
  onChange: (engine: EngineId, modelTier: ModelTier) => void;
}

export function StartHarnessPicker({
  d,
  engine,
  modelTier,
  onChange,
}: StartHarnessPickerProps) {
  const hint = MODEL_TIER_OPTIONS.find((option) => option.id === modelTier)?.hint;

  return (
    <div style={ROW}>
      <div style={FIELD}>
        <span style={fieldLabel(d)}>Harness</span>
        <select
          aria-label="Harness"
          data-testid="start-engine"
          value={engine}
          onChange={(event) => {
            const next = event.target.value as EngineId;
            onChange(next, defaultModelTierFor(next));
          }}
          style={select(d)}
        >
          {Object.values(ENGINES).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div style={FIELD}>
        <span style={fieldLabel(d)}>Model</span>
        <select
          aria-label="Model"
          data-testid="start-tier"
          value={modelTier}
          onChange={(event) => onChange(engine, event.target.value as ModelTier)}
          style={select(d)}
        >
          {MODEL_TIER_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {hint !== undefined && <div style={tierHint(d)}>{hint}</div>}
    </div>
  );
}
