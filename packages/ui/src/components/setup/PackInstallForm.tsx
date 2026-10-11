import { useState } from "react";
import type { CSSProperties } from "react";
import type { InstallPackRequest, PackInstallResult } from "@isotopy/core";
import { FONT, MONO, RADIUS, SANS, SPACE, WEIGHT } from "../../theme";
import type { Dir } from "../../theme";
import { ERROR_RED, OK_GREEN, WHITE, fieldLabel, mutedCaption } from "./setup-styles";

const FORM: CSSProperties = { display: "flex", flexDirection: "column", gap: SPACE.md };

const ROW: CSSProperties = { display: "flex", gap: SPACE.md };

const STATUS_LINE: CSSProperties = { fontFamily: SANS, fontSize: FONT.sm };

function statusLine(color: string): CSSProperties {
  return { ...STATUS_LINE, color };
}

function textInput(d: Dir): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
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

function installButton(ready: boolean, d: Dir): CSSProperties {
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

interface PackFields {
  source: string;
  ref: string;
  path: string;
}

const EMPTY_FIELDS: PackFields = { source: "", ref: "", path: "" };

export interface PackInstallFormProps {
  d: Dir;
  onInstall: (request: InstallPackRequest) => Promise<PackInstallResult>;
}

export function PackInstallForm({ d, onInstall }: PackInstallFormProps) {
  const [fields, setFields] = useState<PackFields>(EMPTY_FIELDS);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<PackInstallResult | null>(null);
  const ready = fields.source.trim() !== "" && !installing;

  async function install() {
    if (!ready) {
      return;
    }
    setInstalling(true);
    setError(null);
    setInstalled(null);
    try {
      setInstalled(await onInstall(requestOf(fields)));
      setFields(EMPTY_FIELDS);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to install the pack");
    }
    setInstalling(false);
  }

  function field(name: keyof PackFields, value: string) {
    setFields((current) => ({ ...current, [name]: value }));
  }

  return (
    <div style={FORM}>
      <div style={fieldLabel(d, 0)}>Add agents from…</div>
      <div style={mutedCaption(d)}>
        A folder, or a git repository with an optional ref and a folder inside it. Only its
        agents/ and steps/ are copied, and nothing you changed is overwritten.
      </div>
      <input
        aria-label="Pack source"
        value={fields.source}
        onChange={(event) => field("source", event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && void install()}
        placeholder="C:\path\to\pack  or  https://github.com/org/repo.git"
        style={textInput(d)}
      />
      <div style={ROW}>
        <input
          aria-label="Git ref"
          value={fields.ref}
          onChange={(event) => field("ref", event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void install()}
          placeholder="ref (optional)"
          style={textInput(d)}
        />
        <input
          aria-label="Folder inside the repository"
          value={fields.path}
          onChange={(event) => field("path", event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void install()}
          placeholder="folder inside it (optional)"
          style={textInput(d)}
        />
        <button onClick={() => void install()} disabled={!ready} style={installButton(ready, d)}>
          {installing ? "Installing…" : "Install"}
        </button>
      </div>
      {error && <div style={statusLine(ERROR_RED)}>{error}</div>}
      {installed && (
        <div style={statusLine(OK_GREEN)}>
          Installed from {installed.source}: {installed.written.length} written,{" "}
          {installed.removed.length} removed.
        </div>
      )}
    </div>
  );
}

function requestOf(fields: PackFields): InstallPackRequest {
  return {
    source: fields.source.trim(),
    ref: fields.ref.trim() || undefined,
    path: fields.path.trim() || undefined,
  };
}
