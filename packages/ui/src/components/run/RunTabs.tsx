import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { FileText, MessageSquare, Terminal } from "lucide-react";
import type { RunState } from "@adhd/core";
import type { Dir } from "../../theme";
import { FONT, ICON, MOTION, SANS, SPACE, WEIGHT } from "../../theme";
import { ArtifactsPanel } from "./ArtifactsPanel";
import { ChatPanel } from "./ChatPanel";
import { LogsPanel } from "./LogsPanel";
import { PANEL } from "./run-styles";

export type RunTab = "chat" | "logs" | "artifacts";

const TABS: { id: RunTab; label: string; icon: ReactNode }[] = [
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

export interface RunTabsProps {
  run: RunState;
  focusedStageId: string | null;
  sending: boolean;
  d: Dir;
  onSend: (text: string) => void;
  onClearFocus: () => void;
}

export function RunTabs({
  run,
  focusedStageId,
  sending,
  d,
  onSend,
  onClearFocus,
}: RunTabsProps) {
  const [tab, setTab] = useState<RunTab>("chat");
  const focusedStage = run.stages.find((stage) => stage.id === focusedStageId);
  const filtered = tab !== "chat" && focusedStage !== undefined;

  return (
    <div style={PANEL}>
      <div style={tabsRow(d)} role="tablist" aria-label="Run views">
        {TABS.map((entry) => (
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

      {tab === "chat" && <ChatPanel run={run} d={d} sending={sending} onSend={onSend} />}
      {tab === "logs" && (
        <LogsPanel run={run} focusedStageId={focusedStageId} d={d} />
      )}
      {tab === "artifacts" && (
        <ArtifactsPanel run={run} focusedStageId={focusedStageId} d={d} />
      )}
    </div>
  );
}
