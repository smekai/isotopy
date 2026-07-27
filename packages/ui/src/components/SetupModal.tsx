import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { AlertTriangle, CheckCircle2, Copy, Download, LogIn, RefreshCw, Server, X } from "lucide-react";
import type { EngineId, EngineModelList, EngineStatus } from "@adhd/core";
import {
  DEMO_PIPELINES,
  ENGINES,
  PERMISSION_MODES,
  agentForStage,
  defaultConnectionMode,
  flattenPipelineStages,
  modelForEngine,
  modelOptionsFor,
} from "@adhd/core";
import {
  fetchEngineModels,
  fetchEngineStatus,
  installEngine,
  loginEngine,
} from "../api";
import type { EngineConnectionUpdate } from "../api";
import type { SettingsController } from "../hooks/useSettings";
import { useTheme } from "../ThemeContext";
import { DIRS, FONT, GOLD, ICON, MONO, MOTION, RADIUS, SANS, SPACE, WEIGHT, Z, focusRing } from "../theme";
import type { Dir } from "../theme";

const GATED_STAGES = Array.from(
  new Map(
    DEMO_PIPELINES.flatMap((pipeline) => flattenPipelineStages(pipeline))
      .filter((stage) => stage.gateAfter)
      .map((stage) => [stage.id, stage]),
  ).values(),
);

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

export type SetupSection = "harness" | "gates" | "appearance" | "deploy";

const SECTIONS: { id: SetupSection; label: string }[] = [
  { id: "harness", label: "AI Harness" },
  { id: "gates", label: "Gates" },
  { id: "appearance", label: "Appearance" },
  { id: "deploy", label: "Deploy Target" },
];

interface DeployTarget {
  id: string;
  label: string;
  desc: string;
}

const DEPLOY_TARGETS: DeployTarget[] = [
  { id: "vercel", label: "Vercel", desc: "Auto-detected from project" },
  { id: "railway", label: "Railway", desc: "railway.app" },
  { id: "fly", label: "Fly.io", desc: "fly.io" },
  { id: "custom", label: "Custom script", desc: "Run ./scripts/deploy.sh" },
];

const WHITE = "#FFF";
const OK_GREEN = "#059669";
const OK_TINT = "rgba(5,150,105,0.10)";
const ERROR_RED = "#DC2626";
const ERROR_BORDER = "rgba(220,38,38,0.35)";
const ERROR_TINT = "rgba(220,38,38,0.06)";
const SCRIM = "rgba(30,27,75,0.20)";

const DIALOG_WIDTH = 700;
const NAV_RAIL_WIDTH = 160;
const COPY_FEEDBACK_MS = 2000;

interface Accent {
  accent: string;
  accentSoft: string;
}

const BACKDROP: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: Z.overlay,
  background: SCRIM,
  backdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: SPACE.x5l,
};

function dialog(d: Dir): CSSProperties {
  return {
    background: WHITE,
    borderRadius: RADIUS.pill,
    width: DIALOG_WIDTH,
    maxHeight: "82vh",
    display: "flex",
    overflow: "hidden",
    boxShadow: d.elevation.lg,
  };
}

function navRail(d: Dir): CSSProperties {
  return {
    width: NAV_RAIL_WIDTH,
    background: d.surface2,
    borderRight: `1px solid ${d.border}`,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  };
}

function navHeader(d: Dir): CSSProperties {
  return { padding: `${SPACE.xxl}px ${SPACE.xxl}px ${SPACE.xl}px`, borderBottom: `1px solid ${d.border}` };
}

function navTitle(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.xl, fontWeight: WEIGHT.heavy };
}

function navButton(active: boolean, d: Dir): CSSProperties {
  return {
    textAlign: "left",
    padding: `${SPACE.lg}px ${SPACE.xxl}px`,
    border: "none",
    background: active ? d.accentSoft : "transparent",
    borderLeft: `3px solid ${active ? d.accent : "transparent"}`,
    color: active ? d.accent : d.textMid,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: active ? 700 : 500,
    cursor: "pointer",
    transition: `all ${MOTION.fast}`,
  };
}

function navCloseButton(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.md,
    padding: `${SPACE.xl}px ${SPACE.xxl}px`,
    border: "none",
    borderTop: `1px solid ${d.border}`,
    background: "transparent",
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.md,
    cursor: "pointer",
  };
}

const BODY: CSSProperties = { flex: 1, overflowY: "auto", padding: SPACE.x4l };
const FLEX_FILL: CSSProperties = { flex: 1 };
const MONO_TEXT: CSSProperties = { fontFamily: MONO };

function sectionTitle(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.xl, fontWeight: WEIGHT.bold, marginBottom: SPACE.xs };
}

function sectionSubtitle(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.md, marginBottom: SPACE.xxl };
}

function fieldLabel(d: Dir, marginBottom: number = SPACE.md): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.lg, fontWeight: WEIGHT.semibold, marginBottom };
}

function mutedBody(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.md };
}

function mutedCaption(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.sm };
}

function hintText(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.xs };
}

const OPTION_STACK: CSSProperties = { display: "flex", flexDirection: "column", gap: SPACE.md };
const ENGINE_STACK: CSSProperties = { ...OPTION_STACK, marginBottom: SPACE.xxxl };
const GATE_STACK: CSSProperties = { display: "flex", flexDirection: "column", gap: SPACE.lg };

function optionCard(selected: boolean, d: Dir, accent: Accent = d): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.xl,
    padding: `${SPACE.xl}px ${SPACE.xxl}px`,
    border: `2px solid ${selected ? accent.accent : d.border}`,
    borderRadius: RADIUS.xl,
    background: selected ? accent.accentSoft : "transparent",
    cursor: "pointer",
    textAlign: "left",
  };
}

function engineCard(selected: boolean, available: boolean, d: Dir): CSSProperties {
  return {
    ...optionCard(selected, d),
    cursor: available ? "pointer" : "default",
    opacity: available ? 1 : 0.45,
  };
}

function radioDot(selected: boolean, d: Dir): CSSProperties {
  return {
    width: 12,
    height: 12,
    borderRadius: RADIUS.round,
    border: `2px solid ${selected ? d.accent : d.border}`,
    background: selected ? d.accent : "transparent",
    flexShrink: 0,
  };
}

function optionLabel(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.lg, fontWeight: WEIGHT.semibold };
}

function accentBadge(d: Dir): CSSProperties {
  return {
    background: d.accentSoft,
    color: d.accent,
    borderRadius: RADIUS.pill,
    padding: `${SPACE.xxs}px ${SPACE.lg}px`,
    fontFamily: MONO,
    fontSize: FONT.xxs,
    fontWeight: WEIGHT.bold,
  };
}

function dirSwatch(dir: Dir, selected: boolean): CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: RADIUS.md,
    flexShrink: 0,
    background: `linear-gradient(135deg, ${dir.accent}, ${dir.accentDark})`,
    boxShadow: selected ? focusRing(dir.accentSoft) : "none",
  };
}

function gateCard(d: Dir): CSSProperties {
  return { border: `1px solid ${d.border}`, borderRadius: RADIUS.xl, padding: `${SPACE.xl}px ${SPACE.xxl}px` };
}

const GATE_CARD_HEADER: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: SPACE.xs,
};

function statusCard(missing: boolean, d: Dir): CSSProperties {
  return {
    border: `1px solid ${missing ? ERROR_BORDER : d.border}`,
    background: missing ? ERROR_TINT : "transparent",
    borderRadius: RADIUS.xl,
    padding: `${SPACE.xl}px ${SPACE.xxl}px`,
    marginBottom: SPACE.xxxl,
  };
}

const STATUS_HEADER: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: SPACE.md,
};

const STATUS_BADGE_ROW: CSSProperties = { display: "flex", alignItems: "center", gap: SPACE.md };
const OK_ICON: CSSProperties = { color: OK_GREEN, flexShrink: 0 };
const OK_TEXT: CSSProperties = { color: OK_GREEN, fontFamily: SANS, fontSize: FONT.md, fontWeight: WEIGHT.bold };
const ERROR_ICON: CSSProperties = { color: ERROR_RED, flexShrink: 0 };
const ERROR_TEXT: CSSProperties = { color: ERROR_RED, fontFamily: SANS, fontSize: FONT.md, fontWeight: WEIGHT.bold };
const ERROR_NOTE: CSSProperties = { color: ERROR_RED, fontFamily: SANS, fontSize: FONT.sm, marginTop: SPACE.md };
const CONNECTION_ERROR: CSSProperties = { color: ERROR_RED, fontFamily: SANS, fontSize: FONT.sm, marginBottom: SPACE.xl };

function recheckButton(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    background: "transparent",
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.sm,
    fontWeight: WEIGHT.semibold,
    padding: `${SPACE.xs}px ${SPACE.lg}px`,
    cursor: "pointer",
    flexShrink: 0,
  };
}

function statusPath(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: MONO,
    fontSize: FONT.xs,
    marginTop: SPACE.sm,
    wordBreak: "break-all",
  };
}

function statusNote(installed: boolean, d: Dir): CSSProperties {
  return {
    color: installed ? d.textMuted : d.textMid,
    fontFamily: SANS,
    fontSize: FONT.sm,
    marginTop: SPACE.sm,
  };
}

function cardDivider(d: Dir): CSSProperties {
  return { marginTop: SPACE.xl, borderTop: `1px solid ${d.border}`, paddingTop: SPACE.xl };
}

const ACTION_ROW: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: SPACE.md,
  alignItems: "center",
};

function actionsLabel(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.sm, fontWeight: WEIGHT.bold, marginBottom: SPACE.md };
}

function primaryAction(busy: boolean, d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    border: "none",
    borderRadius: RADIUS.md,
    padding: `${SPACE.md}px ${SPACE.xl}px`,
    background: busy ? d.surface2 : d.accent,
    color: busy ? d.textMuted : WHITE,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.bold,
    cursor: busy ? "default" : "pointer",
  };
}

function secondaryAction(d: Dir): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: SPACE.sm,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.md,
    padding: `${SPACE.md}px ${SPACE.xl}px`,
    background: "transparent",
    color: d.textMid,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
    cursor: "pointer",
  };
}

function docsLink(d: Dir): CSSProperties {
  return {
    color: d.accent,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.semibold,
    textDecoration: "none",
  };
}

function installerHint(d: Dir): CSSProperties {
  return {
    color: d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.xs,
    marginTop: SPACE.md,
    lineHeight: 1.5,
  };
}

function connectionHint(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.sm, marginBottom: SPACE.lg };
}

function connectionStack(keyFormOpen: boolean): CSSProperties {
  return { ...OPTION_STACK, marginBottom: keyFormOpen ? 12 : 20 };
}

const API_KEY_BLOCK: CSSProperties = { marginBottom: SPACE.xxxl };

function apiKeyLabel(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.md, fontWeight: WEIGHT.semibold, marginBottom: SPACE.xxs };
}

function apiKeyNote(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.sm, marginBottom: SPACE.md };
}

const KEY_STATUS_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: SPACE.lg,
  marginBottom: SPACE.md,
};

const KEY_CONFIGURED_PILL: CSSProperties = {
  background: OK_TINT,
  color: OK_GREEN,
  borderRadius: RADIUS.pill,
  padding: `${SPACE.xs}px ${SPACE.lg}px`,
  fontFamily: MONO,
  fontSize: FONT.xs,
  fontWeight: WEIGHT.bold,
};

const REMOVE_KEY_BUTTON: CSSProperties = {
  border: "none",
  background: "transparent",
  color: ERROR_RED,
  fontFamily: SANS,
  fontSize: FONT.sm,
  fontWeight: WEIGHT.semibold,
  cursor: "pointer",
  padding: 0,
};

const KEY_INPUT_ROW: CSSProperties = { display: "flex", gap: SPACE.md };

function apiKeyInput(d: Dir): CSSProperties {
  return {
    flex: 1,
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.lg,
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
    fontFamily: MONO,
    fontSize: FONT.sm,
    color: d.text,
    outline: "none",
    background: d.surface2,
  };
}

function saveKeyButton(ready: boolean, d: Dir): CSSProperties {
  return {
    border: "none",
    borderRadius: RADIUS.lg,
    padding: `${SPACE.lg}px ${SPACE.xxl}px`,
    background: ready ? d.accent : d.surface2,
    color: ready ? WHITE : d.textMuted,
    fontFamily: SANS,
    fontSize: FONT.md,
    fontWeight: WEIGHT.bold,
    cursor: ready ? "pointer" : "default",
    flexShrink: 0,
  };
}

function modelSelect(d: Dir): CSSProperties {
  return {
    width: "100%",
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.lg,
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
    fontFamily: MONO,
    fontSize: FONT.md,
    color: d.text,
    background: WHITE,
    outline: "none",
    marginBottom: SPACE.sm,
  };
}

function modelMetaRow(followedByNote: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "baseline",
    gap: SPACE.sm,
    marginBottom: followedByNote ? 6 : 20,
  };
}

function customIdToggle(d: Dir): CSSProperties {
  return {
    border: "none",
    background: "transparent",
    padding: 0,
    color: d.accent,
    fontFamily: SANS,
    fontSize: FONT.sm,
    cursor: "pointer",
    marginLeft: "auto",
    flexShrink: 0,
  };
}

function customModelInput(followedByNote: boolean, d: Dir): CSSProperties {
  return {
    width: "100%",
    border: `1px solid ${d.border}`,
    borderRadius: RADIUS.lg,
    padding: `${SPACE.lg}px ${SPACE.xl}px`,
    fontFamily: MONO,
    fontSize: FONT.md,
    color: d.text,
    background: d.surface2,
    outline: "none",
    marginBottom: followedByNote ? 6 : 20,
  };
}

const CREDITS_NOTE: CSSProperties = {
  color: GOLD,
  fontFamily: SANS,
  fontSize: FONT.sm,
  marginBottom: SPACE.xxxl,
};

function deployIcon(selected: boolean, d: Dir): CSSProperties {
  return { color: selected ? d.accent : d.textMuted, flexShrink: 0 };
}

function deployLabel(d: Dir): CSSProperties {
  return { color: d.text, fontFamily: SANS, fontSize: FONT.md, fontWeight: WEIGHT.semibold };
}

export interface SetupModalProps {
  d: Dir;
  projectName: string;
  settings: SettingsController;
  section?: SetupSection;
  onClose: () => void;
}

export function SetupModal({
  d,
  projectName,
  settings,
  section = "harness",
  onClose,
}: SetupModalProps) {
  const { dirId, setDirId } = useTheme();
  const { preferences } = settings;
  const harness = preferences.engine;
  const model = modelForEngine(preferences, harness);
  const permissionMode = preferences.permissionMode;
  const [sec, setSec] = useState<SetupSection>(section);
  const [modelList, setModelList] = useState<EngineModelList>(() => seedModelList(harness));
  const [customModel, setCustomModel] = useState(false);
  const [customModelDraft, setCustomModelDraft] = useState(model);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusNonce, setStatusNonce] = useState(0);
  const [keyInput, setKeyInput] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

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

  function selectEngine(engineId: EngineId) {
    settings.update({ engine: engineId });
    setCustomModelDraft(modelForEngine(preferences, engineId));
  }

  function selectModel(modelId: string) {
    settings.update({ engineModels: { [harness]: modelId } });
    setCustomModelDraft(modelId);
  }

  async function applyConnectionUpdate(update: EngineConnectionUpdate): Promise<boolean> {
    setConnectionError(null);
    try {
      await settings.updateConnection(harness, update);
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
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
    }
  }

  const connectionModes = ENGINES[harness].connections;
  const connectionView = settings.view?.engines[harness];
  const connectionMode = connectionView?.connectionMode ?? defaultConnectionMode(harness);
  const apiKeyConfigured = connectionView?.apiKeyConfigured ?? false;
  const apiKeyMode = connectionModes.find((opt) => opt.requiresApiKey);
  const modelOptions = modelList.options;
  const modelOption = modelOptions.find((opt) => opt.id === model);
  const installer = INSTALLERS[harness];
  const engineMissing = Boolean(engineStatus && !engineStatus.installed);
  const keyFormOpen = connectionMode === "api-key";
  const keyReady = keyInput.trim() !== "" && !keySaving;
  const creditsNoteShown = Boolean(modelOption?.requiresUsageCredits);

  return (
    <div onClick={onClose} style={BACKDROP}>
      <div onClick={(e) => e.stopPropagation()} style={dialog(d)}>
        <div style={navRail(d)}>
          <div style={navHeader(d)}>
            <div style={navTitle(d)}>Setup</div>
            <div style={mutedCaption(d)}>{projectName}</div>
          </div>
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => setSec(s.id)} style={navButton(sec === s.id, d)}>
              {s.label}
            </button>
          ))}
          <div style={FLEX_FILL} />
          <button onClick={onClose} style={navCloseButton(d)}>
            <X size={ICON.sm} /> Close
          </button>
        </div>

        <div style={BODY}>
          {sec === "appearance" && (
            <div>
              <div style={sectionTitle(d)}>Appearance</div>
              <div style={sectionSubtitle(d)}>
                Pick a visual direction for the workspace. Applies instantly.
              </div>
              <div style={OPTION_STACK}>
                {Object.values(DIRS).map((dir) => {
                  const sel = dir.id === dirId;
                  return (
                    <button
                      key={dir.id}
                      onClick={() => setDirId(dir.id)}
                      style={optionCard(sel, d, dir)}
                    >
                      <div style={dirSwatch(dir, sel)} />
                      <div>
                        <div style={optionLabel(d)}>{dir.label}</div>
                        <div style={mutedCaption(d)}>{dir.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {sec === "gates" && (
            <div>
              <div style={sectionTitle(d)}>Human Gates</div>
              <div style={sectionSubtitle(d)}>Approval checkpoints that pause the pipeline until a human reviews.</div>
              <div style={GATE_STACK}>
                {GATED_STAGES.map((stage, i) => (
                  <div key={stage.id} style={gateCard(d)}>
                    <div style={GATE_CARD_HEADER}>
                      <div style={optionLabel(d)}>After {stage.label} · G{i + 1}</div>
                      <div style={accentBadge(d)}>ENABLED</div>
                    </div>
                    <div style={mutedBody(d)}>
                      The {agentForStage(stage.id).profession}'s output needs your approval before the team continues.
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sec === "harness" && (
            <div>
              <div style={sectionTitle(d)}>AI Harness</div>
              <div style={sectionSubtitle(d)}>The engine used by the Developer in single-agent runs.</div>
              <div style={ENGINE_STACK}>
                {Object.values(ENGINES).map((opt) => {
                  const sel = harness === opt.id;
                  return (
                    <button key={opt.id}
                      onClick={() => opt.available && selectEngine(opt.id)}
                      disabled={!opt.available}
                      style={engineCard(sel, opt.available, d)}>
                      <div style={radioDot(sel, d)} />
                      <div style={FLEX_FILL}>
                        <div style={optionLabel(d)}>{opt.label}</div>
                        <div style={mutedCaption(d)}>{opt.description}</div>
                      </div>
                      {!opt.available && <div style={accentBadge(d)}>SOON</div>}
                    </button>
                  );
                })}
              </div>
              <div style={fieldLabel(d)}>Engine status</div>
              <div style={statusCard(engineMissing, d)}>
                <div style={STATUS_HEADER}>
                  <div style={STATUS_BADGE_ROW}>
                    {statusLoading ? (
                      <span style={mutedBody(d)}>Checking CLI…</span>
                    ) : engineStatus?.installed ? (
                      <>
                        <CheckCircle2 size={ICON.md} style={OK_ICON} />
                        <span style={OK_TEXT}>
                          Installed{engineStatus.version ? ` · ${engineStatus.version}` : ""}
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={ICON.md} style={ERROR_ICON} />
                        <span style={ERROR_TEXT}>Not detected</span>
                      </>
                    )}
                  </div>
                  <button onClick={() => setStatusNonce((n) => n + 1)} style={recheckButton(d)}>
                    <RefreshCw size={ICON.sm} /> Re-check
                  </button>
                </div>
                {!statusLoading && engineStatus?.installed && engineStatus.path && (
                  <div style={statusPath(d)}>{engineStatus.path}</div>
                )}
                {!statusLoading && engineStatus?.message && (
                  <div style={statusNote(engineStatus.installed, d)}>{engineStatus.message}</div>
                )}
                {!statusLoading && engineStatus?.installed && engineStatus.loggedIn === false && harness === "cursor" && (
                  <div style={cardDivider(d)}>
                    <div style={ACTION_ROW}>
                      <button onClick={() => void runLogin()} disabled={loggingIn}
                        style={primaryAction(loggingIn, d)}>
                        <LogIn size={ICON.sm} /> {loggingIn ? "Finish sign-in in your browser…" : "Log in to Cursor"}
                      </button>
                      <span style={hintText(d)}>Opens the Cursor sign-in in your browser.</span>
                    </div>
                    {loginError && <div style={ERROR_NOTE}>{loginError}</div>}
                  </div>
                )}
                {!statusLoading && engineStatus && !engineStatus.installed && (engineStatus.installCommand || installer) && (
                  <div style={cardDivider(d)}>
                    <div style={actionsLabel(d)}>Recommended actions</div>
                    <div style={ACTION_ROW}>
                      {installer && (
                        <button onClick={() => void runInstall()} disabled={installing}
                          style={primaryAction(installing, d)}>
                          <Download size={ICON.sm} /> {installing ? "Installing… (up to ~1 min)" : installer.label}
                        </button>
                      )}
                      {engineStatus.installCommand && (
                        <button onClick={() => void copyInstallCommand()} style={secondaryAction(d)}>
                          <Copy size={ICON.sm} /> {copied ? "Copied ✓" : "Copy install command"}
                        </button>
                      )}
                      {engineStatus.docsUrl && (
                        <a href={engineStatus.docsUrl} target="_blank" rel="noreferrer" style={docsLink(d)}>Docs ↗</a>
                      )}
                    </div>
                    {installError && <div style={ERROR_NOTE}>{installError}</div>}
                    {installer && (
                      <div style={installerHint(d)}>
                        After install, run <span style={MONO_TEXT}>{installer.loginCmd}</span> once — or point <span style={MONO_TEXT}>{installer.envVar}</span> at an existing binary.
                      </div>
                    )}
                  </div>
                )}
                {!statusLoading && !engineStatus && (
                  <div style={statusNote(true, d)}>Status unavailable — is the server running?</div>
                )}
              </div>
              <div style={fieldLabel(d, 2)}>Connection</div>
              <div style={connectionHint(d)}>
                How {ENGINES[harness].label} authenticates and bills usage.
              </div>
              <div style={connectionStack(keyFormOpen)}>
                {connectionModes.map((opt) => {
                  const sel = connectionMode === opt.id;
                  return (
                    <button key={opt.id}
                      onClick={() => void applyConnectionUpdate({ connectionMode: opt.id })}
                      style={optionCard(sel, d)}>
                      <div style={radioDot(sel, d)} />
                      <div>
                        <div style={optionLabel(d)}>{opt.label}</div>
                        <div style={mutedCaption(d)}>{opt.description}</div>
                      </div>
                    </button>
                  );
                })}
                {connectionModes.length === 0 && (
                  <div style={mutedBody(d)}>
                    No connection options for {ENGINES[harness].label} yet.
                  </div>
                )}
              </div>
              {keyFormOpen && (
                <div style={API_KEY_BLOCK}>
                  <div style={apiKeyLabel(d)}>{apiKeyMode?.label ?? "API key"}</div>
                  <div style={apiKeyNote(d)}>
                    Stored server-side in your user-level ~/.adhd/settings.json for {projectName} — never inside the project folder, never sent back to the browser.
                  </div>
                  {apiKeyConfigured && (
                    <div style={KEY_STATUS_ROW}>
                      <span style={KEY_CONFIGURED_PILL}>KEY CONFIGURED ✓</span>
                      <button onClick={() => void applyConnectionUpdate({ apiKey: null })}
                        style={REMOVE_KEY_BUTTON}>
                        Remove
                      </button>
                    </div>
                  )}
                  <div style={KEY_INPUT_ROW}>
                    <input type="password" value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void saveApiKey()}
                      placeholder={apiKeyConfigured ? "Replace key…" : harness === "claude-code" ? "sk-ant-api03-..." : "Paste your API key…"}
                      style={apiKeyInput(d)} />
                    <button onClick={() => void saveApiKey()} disabled={keySaving || keyInput.trim() === ""}
                      style={saveKeyButton(keyReady, d)}>
                      {keySaving ? "Saving…" : "Save key"}
                    </button>
                  </div>
                </div>
              )}
              {connectionError && <div style={CONNECTION_ERROR}>{connectionError}</div>}
              <div style={fieldLabel(d)}>Model</div>
              <select value={model}
                onChange={(e) => selectModel(e.target.value)}
                style={modelSelect(d)}>
                {modelOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.hint ? `${opt.label} — ${opt.hint}` : opt.label}</option>
                ))}
                {!modelOption && <option value={model}>{model} (custom)</option>}
              </select>
              <div style={modelMetaRow(creditsNoteShown || customModel)}>
                <span style={mutedCaption(d)}>
                  {MODEL_SOURCE_LABEL[modelList.source]}{modelList.note ? ` · ${modelList.note}` : ""}
                </span>
                <button onClick={() => setCustomModel((on) => !on)} style={customIdToggle(d)}>
                  {customModel ? "Hide custom ID" : "Custom ID…"}
                </button>
              </div>
              {customModel && (
                <input value={customModelDraft}
                  onChange={(e) => setCustomModelDraft(e.target.value)}
                  onBlur={() => selectModel(customModelDraft)}
                  onKeyDown={(e) => e.key === "Enter" && selectModel(customModelDraft)}
                  placeholder="Exact model ID passed to the CLI (blank = Auto)"
                  style={customModelInput(creditsNoteShown, d)} />
              )}
              {creditsNoteShown && (
                <div style={CREDITS_NOTE}>
                  1M context requires usage credits on your Claude plan (claude.ai/settings/usage) or an API key connection.
                </div>
              )}
              <div style={fieldLabel(d)}>Permissions</div>
              <div style={OPTION_STACK}>
                {PERMISSION_MODES.map((opt) => {
                  const sel = permissionMode === opt.id;
                  return (
                    <button key={opt.id}
                      onClick={() => settings.update({ permissionMode: opt.id })}
                      style={optionCard(sel, d)}>
                      <div style={radioDot(sel, d)} />
                      <div>
                        <div style={optionLabel(d)}>
                          {opt.recommended ? `${opt.label} (recommended)` : opt.label}
                        </div>
                        <div style={mutedCaption(d)}>{opt.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {sec === "deploy" && (
            <div>
              <div style={sectionTitle(d)}>Deploy Target</div>
              <div style={sectionSubtitle(d)}>Where the SRE deploys your release.</div>
              <div style={OPTION_STACK}>
                {DEPLOY_TARGETS.map((opt, i) => (
                  <button key={opt.id} style={optionCard(i === 0, d)}>
                    <Server size={ICON.md} style={deployIcon(i === 0, d)} />
                    <div>
                      <div style={deployLabel(d)}>{opt.label}</div>
                      <div style={mutedCaption(d)}>{opt.desc}</div>
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
