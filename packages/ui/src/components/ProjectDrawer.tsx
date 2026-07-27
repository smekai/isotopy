import { useEffect, useState } from "react";
import { Check, Copy, FolderOpen, Lock, X } from "lucide-react";
import { ENGINES, HOME_PROJECT_ID, findPipeline, flattenPipelineStages, modelForEngine, permissionModeLabel } from "@adhd/core";
import type { Project, RunState } from "@adhd/core";
import type { SettingsController } from "../hooks/useSettings";
import { childPath, isScratchWorkspace } from "../run-utils";
import type { Dir } from "../theme";
import { FONT, ICON, MONO, RADIUS, RUN_PILL, SANS, SPACE, WEIGHT, Z } from "../theme";
import type { SetupSection } from "./setup/SetupModal";

const PANEL_WIDTH = 320;
const COPY_FEEDBACK_MS = 2000;

function panelStyle(d: Dir): React.CSSProperties {
  return {
    position: "fixed", inset: "0 auto 0 0", zIndex: Z.overlay, width: PANEL_WIDTH,
    background: "#FFF", borderRight: `1px solid ${d.border}`,
    display: "flex", flexDirection: "column", boxShadow: d.elevation.lg,
  };
}

function sectionStyle(d: Dir): React.CSSProperties {
  return { padding: `${SPACE.xxl}px ${SPACE.xxl}px`, borderBottom: `1px solid ${d.border}` };
}

function sectionTitleStyle(d: Dir): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    color: d.textMuted, fontFamily: MONO, fontSize: FONT.xxs, fontWeight: WEIGHT.bold,
    letterSpacing: "0.08em", marginBottom: SPACE.md,
  };
}

function editLinkStyle(d: Dir): React.CSSProperties {
  return {
    border: "none", background: "transparent", padding: 0, cursor: "pointer",
    color: d.accent, fontFamily: SANS, fontSize: FONT.sm, fontWeight: WEIGHT.semibold, letterSpacing: 0,
  };
}

function pathStyle(d: Dir): React.CSSProperties {
  return { color: d.textMid, fontFamily: MONO, fontSize: FONT.xs, wordBreak: "break-all", lineHeight: 1.5 };
}

function noteStyle(d: Dir): React.CSSProperties {
  return {
    display: "flex", alignItems: "flex-start", gap: SPACE.sm, color: d.textMuted,
    fontFamily: SANS, fontSize: FONT.sm, lineHeight: 1.5, marginTop: SPACE.md,
  };
}

function headerStyle(d: Dir): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: `${SPACE.xxl}px ${SPACE.xxl}px`, borderBottom: `1px solid ${d.border}`,
  };
}

function headerTitleStyle(d: Dir): React.CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.xl, fontWeight: WEIGHT.bold };
}

function closeButtonStyle(d: Dir): React.CSSProperties {
  return { background: "none", border: "none", cursor: "pointer", color: d.textMuted };
}

function projectNameStyle(d: Dir): React.CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.lg, fontWeight: WEIGHT.bold };
}

function copyButtonStyle(d: Dir, copied: boolean): React.CSSProperties {
  return {
    background: "none", border: "none", cursor: "pointer",
    color: copied ? d.accent : d.textMuted, marginLeft: "auto", padding: 0,
  };
}

function runNumberStyle(d: Dir): React.CSSProperties {
  return { color: d.textMuted, fontFamily: MONO, fontSize: FONT.xs };
}

function runPillStyle(pill: { text: string; bg: string }): React.CSSProperties {
  return {
    background: pill.bg, color: pill.text, borderRadius: RADIUS.pill,
    padding: `${SPACE.xxs}px ${SPACE.md}px`, fontFamily: MONO,
    fontSize: FONT.xxs, fontWeight: WEIGHT.bold,
  };
}

interface FieldProps {
  d: Dir;
  label: string;
  value: string;
  mono?: boolean;
}

function Field({ d, label, value, mono = false }: FieldProps) {
  return (
    <div style={{ marginTop: SPACE.md }}>
      <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: FONT.xs }}>{label}</div>
      <div style={mono ? pathStyle(d) : { color: d.text, fontFamily: SANS, fontSize: FONT.md, fontWeight: WEIGHT.semibold }}>
        {value}
      </div>
    </div>
  );
}

export interface ProjectDrawerProps {
  d: Dir;
  projectId: string;
  project: Project | undefined;
  settings: SettingsController;
  run: RunState | null;
  onOpenSetup: (section: SetupSection) => void;
  onClose: () => void;
}

export function ProjectDrawer({
  d,
  projectId,
  project,
  settings,
  run,
  onOpenSetup,
  onClose,
}: ProjectDrawerProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function copyRoot() {
    if (!project) {
      return;
    }
    try {
      await navigator.clipboard.writeText(project.root);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {}
  }

  const { preferences } = settings;
  const scratch = projectId === HOME_PROJECT_ID;
  const engineId = preferences.engine;
  const engine = ENGINES[engineId];
  const connection = settings.view?.engines[engineId];
  const pipeline = findPipeline(preferences.pipelineId);
  const stages = pipeline ? flattenPipelineStages(pipeline) : [];
  const gates = stages.filter((stage) => stage.gateAfter).length;

  return (
    <div style={panelStyle(d)} data-testid="project-drawer">
      <div style={headerStyle(d)}>
        <div style={headerTitleStyle(d)}>Project</div>
        <button onClick={onClose} aria-label="Close project panel" style={closeButtonStyle(d)}>
          <X size={ICON.lg} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={sectionStyle(d)}>
          <div style={sectionTitleStyle(d)}>FOLDER</div>
          <div style={{ display: "flex", alignItems: "center", gap: SPACE.md }}>
            <FolderOpen size={ICON.md} style={{ color: d.accent, flexShrink: 0 }} />
            <span style={projectNameStyle(d)}>{project?.name ?? "…"}</span>
            <button onClick={() => void copyRoot()} title="Copy the folder path" style={copyButtonStyle(d, copied)}>
              {copied ? <Check size={ICON.md} /> : <Copy size={ICON.md} />}
            </button>
          </div>
          <div data-testid="project-root" style={{ ...pathStyle(d), marginTop: SPACE.sm }}>
            {project?.root ?? ""}
          </div>
          <div style={noteStyle(d)}>
            <Lock size={ICON.sm} style={{ flexShrink: 0, marginTop: SPACE.xxs }} />
            <span>
              {scratch
                ? "Home has no project folder — every run works in its own scratch folder. Add a project to work on real code."
                : "A project's folder is fixed. Add another project to work somewhere else."}
            </span>
          </div>
          <Field d={d} label="Runs and artifacts (git-ignored)" value={project?.dataDir ?? ""} mono />
        </div>

        {run && (
          <div style={sectionStyle(d)}>
            <div style={sectionTitleStyle(d)}>THIS RUN</div>
            <div style={{ display: "flex", alignItems: "center", gap: SPACE.md }}>
              <span style={runNumberStyle(d)}>#{run.number}</span>
              <div style={runPillStyle(RUN_PILL[run.status])}>{run.status.toUpperCase()}</div>
            </div>
            <Field
              d={d}
              label="Ran"
              value={run.engine ? `${run.pipelineName} · ${ENGINES[run.engine].label}${run.model ? ` · ${run.model}` : ""}` : run.pipelineName}
            />
            <Field
              d={d}
              label={isScratchWorkspace(run.workspacePath) ? "Working folder (scratch)" : "Working folder"}
              value={run.workspacePath ?? "— no workspace (simulated run)"}
              mono
            />
            {project && (
              <Field d={d} label="Artifacts" value={childPath(project.dataDir, `runs/${run.id}`)} mono />
            )}
          </div>
        )}

        <div style={sectionStyle(d)}>
          <div style={sectionTitleStyle(d)}>
            ENGINE
            <button onClick={() => onOpenSetup("harness")} style={editLinkStyle(d)}>Edit in Setup →</button>
          </div>
          <Field d={d} label="For new runs" value={`${engine.label} · ${modelForEngine(preferences, engineId) || "Auto"}`} />
          <Field d={d} label="Permissions" value={permissionModeLabel(preferences.permissionMode)} />
          <Field
            d={d}
            label="Connection"
            value={
              connection
                ? `${connection.connectionMode}${connection.apiKeyConfigured ? " · key configured" : ""}`
                : "—"
            }
          />
        </div>

        <div style={sectionStyle(d)}>
          <div style={sectionTitleStyle(d)}>
            PIPELINE
            <button onClick={() => onOpenSetup("gates")} style={editLinkStyle(d)}>Edit in Setup →</button>
          </div>
          <Field d={d} label="For new runs" value={pipeline?.name ?? "—"} />
          <Field
            d={d}
            label="Stages"
            value={`${stages.length} stages · ${gates} gates`}
          />
        </div>
      </div>
    </div>
  );
}
