import { useState } from "react";
import type { CSSProperties } from "react";
import type { EngineId, ModelTier } from "@adhd/core";
import { ENGINES, PERMISSION_MODES, modelOverrideFor } from "@adhd/core";
import type { SettingsController } from "../../hooks/useSettings";
import { SPACE } from "../../theme";
import type { Dir } from "../../theme";
import { EngineConnection } from "./EngineConnection";
import { EngineModelPicker } from "./EngineModelPicker";
import { EngineStatusCard } from "./EngineStatusCard";
import {
  FLEX_FILL,
  OPTION_STACK,
  accentBadge,
  fieldLabel,
  mutedCaption,
  optionCard,
  optionLabel,
  radioDot,
  sectionSubtitle,
  sectionTitle,
} from "./setup-styles";

const ENGINE_STACK: CSSProperties = { ...OPTION_STACK, marginBottom: SPACE.xxxl };

function engineCard(selected: boolean, available: boolean, d: Dir): CSSProperties {
  return {
    ...optionCard(selected, d),
    cursor: available ? "pointer" : "default",
    opacity: available ? 1 : 0.45,
  };
}

export interface HarnessSectionProps {
  d: Dir;
  projectName: string;
  settings: SettingsController;
}

export function HarnessSection({ d, projectName, settings }: HarnessSectionProps) {
  const { preferences } = settings;
  const harness = preferences.engine;
  const permissionMode = preferences.permissionMode;
  const [refreshKey, setRefreshKey] = useState(0);

  function refreshEngine() {
    setRefreshKey((n) => n + 1);
  }

  function selectEngine(engineId: EngineId) {
    settings.update({ engine: engineId });
  }

  function selectTier(tier: ModelTier) {
    settings.update({ modelTier: tier, engineModels: { [harness]: null } });
  }

  function selectModelOverride(modelId: string) {
    settings.update({ engineModels: { [harness]: modelId } });
  }

  return (
    <div>
      <div style={sectionTitle(d)}>AI Harness</div>
      <div style={sectionSubtitle(d)}>The engine used by the Developer in single-agent runs.</div>
      <div style={ENGINE_STACK}>
        {Object.values(ENGINES).map((opt) => {
          const sel = harness === opt.id;
          return (
            <button key={opt.id}
              onClick={() => opt.available && selectEngine(opt.id)}
              disabled={!opt.available}
              style={engineCard(sel, opt.available, d)}>
              <div style={radioDot(sel, d)} />
              <div style={FLEX_FILL}>
                <div style={optionLabel(d)}>{opt.label}</div>
                <div style={mutedCaption(d)}>{opt.description}</div>
              </div>
              {!opt.available && <div style={accentBadge(d)}>SOON</div>}
            </button>
          );
        })}
      </div>
      <EngineStatusCard d={d} engine={harness} refreshKey={refreshKey} onRefresh={refreshEngine} />
      <EngineConnection d={d} projectName={projectName} engine={harness} settings={settings} />
      <EngineModelPicker d={d}
        engine={harness}
        tier={preferences.modelTier}
        modelOverride={modelOverrideFor(preferences, harness)}
        refreshKey={refreshKey}
        onSelectTier={selectTier}
        onSelectModel={selectModelOverride} />
      <div style={fieldLabel(d)}>Permissions</div>
      <div style={OPTION_STACK}>
        {PERMISSION_MODES.map((opt) => {
          const sel = permissionMode === opt.id;
          return (
            <button key={opt.id}
              onClick={() => settings.update({ permissionMode: opt.id })}
              style={optionCard(sel, d)}>
              <div style={radioDot(sel, d)} />
              <div>
                <div style={optionLabel(d)}>
                  {opt.recommended ? `${opt.label} (recommended)` : opt.label}
                </div>
                <div style={mutedCaption(d)}>{opt.description}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
