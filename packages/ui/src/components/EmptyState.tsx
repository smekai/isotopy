import { useState } from "react";
import { Flag, FolderOpen, Play } from "lucide-react";
import {
  DEMO_PIPELINES,
  ENGINES,
  HOME_PROJECT_ID,
  agentForStage,
  findPipeline,
  flattenPipelineStages,
  modelForEngine,
  pipelineUsesEngineById,
} from "@adhd/core";
import type { Project } from "@adhd/core";
import type { SettingsController } from "../hooks/useSettings";
import type { Dir } from "../theme";
import { FONT, ICON, MONO, MOTION, RADIUS, SANS, SPACE, WEIGHT, specColor } from "../theme";
import { PipelineDropdown } from "./PipelineDropdown";
import type { PipelineOption } from "./PipelineDropdown";

type SpecColor = ReturnType<typeof specColor>;

const AGENT_GLYPH_SIZE = 34;
const COMPOSER_MAX_WIDTH = 540;
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

function workspaceChipStyle(d: Dir): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: SPACE.md, alignSelf: "center",
    border: `1px solid ${d.border}`, borderRadius: RADIUS.xl, padding: `${SPACE.md}px ${SPACE.xl}px`,
    background: d.surface2, cursor: "pointer", maxWidth: "100%",
  };
}

const PAGE: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: SPACE.x4l,
  padding: `0 ${SPACE.x5l}px`,
};

function agentGlyph(spec: SpecColor, d: Dir): React.CSSProperties {
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

function agentCaption(d: Dir): React.CSSProperties {
  return {
    fontFamily: SANS,
    fontSize: FONT.xs,
    fontWeight: WEIGHT.semibold,
    color: d.textMid,
    whiteSpace: "nowrap",
  };
}

function agentConnector(d: Dir): React.CSSProperties {
  return {
    width: SPACE.xxl,
    height: RULE_THICKNESS,
    borderRadius: RADIUS.xs,
    background: d.runBorder,
    alignSelf: "flex-start",
    marginTop: SPACE.xxl,
  };
}

function headline(d: Dir): React.CSSProperties {
  return {
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.display,
    fontWeight: WEIGHT.heavy,
    letterSpacing: "-0.02em",
    marginBottom: SPACE.md,
  };
}

function subtitle(d: Dir): React.CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.xl };
}

function composerCard(d: Dir): React.CSSProperties {
  return {
    background: "#FFF",
    border: `1.5px solid ${d.border}`,
    borderRadius: RADIUS.xxl,
    display: "flex",
    alignItems: "center",
    gap: SPACE.xl,
    padding: `${SPACE.lg}px ${SPACE.lg}px ${SPACE.lg}px ${SPACE.xxxl}px`,
    boxShadow: d.elevation.md,
  };
}

function composerInput(d: Dir): React.CSSProperties {
  return {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.xl,
  };
}

function startButton(canStart: boolean, d: Dir): React.CSSProperties {
  return {
    background: canStart ? `linear-gradient(135deg, ${d.accent}, ${d.accentDark})` : d.surface2,
    color: canStart ? "#FFF" : d.textMuted,
    border: "none",
    borderRadius: RADIUS.xl,
    padding: `${SPACE.lg}px ${SPACE.xxxl}px`,
    fontFamily: SANS,
    fontSize: FONT.lg,
    fontWeight: WEIGHT.heavy,
    cursor: canStart ? "pointer" : "default",
    display: "flex",
    alignItems: "center",
    gap: SPACE.md,
    boxShadow: canStart ? `0 2px 10px ${d.accentMid}` : "none",
    transition: `all ${MOTION.base}`,
  };
}

function chipName(d: Dir): React.CSSProperties {
  return {
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
    whiteSpace: "nowrap",
  };
}

function chipPath(d: Dir): React.CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: MONO,
    fontSize: FONT.xs,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

function footerHint(d: Dir): React.CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.md };
}

export interface EmptyStateProps {
  d: Dir;
  projectId: string;
  project: Project | undefined;
  settings: SettingsController;
  onOpenProject: () => void;
  onStart: (task: string, pipelineId: string) => void;
  onPlanMilestone: (goal: string) => void;
  starting?: boolean;
  initialTask?: string | undefined;
}

export function EmptyState({
  d,
  projectId,
  project,
  settings,
  onOpenProject,
  onStart,
  onPlanMilestone,
  starting = false,
  initialTask = "",
}: EmptyStateProps) {
  const [input, setInput] = useState(initialTask);
  const { pipelineId } = settings.preferences;
  const scratch = projectId === HOME_PROJECT_ID;
  const canStart = input.trim().length > 0 && !starting;
  const usesEngine = pipelineUsesEngineById(pipelineId);
  const selectedPipeline = findPipeline(pipelineId);
  const stages = selectedPipeline ? flattenPipelineStages(selectedPipeline) : [];
  const engine = ENGINES[settings.preferences.engine];

  const pipelineOptions: PipelineOption[] = DEMO_PIPELINES.map((pipeline) => ({
    id: pipeline.id,
    label: pipeline.name,
    description: `${pipeline.description} — ${engine.label}`,
  }));

  const copy = PIPELINE_COPY[pipelineId] ?? DEFAULT_PIPELINE_COPY;

  function selectPipeline(id: string) {
    settings.update({ pipelineId: id });
  }

  function start() {
    if (canStart) {
      onStart(input.trim(), pipelineId);
    }
  }

  return (
    <div style={PAGE}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: SPACE.md,
          maxWidth: "100%",
          overflowX: "auto",
          paddingBottom: SPACE.sm,
        }}
      >
        {stages.map((stage, i) => {
          const agent = agentForStage(stage.id);
          const spec = specColor(stage.id);
          return (
            <div key={stage.id} style={{ display: "flex", alignItems: "center", gap: SPACE.md }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: SPACE.sm }}>
                <div style={agentGlyph(spec, d)}>{agent.glyph}</div>
                <div style={agentCaption(d)}>{agent.profession}</div>
              </div>
              {i < stages.length - 1 && <div style={agentConnector(d)} />}
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={headline(d)}>{copy.headline}</div>
        <div style={subtitle(d)}>{copy.subtitle}</div>
      </div>

      <PipelineDropdown d={d} options={pipelineOptions} value={pipelineId} onSelect={selectPipeline} />

      <div style={{ maxWidth: COMPOSER_MAX_WIDTH, width: "100%", display: "flex", flexDirection: "column", gap: SPACE.lg }}>
        <div style={composerCard(d)}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
            placeholder="Describe the task..."
            autoFocus
            style={composerInput(d)}
          />
          <button onClick={start} disabled={!canStart} style={startButton(canStart, d)}>
            <Play size={ICON.md} /> {starting ? "Starting..." : "Start run"}
          </button>
        </div>
        <button
          type="button"
          data-testid="plan-milestone"
          disabled={!canStart}
          onClick={() => canStart && onPlanMilestone(input.trim())}
          style={{
            alignSelf: "center",
            border: 0,
            background: "transparent",
            color: canStart ? d.accent : d.textMuted,
            fontFamily: SANS,
            fontSize: FONT.md,
            fontWeight: WEIGHT.semibold,
            cursor: canStart ? "pointer" : "default",
            display: "flex",
            gap: SPACE.sm,
            alignItems: "center",
          }}
        >
          <Flag size={ICON.sm} /> Plan this as a milestone first
        </button>

        {usesEngine && (
          <button onClick={onOpenProject} data-testid="workspace-chip" style={workspaceChipStyle(d)}>
            <FolderOpen size={ICON.md} style={{ color: d.textMuted, flexShrink: 0 }} />
            <span style={chipName(d)}>
              {scratch ? "Scratch workspace" : (project?.name ?? "Project")}
            </span>
            <span style={chipPath(d)}>
              {scratch ? "this run gets its own folder" : (project?.root ?? "")}
            </span>
          </button>
        )}
      </div>

      <div style={footerHint(d)}>
        {usesEngine
          ? <>Engine: {engine.label} · {modelForEngine(settings.preferences, engine.id)} — change in Setup</>
          : <>↵ to start · ⌘⇧V for voice</>}
      </div>
    </div>
  );
}
