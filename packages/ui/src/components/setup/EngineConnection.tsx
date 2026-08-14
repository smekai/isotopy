import { useState } from "react";
import type { CSSProperties } from "react";
import type { EngineId } from "@isotopy/core";
import { ENGINES, defaultConnectionMode } from "@isotopy/core";
import type { EngineConnectionUpdate } from "../../api";
import type { SettingsController } from "../../hooks/useSettings";
import { FONT, MONO, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import type { Dir } from "../../theme";
import {
  ERROR_RED,
  OK_GREEN,
  OPTION_STACK,
  WHITE,
  fieldLabel,
  mutedBody,
  mutedCaption,
  optionCard,
  optionLabel,
  radioDot,
} from "./setup-styles";

const OK_TINT = "rgba(5,150,105,0.10)";

function connectionHint(d: Dir): CSSProperties {
  return { color: d.textMuted, fontFamily: SANS, fontSize: FONT.sm, marginBottom: SPACE.lg };
}

function connectionStack(keyFormOpen: boolean): CSSProperties {
  return { ...OPTION_STACK, marginBottom: keyFormOpen ? 12 : 20 };
}

const CONNECTION_ERROR: CSSProperties = { color: ERROR_RED, fontFamily: SANS, fontSize: FONT.sm, marginBottom: SPACE.xl };

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

export interface EngineConnectionProps {
  d: Dir;
  projectName: string;
  engine: EngineId;
  settings: SettingsController;
}

export function EngineConnection({ d, projectName, engine, settings }: EngineConnectionProps) {
  const [keyInput, setKeyInput] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  async function applyConnectionUpdate(update: EngineConnectionUpdate): Promise<boolean> {
    setConnectionError(null);
    try {
      await settings.updateConnection(engine, update);
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

  const connectionModes = ENGINES[engine].connections;
  const connectionView = settings.view?.engines[engine];
  const connectionMode = connectionView?.connectionMode ?? defaultConnectionMode(engine);
  const apiKeyConfigured = connectionView?.apiKeyConfigured ?? false;
  const apiKeyMode = connectionModes.find((opt) => opt.requiresApiKey);
  const keyFormOpen = connectionMode === "api-key";
  const keyReady = keyInput.trim() !== "" && !keySaving;

  return (
    <>
      <div style={fieldLabel(d, 2)}>Connection</div>
      <div style={connectionHint(d)}>
        How {ENGINES[engine].label} authenticates and bills usage.
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
            No connection options for {ENGINES[engine].label} yet.
          </div>
        )}
      </div>
      {keyFormOpen && (
        <div style={API_KEY_BLOCK}>
          <div style={apiKeyLabel(d)}>{apiKeyMode?.label ?? "API key"}</div>
          <div style={apiKeyNote(d)}>
            Stored server-side in your user-level ~/.isotopy/settings.json for {projectName} — never inside the project folder, never sent back to the browser.
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
              placeholder={apiKeyConfigured ? "Replace key…" : engine === "claude-code" ? "sk-ant-api03-..." : "Paste your API key…"}
              style={apiKeyInput(d)} />
            <button onClick={() => void saveApiKey()} disabled={keySaving || keyInput.trim() === ""}
              style={saveKeyButton(keyReady, d)}>
              {keySaving ? "Saving…" : "Save key"}
            </button>
          </div>
        </div>
      )}
      {connectionError && <div style={CONNECTION_ERROR}>{connectionError}</div>}
    </>
  );
}
