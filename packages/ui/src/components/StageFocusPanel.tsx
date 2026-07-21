import { useEffect, useRef, useState } from "react";
import { Brain, FileText, FolderOpen, MessageSquare, RotateCcw, Terminal, X } from "lucide-react";
import type { LogLevel, RunState, StageState } from "@adhd/core";
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

/** Within Artifacts: what the boxes reported vs what the run wrote to disk. */
type ArtifactView = "workflow" | "files";

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * How close to the bottom still counts as "following" the log. Anything further
 * up means the user scrolled back to read, and new entries must not yank them
 * away from it.
 */
const FOLLOW_THRESHOLD_PX = 40;

function formatTs(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour12: false });
}

export function StageFocusPanel({
  stage, run, d, tab, onTabChange, vs, onCycleVoice, onClose, onRestartHere,
}: {
  stage: StageState;
  run: RunState;
  d: Dir;
  tab: FocusTab;
  onTabChange: (t: FocusTab) => void;
  vs: VoiceState;
  onCycleVoice: () => void;
  onClose: () => void;
  onRestartHere: (stageId: string) => void;
}) {
  const agent = agentForStage(stage.id);
  const sc = specColor(stage.id);
  const st = statusClr(stage.status);
  // Engine runs show the real result; mock runs still show static design samples.
  const isEngineRun = run.engine != null;
  // Each box's own handoff — run.result only holds the last stage's output, so
  // with multiple boxes it must not be shown against every stage. Runs recorded
  // before stageOutputs existed fall back to it (they had a single box).
  const legacyRun = Object.keys(run.stageOutputs ?? {}).length === 0;
  const stageOutput = run.stageOutputs?.[stage.id] ?? (legacyRun ? run.result : undefined);
  const artifacts = isEngineRun
    ? stageOutput
      ? [{ name: "handoff.md", size: `${new Blob([stageOutput]).size} B`, preview: stageOutput }]
      : []
    : (ARTIFACTS[stage.id] ?? []);
  const reasoning = isEngineRun ? [] : (REASONING[stage.id] ?? []);
  const [artIdx, setArtIdx] = useState(0);

  // "Workflow" is what each box reported; "Files" is what the run actually
  // wrote to the shared workspace — the produced code, not the description.
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
    // Re-list when the run finishes so newly written files appear.
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

  // Follow the live log as it streams, but only while the user is already at
  // the bottom — scrolling up to read must not be interrupted by new entries.
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

  // A newly opened stage starts following again.
  useEffect(() => {
    followRef.current = true;
  }, [stage.id, tab]);

  const restartable =
    (run.status === "failed" || run.status === "cancelled") &&
    !(run.disabledStages ?? []).includes(stage.id);

  const tabs: { id: FocusTab; label: string; ico: React.ReactNode }[] = [
    { id: "artifacts", label: "Artifacts", ico: <FileText size={12} /> },
    { id: "log", label: "Live Log", ico: <Terminal size={12} /> },
    { id: "reasoning", label: "Reasoning", ico: <Brain size={12} /> },
    { id: "steer", label: "Steer", ico: <MessageSquare size={12} /> },
  ];

  const logColor = (level: LogLevel) => {
    if (level === "error" || level === "fail") return "#DC2626";
    if (level === "pass") return "#059669";
    if (level === "run") return d.accent;
    if (level === "warn") return "#D97706";
    return d.textMid;
  };

  return (
    <div style={{
      flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
      background: d.surface,
      borderTop: `3px solid ${sc.main}`,
      boxShadow: "0 -4px 24px rgba(0,0,0,0.06)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${d.border}`, flexShrink: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: sc.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
          {agent.glyph}
        </div>
        <div>
          <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700 }}>{agent.profession}</div>
          <div style={{ color: d.textMuted, fontSize: 11, fontFamily: SANS }}>{stage.label} stage</div>
        </div>
        {/* The box's own reported outcome, which drives its pass/fail status. */}
        {stage.verdict && (
          <div
            data-testid="stage-verdict"
            title={`This box reported VERDICT: ${stage.verdict}`}
            style={{
              background: stage.verdict === "PASS" ? "rgba(5,150,105,0.10)" : "rgba(220,38,38,0.10)",
              border: `1px solid ${stage.verdict === "PASS" ? "rgba(5,150,105,0.35)" : "rgba(220,38,38,0.35)"}`,
              borderRadius: 20, padding: "3px 10px",
              color: stage.verdict === "PASS" ? "#059669" : "#DC2626",
              fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
            }}
          >
            {stage.verdict}
          </div>
        )}
        {/* Which persona this box ran as — .adhd/skills/<skill>.md */}
        {stage.skill && (
          <div
            title={`Persona: .adhd/skills/${stage.skill}.md`}
            style={{
              background: d.surface2, border: `1px solid ${d.border}`, borderRadius: 20,
              padding: "3px 10px", color: d.textMid, fontFamily: MONO, fontSize: 9,
              fontWeight: 700, letterSpacing: "0.06em",
            }}
          >
            {stage.skill.toUpperCase()}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: st.bg, borderRadius: 20, padding: "3px 10px" }}>
          <StatusIcon s={stage.status} size={11} />
          <span style={{ color: st.text, fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em" }}>{sLabel(stage.status)}</span>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => restartable && onRestartHere(stage.id)}
          disabled={!restartable}
          title={restartable ? undefined : "Available after a failed or aborted run"}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: d.surface2, border: `1px solid ${d.border}`,
            borderRadius: 8, padding: "5px 10px",
            cursor: restartable ? "pointer" : "default",
            opacity: restartable ? 1 : 0.45,
            color: d.textMid, fontFamily: SANS, fontSize: 11, fontWeight: 600,
          }}>
          <RotateCcw size={11} /> Restart here
        </button>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: d.textMuted, padding: 4 }}>
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${d.border}`, padding: "0 16px", flexShrink: 0 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 14px", marginBottom: -1,
              border: "none", borderBottom: `2px solid ${tab === t.id ? sc.main : "transparent"}`,
              background: "none", cursor: "pointer",
              color: tab === t.id ? sc.main : d.textMuted,
              fontFamily: SANS, fontSize: 12, fontWeight: tab === t.id ? 700 : 500,
              transition: "all 0.18s",
            }}
          >
            {t.ico}{t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="stage-scroll"
        style={{ flex: 1, minHeight: 0, overflowY: tab === "steer" ? "hidden" : "auto" }}
      >
        {tab === "artifacts" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Workflow = what the boxes reported; Files = what they wrote. */}
            {canBrowseFiles && (
              <div style={{ display: "flex", gap: 4, padding: "8px 16px", borderBottom: `1px solid ${d.border}`, flexShrink: 0 }}>
                {(["workflow", "files"] as ArtifactView[]).map((view) => (
                  <button
                    key={view}
                    onClick={() => setArtifactView(view)}
                    data-testid={`artifact-view-${view}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      border: `1px solid ${artifactView === view ? d.accent : d.border}`,
                      borderRadius: 8, padding: "4px 12px",
                      background: artifactView === view ? d.accentSoft : "transparent",
                      color: artifactView === view ? d.accent : d.textMid,
                      cursor: "pointer", fontFamily: SANS, fontSize: 11,
                      fontWeight: artifactView === view ? 700 : 500,
                    }}
                  >
                    {view === "workflow" ? <FileText size={11} /> : <FolderOpen size={11} />}
                    {view === "workflow" ? "Workflow" : "Files"}
                  </button>
                ))}
              </div>
            )}

            {artifactView === "workflow" || !canBrowseFiles ? (
              <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
                <div style={{ width: 180, borderRight: `1px solid ${d.border}`, overflowY: "auto", flexShrink: 0 }}>
                  {artifacts.length === 0
                    ? <div style={{ color: d.textMuted, padding: 16, fontSize: 12, fontFamily: SANS }}>No artifacts yet.</div>
                    : artifacts.map((a, i) => (
                      <button
                        key={a.name}
                        onClick={() => setArtIdx(i)}
                        style={{
                          width: "100%", display: "flex", alignItems: "flex-start", gap: 8,
                          padding: "10px 12px", border: "none", borderBottom: `1px solid ${d.border}`,
                          background: i === artIdx ? d.accentSoft : "transparent",
                          cursor: "pointer", textAlign: "left",
                        }}
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
                <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
                  {artifacts[artIdx] && (
                    <pre style={{ color: d.text, fontFamily: MONO, fontSize: 11, lineHeight: 1.75, whiteSpace: "pre-wrap", margin: 0 }}>
                      {artifacts[artIdx].preview}
                    </pre>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flex: 1, minHeight: 0 }} data-testid="artifact-files">
                <div style={{ width: 220, borderRight: `1px solid ${d.border}`, overflowY: "auto", flexShrink: 0 }}>
                  {filesError
                    ? <div style={{ color: "#DC2626", padding: 16, fontSize: 12, fontFamily: SANS }}>{filesError}</div>
                    : files.length === 0
                      ? <div style={{ color: d.textMuted, padding: 16, fontSize: 12, fontFamily: SANS }}>No files in the workspace yet.</div>
                      : files.map((file) => (
                        <button
                          key={file.path}
                          onClick={() => setSelectedFile(file.path)}
                          title={file.path}
                          style={{
                            width: "100%", display: "flex", alignItems: "flex-start", gap: 8,
                            padding: "10px 12px", border: "none", borderBottom: `1px solid ${d.border}`,
                            background: file.path === selectedFile ? d.accentSoft : "transparent",
                            cursor: "pointer", textAlign: "left",
                          }}
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
                <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
                  {fileContent?.truncated
                    ? <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12 }}>File is too large to preview ({formatBytes(fileContent.size)}).</div>
                    : fileContent && (
                      <pre style={{ color: d.text, fontFamily: MONO, fontSize: 11, lineHeight: 1.75, whiteSpace: "pre-wrap", margin: 0 }}>
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
