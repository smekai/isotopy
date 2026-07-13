import { useEffect, useState } from "react";
import { ChevronDown, History, Settings, Sparkles } from "lucide-react";
import type { RunStatus } from "@adhd/core";
import { abortRun, approveGate, fetchRuns, restartRun, startRun } from "./api";
import { EmptyState } from "./components/EmptyState";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { PipelineRow } from "./components/PipelineRow";
import { RunStatusBar } from "./components/RunStatusBar";
import { SetupModal } from "./components/SetupModal";
import { StageFocusPanel } from "./components/StageFocusPanel";
import type { FocusTab } from "./components/StageFocusPanel";
import { TeamController } from "./components/TeamController";
import { cycleVS } from "./components/VoiceControls";
import type { VoiceState } from "./components/VoiceControls";
import { useRunEvents } from "./hooks/useRunEvents";
import { loadDisabledStages } from "./settings";
import { SANS } from "./theme";
import { useTheme } from "./ThemeContext";

const TERMINAL_RUN_STATUSES: RunStatus[] = ["completed", "failed", "cancelled"];

export function App() {
  const { d } = useTheme();
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [resubKey, setResubKey] = useState(0);
  const [booted, setBooted] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [focusTab, setFocusTab] = useState<FocusTab>("log");
  const [pipeVs, setPipeVs] = useState<VoiceState>("idle");
  const [stageVs, setStageVs] = useState<VoiceState>("idle");
  const [showSetup, setShowSetup] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { run, error: runError } = useRunEvents(activeRunId, resubKey);

  // Re-attach to an in-flight run on page load.
  useEffect(() => {
    void fetchRuns()
      .then((runs) => {
        const active = runs.find((r) => !TERMINAL_RUN_STATUSES.includes(r.status));
        if (active) {
          setActiveRunId(active.id);
        }
      })
      .catch(() => {
        // Server unreachable — the empty state still renders.
      })
      .finally(() => setBooted(true));
  }, []);

  // Follow the stage that needs attention unless the user pinned one.
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
  }

  async function handleStart(task: string) {
    setError(null);
    setStarting(true);
    try {
      const created = await startRun({ task, disabledStages: loadDisabledStages() });
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
    } catch {
      // Double-click race — the gate was already approved.
    }
  }

  async function handleAbort() {
    if (!activeRunId) {
      return;
    }
    try {
      await abortRun(activeRunId);
    } catch {
      // Run already finished.
    }
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
  const banner = error ?? runError;

  const dotGrid = `radial-gradient(circle, ${d.border.replace("0.12", "0.20")} 1px, transparent 1px)`;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: SANS, background: d.bg }}>
      {/* ── Header ── */}
      <div style={{ background: d.surface, borderBottom: `1px solid ${d.border}`, height: 50, display: "flex", alignItems: "center", padding: "0 20px", gap: 14, flexShrink: 0, boxShadow: d.shadowSm }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: `linear-gradient(135deg, ${d.accent}, ${d.accentDark})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles size={15} style={{ color: "#FFF" }} />
          </div>
          <span style={{ color: d.text, fontFamily: SANS, fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}>ADHD</span>
        </div>

        <div style={{ width: 1, height: 22, background: d.border }} />

        {/* Project */}
        <button style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: d.textMid, fontFamily: SANS, fontSize: 13, fontWeight: 500 }}>
          my-saas-app <ChevronDown size={13} style={{ color: d.textMuted }} />
        </button>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setShowHistory(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: d.surface2, border: `1px solid ${d.border}`, borderRadius: 10, padding: "6px 12px", cursor: "pointer", color: d.textMid, fontFamily: SANS, fontSize: 12, fontWeight: 500 }}>
            <History size={13} /> History
          </button>
          <button onClick={() => setShowSetup(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: d.surface2, border: `1px solid ${d.border}`, borderRadius: 10, padding: "6px 12px", cursor: "pointer", color: d.textMid, fontFamily: SANS, fontSize: 12, fontWeight: 500 }}>
            <Settings size={13} /> Setup
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {banner && (
        <div style={{ background: "rgba(220,38,38,0.08)", borderBottom: "1px solid rgba(220,38,38,0.20)", color: "#DC2626", fontFamily: SANS, fontSize: 12, padding: "6px 20px", flexShrink: 0 }}>
          {banner}
        </div>
      )}

      {/* ── Main canvas ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", backgroundImage: dotGrid, backgroundSize: "26px 26px" }}>
        {showEmpty ? (
          <EmptyState d={d} onStart={(task) => void handleStart(task)} starting={starting} />
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
                onTabChange={setFocusTab}
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

      {/* ── Team controller ── */}
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

      {/* ── Overlays ── */}
      {showSetup && <SetupModal d={d} onClose={() => setShowSetup(false)} />}
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
        />
      )}
    </div>
  );
}
