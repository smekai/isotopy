import type { CSSProperties } from "react";
import type { EngineId } from "@isotopy/core";
import { ENGINES } from "@isotopy/core";
import type { SettingsController } from "../../hooks/useSettings";
import { SPACE } from "../../theme";
import type { Dir } from "../../theme";
import { EngineConnection } from "./EngineConnection";
import { EngineStatusCard } from "./EngineStatusCard";
import {
  FLEX_FILL,
  OPTION_STACK,
  fieldLabel,
  mutedCaption,
  optionCard,
  optionLabel,
  radioDot,
} from "./setup-styles";

const SECONDARY_STACK: CSSProperties = { ...OPTION_STACK, marginBottom: SPACE.xxxl };

export interface SecondaryEngineChoiceProps {
  d: Dir;
  projectName: string;
  settings: SettingsController;
  refreshKey: number;
  onRefresh: () => void;
}

interface SecondaryOption {
  id?: EngineId;
  label: string;
  description: string;
}

function secondaryOptions(primary: EngineId): SecondaryOption[] {
  return [
    {
      label: "Review on the primary",
      description: `Reviewers run on ${ENGINES[primary].label} too, without the Developer's handoff.`,
    },
    ...Object.values(ENGINES)
      .filter((engine) => engine.available && engine.id !== primary)
      .map((engine) => ({
        id: engine.id,
        label: `Review on ${engine.label}`,
        description: "Code is judged by a different model from the one that wrote it.",
      })),
  ];
}

export function SecondaryEngineChoice({
  d,
  projectName,
  settings,
  refreshKey,
  onRefresh,
}: SecondaryEngineChoiceProps) {
  const { primaryEngine, secondaryEngine } = settings.preferences;
  return (
    <div>
      <div style={fieldLabel(d)}>Second engine for reviews</div>
      <div style={SECONDARY_STACK}>
        {secondaryOptions(primaryEngine).map((option) => {
          const selected = secondaryEngine === option.id;
          return (
            <button key={option.id ?? "none"}
              onClick={() => settings.update({ secondaryEngine: option.id ?? null })}
              style={optionCard(selected, d)}>
              <div style={radioDot(selected, d)} />
              <div style={FLEX_FILL}>
                <div style={optionLabel(d)}>{option.label}</div>
                <div style={mutedCaption(d)}>{option.description}</div>
              </div>
            </button>
          );
        })}
      </div>
      {secondaryEngine !== undefined && (
        <>
          <EngineStatusCard d={d} engine={secondaryEngine} refreshKey={refreshKey} onRefresh={onRefresh} />
          <EngineConnection d={d} projectName={projectName} engine={secondaryEngine} settings={settings} />
        </>
      )}
    </div>
  );
}
