import type { CSSProperties } from "react";
import { FileText } from "lucide-react";
import { FILE_CHANGE_KINDS, summariseChanges } from "@adhd/core";
import type { FileChange, FileChangeKind, RunChangeSet } from "@adhd/core";
import { useWorkspaceFile } from "../../hooks/useWorkspaceFile";
import { FileReadingPane } from "./FileReadingPane";
import { OpenProjectFolder } from "./OpenProjectFolder";
import type { Dir } from "../../theme";
import { FONT, ICON, MONO, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import {
  PASS_GREEN,
  SPLIT_PANE,
  SKIP_AMBER,
  FAIL_RED,
  emptyNote,
  listButton,
  listItemIcon,
  listItemName,
  sidebar,
} from "./run-styles";

const SIDEBAR_WIDTH = 260;

const KIND_COLOR: Record<FileChangeKind, string> = {
  created: PASS_GREEN,
  edited: SKIP_AMBER,
  deleted: FAIL_RED,
};

function headerRow(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACE.xl,
    padding: `${SPACE.md}px ${SPACE.xxl}px`,
    borderBottom: `1px solid ${d.border}`,
    flexShrink: 0,
  };
}

function headline(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.md, fontWeight: WEIGHT.bold };
}

function caption(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.xs };
}

function kindBadge(kind: FileChangeKind): CSSProperties {
  return {
    borderRadius: RADIUS.pill,
    padding: `0 ${SPACE.sm}px`,
    border: `1px solid ${KIND_COLOR[kind]}`,
    color: KIND_COLOR[kind],
    fontFamily: MONO,
    fontSize: FONT.xxs,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.06em",
  };
}

function orderedChanges(changes: RunChangeSet): FileChange[] {
  return FILE_CHANGE_KINDS.flatMap((kind) =>
    changes.files.filter((file) => file.kind === kind),
  );
}

export interface ChangedFilesPanelProps {
  runId: string;
  changes: RunChangeSet;
  d: Dir;
}

export function ChangedFilesPanel({ runId, changes, d }: ChangedFilesPanelProps) {
  const files = orderedChanges(changes);
  const reading = useWorkspaceFile(runId);

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={headerRow(d)}>
        <div>
          <div style={headline(d)}>{summariseChanges(changes)}</div>
          <div style={caption(d)}>
            {changes.truncated
              ? "The project was larger than the snapshot limit, so this list may be incomplete."
              : "Compared against the project as it was when the run started."}
          </div>
        </div>
        <OpenProjectFolder runId={runId} d={d} />
      </div>

      <div style={SPLIT_PANE} data-testid="artifact-changes">
        <div style={sidebar(SIDEBAR_WIDTH, d)}>
          {files.length === 0 ? (
            <div style={emptyNote(d)}>This run did not change any files.</div>
          ) : (
            files.map((file) => {
              const active = file.path === reading.selectedPath;
              return (
                <button
                  key={file.path}
                  onClick={() => reading.select(file.path)}
                  title={file.path}
                  disabled={file.kind === "deleted"}
                  style={listButton(active, d)}
                >
                  <FileText size={ICON.sm} style={listItemIcon(active, d)} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...listItemName(active, d), wordBreak: "break-all" }}>
                      {file.path}
                    </div>
                    <span style={kindBadge(file.kind)}>{file.kind}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
        <FileReadingPane
          file={reading.content}
          error={reading.error}
          placeholder={files.length === 0 ? "" : "Pick a file to read what the run wrote."}
          d={d}
        />
      </div>
    </div>
  );
}
