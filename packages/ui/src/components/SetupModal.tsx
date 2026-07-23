import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Download, LogIn, RefreshCw, Server, ToggleLeft, ToggleRight, X } from "lucide-react";
import type {
  EngineId,
  EngineModelList,
  EnginePermissionMode,
  EngineStatus,
  SettingsView,
} from "@adhd/core";
import {
  ENGINES,
  LIFECYCLE_STAGES,
  PERMISSION_MODES,
  agentForStage,
  defaultConnectionMode,
  modelOptionsFor,
} from "@adhd/core";
import {
  fetchEngineModels,
  fetchEngineStatus,
  fetchSettings,
  installEngine,
  loginEngine,
  updateEngineConnection,
} from "../api";
import type { EngineConnectionUpdate } from "../api";
import {
  loadDisabledStages,
  loadEngine,
  loadEngineModel,
  loadPermissionMode,
  saveDisabledStages,
  saveEngine,
  saveEngineModel,
  savePermissionMode,
} from "../settings";
import { useTheme } from "../ThemeContext";
import { DIRS, GOLD, MONO, SANS, specColor } from "../theme";
import type { Dir } from "../theme";

const GATED_STAGES = LIFECYCLE_STAGES.filter((stage) => stage.gateAfter);

const MODEL_SOURCE_LABEL: Record<EngineModelList["source"], string> = {
  cli: "from the CLI",
  config: "from the CLI's config",
  static: "built-in list",
};

function seedModelList(engineId: EngineId): EngineModelList {
  return { options: modelOptionsFor(engineId), source: "static" };
}

const INSTALLERS: Partial<Record<EngineId, { label: string; loginCmd: string; envVar: string }>> = {
  cursor: { label: "Install Cursor CLI", loginCmd: "agent login", envVar: "ADHD_CURSOR_PATH" },
  codex: { label: "Install Codex CLI", loginCmd: "codex login", envVar: "ADHD_CODEX_PATH" },
};

export type SetupSection = "harness" | "pipeline" | "gates" | "appearance" | "deploy";

const SECTIONS: { id: SetupSection; label: string }[] = [
  { id: "harness", label: "AI Harness" },
  { id: "pipeline", label: "Pipeline" },
  { id: "gates", label: "Gates" },
  { id: "appearance", label: "Appearance" },
  { id: "deploy", label: "Deploy Target" },
];

export interface SetupModalProps {
  d: Dir;
  projectId: string;
  projectName: string;
  section?: SetupSection;
  onClose: () => void;
}

export function SetupModal({
  d,
  projectId,
  projectName,
  section = "harness",
  onClose,
}: SetupModalProps) {
  const { dirId, setDirId } = useTheme();
  const [sec, setSec] = useState<SetupSection>(section);
  const [disabledStages, setDisabledStages] = useState<string[]>(() =>
    loadDisabledStages(projectId),
  );
  const [harness, setHarness] = useState<EngineId>(() => loadEngine(projectId));
  const [model, setModel] = useState(() => loadEngineModel(projectId, loadEngine(projectId)));
  const [modelList, setModelList] = useState<EngineModelList>(() =>
    seedModelList(loadEngine(projectId)),
  );
  const [customModel, setCustomModel] = useState(false);
  const [permissionMode, setPermissionMode] = useState<EnginePermissionMode>(() =>
    loadPermissionMode(projectId),
  );
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusNonce, setStatusNonce] = useState(0);
  const [settingsView, setSettingsView] = useState<SettingsView | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings()
      .then(setSettingsView)
      .catch(() => setSettingsView(null));
  }, []);

  useEffect(() => {
    if (sec !== "harness") {
      return;
    }
    let stale = false;
    setStatusLoading(true);
    fetchEngineStatus(harness)
      .then((status) => {
        if (!stale) setEngineStatus(status);
      })
      .catch(() => {
        if (!stale) setEngineStatus(null);
      })
      .finally(() => {
        if (!stale) setStatusLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [sec, harness, statusNonce]);

  useEffect(() => {
    if (sec !== "harness") {
      return;
    }
    let stale = false;
    setModelList(seedModelList(harness));
    fetchEngineModels(harness)
      .then((list) => {
        if (!stale && list.options.length > 0) setModelList(list);
      })
      .catch(() => {
      });
    return () => {
      stale = true;
    };
  }, [sec, harness, statusNonce]);

  function toggleStage(stageId: string) {
    setDisabledStages((current) => {
      const next = current.includes(stageId)
        ? current.filter((id) => id !== stageId)
        : [...current, stageId];
      saveDisabledStages(projectId, next);
      return next;
    });
  }

  async function applyConnectionUpdate(update: EngineConnectionUpdate): Promise<boolean> {
    setConnectionError(null);
    try {
      setSettingsView(await updateEngineConnection(harness, update));
      return true;
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : "Failed to save connection settings",
      );
      return false;
    }
  }

  async function saveApiKey() {
    const key = keyInput.trim();
    if (!key || keySaving) {
      return;
    }
    setKeySaving(true);
    if (await applyConnectionUpdate({ apiKey: key })) {
      setKeyInput("");
    }
    setKeySaving(false);
  }

  async function runInstall() {
    if (installing) {
      return;
    }
    setInstalling(true);
    setInstallError(null);
    try {
      const result = await installEngine(harness);
      if (result.ok) {
        setStatusNonce((n) => n + 1);
      } else {
        setInstallError(result.message ?? "Install failed");
      }
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : "Install failed");
    } finally {
      setInstalling(false);
    }
  }

  async function runLogin() {
    if (loggingIn) {
      return;
    }
    setLoggingIn(true);
    setLoginError(null);
    try {
      const result = await loginEngine(harness);
      if (result.ok) {
        setStatusNonce((n) => n + 1);
      } else {
        setLoginError(result.message ?? "Login failed");
      }
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed");
    } finally {
      setLoggingIn(false);
    }
  }

  async function copyInstallCommand() {
    if (!engineStatus?.installCommand) {
      return;
    }
    try {
      await navigator.clipboard.writeText(engineStatus.installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
    }
  }

  const connectionModes = ENGINES[harness].connections;
  const connectionView = settingsView?.engines[harness];
  const connectionMode = connectionView?.connectionMode ?? defaultConnectionMode(harness);
  const apiKeyConfigured = connectionView?.apiKeyConfigured ?? false;
  const apiKeyMode = connectionModes.find((opt) => opt.requiresApiKey);
  const modelOptions = modelList.options;
  const modelOption = modelOptions.find((opt) => opt.id === model);
  const installer = INSTALLERS[harness];

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(30,27,75,0.20)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#FFF", borderRadius: 20, width: 700, maxHeight: "82vh", display: "flex", overflow: "hidden", boxShadow: d.shadowLg }}
      >
        <div style={{ width: 160, background: d.surface2, borderRight: `1px solid ${d.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${d.border}` }}>
            <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 800 }}>Setup</div>
            <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11 }}>{projectName}</div>
          </div>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSec(s.id)}
              style={{
                textAlign: "left", padding: "10px 16px", border: "none",
                background: sec === s.id ? d.accentSoft : "transparent",
                borderLeft: `3px solid ${sec === s.id ? d.accent : "transparent"}`,
                color: sec === s.id ? d.accent : d.textMid,
                fontFamily: SANS, fontSize: 12, fontWeight: sec === s.id ? 700 : 500,
                cursor: "pointer", transition: "all 0.15s",
              }}
            >{s.label}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={onClose}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", border: "none", borderTop: `1px solid ${d.border}`, background: "transparent", color: d.textMuted, fontFamily: SANS, fontSize: 12, cursor: "pointer" }}>
            <X size={12} /> Close
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {sec === "appearance" && (
            <div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Appearance</div>
              <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, marginBottom: 16 }}>
                Pick a visual direction for the workspace. Applies instantly.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Object.values(DIRS).map((dir) => {
                  const sel = dir.id === dirId;
                  return (
                    <button
                      key={dir.id}
                      onClick={() => setDirId(dir.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                        border: `2px solid ${sel ? dir.accent : d.border}`, borderRadius: 12,
                        background: sel ? dir.accentSoft : "transparent",
                        cursor: "pointer", textAlign: "left",
                      }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: `linear-gradient(135deg, ${dir.accent}, ${dir.accentDark})`,
                        boxShadow: sel ? `0 0 0 3px ${dir.accentSoft}` : "none",
                      }} />
                      <div>
                        <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>{dir.label}</div>
                        <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11 }}>{dir.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {sec === "pipeline" && (
            <div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Pipeline Stages</div>
              <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, marginBottom: 16 }}>
                Toggle which team members are active. Disabled agents are skipped on the next run.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {LIFECYCLE_STAGES.map((stage) => {
                  const agent = agentForStage(stage.id);
                  const sc = specColor(stage.id);
                  const enabled = !disabledStages.includes(stage.id);
                  return (
                    <div key={stage.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${d.border}`, borderRadius: 12, padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: sc.soft, color: sc.main, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{agent.glyph}</div>
                        <div>
                          <div style={{ color: d.text, fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>{agent.profession}</div>
                          <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 10 }}>{stage.label} stage</div>
                        </div>
                      </div>
                      <button onClick={() => toggleStage(stage.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: enabled ? d.accent : d.textMuted }}>
                        {enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {sec === "gates" && (
            <div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Human Gates</div>
              <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, marginBottom: 16 }}>Approval checkpoints that pause the pipeline until a human reviews.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {GATED_STAGES.map((stage, i) => (
                  <div key={stage.id} style={{ border: `1px solid ${d.border}`, borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>After {stage.label} · G{i + 1}</div>
                      <div style={{ background: d.accentSoft, color: d.accent, borderRadius: 20, padding: "2px 10px", fontFamily: MONO, fontSize: 9, fontWeight: 700 }}>ENABLED</div>
                    </div>
                    <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12 }}>
                      The {agentForStage(stage.id).profession}'s output needs your approval before the team continues.
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sec === "harness" && (
            <div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>AI Harness</div>
              <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, marginBottom: 16 }}>The engine used by the Developer in single-agent runs.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {Object.values(ENGINES).map((opt) => {
                  const sel = harness === opt.id;
                  return (
                    <button key={opt.id}
                      onClick={() => {
                        if (opt.available) {
                          setHarness(opt.id);
                          saveEngine(projectId, opt.id);
                          setModel(loadEngineModel(projectId, opt.id));
                        }
                      }}
                      disabled={!opt.available}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `2px solid ${sel ? d.accent : d.border}`, borderRadius: 12, background: sel ? d.accentSoft : "transparent", cursor: opt.available ? "pointer" : "default", textAlign: "left", opacity: opt.available ? 1 : 0.45 }}>
                      <div style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${sel ? d.accent : d.border}`, background: sel ? d.accent : "transparent", flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>{opt.label}</div>
                        <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11 }}>{opt.description}</div>
                      </div>
                      {!opt.available && (
                        <div style={{ background: d.accentSoft, color: d.accent, borderRadius: 20, padding: "2px 10px", fontFamily: MONO, fontSize: 9, fontWeight: 700 }}>SOON</div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Engine status</div>
              <div style={{
                border: `1px solid ${engineStatus && !engineStatus.installed ? "rgba(220,38,38,0.35)" : d.border}`,
                background: engineStatus && !engineStatus.installed ? "rgba(220,38,38,0.06)" : "transparent",
                borderRadius: 12, padding: "12px 14px", marginBottom: 20,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {statusLoading ? (
                      <span style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12 }}>Checking CLI…</span>
                    ) : engineStatus?.installed ? (
                      <>
                        <CheckCircle2 size={14} style={{ color: "#059669", flexShrink: 0 }} />
                        <span style={{ color: "#059669", fontFamily: SANS, fontSize: 12, fontWeight: 700 }}>
                          Installed{engineStatus.version ? ` · ${engineStatus.version}` : ""}
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={14} style={{ color: "#DC2626", flexShrink: 0 }} />
                        <span style={{ color: "#DC2626", fontFamily: SANS, fontSize: 12, fontWeight: 700 }}>Not detected</span>
                      </>
                    )}
                  </div>
                  <button onClick={() => setStatusNonce((n) => n + 1)}
                    style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${d.border}`, borderRadius: 8, background: "transparent", color: d.textMid, fontFamily: SANS, fontSize: 11, fontWeight: 600, padding: "4px 10px", cursor: "pointer", flexShrink: 0 }}>
                    <RefreshCw size={11} /> Re-check
                  </button>
                </div>
                {!statusLoading && engineStatus?.installed && engineStatus.path && (
                  <div style={{ color: d.textMuted, fontFamily: MONO, fontSize: 10, marginTop: 6, wordBreak: "break-all" }}>{engineStatus.path}</div>
                )}
                {!statusLoading && engineStatus?.message && (
                  <div style={{ color: engineStatus.installed ? d.textMuted : d.textMid, fontFamily: SANS, fontSize: 11, marginTop: 6 }}>{engineStatus.message}</div>
                )}
                {!statusLoading && engineStatus?.installed && engineStatus.loggedIn === false && harness === "cursor" && (
                  <div style={{ marginTop: 12, borderTop: `1px solid ${d.border}`, paddingTop: 12 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <button onClick={() => void runLogin()} disabled={loggingIn}
                        style={{ display: "flex", alignItems: "center", gap: 6, border: "none", borderRadius: 8, padding: "7px 12px", background: loggingIn ? d.surface2 : d.accent, color: loggingIn ? d.textMuted : "#FFF", fontFamily: SANS, fontSize: 12, fontWeight: 700, cursor: loggingIn ? "default" : "pointer" }}>
                        <LogIn size={12} /> {loggingIn ? "Finish sign-in in your browser…" : "Log in to Cursor"}
                      </button>
                      <span style={{ color: d.textMuted, fontFamily: SANS, fontSize: 10 }}>Opens the Cursor sign-in in your browser.</span>
                    </div>
                    {loginError && (
                      <div style={{ color: "#DC2626", fontFamily: SANS, fontSize: 11, marginTop: 8 }}>{loginError}</div>
                    )}
                  </div>
                )}
                {!statusLoading && engineStatus && !engineStatus.installed && (engineStatus.installCommand || installer) && (
                  <div style={{ marginTop: 12, borderTop: `1px solid ${d.border}`, paddingTop: 12 }}>
                    <div style={{ color: d.text, fontFamily: SANS, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>Recommended actions</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      {installer && (
                        <button onClick={() => void runInstall()} disabled={installing}
                          style={{ display: "flex", alignItems: "center", gap: 6, border: "none", borderRadius: 8, padding: "7px 12px", background: installing ? d.surface2 : d.accent, color: installing ? d.textMuted : "#FFF", fontFamily: SANS, fontSize: 12, fontWeight: 700, cursor: installing ? "default" : "pointer" }}>
                          <Download size={12} /> {installing ? "Installing… (up to ~1 min)" : installer.label}
                        </button>
                      )}
                      {engineStatus.installCommand && (
                        <button onClick={() => void copyInstallCommand()}
                          style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${d.border}`, borderRadius: 8, padding: "7px 12px", background: "transparent", color: d.textMid, fontFamily: SANS, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          <Copy size={12} /> {copied ? "Copied ✓" : "Copy install command"}
                        </button>
                      )}
                      {engineStatus.docsUrl && (
                        <a href={engineStatus.docsUrl} target="_blank" rel="noreferrer"
                          style={{ color: d.accent, fontFamily: SANS, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>Docs ↗</a>
                      )}
                    </div>
                    {installError && (
                      <div style={{ color: "#DC2626", fontFamily: SANS, fontSize: 11, marginTop: 8 }}>{installError}</div>
                    )}
                    {installer && (
                      <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 10, marginTop: 8, lineHeight: 1.5 }}>
                        After install, run <span style={{ fontFamily: MONO }}>{installer.loginCmd}</span> once — or point <span style={{ fontFamily: MONO }}>{installer.envVar}</span> at an existing binary.
                      </div>
                    )}
                  </div>
                )}
                {!statusLoading && !engineStatus && (
                  <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11, marginTop: 6 }}>Status unavailable — is the server running?</div>
                )}
              </div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Connection</div>
              <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11, marginBottom: 10 }}>
                How {ENGINES[harness].label} authenticates and bills usage.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: connectionMode === "api-key" ? 12 : 20 }}>
                {connectionModes.map((opt) => {
                  const sel = connectionMode === opt.id;
                  return (
                    <button key={opt.id}
                      onClick={() => void applyConnectionUpdate({ connectionMode: opt.id })}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `2px solid ${sel ? d.accent : d.border}`, borderRadius: 12, background: sel ? d.accentSoft : "transparent", cursor: "pointer", textAlign: "left" }}>
                      <div style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${sel ? d.accent : d.border}`, background: sel ? d.accent : "transparent", flexShrink: 0 }} />
                      <div>
                        <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>{opt.label}</div>
                        <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11 }}>{opt.description}</div>
                      </div>
                    </button>
                  );
                })}
                {connectionModes.length === 0 && (
                  <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12 }}>
                    No connection options for {ENGINES[harness].label} yet.
                  </div>
                )}
              </div>
              {connectionMode === "api-key" && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ color: d.text, fontFamily: SANS, fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{apiKeyMode?.label ?? "API key"}</div>
                  <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11, marginBottom: 8 }}>
                    Stored server-side in your user-level ~/.adhd/settings.json for {projectName} — never inside the project folder, never sent back to the browser.
                  </div>
                  {apiKeyConfigured && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <span style={{ background: "rgba(5,150,105,0.10)", color: "#059669", borderRadius: 20, padding: "3px 10px", fontFamily: MONO, fontSize: 10, fontWeight: 700 }}>KEY CONFIGURED ✓</span>
                      <button onClick={() => void applyConnectionUpdate({ apiKey: null })}
                        style={{ border: "none", background: "transparent", color: "#DC2626", fontFamily: SANS, fontSize: 11, fontWeight: 600, cursor: "pointer", padding: 0 }}>
                        Remove
                      </button>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="password" value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void saveApiKey()}
                      placeholder={apiKeyConfigured ? "Replace key…" : harness === "claude-code" ? "sk-ant-api03-..." : "Paste your API key…"}
                      style={{ flex: 1, border: `1px solid ${d.border}`, borderRadius: 10, padding: "9px 12px", fontFamily: MONO, fontSize: 11, color: d.text, outline: "none", background: d.surface2 }} />
                    <button onClick={() => void saveApiKey()} disabled={keySaving || keyInput.trim() === ""}
                      style={{ border: "none", borderRadius: 10, padding: "9px 14px", background: keyInput.trim() && !keySaving ? d.accent : d.surface2, color: keyInput.trim() && !keySaving ? "#FFF" : d.textMuted, fontFamily: SANS, fontSize: 12, fontWeight: 700, cursor: keyInput.trim() && !keySaving ? "pointer" : "default", flexShrink: 0 }}>
                      {keySaving ? "Saving…" : "Save key"}
                    </button>
                  </div>
                </div>
              )}
              {connectionError && (
                <div style={{ color: "#DC2626", fontFamily: SANS, fontSize: 11, marginBottom: 12 }}>{connectionError}</div>
              )}
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Model</div>
              <select value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  saveEngineModel(projectId, harness, e.target.value);
                }}
                style={{ width: "100%", border: `1px solid ${d.border}`, borderRadius: 10, padding: "9px 12px", fontFamily: MONO, fontSize: 12, color: d.text, background: "#FFF", outline: "none", marginBottom: 6 }}>
                {modelOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.hint ? `${opt.label} — ${opt.hint}` : opt.label}</option>
                ))}
                {!modelOption && <option value={model}>{model} (custom)</option>}
              </select>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: modelOption?.requiresUsageCredits || customModel ? 6 : 20 }}>
                <span style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11 }}>
                  {MODEL_SOURCE_LABEL[modelList.source]}{modelList.note ? ` · ${modelList.note}` : ""}
                </span>
                <button onClick={() => setCustomModel((on) => !on)}
                  style={{ border: "none", background: "transparent", padding: 0, color: d.accent, fontFamily: SANS, fontSize: 11, cursor: "pointer", marginLeft: "auto", flexShrink: 0 }}>
                  {customModel ? "Hide custom ID" : "Custom ID…"}
                </button>
              </div>
              {customModel && (
                <input value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    saveEngineModel(projectId, harness, e.target.value);
                  }}
                  placeholder="Exact model ID passed to the CLI (blank = Auto)"
                  style={{ width: "100%", border: `1px solid ${d.border}`, borderRadius: 10, padding: "9px 12px", fontFamily: MONO, fontSize: 12, color: d.text, background: d.surface2, outline: "none", marginBottom: modelOption?.requiresUsageCredits ? 6 : 20 }} />
              )}
              {modelOption?.requiresUsageCredits && (
                <div style={{ color: GOLD, fontFamily: SANS, fontSize: 11, marginBottom: 20 }}>
                  1M context requires usage credits on your Claude plan (claude.ai/settings/usage) or an API key connection.
                </div>
              )}
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Permissions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {PERMISSION_MODES.map((opt) => {
                  const sel = permissionMode === opt.id;
                  return (
                    <button key={opt.id}
                      onClick={() => {
                        setPermissionMode(opt.id);
                        savePermissionMode(projectId, opt.id);
                      }}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `2px solid ${sel ? d.accent : d.border}`, borderRadius: 12, background: sel ? d.accentSoft : "transparent", cursor: "pointer", textAlign: "left" }}>
                      <div style={{ width: 12, height: 12, borderRadius: "50%", border: `2px solid ${sel ? d.accent : d.border}`, background: sel ? d.accent : "transparent", flexShrink: 0 }} />
                      <div>
                        <div style={{ color: d.text, fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>
                          {opt.recommended ? `${opt.label} (recommended)` : opt.label}
                        </div>
                        <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11 }}>{opt.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {sec === "deploy" && (
            <div>
              <div style={{ color: d.text, fontFamily: SANS, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Deploy Target</div>
              <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 12, marginBottom: 16 }}>Where the SRE deploys your release.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[{ id: "vercel", label: "Vercel", desc: "Auto-detected from project" }, { id: "railway", label: "Railway", desc: "railway.app" }, { id: "fly", label: "Fly.io", desc: "fly.io" }, { id: "custom", label: "Custom script", desc: "Run ./scripts/deploy.sh" }].map((opt, i) => (
                  <button key={opt.id}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `2px solid ${i === 0 ? d.accent : d.border}`, borderRadius: 12, background: i === 0 ? d.accentSoft : "transparent", cursor: "pointer", textAlign: "left" }}>
                    <Server size={14} style={{ color: i === 0 ? d.accent : d.textMuted, flexShrink: 0 }} />
                    <div>
                      <div style={{ color: d.text, fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>{opt.label}</div>
                      <div style={{ color: d.textMuted, fontFamily: SANS, fontSize: 11 }}>{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
