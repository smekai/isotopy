import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Brain, FileText, FolderOpen, RotateCcw, Terminal, X } from "lucide-react";
import type { LogLevel, RunState, StageState, StageVerdict } from "@adhd/core";
import { agentForStage } from "@adhd/core";
import { fetchRunFileContent, fetchRunFiles } from "../api";
import type { WorkspaceFile, WorkspaceFileContent } from "../api";
import { useFollowScroll } from "../hooks/useFollowScroll";
import { renderInlineMarkdown } from "../inline-md";
import { ARTIFACTS, REASONING } from "../mock-content";
import type { Dir } from "../theme";
import { EASE, ELEVATION, FAIL_RED, FONT, ICON, MONO, MOTION, PASS_GREEN, RADIUS, SANS, SPACE, WEIGHT, logLevelColor, sLabel, specColor, statusClr } from "../theme";
import { StatusIcon } from "./StatusIcon";

export type FocusTab = "artifacts" | "log" | "reasoning";

type ArtifactView = "workflow" | "files";

type SpecColor = ReturnType<typeof specColor>;
type StatusColor = ReturnType<typeof statusClr>;

const GLYPH_SIZE = 32;
const ARTIFACT_SIDEBAR_WIDTH = 180;
const FILE_SIDEBAR_WIDTH = 220;

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function formatTs(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour12: false });
}

const listPreview: CSSProperties = {
  color: "inherit",
  fontFamily: MONO,
  fontSize: FONT.sm,
  lineHeight: 1.75,
  whiteSpace: "pre-wrap",
  margin: 0,
};

const pillBase: CSSProperties = {
  borderRadius: RADIUS.pill,
  padding: `${SPACE.xs}px ${SPACE.lg}px`,
  fontFamily: MONO,
  fontSize: FONT.xxs,
  fontWeight: WEIGHT.bold,
  letterSpacing: "0.06em",
};

function panelContainer(d: Dir, sc: SpecColor): CSSProperties {
  return {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    background: d.surface,
    borderTop: `3px solid ${sc.main}`,
    boxShadow: ELEVATION.panelUp,
  };
}

function headerRow(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.xl,
    padding: `${SPACE.lg}px ${SPACE.xxl}px`,
    borderBottom: `1px solid ${d.border}`,
    flexShrink: 0,
  };
}

function agentGlyph(sc: SpecColor): CSSProperties {
  return {
    width: GLYPH_SIZE,
    height: GLYPH_SIZE,
    borderRadius: RADIUS.lg,
    background: sc.gradient,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: FONT.xxl,
  };
}

function verdictPill(verdict: StageVerdict): CSSProperties {
  const pass = verdict === "PASS";
  return {
    ...pillBase,
    background: pass ? "rgba(5,150,105,0.10)" : "rgba(220,38,38,0.10)",
    border: `1px solid ${pass ? "rgba(5,150,105,0.35)" : "rgba(220,38,38,0.35)"}`,
    color: pass ? PASS_GREEN : FAIL_RED,
  };
}

function personaPill(d: Dir): CSSProperties {
  return {
    ...pillBase,
    background: d.surface2,
    border: `1px solid ${d.border}`,
    color: d.textMid,
  };
}

function statusPill(st: StatusColor): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    background: st.bg,
    borderRadius: RADIUS.pill,
    padding: `${SPACE.xs}px ${SPACE.lg}px`,
  };
}

function restartButton(d: Dir, restartable: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    background: d.surface2,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    padding: `${SPACE.sm}px ${SPACE.lg}px`,
    cursor: restartable ? "pointer" : "default",
    opacity: restartable ? 1 : 0.45,
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.sm,
    fontWeight: WEIGHT.semibold,
  };
}

function tabsRow(d: Dir): CSSProperties {
  return {
    display: "flex",
    borderBottom: `1px solid ${d.border}`,
    padding: `0 ${SPACE.xxl}px`,
    flexShrink: 0,
  };
}

function tabButton(active: boolean, sc: SpecColor, d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    padding: `${SPACE.lg}px ${SPACE.xxl}px`,
    marginBottom: -1,
    border: "none",
    borderBottom: `2px solid ${active ? sc.main : "transparent"}`,
    background: "none",
    cursor: "pointer",
    color: active ? sc.main : d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: active ? WEIGHT.bold : WEIGHT.medium,
    transition: `all ${MOTION.base}`,
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

function listButton(active: boolean, d: Dir): CSSProperties {
  return {
    width: "100%",
    display: "flex",
    alignItems: "flex-start",
    gap: SPACE.md,
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
    border: "none",
    borderBottom: `1px solid ${d.border}`,
    background: active ? d.accentSoft : "transparent",
    cursor: "pointer",
    textAlign: "left",
  };
}

function sidebar(width: number, d: Dir): CSSProperties {
  return {
    width,
    borderRight: `1px solid ${d.border}`,
    overflowY: "auto",
    flexShrink: 0,
  };
}

function emptyNote(d: Dir): CSSProperties {
  return { color: d.textMuted, padding: SPACE.xxl, fontSize: FONT.md, fontFamily: SANS };
}

const HEADER_TITLE_STACK: CSSProperties = { display: "flex" };
const FLEX_SPACER: CSSProperties = { flex: 1 };
const CLOSE_BUTTON: CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: SPACE.xs,
};
const SPLIT_PANE: CSSProperties = { display: "flex", flex: 1, minHeight: 0 };
const READING_PANE: CSSProperties = { flex: 1, padding: SPACE.xxl, overflowY: "auto" };

function professionText(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.xl, fontWeight: WEIGHT.bold };
}

function stageLabelText(d: Dir): CSSProperties {
  return { color: d.textMuted, fontSize: FONT.sm, fontFamily: SANS };
}

function statusLabel(st: StatusColor): CSSProperties {
  return {
    color: st.text,
    fontFamily: MONO,
    fontSize: FONT.xxs,
    fontWeight: WEIGHT.bold,
    letterSpacing: "0.06em",
  };
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

function listItemName(active: boolean, d: Dir): CSSProperties {
  return {
    color: active ? d.accent : d.text,
    fontFamily: MONO,
    fontSize: FONT.xs,
    lineHeight: 1.4,
  };
}

function listItemSize(d: Dir): CSSProperties {
  return { color: d.textMuted, fontSize: FONT.xxs };
}

function listItemIcon(active: boolean, d: Dir): CSSProperties {
  return { color: active ? d.accent : d.textMuted, marginTop: SPACE.xxs, flexShrink: 0 };
}

function bodyNote(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.md };
}

const TAB_BODY: CSSProperties = { padding: `${SPACE.xl}px ${SPACE.xxl}px` };

const REASONING_BODY: CSSProperties = {
  ...TAB_BODY,
  display: "flex",
  flexDirection: "column",
  gap: SPACE.xl,
};

function logTimestamp(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: MONO,
    fontSize: FONT.xs,
    flexShrink: 0,
    paddingTop: SPACE.xxs,
  };
}

function logMessage(color: string): CSSProperties {
  return { color, fontFamily: MONO, fontSize: FONT.sm, lineHeight: 1.6 };
}

function caret(d: Dir): CSSProperties {
  return {
    color: d.accent,
    fontFamily: MONO,
    fontSize: FONT.md,
    animation: `adhd-fade-pulse ${MOTION.shimmer} ${EASE.inOut} infinite`,
  };
}

function reasoningRule(sc: SpecColor): CSSProperties {
  return {
    width: 2,
    background: sc.soft,
    borderRadius: RADIUS.xs,
    flexShrink: 0,
    alignSelf: "stretch",
  };
}

function reasoningText(d: Dir): CSSProperties {
  return { color: d.textMid, fontSize: FONT.md, lineHeight: 1.75, fontFamily: SANS, margin: 0 };
}

export interface StageFocusPanelProps {
  stage: StageState;
  run: RunState;
  d: Dir;
  onClose: () => void;
  onRestartHere: (stageId: string) => void;
}

export function StageFocusPanel({
  stage, run, d, onClose, onRestartHere,
}: StageFocusPanelProps) {
  const [tab, setTab] = useState<FocusTab>("artifacts");
  const agent = agentForStage(stage.id);
  const sc = specColor(stage.id);
  const st = statusClr(stage.status);
  const isEngineRun = run.engine != null;

  const legacyRun = Object.keys(run.stageOutputs ?? {}).length === 0;
  const stageOutput = run.stageOutputs?.[stage.id] ?? (legacyRun ? run.result : undefined);
  const artifacts = isEngineRun
    ? stageOutput
      ? [{ name: "handoff.md", size: `${new Blob([stageOutput]).size} B`, preview: stageOutput }]
      : []
    : (ARTIFACTS[stage.id] ?? []);
  const reasoning = isEngineRun ? [] : (REASONING[stage.id] ?? []);
  const [artIdx, setArtIdx] = useState(0);

  const [artifactView, setArtifactView] = useState<ArtifactView>("workflow");
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<WorkspaceFileContent | null>(null);

  const canBrowseFiles = run.workspacePath != null;

  useEffect(() => {
    if (tab !== "artifacts" || artifactView !== "files" || !canBrowseFiles) {
      return;
    }
    let cancelled = false;
    fetchRunFiles(run.id)
      .then((result) => {
        if (!cancelled) {
          setFiles(result.files);
          setFilesError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFilesError(err instanceof Error ? err.message : "Failed to list files");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab, artifactView, canBrowseFiles, run.id, run.status]);

  useEffect(() => {
    if (!selectedFile) {
      setFileContent(null);
      return;
    }
    let cancelled = false;
    fetchRunFileContent(run.id, selectedFile)
      .then((result) => {
        if (!cancelled) {
          setFileContent(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFileContent(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [run.id, selectedFile]);

  const follow = useFollowScroll({
    length: stage.logs.length,
    resetKey: `${stage.id}:${tab}`,
    enabled: tab === "log",
  });

  const restartable = run.status === "failed" || run.status === "cancelled";

  const tabs: { id: FocusTab; label: string; ico: React.ReactNode }[] = [
    { id: "artifacts", label: "Artifacts", ico: <FileText size={ICON.sm} /> },
    { id: "log", label: "Live Log", ico: <Terminal size={ICON.sm} /> },
    { id: "reasoning", label: "Reasoning", ico: <Brain size={ICON.sm} /> },
  ];

  const logColor = (level: LogLevel) => logLevelColor(level, d);

  return (
    <div style={panelContainer(d, sc)}>
      <div style={headerRow(d)}>
        <div style={agentGlyph(sc)}>{agent.glyph}</div>
        <div style={HEADER_TITLE_STACK}>
          <div data-testid="stage-profession" style={professionText(d)}>{agent.profession}</div>
          <div style={stageLabelText(d)}>{stage.label} stage</div>
        </div>
        {stage.verdict && (
          <div
            data-testid="stage-verdict"
            title={`This box reported VERDICT: ${stage.verdict}`}
            style={verdictPill(stage.verdict)}
          >
            {stage.verdict}
          </div>
        )}
        {stage.skill && (
          <div
            data-testid="stage-persona"
            title={`Persona: .adhd/skills/${stage.skill}.md`}
            style={personaPill(d)}
          >
            {stage.skill.toUpperCase()}
          </div>
        )}
        <div style={statusPill(st)}>
          <StatusIcon s={stage.status} size={ICON.sm} />
          <span style={statusLabel(st)}>{sLabel(stage.status)}</span>
        </div>
        <div style={FLEX_SPACER} />
        <button
          onClick={() => restartable && onRestartHere(stage.id)}
          disabled={!restartable}
          title={restartable ? undefined : "Available after a failed or aborted run"}
          style={restartButton(d, restartable)}>
          <RotateCcw size={ICON.sm} /> Restart here
        </button>
        <button onClick={onClose} style={{ ...CLOSE_BUTTON, color: d.textMuted }}>
          <X size={ICON.lg} />
        </button>
      </div>

      <div style={tabsRow(d)}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={tabButton(tab === t.id, sc, d)}
          >
            {t.ico}{t.label}
          </button>
        ))}
      </div>

      <div
        ref={follow.ref}
        onScroll={follow.onScroll}
        data-testid="stage-scroll"
        style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
      >
        {tab === "artifacts" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {canBrowseFiles && (
              <div style={viewToggleRow(d)}>
                {(["workflow", "files"] as ArtifactView[]).map((view) => (
                  <button
                    key={view}
                    onClick={() => setArtifactView(view)}
                    data-testid={`artifact-view-${view}`}
                    style={viewToggle(artifactView === view, d)}
                  >
                    {view === "workflow" ? <FileText size={ICON.sm} /> : <FolderOpen size={ICON.sm} />}
                    {view === "workflow" ? "Workflow" : "Files"}
                  </button>
                ))}
              </div>
            )}

            {artifactView === "workflow" || !canBrowseFiles ? (
              <div style={SPLIT_PANE}>
                <div style={sidebar(ARTIFACT_SIDEBAR_WIDTH, d)}>
                  {artifacts.length === 0
                    ? <div style={emptyNote(d)}>No artifacts yet.</div>
                    : artifacts.map((a, i) => (
                      <button
                        key={a.name}
                        onClick={() => setArtIdx(i)}
                        style={listButton(i === artIdx, d)}
                      >
                        <FileText size={ICON.sm} style={listItemIcon(i === artIdx, d)} />
                        <div>
                          <div style={listItemName(i === artIdx, d)}>{a.name}</div>
                          <div style={listItemSize(d)}>{a.size}</div>
                        </div>
                      </button>
                    ))
                  }
                </div>
                <div style={READING_PANE}>
                  {artifacts[artIdx] && (
                    <pre data-testid="artifact-preview" style={{ ...listPreview, color: d.text }}>
                      {artifacts[artIdx].preview}
                    </pre>
                  )}
                </div>
              </div>
            ) : (
              <div style={SPLIT_PANE} data-testid="artifact-files">
                <div style={sidebar(FILE_SIDEBAR_WIDTH, d)}>
                  {filesError
                    ? <div style={{ ...emptyNote(d), color: FAIL_RED }}>{filesError}</div>
                    : files.length === 0
                      ? <div style={emptyNote(d)}>No files in the workspace yet.</div>
                      : files.map((file) => (
                        <button
                          key={file.path}
                          onClick={() => setSelectedFile(file.path)}
                          title={file.path}
                          style={listButton(file.path === selectedFile, d)}
                        >
                          <FileText size={ICON.sm} style={listItemIcon(file.path === selectedFile, d)} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ ...listItemName(file.path === selectedFile, d), wordBreak: "break-all" }}>{file.path}</div>
                            <div style={listItemSize(d)}>{formatBytes(file.size)}</div>
                          </div>
                        </button>
                      ))
                  }
                </div>
                <div style={READING_PANE}>
                  {fileContent?.truncated
                    ? <div style={bodyNote(d)}>File is too large to preview ({formatBytes(fileContent.size)}).</div>
                    : fileContent && (
                      <pre style={{ ...listPreview, color: d.text }}>
                        {fileContent.content}
                      </pre>
                    )
                  }
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "log" && (
          <div style={TAB_BODY}>
            {stage.logs.length === 0
              ? <span style={bodyNote(d)}>No log entries.</span>
              : stage.logs.map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: SPACE.xl, marginBottom: SPACE.sm }}>
                  <span style={logTimestamp(d)}>{formatTs(entry.ts)}</span>
                  <span style={logMessage(logColor(entry.level))}>{renderInlineMarkdown(entry.message)}</span>
                </div>
              ))
            }
            {stage.status === "running" && <span style={caret(d)}>▊</span>}
          </div>
        )}

        {tab === "reasoning" && (
          <div style={REASONING_BODY}>
            {reasoning.length === 0
              ? <span style={bodyNote(d)}>No reasoning trace available.</span>
              : reasoning.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: SPACE.xl }}>
                  <div style={reasoningRule(sc)} />
                  <p style={reasoningText(d)}>{renderInlineMarkdown(t)}</p>
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  );
}
