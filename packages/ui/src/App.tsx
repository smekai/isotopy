import { useEffect, useRef, useState } from "react";
import { FolderOpen, History, Settings, Sparkles } from "lucide-react";
import type { RunState, RunStatus } from "@adhd/core";
import { modelForEngine } from "@adhd/core";
import { abortRun, approveGate, fetchRuns, restartRun, startRun } from "./api";
import { EmptyState } from "./components/EmptyState";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { PipelineRow } from "./components/PipelineRow";
import { ProjectDrawer } from "./components/ProjectDrawer";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { RunStatusBar } from "./components/RunStatusBar";
import { SetupModal } from "./components/SetupModal";
import type { SetupSection } from "./components/SetupModal";
import { StageFocusPanel } from "./components/StageFocusPanel";
import type { FocusTab } from "./components/StageFocusPanel";
import { TeamController } from "./components/TeamController";
import { cycleVS } from "./components/VoiceControls";
import type { VoiceState } from "./components/VoiceControls";
import { useProjects } from "./hooks/useProjects";
import { useRunEvents } from "./hooks/useRunEvents";
import { useSettings } from "./hooks/useSettings";
import { SANS } from "./theme";
import { useTheme } from "./ThemeContext";

const TERMINAL_RUN_STATUSES: RunStatus[] = ["completed", "failed", "cancelled"];

export function App() {
  const { d } = useTheme();
  const projects = useProjects();
  const projectId = projects.activeId;
  const settings = useSettings(projectId);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [resubKey, setResubKey] = useState(0);
  const [booted, setBooted] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [focusTab, setFocusTab] = useState<FocusTab>("log");
  const tabChosenByUser = useRef(false);
  const [pipeVs, setPipeVs] = useState<VoiceState>("idle");
  const [stageVs, setStageVs] = useState<VoiceState>("idle");
  const [setupSection, setSetupSection] = useState<SetupSection | null>(null);
  const [showProject, setShowProject] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{ key: string; task: string } | null>(null);

  const { run, error: runError } = useRunEvents(activeRunId, resubKey);

  function clearRunViewForProjectSwitch() {
    setBooted(false);
    setActiveRunId(null);
    setFocusedId(null);
    setPinned(false);
  }

  useEffect(() => {
    if (!projects.ready) {
      return;
    }
    let stale = false;
    clearRunViewForProjectSwitch();
    void fetchRuns()
      .then((runs) => {
        const active = runs.find((r) => !TERMINAL_RUN_STATUSES.includes(r.status));
        if (active && !stale) {
          setActiveRunId(active.id);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!stale) {
          setBooted(true);
        }
      });
    return () => {
      stale = true;
    };
  }, [projects.ready, projectId]);

  const runStatus = run?.status;
  useEffect(() => {
    if (runStatus && TERMINAL_RUN_STATUSES.includes(runStatus) && !tabChosenByUser.current) {
      setFocusTab("artifacts");
    }
  }, [runStatus]);

  function handleTabChange(next: FocusTab) {
    tabChosenByUser.current = true;
    setFocusTab(next);
  }

  useEffect(() => {
    if (!run || pinned) {
      return;
    }
    const hot =
      run.stages.find((stage) => stage.status === "running") ??
      run.stages.find((stage) => stage.status === "awaiting") ??
      run.stages.find((stage) => stage.status === "failed");
    if (hot) {
      setFocusedId(hot.id);
    }
  }, [run, pinned]);

  function attachRun(runId: string) {
    setActiveRunId(runId);
    setResubKey((key) => key + 1);
    setPinned(false);
    setFocusTab("log");
    tabChosenByUser.current = false;
  }

  async function handleStart(task: string, pipelineId: string) {
    setError(null);
    setStarting(true);
    try {
      const { engine, permissionMode } = settings.preferences;
      const created = await startRun({
        task,
        pipelineId,
        engine,
        model: modelForEngine(settings.preferences, engine),
        permissionMode,
      });
      setFocusedId(null);
      attachRun(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start run");
    } finally {
      setStarting(false);
    }
  }

  async function handleApprove(stageId: string) {
    if (!activeRunId) {
      return;
    }
    try {
      await approveGate(activeRunId, stageId);
    } catch {}
  }

  async function handleAbort() {
    if (!activeRunId) {
      return;
    }
    try {
      await abortRun(activeRunId);
    } catch {}
  }

  async function handleRestart(runId: string, stageId: string) {
    setError(null);
    try {
      await restartRun(runId, stageId);
      attachRun(runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restart run");
    }
  }

  function handleNewRun() {
    setActiveRunId(null);
    setFocusedId(null);
    setPinned(false);
  }

  function handleRerun(source: RunState) {
    settings.update({
      pipelineId: source.pipelineId,
      ...(source.engine
        ? { engine: source.engine, engineModels: { [source.engine]: source.model ?? "" } }
        : {}),
    });
    setShowHistory(false);
    setActiveRunId(null);
    setFocusedId(null);
    setPinned(false);
    setPrefill({ key: `rerun-${source.id}-${Date.now()}`, task: source.task ?? "" });
  }

  function handleNodeClick(stageId: string) {
    if (focusedId === stageId) {
      setFocusedId(null);
      setPinned(false);
      return;
    }
    setFocusedId(stageId);
    setPinned(true);
  }

  const awaitingStage = run?.stages.find((stage) => stage.status === "awaiting");
  const focusedStage = run?.stages.find((stage) => stage.id === focusedId);
  const showEmpty = booted && !activeRunId;
  const banner = error ?? runError ?? projects.error ?? settings.error;

  const dotGrid = `radial-gradient(circle, ${d.border.replace("0.12", "0.20")} 1px, transparent 1px)`;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: SANS, background: d.bg }}>
      <div style={{ background: d.surface, borderBottom: `1px solid ${d.border}`, height: 50, display: "flex", alignItems: "center", padding: "0 20px", gap: 14, flexShrink: 0, boxShadow: d.shadowSm }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: `linear-gradient(135deg, ${d.accent}, ${d.accentDark})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles size={15} style={{ color: "#FFF" }} />
          </div>
          <span style={{ color: d.text, fontFamily: SANS, fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}>ADHD</span>
        </div>

        <div style={{ width: 1, height: 22, background: d.border }} />

        <ProjectSwitcher
          d={d}
          projects={projects.projects}
          activeId={projectId}
          onSelect={(id) => void projects.select(id)}
          onAdd={(root) => void projects.add(root)}
          onRemove={(id) => void projects.remove(id)}
        />

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setShowProject(true)} data-testid="open-project"
            style={{ display: "flex", alignItems: "center", gap: 6, background: d.surface2, border: `1px solid ${d.border}`, borderRadius: 10, padding: "6px 12px", cursor: "pointer", color: d.textMid, fontFamily: SANS, fontSize: 12, fontWeight: 500 }}>
            <FolderOpen size={13} /> Project
          </button>
          <button onClick={() => setShowHistory(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: d.surface2, border: `1px solid ${d.border}`, borderRadius: 10, padding: "6px 12px", cursor: "pointer", color: d.textMid, fontFamily: SANS, fontSize: 12, fontWeight: 500 }}>
            <History size={13} /> History
          </button>
          <button onClick={() => setSetupSection("harness")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: d.surface2, border: `1px solid ${d.border}`, borderRadius: 10, padding: "6px 12px", cursor: "pointer", color: d.textMid, fontFamily: SANS, fontSize: 12, fontWeight: 500 }}>
            <Settings size={13} /> Setup
          </button>
        </div>
      </div>

      {banner && (
        <div style={{ background: "rgba(220,38,38,0.08)", borderBottom: "1px solid rgba(220,38,38,0.20)", color: "#DC2626", fontFamily: SANS, fontSize: 12, padding: "6px 20px", flexShrink: 0 }}>
          {banner}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", backgroundImage: dotGrid, backgroundSize: "26px 26px" }}>
        {showEmpty ? (
          <EmptyState
            key={`${projectId}:${prefill?.key ?? "composer"}`}
            d={d}
            projectId={projectId}
            project={projects.active}
            settings={settings}
            onOpenProject={() => setShowProject(true)}
            initialTask={prefill?.task}
            onStart={(task, pipelineId) => void handleStart(task, pipelineId)}
            starting={starting}
          />
        ) : run ? (
          <>
            <RunStatusBar run={run} d={d} />
            <PipelineRow
              run={run}
              d={d}
              focusedId={focusedId}
              onNodeClick={handleNodeClick}
              onApprove={(stageId) => void handleApprove(stageId)}
            />
            {focusedStage && (
              <StageFocusPanel
                key={focusedStage.id}
                stage={focusedStage}
                run={run}
                d={d}
                tab={focusTab}
                onTabChange={handleTabChange}
                vs={stageVs}
                onCycleVoice={() => setStageVs((v) => cycleVS(v))}
                onClose={() => {
                  setFocusedId(null);
                  setPinned(false);
                }}
                onRestartHere={(stageId) => void handleRestart(run.id, stageId)}
              />
            )}
          </>
        ) : null}
      </div>

      <TeamController
        d={d}
        run={run}
        pipeVs={pipeVs}
        onCycleVoice={() => setPipeVs((v) => cycleVS(v))}
        onApprove={() => awaitingStage && void handleApprove(awaitingStage.id)}
        onAbort={() => void handleAbort()}
        onRestart={(stageId) => run && void handleRestart(run.id, stageId)}
        onNewRun={handleNewRun}
      />

      {showProject && (
        <ProjectDrawer
          d={d}
          projectId={projectId}
          project={projects.active}
          settings={settings}
          run={run}
          onOpenSetup={(section) => {
            setShowProject(false);
            setSetupSection(section);
          }}
          onClose={() => setShowProject(false)}
        />
      )}
      {setupSection && (
        <SetupModal
          d={d}
          projectName={projects.active?.name ?? "Home"}
          settings={settings}
          section={setupSection}
          onClose={() => setSetupSection(null)}
        />
      )}
      {showHistory && (
        <HistoryDrawer
          d={d}
          onClose={() => setShowHistory(false)}
          onView={(runId) => {
            attachRun(runId);
            setShowHistory(false);
          }}
          onRestart={(runId, stageId) => {
            void handleRestart(runId, stageId);
            setShowHistory(false);
          }}
          onRerun={handleRerun}
        />
      )}
    </div>
  );
}
