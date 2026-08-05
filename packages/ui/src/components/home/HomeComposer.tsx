import { useState } from "react";
import type { CSSProperties } from "react";
import { Flag, FolderOpen, Play, Sparkles, SlidersHorizontal } from "lucide-react";
import {
  ENGINES,
  HOME_PROJECT_ID,
  modelForEngine,
  pipelineUsesEngineById,
} from "@adhd/core";
import type { Project } from "@adhd/core";
import type { SettingsController } from "../../hooks/useSettings";
import type { Dir } from "../../theme";
import { FONT, ICON, MONO, MOTION, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import { PipelineHeader } from "./PipelineHeader";
import { PAGE, headline, linkButton, subtitle } from "./home-styles";

const COMPOSER_MAX_WIDTH = 540;

type ComposerMode = "orchestrator" | "pipeline";

const ORCHESTRATOR_HEADLINE = "What are we building?";
const ORCHESTRATOR_SUBTITLE =
  "Describe the goal. The Orchestrator talks it through with you, composes the " +
  "right team from the persona catalog, and decides what runs next.";

function workspaceChipStyle(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.md,
    alignSelf: "center",
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.xl,
    padding: `${SPACE.md}px ${SPACE.xl}px`,
    background: d.surface2,
    cursor: "pointer",
    maxWidth: "100%",
  };
}

function composerCard(d: Dir): CSSProperties {
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

function composerInput(d: Dir): CSSProperties {
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

function startButton(armed: boolean, d: Dir): CSSProperties {
  return {
    background: armed
      ? `linear-gradient(135deg, ${d.accent}, ${d.accentDark})`
      : d.surface2,
    color: armed ? "#FFF" : d.textMuted,
    border: "none",
    borderRadius: RADIUS.xl,
    padding: `${SPACE.lg}px ${SPACE.xxxl}px`,
    fontFamily: SANS,
    fontSize: FONT.lg,
    fontWeight: WEIGHT.heavy,
    cursor: armed ? "pointer" : "default",
    display: "flex",
    alignItems: "center",
    gap: SPACE.md,
    boxShadow: armed ? `0 2px 10px ${d.accentMid}` : "none",
    transition: `all ${MOTION.base}`,
    whiteSpace: "nowrap",
  };
}

function chipName(d: Dir): CSSProperties {
  return {
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
    whiteSpace: "nowrap",
  };
}

function chipPath(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: MONO,
    fontSize: FONT.xs,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}

function footerHint(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.md };
}

const COMPOSER_COLUMN: CSSProperties = {
  maxWidth: COMPOSER_MAX_WIDTH,
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: SPACE.lg,
};

export interface HomeComposerProps {
  d: Dir;
  projectId: string;
  project?: Project;
  settings: SettingsController;
  starting?: boolean;
  initialTask?: string;
  onOpenProject: () => void;
  onStartOrchestrator: (goal: string) => void;
  onStart: (task: string, pipelineId: string) => void;
  onPlanMilestone: (goal: string) => void;
}

export function HomeComposer({
  d,
  projectId,
  project,
  settings,
  starting = false,
  initialTask = "",
  onOpenProject,
  onStartOrchestrator,
  onStart,
  onPlanMilestone,
}: HomeComposerProps) {
  const [mode, setMode] = useState<ComposerMode>("orchestrator");
  const [input, setInput] = useState(initialTask);
  const { pipelineId } = settings.preferences;
  const orchestrating = mode === "orchestrator";
  const scratch = projectId === HOME_PROJECT_ID;
  const armed = input.trim().length > 0 && !starting;
  const usesEngine = orchestrating || pipelineUsesEngineById(pipelineId);
  const engine = ENGINES[settings.preferences.engine];

  function start() {
    if (!armed) {
      return;
    }
    if (orchestrating) {
      onStartOrchestrator(input.trim());
    } else {
      onStart(input.trim(), pipelineId);
    }
  }

  return (
    <div style={PAGE}>
      {orchestrating ? (
        <div style={{ textAlign: "center" }}>
          <div style={headline(d)}>{ORCHESTRATOR_HEADLINE}</div>
          <div style={subtitle(d)}>{ORCHESTRATOR_SUBTITLE}</div>
        </div>
      ) : (
        <PipelineHeader
          d={d}
          pipelineId={pipelineId}
          engineId={settings.preferences.engine}
          onSelectPipeline={(id) => settings.update({ pipelineId: id })}
        />
      )}

      <div style={COMPOSER_COLUMN}>
        <div style={composerCard(d)}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && start()}
            placeholder={orchestrating ? "Describe the goal..." : "Describe the task..."}
            autoFocus
            style={composerInput(d)}
          />
          <button onClick={start} disabled={!armed} style={startButton(armed, d)}>
            {orchestrating ? <Sparkles size={ICON.md} /> : <Play size={ICON.md} />}
            {starting
              ? "Starting..."
              : orchestrating
                ? "Start Orchestrator"
                : "Start run"}
          </button>
        </div>

        {orchestrating ? (
          <button
            type="button"
            data-testid="choose-pipeline"
            onClick={() => setMode("pipeline")}
            style={linkButton(true, d)}
          >
            <SlidersHorizontal size={ICON.sm} /> Run a fixed pipeline instead
          </button>
        ) : (
          <>
            <button
              type="button"
              data-testid="plan-milestone"
              disabled={!armed}
              onClick={() => armed && onPlanMilestone(input.trim())}
              style={linkButton(armed, d)}
            >
              <Flag size={ICON.sm} /> Plan this as a milestone first
            </button>
            <button
              type="button"
              data-testid="choose-orchestrator"
              onClick={() => setMode("orchestrator")}
              style={linkButton(true, d)}
            >
              <Sparkles size={ICON.sm} /> Let the Orchestrator compose the team
            </button>
          </>
        )}

        {usesEngine && (
          <button
            onClick={onOpenProject}
            data-testid="workspace-chip"
            style={workspaceChipStyle(d)}
          >
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
        {usesEngine ? (
          <>
            Engine: {engine.label} · {modelForEngine(settings.preferences, engine.id)} —
            change in Setup
          </>
        ) : (
          <>↵ to start · ⌘⇧V for voice</>
        )}
      </div>
    </div>
  );
}
