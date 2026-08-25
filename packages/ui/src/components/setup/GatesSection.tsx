import type { CSSProperties } from "react";
import {
  DEMO_PIPELINES,
  agentForStage,
  flattenPipelineStages,
  gateEnabled,
  gateKey,
} from "@isotopy/core";
import type { PipelineDefinition, StageDefinition } from "@isotopy/core";
import { RADIUS, SPACE } from "../../theme";
import type { Dir } from "../../theme";
import type { SettingsController } from "../../hooks/useSettings";
import {
  accentBadge,
  fieldLabel,
  mutedBody,
  mutedCaption,
  optionCard,
  optionLabel,
  sectionSubtitle,
  sectionTitle,
} from "./setup-styles";

const CONFIGURABLE_PIPELINES = DEMO_PIPELINES.filter((pipeline) => !pipeline.internal);

const GATE_STACK: CSSProperties = { display: "flex", flexDirection: "column", gap: SPACE.lg };

const PIPELINE_STACK: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xxl,
};

const GATE_CARD_HEADER: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: SPACE.xs,
};

function mutedBadge(d: Dir): CSSProperties {
  return {
    color: d.textMid,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.sm,
    padding: `2px ${SPACE.sm}px`,
    fontSize: 10,
    letterSpacing: 0.6,
  };
}

export interface GatesSectionProps {
  d: Dir;
  settings: SettingsController;
}

export function GatesSection({ d, settings }: GatesSectionProps) {
  const { gates, builtInSchedules } = settings.preferences;

  return (
    <div>
      <div style={sectionTitle(d)}>Unattended work</div>
      <div style={sectionSubtitle(d)}>
        Whether this project may run the schedules that ship with the product. Off by default; each
        built-in still has its own switch, and both must be on before anything runs.
      </div>
      <button
        data-testid="built-in-schedules-toggle"
        aria-pressed={builtInSchedules}
        onClick={() => settings.update({ builtInSchedules: !builtInSchedules })}
        style={optionCard(builtInSchedules, d)}
      >
        <div style={{ flex: 1 }}>
          <div style={GATE_CARD_HEADER}>
            <div style={optionLabel(d)}>Allow built-in schedules</div>
            <div style={builtInSchedules ? accentBadge(d) : mutedBadge(d)}>
              {builtInSchedules ? "ALLOWED" : "OFF"}
            </div>
          </div>
          <div style={builtInSchedules ? mutedBody(d) : mutedCaption(d)}>
            The board poller starts work on its own when nothing is running. Leave this off unless
            you want the team acting without you.
          </div>
        </div>
      </button>

      <div style={{ height: SPACE.xxl }} />

      <div style={sectionTitle(d)}>Human Gates</div>
      <div style={sectionSubtitle(d)}>
        Approval checkpoints that pause the pipeline until a human reviews. A gate can go after any
        stage; a composed team decides its own.
      </div>
      <div style={PIPELINE_STACK}>
        {CONFIGURABLE_PIPELINES.map((pipeline) => (
          <div key={pipeline.id}>
            <div style={fieldLabel(d)}>{pipeline.id}</div>
            <div style={GATE_STACK}>
              {flattenPipelineStages(pipeline).map((stage) => (
                <GateCard
                  key={gateKey(pipeline.id, stage.id)}
                  d={d}
                  pipeline={pipeline}
                  stage={stage}
                  enabled={gateEnabled(pipeline.id, stage, gates)}
                  onToggle={(next) =>
                    settings.update({ gates: { [gateKey(pipeline.id, stage.id)]: next } })
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface GateCardProps {
  d: Dir;
  pipeline: PipelineDefinition;
  stage: StageDefinition;
  enabled: boolean;
  onToggle: (next: boolean) => void;
}

function GateCard({ d, pipeline, stage, enabled, onToggle }: GateCardProps) {
  return (
    <button
      data-testid={`gate-toggle-${gateKey(pipeline.id, stage.id)}`}
      aria-pressed={enabled}
      onClick={() => onToggle(!enabled)}
      style={optionCard(enabled, d)}
    >
      <div style={{ flex: 1 }}>
        <div style={GATE_CARD_HEADER}>
          <div style={optionLabel(d)}>After {stage.label}</div>
          <div style={enabled ? accentBadge(d) : mutedBadge(d)}>
            {enabled ? "ENABLED" : "OFF"}
          </div>
        </div>
        <div style={enabled ? mutedBody(d) : mutedCaption(d)}>
          The {agentForStage(stage).profession}'s output needs your approval before the team
          continues.
        </div>
      </div>
    </button>
  );
}
