import { useEffect, useState } from "react";
import { Check, Copy, FolderOpen, Lock, X } from "lucide-react";
import { ENGINES, HOME_PROJECT_ID, findPipeline, flattenPipelineStages, permissionModeLabel } from "@adhd/core";
import type { Project, RunState, SettingsView } from "@adhd/core";
import { fetchSettings } from "../api";
import { childPath, isScratchWorkspace } from "../run-utils";
import {
  loadDisabledStages,
  loadEngine,
  loadEngineModel,
  loadPermissionMode,
  loadPipelineId,
} from "../settings";
import type { Dir } from "../theme";
import { MONO, RUN_PILL, SANS } from "../theme";
import type { SetupSection } from "./SetupModal";

const PANEL_WIDTH = 320;

function panelStyle(d: Dir): React.CSSProperties {
  return {
    position: "fixed", inset: "0 auto 0 0", zIndex: 50, width: PANEL_WIDTH,
    background: "#FFF", borderRight: `1px solid ${d.border}`,
    display: "flex", flexDirection: "column", boxShadow: d.shadowLg,
  };
}

function sectionStyle(d: Dir): React.CSSProperties {
  return { padding: "14px 16px", borderBottom: `1px solid ${d.border}` };
}

function sectionTitleStyle(d: Dir): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    color: d.textMuted, fontFamily: MONO, fontSize: 9, fontWeight: 700,
    letterSpacing: "0.08em", marginBottom: 8,
  };
}

function editLinkStyle(d: Dir): React.CSSProperties {
  return {
    border: "none", background: "transparent", padding: 0, cursor: "pointer",
    color: d.accent, fontFamily: SANS, fontSize: 11, fontWeight: 600, letterSpacing: 0,
  };
}

function pathStyle(d: Dir): React.CSSProperties {
  return { color: d.textMid, fontFamily: MONO, fontSize: 10, wordBreak: "break-all", lineHeight: 1.5 };
}

function noteStyle(d: Dir): React.CSSProperties {
  return { display: "flex", alignItems: "flex-start", gap: 6, color: d.textMuted, fontFamily: SANS, fontSize: 11, lineHeight: 1.5, marginTop: 8 };
}

interface FieldProps {
  d: Dir;
  label: string;
  value: string;
  mono?: boolean;
}

function Field({ d, label, value, mono = false }: FieldProps) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 10 }}>{label}</div>
      <div style={mono ? pathStyle(d) : { color: d.text, fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}

export interface ProjectDrawerProps {
  d: Dir;
  projectId: string;
  project: Project | undefined;
  run: RunState | null;
  onOpenSetup: (section: SetupSection) => void;
  onClose: () => void;
}

export function ProjectDrawer({
  d,
  projectId,
  project,
  run,
  onOpenSetup,
  onClose,
}: ProjectDrawerProps) {
  const [settingsView, setSettingsView] = useState<SettingsView | null>(null);
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

  useEffect(() => {
    fetchSettings()
      .then(setSettingsView)
      .catch(() => setSettingsView(null));
  }, [projectId]);

  async function copyRoot() {
    if (!project) {
      return;
    }
    try {
      await navigator.clipboard.writeText(project.root);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  const scratch = projectId === HOME_PROJECT_ID;
  const engineId = loadEngine(projectId);
  const engine = ENGINES[engineId];
  const connection = settingsView?.engines[engineId];
  const pipeline = findPipeline(loadPipelineId(projectId));
  const stages = pipeline ? flattenPipelineStages(pipeline) : [];
  const gates = stages.filter((stage) => stage.gateAfter).length;
  const disabled = loadDisabledStages(projectId).length;

  return (
    <div style={panelStyle(d)} data-testid="project-drawer">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${d.border}` }}>
        <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700 }}>Project</div>
        <button onClick={onClose} aria-label="Close project panel" style={{ background: "none", border: "none", cursor: "pointer", color: d.textMuted }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={sectionStyle(d)}>
          <div style={sectionTitleStyle(d)}>FOLDER</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FolderOpen size={13} style={{ color: d.accent, flexShrink: 0 }} />
            <span style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 700 }}>
              {project?.name ?? "…"}
            </span>
            <button onClick={() => void copyRoot()} title="Copy the folder path"
              style={{ background: "none", border: "none", cursor: "pointer", color: copied ? d.accent : d.textMuted, marginLeft: "auto", padding: 0 }}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <div data-testid="project-root" style={{ ...pathStyle(d), marginTop: 6 }}>
            {project?.root ?? ""}
          </div>
          <div style={noteStyle(d)}>
            <Lock size={11} style={{ flexShrink: 0, marginTop: 2 }} />
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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10 }}>#{run.number}</span>
              <div style={{ background: RUN_PILL[run.status].bg, color: RUN_PILL[run.status].text, borderRadius: 20, padding: "2px 8px", fontFamily: MONO, fontSize: 9, fontWeight: 700 }}>
                {run.status.toUpperCase()}
              </div>
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
          <Field d={d} label="For new runs" value={`${engine.label} · ${loadEngineModel(projectId, engineId) || "Auto"}`} />
          <Field d={d} label="Permissions" value={permissionModeLabel(loadPermissionMode(projectId))} />
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
            <button onClick={() => onOpenSetup("pipeline")} style={editLinkStyle(d)}>Edit in Setup →</button>
          </div>
          <Field d={d} label="For new runs" value={pipeline?.name ?? "—"} />
          <Field
            d={d}
            label="Stages"
            value={`${stages.length} stages · ${gates} gates${disabled > 0 ? ` · ${disabled} disabled` : ""}`}
          />
        </div>
      </div>
    </div>
  );
}
