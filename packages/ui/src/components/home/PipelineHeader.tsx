import type { CSSProperties } from "react";
import {
  DEMO_PIPELINES,
  ENGINES,
  agentForStage,
  findPipeline,
  flattenPipelineStages,
} from "@adhd/core";
import type { EngineId } from "@adhd/core";
import type { Dir } from "../../theme";
import { FONT, RADIUS, SANS, SPACE, WEIGHT, specColor } from "../../theme";
import { PipelineDropdown } from "../PipelineDropdown";
import type { PipelineOption } from "../PipelineDropdown";
import { headline, subtitle } from "./home-styles";

type SpecColor = ReturnType<typeof specColor>;

const AGENT_GLYPH_SIZE = 34;
const RULE_THICKNESS = 2;

interface PipelineCopy {
  headline: string;
  subtitle: string;
}

const DEFAULT_PIPELINE_COPY: PipelineCopy = {
  headline: "What should the team build?",
  subtitle: "Describe a feature, bug fix, or task. Your AI team will handle the rest.",
};

const PIPELINE_COPY: Record<string, PipelineCopy> = {
  "full-delivery": {
    headline: "What should the delivery team build?",
    subtitle:
      "Approved scope flows through design, implementation, independent review, QA, " +
      "release preparation, preview deployment, and closeout.",
  },
  solo: {
    headline: "What should the Agent build?",
    subtitle: "One box does everything, and asks you if something is genuinely unclear.",
  },
  "pm-dev-test": {
    headline: "What do you want to build?",
    subtitle:
      "A Product Manager works out what to build and recommends an approach — " +
      "you approve it, then a Developer builds it and a QA Engineer verifies it.",
  },
};

const GLYPH_STRIP: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: SPACE.md,
  maxWidth: "100%",
  overflowX: "auto",
  paddingBottom: SPACE.sm,
};

function agentGlyph(spec: SpecColor, d: Dir): CSSProperties {
  return {
    width: AGENT_GLYPH_SIZE,
    height: AGENT_GLYPH_SIZE,
    borderRadius: RADIUS.lg,
    border: `1.5px solid ${spec.main}`,
    background: spec.soft,
    boxShadow: d.elevation.sm,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: FONT.xl,
    color: spec.main,
  };
}

function agentCaption(d: Dir): CSSProperties {
  return {
    fontFamily: SANS,
    fontSize: FONT.xs,
    fontWeight: WEIGHT.semibold,
    color: d.textMid,
    whiteSpace: "nowrap",
  };
}

function agentConnector(d: Dir): CSSProperties {
  return {
    width: SPACE.xxl,
    height: RULE_THICKNESS,
    borderRadius: RADIUS.xs,
    background: d.runBorder,
    alignSelf: "flex-start",
    marginTop: SPACE.xxl,
  };
}

function pipelineOptions(engineId: EngineId): PipelineOption[] {
  const engine = ENGINES[engineId];
  return DEMO_PIPELINES.filter((pipeline) => pipeline.internal !== true).map(
    (pipeline) => ({
      id: pipeline.id,
      label: pipeline.name,
      description: `${pipeline.description} — ${engine.label}`,
    }),
  );
}

export interface PipelineHeaderProps {
  d: Dir;
  pipelineId: string;
  engineId: EngineId;
  onSelectPipeline: (pipelineId: string) => void;
}

export function PipelineHeader({
  d,
  pipelineId,
  engineId,
  onSelectPipeline,
}: PipelineHeaderProps) {
  const selected = findPipeline(pipelineId);
  const stages = selected ? flattenPipelineStages(selected) : [];
  const copy = PIPELINE_COPY[pipelineId] ?? DEFAULT_PIPELINE_COPY;

  return (
    <>
      <div style={GLYPH_STRIP}>
        {stages.map((stage, index) => {
          const agent = agentForStage(stage.id);
          const spec = specColor(stage.id);
          return (
            <div
              key={stage.id}
              style={{ display: "flex", alignItems: "center", gap: SPACE.md }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: SPACE.sm,
                }}
              >
                <div style={agentGlyph(spec, d)}>{agent.glyph}</div>
                <div style={agentCaption(d)}>{agent.profession}</div>
              </div>
              {index < stages.length - 1 && <div style={agentConnector(d)} />}
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={headline(d)}>{copy.headline}</div>
        <div style={subtitle(d)}>{copy.subtitle}</div>
      </div>

      <PipelineDropdown
        d={d}
        options={pipelineOptions(engineId)}
        value={pipelineId}
        onSelect={onSelectPipeline}
      />
    </>
  );
}
