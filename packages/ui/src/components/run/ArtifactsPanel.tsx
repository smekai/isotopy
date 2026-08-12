import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { ClipboardCheck, FileDiff, FileText, FolderOpen } from "lucide-react";
import { agentForStage } from "@adhd/core";
import type { RunState } from "@adhd/core";
import { fetchRunFiles } from "../../api";
import type { WorkspaceFile } from "../../api";
import { useWorkspaceFile } from "../../hooks/useWorkspaceFile";
import { ChangedFilesPanel } from "./ChangedFilesPanel";
import { CloseoutPanel, RunArtifactsPanel } from "./CloseoutPanel";
import { FileReadingPane } from "./FileReadingPane";
import type { Dir } from "../../theme";
import { FONT, ICON, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import {
  FAIL_RED,
  PANEL,
  READING_PANE,
  SPLIT_PANE,
  emptyNote,
  filePreview,
  formatBytes,
  listButton,
  listItemIcon,
  listItemName,
  listItemSize,
  sidebar,
} from "./run-styles";

export type ArtifactView = "changes" | "workflow" | "closeout" | "files";

const VIEW_LABEL: Record<ArtifactView, string> = {
  changes: "What changed",
  workflow: "Handoffs",
  closeout: "Closeout",
  files: "Solution folder",
};

const HANDOFF_SIDEBAR_WIDTH = 200;
const FILE_SIDEBAR_WIDTH = 220;

interface Handoff {
  stageId: string;
  name: string;
  profession: string;
  size: string;
  body: string;
}

function handoffsOf(run: RunState): Handoff[] {
  const outputs = run.stageOutputs ?? {};
  return run.stages.flatMap((stage) => {
    const body = outputs[stage.id];
    if (body === undefined || body === "") {
      return [];
    }
    return [
      {
        stageId: stage.id,
        name: `${stage.id}/handoff.md`,
        profession: agentForStage(stage).profession,
        size: formatBytes(new Blob([body]).size),
        body,
      },
    ];
  });
}

function viewToggleRow(d: Dir): CSSProperties {
  return {
    display: "flex",
    gap: SPACE.xs,
    padding: `${SPACE.md}px ${SPACE.xxl}px`,
    borderBottom: `1px solid ${d.border}`,
    flexShrink: 0,
  };
}

function viewToggle(active: boolean, d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    border: `1px solid ${active ? d.accent : d.border}`,
    borderRadius: RADIUS.md,
    padding: `${SPACE.xs}px ${SPACE.xl}px`,
    background: active ? d.accentSoft : "transparent",
    color: active ? d.accent : d.textMid,
    cursor: "pointer",
    fontFamily: SANS,
    fontSize: FONT.sm,
    fontWeight: active ? WEIGHT.bold : WEIGHT.medium,
  };
}

interface HandoffListProps {
  handoffs: Handoff[];
  selectedId: string | null;
  onSelect: (stageId: string) => void;
  d: Dir;
}

function HandoffList({ handoffs, selectedId, onSelect, d }: HandoffListProps) {
  const selected = handoffs.find((entry) => entry.stageId === selectedId) ?? handoffs[0];

  return (
    <div style={SPLIT_PANE}>
      <div style={sidebar(HANDOFF_SIDEBAR_WIDTH, d)}>
        {handoffs.length === 0 ? (
          <div style={emptyNote(d)}>No handoffs yet.</div>
        ) : (
          handoffs.map((entry) => {
            const active = entry.stageId === selected?.stageId;
            return (
              <button key={entry.stageId} onClick={() => onSelect(entry.stageId)} style={listButton(active, d)}>
                <FileText size={ICON.sm} style={listItemIcon(active, d)} />
                <div>
                  <div style={listItemName(active, d)}>{entry.name}</div>
                  <div style={listItemSize(d)}>{entry.profession} · {entry.size}</div>
                </div>
              </button>
            );
          })
        )}
      </div>
      <div style={READING_PANE}>
        {selected && (
          <pre data-testid="artifact-preview" style={{ ...filePreview, color: d.text }}>
            {selected.body}
          </pre>
        )}
      </div>
    </div>
  );
}

interface WorkspaceBrowserProps {
  runId: string;
  runStatus: RunState["status"];
  d: Dir;
}

function WorkspaceBrowser({ runId, runStatus, d }: WorkspaceBrowserProps) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reading = useWorkspaceFile(runId);

  useEffect(() => {
    let cancelled = false;
    fetchRunFiles(runId)
      .then((result) => {
        if (!cancelled) {
          setFiles(result.files);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to list files");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [runId, runStatus]);

  return (
    <div style={SPLIT_PANE} data-testid="artifact-files">
      <div style={sidebar(FILE_SIDEBAR_WIDTH, d)}>
        {error ? (
          <div style={{ ...emptyNote(d), color: FAIL_RED }}>{error}</div>
        ) : files.length === 0 ? (
          <div style={emptyNote(d)}>No files in the workspace yet.</div>
        ) : (
          files.map((file) => {
            const active = file.path === reading.selectedPath;
            return (
              <button
                key={file.path}
                onClick={() => reading.select(file.path)}
                title={file.path}
                style={listButton(active, d)}
              >
                <FileText size={ICON.sm} style={listItemIcon(active, d)} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...listItemName(active, d), wordBreak: "break-all" }}>{file.path}</div>
                  <div style={listItemSize(d)}>{formatBytes(file.size)}</div>
                </div>
              </button>
            );
          })
        )}
      </div>
      <FileReadingPane file={reading.content} error={null} placeholder="" d={d} />
    </div>
  );
}

export interface ArtifactsPanelProps {
  run: RunState;
  focusedStageId: string | null;
  view: ArtifactView;
  d: Dir;
  onViewChange: (view: ArtifactView) => void;
}

function viewIcon(view: ArtifactView) {
  if (view === "changes") return <FileDiff size={ICON.sm} />;
  if (view === "workflow") return <FileText size={ICON.sm} />;
  if (view === "closeout") return <ClipboardCheck size={ICON.sm} />;
  return <FolderOpen size={ICON.sm} />;
}

export function ArtifactsPanel({
  run,
  focusedStageId,
  view,
  d,
  onViewChange,
}: ArtifactsPanelProps) {
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const handoffs = handoffsOf(run);
  const views: ArtifactView[] = [
    ...(run.changes ? (["changes"] as const) : []),
    "workflow",
    ...(run.closeout || run.artifacts ? (["closeout"] as const) : []),
    ...(run.workspacePath != null ? (["files"] as const) : []),
  ];
  const active = views.includes(view) ? view : "workflow";

  return (
    <div style={PANEL}>
      {views.length > 1 && (
        <div style={viewToggleRow(d)}>
          {views.map((option) => (
            <button
              key={option}
              onClick={() => onViewChange(option)}
              data-testid={`artifact-view-${option}`}
              style={viewToggle(active === option, d)}
            >
              {viewIcon(option)}
              {VIEW_LABEL[option]}
            </button>
          ))}
        </div>
      )}

      {active === "changes" && run.changes ? (
        <ChangedFilesPanel runId={run.id} changes={run.changes} d={d} />
      ) : active === "closeout" && run.closeout ? (
        <CloseoutPanel closeout={run.closeout} d={d} />
      ) : active === "closeout" && run.artifacts ? (
        <RunArtifactsPanel artifacts={run.artifacts} d={d} />
      ) : active === "files" ? (
        <WorkspaceBrowser runId={run.id} runStatus={run.status} d={d} />
      ) : (
        <HandoffList
          handoffs={handoffs}
          selectedId={selectedStageId ?? focusedStageId}
          onSelect={setSelectedStageId}
          d={d}
        />
      )}
    </div>
  );
}
