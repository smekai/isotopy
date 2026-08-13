import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { FileText, Flag, MessageSquare, Monitor, Terminal } from "lucide-react";
import { MILESTONE_PLANNING_PIPELINE } from "@isotopy/core";
import type { RunState } from "@isotopy/core";
import type { Dir } from "../../theme";
import type { ProductController } from "../../hooks/useProduct";
import type { SettingsController } from "../../hooks/useSettings";
import { FONT, ICON, MOTION, SANS, SPACE, WEIGHT } from "../../theme";
import { ArtifactsPanel } from "./ArtifactsPanel";
import type { ArtifactView } from "./ArtifactsPanel";
import { ChatPanel } from "./ChatPanel";
import { LogsPanel } from "./LogsPanel";
import { MilestonePlanPanel } from "./MilestonePlanPanel";
import type { OrchestratorView } from "../../orchestration";
import { PreviewPanel } from "./PreviewPanel";
import { PANEL } from "./run-styles";

export type RunTab = "chat" | "plan" | "logs" | "artifacts" | "preview";

interface RunTabEntry {
  id: RunTab;
  label: string;
  icon: ReactNode;
}

const STANDARD_TABS: RunTabEntry[] = [
  { id: "chat", label: "Chat", icon: <MessageSquare size={ICON.sm} /> },
  { id: "logs", label: "Logs", icon: <Terminal size={ICON.sm} /> },
  { id: "artifacts", label: "Artifacts", icon: <FileText size={ICON.sm} /> },
];

function tabsRow(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.xs,
    borderBottom: `1px solid ${d.border}`,
    background: d.surface,
    padding: `0 ${SPACE.xxl}px`,
    flexShrink: 0,
  };
}

function tabButton(active: boolean, d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    padding: `${SPACE.lg}px ${SPACE.xxl}px`,
    marginBottom: -1,
    border: "none",
    borderBottom: `2px solid ${active ? d.accent : "transparent"}`,
    background: "none",
    cursor: "pointer",
    color: active ? d.accent : d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: active ? WEIGHT.bold : WEIGHT.medium,
    transition: `all ${MOTION.base}`,
  };
}

function clearFilterButton(d: Dir): CSSProperties {
  return {
    marginLeft: "auto",
    border: "none",
    background: "none",
    padding: SPACE.xs,
    cursor: "pointer",
    color: d.accent,
    fontFamily: SANS,
    fontSize: FONT.xs,
  };
}

const PREVIEW_TAB: RunTabEntry = {
  id: "preview",
  label: "Preview",
  icon: <Monitor size={ICON.sm} />,
};

function tabsFor(planning: boolean, previewable: boolean): RunTabEntry[] {
  const standard = previewable ? [...STANDARD_TABS, PREVIEW_TAB] : STANDARD_TABS;
  if (planning) {
    return [
      standard[0]!,
      { id: "plan", label: "Plan", icon: <Flag size={ICON.sm} /> },
      ...standard.slice(1),
    ];
  }
  return standard;
}

export interface RunTabsProps {
  run: RunState;
  focusedStageId: string | null;
  sending: boolean;
  d: Dir;
  settings?: SettingsController;
  orchestrator?: OrchestratorView;
  product?: ProductController;
  onSend: (text: string) => void;
  onRunStarted?: (runId: string) => void;
  onClearFocus: () => void;
}

export function RunTabs({
  run,
  focusedStageId,
  sending,
  d,
  settings,
  orchestrator,
  product,
  onSend,
  onRunStarted,
  onClearFocus,
}: RunTabsProps) {
  const planning = run.pipelineId === MILESTONE_PLANNING_PIPELINE.id;
  const previewable = product?.status?.configured === true;
  const tabs = tabsFor(planning, previewable);
  const [tab, setTab] = useState<RunTab>(
    planning && run.status === "completed" ? "plan" : "chat",
  );
  useEffect(() => {
    if (planning && run.status === "completed") {
      setTab("plan");
    }
  }, [planning, run.id, run.status]);
  const changed = run.changes !== undefined;
  const [artifactView, setArtifactView] = useState<ArtifactView>(
    changed ? "changes" : "workflow",
  );
  useEffect(() => {
    setArtifactView(changed ? "changes" : "workflow");
  }, [changed, run.id]);
  const focusedStage = run.stages.find((stage) => stage.id === focusedStageId);
  const filtered = tab !== "chat" && focusedStage !== undefined;

  function showChanges() {
    setArtifactView("changes");
    setTab("artifacts");
  }

  return (
    <div style={PANEL}>
      <div style={tabsRow(d)} role="tablist" aria-label="Run views">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            data-testid={`run-tab-${entry.id}`}
            style={tabButton(tab === entry.id, d)}
          >
            {entry.icon}{entry.label}
          </button>
        ))}
        {filtered && (
          <button onClick={onClearFocus} style={clearFilterButton(d)}>
            {focusedStage.label} only — show all
          </button>
        )}
      </div>

      {tab === "chat" && (
        <ChatPanel
          run={run}
          d={d}
          sending={sending}
          orchestrator={orchestrator}
          onSend={onSend}
          onShowChanges={showChanges}
        />
      )}
      {tab === "plan" && planning && settings && onRunStarted && (
        <MilestonePlanPanel
          run={run}
          d={d}
          settings={settings}
          onRunStarted={onRunStarted}
        />
      )}
      {tab === "logs" && (
        <LogsPanel run={run} focusedStageId={focusedStageId} d={d} />
      )}
      {tab === "preview" && product && <PreviewPanel {...product} d={d} />}
      {tab === "artifacts" && (
        <ArtifactsPanel
          run={run}
          focusedStageId={focusedStageId}
          view={artifactView}
          d={d}
          onViewChange={setArtifactView}
        />
      )}
    </div>
  );
}
