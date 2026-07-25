import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Brain, FileText, FolderOpen, MessageSquare, RotateCcw, Terminal, X } from "lucide-react";
import type { LogLevel, RunState, StageState, StageVerdict } from "@adhd/core";
import { agentForStage } from "@adhd/core";
import { fetchRunFileContent, fetchRunFiles } from "../api";
import type { WorkspaceFile, WorkspaceFileContent } from "../api";
import { renderInlineMarkdown } from "../inline-md";
import { ARTIFACTS, REASONING } from "../mock-content";
import type { Dir } from "../theme";
import { MONO, SANS, sLabel, specColor, statusClr } from "../theme";
import { StatusIcon } from "./StatusIcon";
import { SteerChat } from "./SteerChat";
import type { VoiceState } from "./VoiceControls";

export type FocusTab = "artifacts" | "log" | "reasoning" | "steer";

type ArtifactView = "workflow" | "files";

type SpecColor = ReturnType<typeof specColor>;
type StatusColor = ReturnType<typeof statusClr>;

const PASS_GREEN = "#059669";
const FAIL_RED = "#DC2626";

const FOLLOW_THRESHOLD_PX = 40;

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function formatTs(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour12: false });
}

const listPreview: CSSProperties = {
  color: "inherit",
  fontFamily: MONO,
  fontSize: 11,
  lineHeight: 1.75,
  whiteSpace: "pre-wrap",
  margin: 0,
};

const pillBase: CSSProperties = {
  borderRadius: 20,
  padding: "3px 10px",
  fontFamily: MONO,
  fontSize: 9,
  fontWeight: 700,
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
    boxShadow: "0 -4px 24px rgba(0,0,0,0.06)",
  };
}

function headerRow(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    borderBottom: `1px solid ${d.border}`,
    flexShrink: 0,
  };
}

function agentGlyph(sc: SpecColor): CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 9,
    background: sc.gradient,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
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
    gap: 6,
    background: st.bg,
    borderRadius: 20,
    padding: "3px 10px",
  };
}

function restartButton(d: Dir, restartable: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: d.surface2,
    border: `1px solid ${d.border}`,
    borderRadius: 8,
    padding: "5px 10px",
    cursor: restartable ? "pointer" : "default",
    opacity: restartable ? 1 : 0.45,
    color: d.textMid,
    fontFamily: SANS,
    fontSize: 11,
    fontWeight: 600,
  };
}

function tabsRow(d: Dir): CSSProperties {
  return {
    display: "flex",
    borderBottom: `1px solid ${d.border}`,
    padding: "0 16px",
    flexShrink: 0,
  };
}

function tabButton(active: boolean, sc: SpecColor, d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "10px 14px",
    marginBottom: -1,
    border: "none",
    borderBottom: `2px solid ${active ? sc.main : "transparent"}`,
    background: "none",
    cursor: "pointer",
    color: active ? sc.main : d.textMuted,
    fontFamily: SANS,
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    transition: "all 0.18s",
  };
}

function viewToggle(active: boolean, d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    border: `1px solid ${active ? d.accent : d.border}`,
    borderRadius: 8,
    padding: "4px 12px",
    background: active ? d.accentSoft : "transparent",
    color: active ? d.accent : d.textMid,
    cursor: "pointer",
    fontFamily: SANS,
    fontSize: 11,
    fontWeight: active ? 700 : 500,
  };
}

function listButton(active: boolean, d: Dir): CSSProperties {
  return {
    width: "100%",
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "10px 12px",
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
  return { color: d.textMuted, padding: 16, fontSize: 12, fontFamily: SANS };
}

const HEADER_TITLE_STACK: CSSProperties = { display: "flex" };
const FLEX_SPACER: CSSProperties = { flex: 1 };
const CLOSE_BUTTON: CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 4,
};
const SPLIT_PANE: CSSProperties = { display: "flex", flex: 1, minHeight: 0 };
const READING_PANE: CSSProperties = { flex: 1, padding: 16, overflowY: "auto" };

export interface StageFocusPanelProps {
  stage: StageState;
  run: RunState;
  d: Dir;
  tab: FocusTab;
  onTabChange: (t: FocusTab) => void;
  vs: VoiceState;
  onCycleVoice: () => void;
  onClose: () => void;
  onRestartHere: (stageId: string) => void;
}

export function StageFocusPanel({
  stage, run, d, tab, onTabChange, vs, onCycleVoice, onClose, onRestartHere,
}: StageFocusPanelProps) {
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);

  function handleScroll() {
    const el = scrollRef.current;
    if (el) {
      followRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD_PX;
    }
  }

  useEffect(() => {
    if (tab !== "log") {
      return;
    }
    const el = scrollRef.current;
    if (el && followRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [tab, stage.id, stage.logs.length]);

  useEffect(() => {
    followRef.current = true;
  }, [stage.id, tab]);

  const restartable = run.status === "failed" || run.status === "cancelled";

  const tabs: { id: FocusTab; label: string; ico: React.ReactNode }[] = [
    { id: "artifacts", label: "Artifacts", ico: <FileText size={12} /> },
    { id: "log", label: "Live Log", ico: <Terminal size={12} /> },
    { id: "reasoning", label: "Reasoning", ico: <Brain size={12} /> },
    { id: "steer", label: "Steer", ico: <MessageSquare size={12} /> },
  ];

  const logColor = (level: LogLevel) => {
    if (level === "error" || level === "fail") return FAIL_RED;
    if (level === "pass") return PASS_GREEN;
    if (level === "run") return d.accent;
    if (level === "warn") return "#D97706";
    return d.textMid;
  };

  return (
    <div style={panelContainer(d, sc)}>
      <div style={headerRow(d)}>
        <div style={agentGlyph(sc)}>{agent.glyph}</div>
        <div style={HEADER_TITLE_STACK}>
          <div data-testid="stage-profession" style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700 }}>{agent.profession}</div>
          <div style={{ color: d.textMuted, fontSize: 11, fontFamily: SANS }}>{stage.label} stage</div>
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
          <StatusIcon s={stage.status} size={11} />
          <span style={{ color: st.text, fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em" }}>{sLabel(stage.status)}</span>
        </div>
        <div style={FLEX_SPACER} />
        <button
          onClick={() => restartable && onRestartHere(stage.id)}
          disabled={!restartable}
          title={restartable ? undefined : "Available after a failed or aborted run"}
          style={restartButton(d, restartable)}>
          <RotateCcw size={11} /> Restart here
        </button>
        <button onClick={onClose} style={{ ...CLOSE_BUTTON, color: d.textMuted }}>
          <X size={16} />
        </button>
      </div>

      <div style={tabsRow(d)}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            style={tabButton(tab === t.id, sc, d)}
          >
            {t.ico}{t.label}
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="stage-scroll"
        style={{ flex: 1, minHeight: 0, overflowY: tab === "steer" ? "hidden" : "auto" }}
      >
        {tab === "artifacts" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {canBrowseFiles && (
              <div style={{ display: "flex", gap: 4, padding: "8px 16px", borderBottom: `1px solid ${d.border}`, flexShrink: 0 }}>
                {(["workflow", "files"] as ArtifactView[]).map((view) => (
                  <button
                    key={view}
                    onClick={() => setArtifactView(view)}
                    data-testid={`artifact-view-${view}`}
                    style={viewToggle(artifactView === view, d)}
                  >
                    {view === "workflow" ? <FileText size={11} /> : <FolderOpen size={11} />}
                    {view === "workflow" ? "Workflow" : "Files"}
                  </button>
                ))}
              </div>
            )}

            {artifactView === "workflow" || !canBrowseFiles ? (
              <div style={SPLIT_PANE}>
                <div style={sidebar(180, d)}>
                  {artifacts.length === 0
                    ? <div style={emptyNote(d)}>No artifacts yet.</div>
                    : artifacts.map((a, i) => (
                      <button
                        key={a.name}
                        onClick={() => setArtIdx(i)}
                        style={listButton(i === artIdx, d)}
                      >
                        <FileText size={11} style={{ color: i === artIdx ? d.accent : d.textMuted, marginTop: 2, flexShrink: 0 }} />
                        <div>
                          <div style={{ color: i === artIdx ? d.accent : d.text, fontFamily: MONO, fontSize: 10, lineHeight: 1.4 }}>{a.name}</div>
                          <div style={{ color: d.textMuted, fontSize: 9 }}>{a.size}</div>
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
                <div style={sidebar(220, d)}>
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
                          <FileText size={11} style={{ color: file.path === selectedFile ? d.accent : d.textMuted, marginTop: 2, flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: file.path === selectedFile ? d.accent : d.text, fontFamily: MONO, fontSize: 10, lineHeight: 1.4, wordBreak: "break-all" }}>{file.path}</div>
                            <div style={{ color: d.textMuted, fontSize: 9 }}>{formatBytes(file.size)}</div>
                          </div>
                        </button>
                      ))
                  }
                </div>
                <div style={READING_PANE}>
                  {fileContent?.truncated
                    ? <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12 }}>File is too large to preview ({formatBytes(fileContent.size)}).</div>
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
          <div style={{ padding: "12px 16px" }}>
            {stage.logs.length === 0
              ? <span style={{ color: d.textMuted, fontSize: 12, fontFamily: SANS }}>No log entries.</span>
              : stage.logs.map((entry, i) => (
                <div key={i} style={{ display: "flex", gap: 12, marginBottom: 5 }}>
                  <span style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10, flexShrink: 0, paddingTop: 2 }}>{formatTs(entry.ts)}</span>
                  <span style={{ color: logColor(entry.level), fontFamily: MONO, fontSize: 11, lineHeight: 1.6 }}>{renderInlineMarkdown(entry.message)}</span>
                </div>
              ))
            }
            {stage.status === "running" && (
              <span style={{ color: d.accent, fontFamily: MONO, fontSize: 12 }} className="animate-pulse">▊</span>
            )}
          </div>
        )}

        {tab === "reasoning" && (
          <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            {reasoning.length === 0
              ? <span style={{ color: d.textMuted, fontSize: 12, fontFamily: SANS }}>No reasoning trace available.</span>
              : reasoning.map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 12 }}>
                  <div style={{ width: 2, background: sc.soft, borderRadius: 1, flexShrink: 0, alignSelf: "stretch" }} />
                  <p style={{ color: d.textMid, fontSize: 12, lineHeight: 1.75, fontFamily: SANS, margin: 0 }}>{renderInlineMarkdown(t)}</p>
                </div>
              ))
            }
          </div>
        )}

        {tab === "steer" && (
          <SteerChat stageId={stage.id} stageLabel={stage.label} d={d} vs={vs} onCycle={onCycleVoice} />
        )}
      </div>
    </div>
  );
}
