import { useState } from "react";
import { FolderOpen, Play } from "lucide-react";
import {
  ENGINES,
  HOME_PROJECT_ID,
  LIFECYCLE_STAGES,
  agentForStage,
  findPipeline,
  flattenPipelineStages,
  pipelineUsesEngineById,
} from "@adhd/core";
import type { Project } from "@adhd/core";
import { loadEngine, loadEngineModel, loadPipelineId, savePipelineId } from "../settings";
import type { Dir } from "../theme";
import { MONO, SANS, specColor } from "../theme";
import { PipelineDropdown } from "./PipelineDropdown";
import type { PipelineOption } from "./PipelineDropdown";

interface PipelineCopy {
  headline: string;
  subtitle: string;
}

const DEFAULT_PIPELINE_COPY: PipelineCopy = {
  headline: "What should the team build?",
  subtitle: "Describe a feature, bug fix, or task. Your AI team will handle the rest.",
};

const PIPELINE_COPY: Record<string, PipelineCopy> = {
  sequential: DEFAULT_PIPELINE_COPY,
  "one-box": {
    headline: "What should the Developer build?",
    subtitle: "One prompt, one agent, one result — powered by a real engine.",
  },
  "dev-test": {
    headline: "What should the Developer build?",
    subtitle: "A Developer implements it, then a Tester verifies the result — real engine.",
  },
};

function workspaceChipStyle(d: Dir): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 8, alignSelf: "center",
    border: `1px solid ${d.border}`, borderRadius: 12, padding: "7px 12px",
    background: d.surface2, cursor: "pointer", maxWidth: "100%",
  };
}

export interface EmptyStateProps {
  d: Dir;
  projectId: string;
  project: Project | undefined;
  onOpenProject: () => void;
  onStart: (task: string, pipelineId: string) => void;
  starting?: boolean;
  initialTask?: string | undefined;
}

export function EmptyState({
  d,
  projectId,
  project,
  onOpenProject,
  onStart,
  starting = false,
  initialTask = "",
}: EmptyStateProps) {
  const [input, setInput] = useState(initialTask);
  const [pipelineId, setPipelineId] = useState(() => loadPipelineId(projectId));
  const scratch = projectId === HOME_PROJECT_ID;
  const canStart = input.trim().length > 0 && !starting;
  const usesEngine = pipelineUsesEngineById(pipelineId);
  const selectedPipeline = findPipeline(pipelineId);
  const stages = selectedPipeline
    ? flattenPipelineStages(selectedPipeline)
    : LIFECYCLE_STAGES;
  const engine = ENGINES[loadEngine(projectId)];

  const pipelineOptions: PipelineOption[] = [
    {
      id: "sequential",
      label: "Full team",
      description: "8 simulated stages with approval gates (mock)",
    },
    {
      id: "one-box",
      label: "Single agent",
      description: `Real engine — ${engine.label}`,
    },
    {
      id: "dev-test",
      label: "Developer + Tester",
      description: `Developer implements, Tester verifies — ${engine.label}`,
    },
  ];

  const copy = PIPELINE_COPY[pipelineId] ?? DEFAULT_PIPELINE_COPY;

  function selectPipeline(id: string) {
    setPipelineId(id);
    savePipelineId(projectId, id);
  }

  function start() {
    if (canStart) {
      onStart(input.trim(), pipelineId);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: "0 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {stages.map((stage, i) => {
          const agent = agentForStage(stage.id);
          const spec = specColor(stage.id);
          return (
            <div key={stage.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, border: `1.5px solid ${spec.main}`, background: spec.soft, boxShadow: d.shadowSm, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: spec.main }}>{agent.glyph}</div>
                <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 600, color: d.textMid, whiteSpace: "nowrap" }}>{agent.profession}</div>
              </div>
              {i < stages.length - 1 && <div style={{ width: 16, height: 2, borderRadius: 1, background: d.runBorder, alignSelf: "flex-start", marginTop: 16 }} />}
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={{ color: d.text, fontFamily: SANS, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>
          {copy.headline}
        </div>
        <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 14 }}>
          {copy.subtitle}
        </div>
      </div>

      <PipelineDropdown d={d} options={pipelineOptions} value={pipelineId} onSelect={selectPipeline} />

      <div style={{ maxWidth: 540, width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ background: "#FFF", border: `1.5px solid ${d.border}`, borderRadius: 16, display: "flex", alignItems: "center", gap: 12, padding: "10px 10px 10px 18px", boxShadow: d.shadow }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
            placeholder="Describe the task..."
            autoFocus
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: d.text, fontFamily: SANS, fontSize: 14 }}
          />
          <button
            onClick={start}
            disabled={!canStart}
            style={{
              background: canStart ? `linear-gradient(135deg, ${d.accent}, ${d.accentDark})` : d.surface2,
              color: canStart ? "#FFF" : d.textMuted,
              border: "none", borderRadius: 12, padding: "10px 20px",
              fontFamily: SANS, fontSize: 13, fontWeight: 800,
              cursor: canStart ? "pointer" : "default",
              display: "flex", alignItems: "center", gap: 7,
              boxShadow: canStart ? `0 2px 10px ${d.accentMid}` : "none",
              transition: "all 0.2s",
            }}
          >
            <Play size={13} /> {starting ? "Starting..." : "Start run"}
          </button>
        </div>

        {usesEngine && (
          <button onClick={onOpenProject} data-testid="workspace-chip" style={workspaceChipStyle(d)}>
            <FolderOpen size={13} style={{ color: d.textMuted, flexShrink: 0 }} />
            <span style={{ color: d.textMid, fontFamily: SANS, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
              {scratch ? "Scratch workspace" : (project?.name ?? "Project")}
            </span>
            <span style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {scratch ? "this run gets its own folder" : (project?.root ?? "")}
            </span>
          </button>
        )}
      </div>

      <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12 }}>
        {usesEngine
          ? <>Engine: {engine.label} · {loadEngineModel(projectId, engine.id)} — change in Setup</>
          : <>↵ to start · ⌘⇧V for voice</>}
      </div>
    </div>
  );
}
