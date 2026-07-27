import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { AlertTriangle, CheckCircle2, Copy, Download, LogIn, RefreshCw } from "lucide-react";
import type { EngineId, EngineStatus } from "@adhd/core";
import { fetchEngineStatus, installEngine, loginEngine } from "../../api";
import { FONT, ICON, MONO, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import type { Dir } from "../../theme";
import { ERROR_RED, OK_GREEN, WHITE, fieldLabel, mutedBody } from "./setup-styles";

const ERROR_BORDER = "rgba(220,38,38,0.35)";
const ERROR_TINT = "rgba(220,38,38,0.06)";

const COPY_FEEDBACK_MS = 2000;

const INSTALLERS: Partial<Record<EngineId, { label: string; loginCmd: string; envVar: string }>> = {
  cursor: { label: "Install Cursor CLI", loginCmd: "agent login", envVar: "ADHD_CURSOR_PATH" },
  codex: { label: "Install Codex CLI", loginCmd: "codex login", envVar: "ADHD_CODEX_PATH" },
};

const MONO_TEXT: CSSProperties = { fontFamily: MONO };

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

function hintText(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.xs };
}

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

export interface EngineStatusCardProps {
  d: Dir;
  engine: EngineId;
  refreshKey: number;
  onRefresh: () => void;
}

export function EngineStatusCard({ d, engine, refreshKey, onRefresh }: EngineStatusCardProps) {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    fetchEngineStatus(engine)
      .then((next) => {
        if (!stale) setStatus(next);
      })
      .catch(() => {
        if (!stale) setStatus(null);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [engine, refreshKey]);

  async function runInstall() {
    if (installing) {
      return;
    }
    setInstalling(true);
    setInstallError(null);
    try {
      const result = await installEngine(engine);
      if (result.ok) {
        onRefresh();
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
      const result = await loginEngine(engine);
      if (result.ok) {
        onRefresh();
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
    if (!status?.installCommand) {
      return;
    }
    try {
      await navigator.clipboard.writeText(status.installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
    }
  }

  const installer = INSTALLERS[engine];
  const engineMissing = Boolean(status && !status.installed);

  return (
    <>
      <div style={fieldLabel(d)}>Engine status</div>
      <div style={statusCard(engineMissing, d)}>
        <div style={STATUS_HEADER}>
          <div style={STATUS_BADGE_ROW}>
            {loading ? (
              <span style={mutedBody(d)}>Checking CLI…</span>
            ) : status?.installed ? (
              <>
                <CheckCircle2 size={ICON.md} style={OK_ICON} />
                <span style={OK_TEXT}>
                  Installed{status.version ? ` · ${status.version}` : ""}
                </span>
              </>
            ) : (
              <>
                <AlertTriangle size={ICON.md} style={ERROR_ICON} />
                <span style={ERROR_TEXT}>Not detected</span>
              </>
            )}
          </div>
          <button onClick={onRefresh} style={recheckButton(d)}>
            <RefreshCw size={ICON.sm} /> Re-check
          </button>
        </div>
        {!loading && status?.installed && status.path && (
          <div style={statusPath(d)}>{status.path}</div>
        )}
        {!loading && status?.message && (
          <div style={statusNote(status.installed, d)}>{status.message}</div>
        )}
        {!loading && status?.installed && status.loggedIn === false && engine === "cursor" && (
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
        {!loading && status && !status.installed && (status.installCommand || installer) && (
          <div style={cardDivider(d)}>
            <div style={actionsLabel(d)}>Recommended actions</div>
            <div style={ACTION_ROW}>
              {installer && (
                <button onClick={() => void runInstall()} disabled={installing}
                  style={primaryAction(installing, d)}>
                  <Download size={ICON.sm} /> {installing ? "Installing… (up to ~1 min)" : installer.label}
                </button>
              )}
              {status.installCommand && (
                <button onClick={() => void copyInstallCommand()} style={secondaryAction(d)}>
                  <Copy size={ICON.sm} /> {copied ? "Copied ✓" : "Copy install command"}
                </button>
              )}
              {status.docsUrl && (
                <a href={status.docsUrl} target="_blank" rel="noreferrer" style={docsLink(d)}>Docs ↗</a>
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
        {!loading && !status && (
          <div style={statusNote(true, d)}>Status unavailable — is the server running?</div>
        )}
      </div>
    </>
  );
}
