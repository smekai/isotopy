import { useState } from "react";
import { FolderOpen, Play } from "lucide-react";
import {
  ENGINES,
  LIFECYCLE_STAGES,
  agentForStage,
  findPipeline,
  flattenPipelineStages,
  pipelineUsesEngineById,
} from "@adhd/core";
import {
  loadEngine,
  loadEngineModel,
  loadPipelineId,
  loadWorkspaceDir,
  savePipelineId,
  saveWorkspaceDir,
} from "../settings";
import type { Dir } from "../theme";
import { SANS, specColor } from "../theme";
import { FolderPicker } from "./FolderPicker";
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

export interface EmptyStateProps {
  d: Dir;
  onStart: (task: string, pipelineId: string, workspaceDir?: string) => void;
  starting?: boolean;
  initialTask?: string | undefined;
}

export function EmptyState({ d, onStart, starting = false, initialTask = "" }: EmptyStateProps) {
  const [input, setInput] = useState(initialTask);
  const [pipelineId, setPipelineId] = useState(loadPipelineId);
  const [workspaceDir, setWorkspaceDir] = useState(loadWorkspaceDir);
  const [pickerOpen, setPickerOpen] = useState(false);
  const firstRun = workspaceDir.trim() === "";
  const canStart = input.trim().length > 0 && !starting;
  const usesEngine = pipelineUsesEngineById(pipelineId);
  const selectedPipeline = findPipeline(pipelineId);
  const stages = selectedPipeline
    ? flattenPipelineStages(selectedPipeline)
    : LIFECYCLE_STAGES;
  const engine = ENGINES[loadEngine()];

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
    savePipelineId(id);
  }

  function start() {
    if (canStart) {
      onStart(input.trim(), pipelineId, usesEngine ? workspaceDir.trim() : undefined);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: "0 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.18 }}>
        {stages.map((stage, i) => {
          const agent = agentForStage(stage.id);
          return (
            <div key={stage.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, border: `1.5px solid ${specColor(stage.id).main}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: d.text }}>{agent.glyph}</div>
                <div style={{ fontFamily: SANS, fontSize: 9, color: d.textMuted, whiteSpace: "nowrap" }}>{agent.profession}</div>
              </div>
              {i < stages.length - 1 && <div style={{ width: 16, height: 2, borderRadius: 1, background: d.border }} />}
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
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={workspaceDir}
              onChange={(e) => {
                setWorkspaceDir(e.target.value);
                saveWorkspaceDir(e.target.value);
              }}
              placeholder="Working directory — empty = scratch workspace per run"
              style={{
                flex: 1,
                border: `1px solid ${firstRun ? d.accent : d.border}`, borderRadius: 12, padding: "9px 14px",
                background: "#FFF", color: d.text, fontFamily: SANS, fontSize: 12, outline: "none",
              }}
            />
            <button
              onClick={() => setPickerOpen(true)}
              data-testid="browse-folder"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                border: `1px solid ${firstRun ? d.accent : d.border}`, borderRadius: 12,
                padding: "9px 14px", background: firstRun ? d.accentSoft : "#FFF",
                color: firstRun ? d.accent : d.textMid, cursor: "pointer",
                fontFamily: SANS, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
              }}
            >
              <FolderOpen size={13} /> Browse…
            </button>
          </div>
        )}
        {usesEngine && firstRun && (
          <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11, textAlign: "center" }}>
            Pick a project folder — otherwise the run works in a temporary scratch workspace.
          </div>
        )}
      </div>

      <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12 }}>
        {usesEngine
          ? <>Engine: {engine.label} · {loadEngineModel(engine.id)} — change in Setup</>
          : <>↵ to start · ⌘⇧V for voice</>}
      </div>

      {pickerOpen && (
        <FolderPicker
          d={d}
          initialPath={workspaceDir.trim() === "" ? undefined : workspaceDir.trim()}
          onSelect={(picked) => {
            setWorkspaceDir(picked);
            saveWorkspaceDir(picked);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
