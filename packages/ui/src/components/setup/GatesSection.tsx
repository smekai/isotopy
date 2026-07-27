import type { CSSProperties } from "react";
import { DEMO_PIPELINES, agentForStage, flattenPipelineStages } from "@adhd/core";
import { RADIUS, SPACE } from "../../theme";
import type { Dir } from "../../theme";
import { accentBadge, mutedBody, optionLabel, sectionSubtitle, sectionTitle } from "./setup-styles";

const GATED_STAGES = Array.from(
  new Map(
    DEMO_PIPELINES.flatMap((pipeline) => flattenPipelineStages(pipeline))
      .filter((stage) => stage.gateAfter)
      .map((stage) => [stage.id, stage]),
  ).values(),
);

const GATE_STACK: CSSProperties = { display: "flex", flexDirection: "column", gap: SPACE.lg };

const GATE_CARD_HEADER: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: SPACE.xs,
};

function gateCard(d: Dir): CSSProperties {
  return { border: `1px solid ${d.border}`, borderRadius: RADIUS.xl, padding: `${SPACE.xl}px ${SPACE.xxl}px` };
}

export interface GatesSectionProps {
  d: Dir;
}

export function GatesSection({ d }: GatesSectionProps) {
  return (
    <div>
      <div style={sectionTitle(d)}>Human Gates</div>
      <div style={sectionSubtitle(d)}>Approval checkpoints that pause the pipeline until a human reviews.</div>
      <div style={GATE_STACK}>
        {GATED_STAGES.map((stage, i) => (
          <div key={stage.id} style={gateCard(d)}>
            <div style={GATE_CARD_HEADER}>
              <div style={optionLabel(d)}>After {stage.label} · G{i + 1}</div>
              <div style={accentBadge(d)}>ENABLED</div>
            </div>
            <div style={mutedBody(d)}>
              The {agentForStage(stage.id).profession}'s output needs your approval before the team continues.
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
