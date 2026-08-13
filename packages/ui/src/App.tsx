import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { FolderOpen, Settings } from "lucide-react";
import type { LimitResolution, ModelTier, RunSummary } from "@adhd/core";
import { preferredRunOptions } from "@adhd/core";
import {
  abortRun,
  answerOrchestrator,
  approveGate,
  postRunMessage,
  resolveLimit,
  restartRun,
  startMilestonePlanning,
  startRun,
} from "./api";
import { HomeComposer } from "./components/home/HomeComposer";
import { LimitModal } from "./components/LimitModal";
import { MilestoneDashboard } from "./components/MilestoneDashboard";
import { PipelineRow } from "./components/PipelineRow";
import { ProjectDrawer } from "./components/ProjectDrawer";
import { ProjectSwitcher } from "./components/ProjectSwitcher";
import { RunRail } from "./components/RunRail";
import { RunStatusBar } from "./components/RunStatusBar";
import type { InitiativeChrome } from "./components/RunStatusBar";
import { RunTabs } from "./components/run/RunTabs";
import { SetupModal } from "./components/setup/SetupModal";
import type { SetupSection } from "./components/setup/SetupModal";
import { TeamController } from "./components/TeamController";
import type { LiveInitiative } from "./components/TeamController";
import { cycleVS } from "./components/VoiceControls";
import type { VoiceState } from "./components/VoiceControls";
import { useMilestones } from "./hooks/useMilestones";
import { useOrchestration } from "./hooks/useOrchestration";
import { useProduct } from "./hooks/useProduct";
import { useProjects } from "./hooks/useProjects";
import { useRoute } from "./hooks/useRoute";
import { useRunEvents } from "./hooks/useRunEvents";
import { useRunList } from "./hooks/useRunList";
import { useSettings } from "./hooks/useSettings";
import {
  HOME_ROUTE,
  milestoneRoute,
  routeMilestoneId,
  routeRunId,
  runRoute,
} from "./route";
import {
  answerableQuestion,
  orchestrationNeedsUser,
  orchestrationStatusLabel,
  pendingTiersFor,
  withPendingTier,
} from "./orchestration";
import type { OrchestratorView, PendingRoleTiers } from "./orchestration";
import {
  firstActiveRunId,
  milestoneRefreshKey,
  orchestrationRefreshKey,
  runsForOrchestration,
} from "./run-list";
import type { Dir } from "./theme";
import { FONT, ICON, RADIUS, SANS, SPACE, WEIGHT } from "./theme";
import { useTheme } from "./ThemeContext";

const TOP_BAR_HEIGHT = 50;
const LOGO_SIZE = 30;
const DIVIDER_HEIGHT = 22;
const DOT_GRID_SIZE = 26;

const BANNER_RED = "#DC2626";

function topBar(d: Dir): CSSProperties {
  return {
    background: d.surface,
    borderBottom: `1px solid ${d.border}`,
    height: TOP_BAR_HEIGHT,
    display: "flex",
    alignItems: "center",
    padding: `0 ${SPACE.xxxl}px`,
    gap: SPACE.xxl,
    flexShrink: 0,
    boxShadow: d.elevation.sm,
  };
}

function appLogo(): CSSProperties {
  return {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: RADIUS.lg,
    display: "block",
    flexShrink: 0,
  };
}

function wordmark(d: Dir): CSSProperties {
  return {
    color: d.text,
    fontFamily: SANS,
    fontSize: FONT.xl,
    fontWeight: WEIGHT.heavy,
    letterSpacing: "-0.02em",
  };
}

function topBarButton(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    background: d.surface2,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.lg,
    padding: `${SPACE.sm}px ${SPACE.xl}px`,
    cursor: "pointer",
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.medium,
  };
}

const ERROR_BANNER: CSSProperties = {
  background: "rgba(220,38,38,0.08)",
  borderBottom: "1px solid rgba(220,38,38,0.20)",
  color: BANNER_RED,
  fontFamily: SANS,
  fontSize: FONT.md,
  padding: `${SPACE.sm}px ${SPACE.xxxl}px`,
  flexShrink: 0,
};

const WORKSPACE: CSSProperties = {
  flex: 1,
  display: "flex",
  overflow: "hidden",
};

function mainPane(d: Dir): CSSProperties {
  return {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundImage: `radial-gradient(circle, ${d.borderStrong} 1px, transparent 1px)`,
    backgroundSize: `${DOT_GRID_SIZE}px ${DOT_GRID_SIZE}px`,
  };
}

export function App() {
  const { d } = useTheme();
  const projects = useProjects();
  const projectId = projects.activeId;
  const settings = useSettings(projectId);
  const { route, navigate, replace } = useRoute();
  const runs = useRunList(projectId, projects.ready);
  const milestones = useMilestones(
    projectId,
    projects.ready,
    milestoneRefreshKey(runs.runs),
  );
  const orchestration = useOrchestration(
    projectId,
    projects.ready,
    orchestrationRefreshKey(runs.runs),
  );
  const product = useProduct(projectId);
  const [pendingTiers, setPendingTiers] = useState<PendingRoleTiers | null>(null);
  const [resubKey, setResubKey] = useState(0);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const attachedProject = useRef<string | null>(null);
  const [pipeVs, setPipeVs] = useState<VoiceState>("idle");
  const [setupSection, setSetupSection] = useState<SetupSection | null>(null);
  const [showProject, setShowProject] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{ key: string; task: string } | null>(null);
  const [dismissedLimit, setDismissedLimit] = useState<string | null>(null);

  const activeRunId = routeRunId(route);
  const activeMilestoneId = routeMilestoneId(route);
  const activeMilestone = activeMilestoneId
    ? milestones.find(activeMilestoneId)
    : undefined;
  const { run, error: runError } = useRunEvents(activeRunId, resubKey);

  useEffect(() => {
    if (!runs.ready || attachedProject.current === projectId) {
      return;
    }
    attachedProject.current = projectId;
    if (route.kind !== "home") {
      return;
    }
    const active = firstActiveRunId(runs.runs);
    if (active) {
      replace(runRoute(active));
    }
  }, [runs.ready, runs.runs, projectId, route, replace]);

  function attachRun(runId: string) {
    navigate(runRoute(runId));
    setResubKey((key) => key + 1);
    setFocusedId(null);
  }

  function openComposer() {
    navigate(HOME_ROUTE);
    setFocusedId(null);
  }

  function openMilestone(milestoneId: string) {
    navigate(milestoneRoute(milestoneId));
    setFocusedId(null);
  }

  function currentRunOptions() {
    return preferredRunOptions(settings.preferences);
  }

  async function handleStartNextFeature(milestoneId: string) {
    setStarting(true);
    try {
      const created = await milestones.startNext(milestoneId, currentRunOptions());
      if (created) {
        attachRun(created.id);
      }
    } finally {
      setStarting(false);
    }
  }

  async function handleStartOrchestrator(goal: string) {
    setError(null);
    setStarting(true);
    try {
      const created = await orchestration.start(goal, currentRunOptions());
      if (created) {
        setFocusedId(null);
        attachRun(created.id);
      }
    } finally {
      setStarting(false);
    }
  }

  async function handleApproveTeam(orchestrationId: string) {
    const created = await orchestration.approveTeam(orchestrationId, {
      ...currentRunOptions(),
      roleTiers: pendingTiersFor(pendingTiers, orchestration.find(orchestrationId)),
    });
    if (created) {
      setPendingTiers(null);
      attachRun(created.id);
    }
  }

  function handleRoleTierChange(roleId: string, tier: ModelTier | null) {
    if (activeOrchestration === undefined) {
      return;
    }
    setPendingTiers((current) =>
      withPendingTier(current, activeOrchestration.id, roleId, tier),
    );
  }

  function handleSelectProject(id: string) {
    navigate(HOME_ROUTE);
    setFocusedId(null);
    void projects.select(id);
  }

  async function handleStart(task: string, pipelineId: string) {
    setError(null);
    setStarting(true);
    try {
      const created = await startRun({ task, pipelineId, ...currentRunOptions() });
      setFocusedId(null);
      attachRun(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start run");
    } finally {
      setStarting(false);
    }
  }

  async function handlePlanMilestone(goal: string) {
    setError(null);
    setStarting(true);
    try {
      const created = await startMilestonePlanning({ goal, ...currentRunOptions() });
      attachRun(created.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start milestone planning",
      );
    } finally {
      setStarting(false);
    }
  }

  async function handleSend(text: string) {
    if (!activeRunId || !run) {
      return;
    }
    const parked = answerableQuestion(activeOrchestration, run.status);
    setError(null);
    setSending(true);
    try {
      if (parked !== undefined && activeOrchestration) {
        attachRun((await answerOrchestrator(activeOrchestration.id, text)).id);
      } else {
        await postRunMessage(activeRunId, text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
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

  async function handleResolveLimit(stageId: string, resolution: LimitResolution) {
    if (!activeRunId) {
      return;
    }
    setError(null);
    try {
      await resolveLimit(activeRunId, stageId, resolution);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume the run");
    }
  }

  async function handleAbort() {
    if (!activeRunId) {
      return;
    }
    try {
      await abortRun(activeRunId);
    } catch {}
  }

  function handleStopInitiative() {
    if (!activeOrchestration) {
      return;
    }
    void orchestration.stop(activeOrchestration.id);
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

  function handleRerun(source: RunSummary) {
    settings.update({
      pipelineId: source.pipelineId,
      ...(source.engine
        ? { engine: source.engine, engineModels: { [source.engine]: source.model ?? "" } }
        : {}),
    });
    openComposer();
    setPrefill({ key: `rerun-${source.id}-${Date.now()}`, task: source.task ?? "" });
  }

  function handleNodeClick(stageId: string) {
    setFocusedId((current) => (current === stageId ? null : stageId));
  }

  const awaitingStage = run?.stages.find((stage) => stage.status === "awaiting");
  const activeLimit =
    run?.status === "blocked" && run.limit && run.limit.detectedAt !== dismissedLimit
      ? run.limit
      : undefined;
  const showEmpty = runs.ready && route.kind === "home";
  const activeOrchestration = run?.orchestrationId
    ? orchestration.find(run.orchestrationId)
    : undefined;
  const orchestratorView: OrchestratorView | undefined = activeOrchestration && {
    orchestration: activeOrchestration,
    runs: runsForOrchestration(runs.runs, activeOrchestration),
    busy: orchestration.busy,
    roleTiers: pendingTiersFor(pendingTiers, activeOrchestration),
    onApprove: () => void handleApproveTeam(activeOrchestration.id),
    onRoleTierChange: handleRoleTierChange,
    onOpenRun: attachRun,
  };
  const initiativeChrome: InitiativeChrome | undefined = activeOrchestration && {
    statusLabel: orchestrationStatusLabel(activeOrchestration.status),
    needsUser: orchestrationNeedsUser(activeOrchestration.status),
    stopReason: activeOrchestration.stopReason,
    decisionError: activeOrchestration.decisionError,
  };
  const liveInitiative: LiveInitiative | undefined =
    activeOrchestration && activeOrchestration.status !== "stopped"
      ? { busy: orchestration.busy, onStop: handleStopInitiative }
      : undefined;
  const banner =
    error ??
    runError ??
    projects.error ??
    settings.error ??
    runs.error ??
    milestones.error ??
    orchestration.error;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: SANS, background: d.bg }}>
      <div style={topBar(d)}>
        <div style={{ display: "flex", alignItems: "center", gap: SPACE.md }}>
          <img src="/adhd-icon.png" alt="" width={LOGO_SIZE} height={LOGO_SIZE} style={appLogo()} />
          <span style={wordmark(d)}>Isotopy</span>
        </div>

        <div style={{ width: 1, height: DIVIDER_HEIGHT, background: d.border }} />

        <ProjectSwitcher
          d={d}
          projects={projects.projects}
          activeId={projectId}
          onSelect={handleSelectProject}
          onAdd={(root) => void projects.add(root)}
          onRemove={(id) => void projects.remove(id)}
        />

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", gap: SPACE.sm }}>
          <button onClick={() => setShowProject(true)} data-testid="open-project" style={topBarButton(d)}>
            <FolderOpen size={ICON.md} /> Project
          </button>
          <button onClick={() => setSetupSection("harness")} style={topBarButton(d)}>
            <Settings size={ICON.md} /> Setup
          </button>
        </div>
      </div>

      {banner && <div style={ERROR_BANNER}>{banner}</div>}

      <div style={WORKSPACE}>
        <RunRail
          d={d}
          runs={runs.runs}
          milestones={milestones.milestones}
          ready={runs.ready}
          selectedRunId={activeRunId}
          selectedMilestoneId={activeMilestoneId}
          composing={route.kind === "home"}
          onNewRun={openComposer}
          onOpen={attachRun}
          onOpenMilestone={openMilestone}
          onRestart={(runId, stageId) => void handleRestart(runId, stageId)}
          onRerun={handleRerun}
        />

        <div style={mainPane(d)}>
          {showEmpty ? (
            <HomeComposer
              key={`${projectId}:${prefill?.key ?? "composer"}`}
              d={d}
              projectId={projectId}
              project={projects.active}
              settings={settings}
              onOpenProject={() => setShowProject(true)}
              initialTask={prefill?.task}
              onStartOrchestrator={(goal) => void handleStartOrchestrator(goal)}
              onStart={(task, pipelineId) => void handleStart(task, pipelineId)}
              onPlanMilestone={(goal) => void handlePlanMilestone(goal)}
              starting={starting}
            />
          ) : activeMilestone ? (
            <MilestoneDashboard
              milestone={activeMilestone}
              runs={runs.runs}
              busy={starting}
              d={d}
              onToggleAutoRun={(autoRunNext) =>
                void milestones.setAutoRunNext(activeMilestone.id, autoRunNext)
              }
              onStartNext={() => void handleStartNextFeature(activeMilestone.id)}
              onFinalize={() => void milestones.finalize(activeMilestone.id)}
              onOpenRun={attachRun}
              onAcceptFeature={(featureId) =>
                void milestones.acceptFeature(activeMilestone.id, featureId)
              }
            />
          ) : run ? (
            <>
              <RunStatusBar run={run} d={d} initiative={initiativeChrome} />
              <PipelineRow
                run={run}
                d={d}
                focusedId={focusedId}
                onNodeClick={handleNodeClick}
                onApprove={(stageId) => void handleApprove(stageId)}
              />
              <RunTabs
                run={run}
                focusedStageId={focusedId}
                sending={sending}
                d={d}
                settings={settings}
                orchestrator={orchestratorView}
                product={product}
                onSend={(text) => void handleSend(text)}
                onRunStarted={attachRun}
                onClearFocus={() => setFocusedId(null)}
              />
            </>
          ) : null}
        </div>
      </div>

      <TeamController
        d={d}
        run={run}
        pipeVs={pipeVs}
        initiative={liveInitiative}
        onCycleVoice={() => setPipeVs((v) => cycleVS(v))}
        onApprove={() => awaitingStage && void handleApprove(awaitingStage.id)}
        onAbort={() => void handleAbort()}
        onRestart={(stageId) => run && void handleRestart(run.id, stageId)}
        onNewRun={openComposer}
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
      {run && activeLimit && (
        <LimitModal
          d={d}
          run={run}
          limit={activeLimit}
          onResolve={(resolution) => void handleResolveLimit(activeLimit.stageId, resolution)}
          onAbort={() => void handleAbort()}
          onOpenConnection={() => setSetupSection("harness")}
          onDismiss={() => setDismissedLimit(activeLimit.detectedAt)}
        />
      )}
      {setupSection && (
        <SetupModal
          d={d}
          projectId={projectId}
          projectName={projects.active?.name ?? "Home"}
          settings={settings}
          section={setupSection}
          onClose={() => setSetupSection(null)}
        />
      )}
    </div>
  );
}
