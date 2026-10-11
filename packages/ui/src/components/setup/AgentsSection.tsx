import type { CSSProperties } from "react";
import type { AgentOrigin, CatalogAgent, CatalogStepTask } from "@isotopy/core";
import type { AgentCatalogController } from "../../hooks/useAgentCatalog";
import { FONT, MONO, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import type { Dir } from "../../theme";
import {
  ERROR_RED,
  OPTION_STACK,
  accentBadge,
  mutedCaption,
  optionLabel,
  sectionSubtitle,
  sectionTitle,
} from "./setup-styles";

const ORIGIN_LABELS: Record<AgentOrigin, string> = {
  bundled: "BUILT IN",
  project: "PROJECT",
};

const GLYPH_SIZE = 28;

const SECTION_GAP: CSSProperties = { height: SPACE.xxl };

const CARD_HEADER: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: SPACE.md,
  marginBottom: SPACE.xs,
};

const CARD_TEXT: CSSProperties = { flex: 1, minWidth: 0 };

const ERROR_LINE: CSSProperties = {
  color: ERROR_RED,
  fontFamily: SANS,
  fontSize: FONT.sm,
  marginBottom: SPACE.lg,
};

function entryCard(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "flex-start",
    gap: SPACE.xl,
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.xl,
  };
}

function glyphTile(d: Dir): CSSProperties {
  return {
    width: GLYPH_SIZE,
    height: GLYPH_SIZE,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    background: d.accentSoft,
    color: d.accent,
    fontSize: FONT.lg,
  };
}

function idLabel(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: MONO, fontSize: FONT.xs, fontWeight: WEIGHT.medium };
}

export interface AgentsSectionProps {
  d: Dir;
  catalog: AgentCatalogController;
}

export function AgentsSection({ d, catalog }: AgentsSectionProps) {
  return (
    <div>
      <div style={sectionTitle(d)}>Agents</div>
      <div style={sectionSubtitle(d)}>
        Who the Orchestrator can put on a team. A project brings its own as files under
        .isotopy/agents/ and .isotopy/steps/, and one with a built-in id replaces it.
      </div>
      {catalog.error && <div style={ERROR_LINE}>{catalog.error}</div>}
      <div style={OPTION_STACK}>
        {catalog.agents.map((agent) => (
          <AgentCard key={agent.id} d={d} agent={agent} />
        ))}
      </div>

      <div style={SECTION_GAP} />

      <div style={sectionTitle(d)}>Steps</div>
      <div style={sectionSubtitle(d)}>The assignments a team member can be given.</div>
      <div style={OPTION_STACK}>
        {catalog.steps.map((step) => (
          <StepCard key={step.id} d={d} step={step} />
        ))}
      </div>
    </div>
  );
}

interface AgentCardProps {
  d: Dir;
  agent: CatalogAgent;
}

function AgentCard({ d, agent }: AgentCardProps) {
  return (
    <div data-testid={`agent-${agent.id}`} style={entryCard(d)}>
      <div style={glyphTile(d)} aria-hidden="true">
        {agent.glyph}
      </div>
      <div style={CARD_TEXT}>
        <div style={CARD_HEADER}>
          <div style={optionLabel(d)}>{agent.title}</div>
          <div style={idLabel(d)}>{agent.id}</div>
          <div style={accentBadge(d)}>{ORIGIN_LABELS[agent.origin]}</div>
        </div>
        <div style={mutedCaption(d)}>{agent.description}</div>
      </div>
    </div>
  );
}

interface StepCardProps {
  d: Dir;
  step: CatalogStepTask;
}

function StepCard({ d, step }: StepCardProps) {
  return (
    <div data-testid={`step-${step.id}`} style={entryCard(d)}>
      <div style={CARD_TEXT}>
        <div style={CARD_HEADER}>
          <div style={idLabel(d)}>{step.id}</div>
          <div style={accentBadge(d)}>{ORIGIN_LABELS[step.origin]}</div>
        </div>
        <div style={mutedCaption(d)}>{step.description}</div>
      </div>
    </div>
  );
}
